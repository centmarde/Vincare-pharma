import { ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import { useToast } from 'vue-toastification'
import { useAuthUserStore } from '@/stores/authUser'
import { useGLDataStore, openingBalanceEquityCode } from '@/stores/glData'
import { generateNextNumber, insertWithDocRetry, getErrorMessage, formatCurrency } from '@/utils/helpers'

// Opening receivables — invoices raised BEFORE the cutover to this system that
// the customer has not finished paying.
//
// WHY THEY ARE DOCUMENTS, NOT A BALANCE
// The Opening Balances screen can put a figure into 1030, but as one lump with
// no customer behind it: the Balance Sheet would read ₱2M of AR while the AR
// page showed nothing. The module's rule is that a control account equals the
// sum of its open sub-ledger documents, so each legacy invoice is recorded as a
// real order row. That also means aging, the per-customer statement and the
// ordinary collection flow all work on them with no special cases.
//
// WHY THE GL ENTRY IS WRITTEN HERE AND NOT LEFT TO THE PROJECTOR
// gl_project_events books an order as DR 1030 / CR 4010 — revenue. These sales
// were earned before cutover, so booking them now would inflate the current
// period's income. Instead this writes DR 1030 / CR 3050 Opening Balance Equity
// itself, using reference_type 'sales_invoice' and the new transaction's id.
// Every projector loop opens with
//     if exists (select 1 from journal_entries
//                where reference_type='sales_invoice' and reference_id=r.id) then continue;
// so the projector sees the entry already there and skips the document
// permanently. No projector change, no new transaction_type.

export type OpeningReceivableInput = {
  customerId: number
  /** 'inhouse' | 'ethical' — decides the transaction_type and extension table. */
  department: 'inhouse' | 'ethical'
  /** Their original invoice number, kept for reconciliation against old files. */
  originalNo: string
  /** The date on their invoice. Drives aging. */
  invoiceDate: string
  /** Agreed credit term in days; null when there was none (COD, consignment). */
  termDays: number | null
  /** Their own wording for the term, e.g. 'Consignment', '30 Days PDC'. */
  termLabel: string
  /** Face value of the original invoice. */
  originalAmount: number
  /** Collected before cutover. The outstanding is what reaches the ledger. */
  alreadyPaid: number
  /**
   * The date the books opened. The JOURNAL ENTRY carries this, not the invoice
   * date — posting an August invoice in August would drop it into a period
   * that closed before this system existed, and the opening Balance Sheet
   * would no longer reconcile. The DOCUMENT keeps the real invoice date so it
   * ages correctly.
   */
  cutoverDate: string
  remarks?: string
}

export const useOpeningReceivablesStore = defineStore('openingReceivables', () => {
  const toast = useToast()
  const authStore = useAuthUserStore()
  const glStore = useGLDataStore()

  const loading = ref(false)
  const error: Ref<string> = ref('')

  function handleError(err: unknown, msg: string) {
    error.value = err instanceof Error ? err.message : msg
  }

  /** Undo a partially-written receivable so a retry cannot double-record it. */
  async function rollback(transactionId: number) {
    await supabase.from('inhouse_details').delete().eq('transaction_id', transactionId)
    await supabase.from('ethical_details').delete().eq('transaction_id', transactionId)
    await supabase.from('transactions').delete().eq('id', transactionId)
  }

  async function addOpeningReceivable(payload: OpeningReceivableInput) {
    loading.value = true
    error.value = ''

    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) {
      toast.error('User not authenticated.'); loading.value = false; return { success: false as const }
    }

    const outstanding = payload.originalAmount - payload.alreadyPaid
    if (payload.originalAmount <= 0) {
      toast.error('The original invoice amount must be positive.'); loading.value = false; return { success: false as const }
    }
    if (payload.alreadyPaid < 0) {
      toast.error('Amount already collected cannot be negative.'); loading.value = false; return { success: false as const }
    }
    if (outstanding <= 0.005) {
      toast.error('This invoice is already fully paid — there is nothing outstanding to record.')
      loading.value = false
      return { success: false as const }
    }

    // 3050 has to exist before anything is written, or the document lands with
    // no ledger entry behind it and the projector books it as revenue later.
    const { data: equityAccount } = await supabase
      .from('accounts').select('code, is_active').eq('code', openingBalanceEquityCode).maybeSingle()
    if (!equityAccount?.is_active) {
      toast.error(
        `Account ${openingBalanceEquityCode} (Opening Balance Equity) is missing or inactive. `
        + 'Add it in Chart of Accounts before recording opening receivables.',
      )
      loading.value = false
      return { success: false as const }
    }

    const isInhouse = payload.department === 'inhouse'
    const transactionType = isInhouse ? 'inhouse_order' : 'ethical_order'
    // Statuses the AR aging query actually looks for — anything else and the
    // receivable is invisible on the page it exists to appear on.
    const status = isInhouse ? 'delivered' : 'invoiced'
    const numberColumn = isInhouse ? 'inhouse_no' : 'ethical_no'
    const prefix = isInhouse ? 'IH-' : 'EO-'
    const year = new Date().getFullYear().toString()

    const dueDate = payload.termDays !== null
      ? new Date(new Date(payload.invoiceDate).getTime() + payload.termDays * 86400000)
        .toISOString().slice(0, 10)
      : null

    // Their original number goes in remarks rather than the number column: the
    // doc-number generators scan that series for the next free slot, and a
    // legacy number in a different format either collides or leaves a hole they
    // later trip over.
    const provenance = `Opening receivable — original invoice ${payload.originalNo || '(unnumbered)'}`
      + (payload.termLabel ? ` · terms ${payload.termLabel}` : '')
    const remarks = payload.remarks?.trim()
      ? `${provenance} · ${payload.remarks.trim()}`
      : provenance

    const { data: created, docNo, error: insertError } = await insertWithDocRetry<{ id: number }>(
      () => generateNextNumber(numberColumn, `${prefix}${year}-`),
      async (no) => supabase
        .from('transactions')
        .insert({
          [numberColumn]: no,
          transaction_type: transactionType,
          status,
          customer_id: payload.customerId,
          // The FACE value of the old invoice. What is still owed is this less
          // the extension row's amount_paid, which is how every other order on
          // this system expresses a part-paid balance.
          subtotal: payload.originalAmount,
          total_amount: payload.originalAmount,
          // Their invoice date, so aging is measured from when the debt really
          // arose rather than from when it was typed in.
          paid_at: payload.invoiceDate,
          created_at: payload.invoiceDate,
          remarks,
          created_by: user.id,
        })
        .select('id')
        .single(),
    )
    if (insertError || !created) {
      handleError(insertError, 'Failed to record the opening receivable.')
      toast.error(getErrorMessage(insertError) || 'Failed to record the opening receivable.')
      loading.value = false
      return { success: false as const }
    }

    const detailRow = isInhouse
      ? { transaction_id: created.id, amount_paid: payload.alreadyPaid, due_date: dueDate }
      : {
          transaction_id: created.id,
          amount_paid: payload.alreadyPaid,
          due_date: dueDate,
          terms_days: payload.termDays,
        }
    const { error: detailError } = await supabase
      .from(isInhouse ? 'inhouse_details' : 'ethical_details')
      .insert(detailRow)
    if (detailError) {
      await rollback(created.id)
      handleError(detailError, 'Failed to record the opening receivable.')
      toast.error(`${getErrorMessage(detailError)} Nothing was recorded.`)
      loading.value = false
      return { success: false as const }
    }

    // DR Accounts Receivable / CR Opening Balance Equity — never revenue, and
    // dated at cutover rather than at the invoice date.
    const glResult = await glStore.postJournalEntry(
      payload.cutoverDate,
      'sales_invoice',
      created.id,
      `Opening receivable ${docNo} — ${payload.originalNo || 'unnumbered'}`,
      [
        { account_code: '1030', debit: outstanding, credit: 0 },
        { account_code: openingBalanceEquityCode, debit: 0, credit: outstanding },
      ],
      user.id,
    )
    if (!glResult.success) {
      // Without the entry the projector would later book this as revenue, so a
      // failed posting must not leave the document behind.
      await rollback(created.id)
      handleError(glResult.error, 'Failed to post the opening receivable.')
      toast.error(`${glResult.error ?? 'Could not post to the ledger.'} Nothing was recorded.`)
      loading.value = false
      return { success: false as const }
    }

    await supabase.from('logs').insert({
      created_by: user.id,
      action: 'opening_receivable_add',
      description: `${docNo} | ${payload.originalNo} | outstanding ${outstanding}`,
      module: 'finance',
      transaction_id: created.id,
    })

    toast.success(`Opening receivable ${docNo} recorded — ${formatCurrency(outstanding)} outstanding.`)
    loading.value = false
    return { success: true as const, transactionId: created.id, docNo }
  }

  /**
   * Back out an opening receivable entered in error.
   *
   * Reverses the ledger entry and cancels the document rather than deleting
   * either — an opening balance that silently vanished is worse than one
   * visibly voided, since the accountant needs to see that the figure was
   * entered and backed out. Refused once anything has been collected against
   * it, the same rule ethical_cancel_order applies.
   */
  async function voidOpeningReceivable(transactionId: number, reason: string) {
    loading.value = true
    error.value = ''

    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) {
      toast.error('User not authenticated.'); loading.value = false; return { success: false as const }
    }

    const { count } = await supabase
      .from('collections')
      .select('id', { count: 'exact', head: true })
      .eq('transaction_id', transactionId)
      .is('voided_at', null)
    if ((count ?? 0) > 0) {
      toast.error('This receivable has collections against it and cannot be voided. Void those first.')
      loading.value = false
      return { success: false as const }
    }

    const { data: entry } = await supabase
      .from('journal_entries')
      .select('id')
      .eq('reference_type', 'sales_invoice')
      .eq('reference_id', transactionId)
      .eq('status', 'posted')
      .maybeSingle()
    if (entry) {
      const reversed = await glStore.reverseJournalEntry(entry.id, user.id)
      if (!reversed.success) {
        toast.error(reversed.error || 'Could not reverse the ledger entry. Nothing was changed.')
        loading.value = false
        return { success: false as const }
      }
    }

    const { error: statusError } = await supabase
      .from('transactions')
      .update({ status: 'cancelled', remarks: `Voided: ${reason}` })
      .eq('id', transactionId)
    if (statusError) {
      handleError(statusError, 'Ledger entry reversed but the document could not be cancelled.')
      toast.error('Ledger entry reversed, but the document could not be cancelled — please check it.')
      loading.value = false
      return { success: false as const }
    }

    await supabase.from('logs').insert({
      created_by: user.id,
      action: 'opening_receivable_void',
      description: reason,
      module: 'finance',
      transaction_id: transactionId,
    })

    toast.success('Opening receivable voided.')
    loading.value = false
    return { success: true as const }
  }

  return { loading, error, addOpeningReceivable, voidOpeningReceivable }
})

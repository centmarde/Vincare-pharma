import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import { useToast } from 'vue-toastification'
import { useAuthUserStore } from '@/stores/authUser'
import { generateNextNumber, insertWithDocRetry, getErrorMessage } from '@/utils/helpers'
import type { ExpenseCategory, ExpenseDepartment } from '@/stores/financeData'

// ─────────────────────────────────────────────────────────────────────────────
// Disbursement Vouchers (transaction_type = 'disbursement_voucher')
//
// A voucher is a PRE-PAYMENT authorization: one payee, many particulars,
// printed and signed BEFORE the expenses are recorded. Lifecycle:
//
//   draft ──print──> printed ──record──> recorded        (or ──> cancelled)
//
// THE INVARIANT THAT KEEPS EVERY EXISTING FINANCE QUERY SAFE: a voucher row
// never moves money and never posts a journal entry. Only its particulars do,
// and only at the record step, as ordinary `expense` transactions — identical
// in shape to one recorded through the Record Expense dialog. Every existing
// aggregate (opex, finance_daily_summary, gl_project_events' expense loop)
// filters transaction_type = 'expense', so a draft or printed voucher is
// invisible to all of them. Nothing downstream needed changing.
//
// A particular is deliberately NOT written as an expense row up front, even a
// 'draft'-status one: that is the premature-state-marker bug class this
// codebase has already swept once. An expense row existing at all must mean
// the money left.
//
// Not atomic (JS-over-RPC convention). recordVoucherExpenses rolls back the
// expense rows it created if a later one fails, so a retry can't double-record.
// ─────────────────────────────────────────────────────────────────────────────

export type VoucherStatus = 'draft' | 'printed' | 'recorded' | 'cancelled'

// The voucher's signature blocks. Signed by hand on the printed copy — nothing
// here is captured in the app, so these are labels only. Exported from the
// store (same convention as expenseCategories in financeData) so the form and
// the printed voucher can never drift out of sync.
export const VOUCHER_SIGNATORIES = [
  'Prepared by',
  'Checked by',
  'Approved by',
  'Received by',
] as const

export type VoucherItemType = {
  id: number
  voucher_id: number
  particular: string
  category: ExpenseCategory
  department: ExpenseDepartment | null
  or_si_no: string | null
  amount: number
  expense_transaction_id: number | null
}

export type VoucherType = {
  id: number
  created_at: string
  dv_no: string | null
  status: VoucherStatus
  voucher_date: string | null
  payee: string | null
  payee_address: string | null
  payee_tin: string | null
  check_no: string | null
  or_si_no: string | null
  remarks: string | null
  cash_account_id: number | null
  cash_account_name: string | null
  cash_account_institution: string | null
  cash_account_classification: string | null
  total_amount: number
  printed_at: string | null
  print_count: number
  created_by: string | null
  items: VoucherItemType[]
}

export type VoucherItemInput = {
  particular: string
  category: ExpenseCategory
  department: ExpenseDepartment | null
  amount: number
}

export type VoucherInput = {
  payee: string
  payee_address: string
  payee_tin: string
  voucher_date: string
  cash_account_id: number
  check_no: string
  // One receipt per voucher — one payee, one payment, so the OR/SI number sits
  // on the header (and prints in section D) rather than per particular.
  or_si_no: string
  remarks: string
  items: VoucherItemInput[]
}

// disbursement_voucher_items has TWO FKs back to transactions (voucher_id and
// expense_transaction_id), so a bare `disbursement_voucher_items(*)` embed is
// ambiguous and PostgREST rejects it with PGRST201. The FK must be named.
const VOUCHER_SELECT = `
  *,
  cash_account:cash_account_id(name, institution, classification),
  finance_details(*),
  items:disbursement_voucher_items!disbursement_voucher_items_voucher_id_fkey(*)
`

export const useDisbursementVouchersStore = defineStore('disbursementVouchers', () => {
  const toast = useToast()
  const authStore = useAuthUserStore()

  const vouchers: Ref<VoucherType[]> = ref([])
  const loading = ref(false)
  const error: Ref<string> = ref('')

  const isLoading = computed(() => loading.value)
  const hasError = computed(() => error.value !== '')

  function handleError(err: unknown, defaultMessage: string) {
    error.value = getErrorMessage(err) || defaultMessage
  }
  function clearError() { error.value = '' }

  function mapItem(row: any): VoucherItemType {
    return {
      id: row.id,
      voucher_id: row.voucher_id,
      particular: row.particular,
      category: row.category,
      department: row.department ?? null,
      or_si_no: row.or_si_no ?? null,
      amount: Number(row.amount ?? 0),
      expense_transaction_id: row.expense_transaction_id ?? null,
    }
  }

  function mapVoucher(row: any): VoucherType {
    const details = row.finance_details ?? {}
    const account = row.cash_account ?? {}
    return {
      id: row.id,
      created_at: row.created_at,
      dv_no: row.dv_no,
      status: (row.status ?? 'draft') as VoucherStatus,
      voucher_date: row.paid_at,
      payee: details.paid_to ?? null,
      payee_address: details.payee_address ?? null,
      payee_tin: details.payee_tin ?? null,
      check_no: details.check_no ?? null,
      or_si_no: details.or_si_no ?? null,
      remarks: row.remarks,
      cash_account_id: row.cash_account_id,
      cash_account_name: account.name ?? null,
      cash_account_institution: account.institution ?? null,
      cash_account_classification: account.classification ?? null,
      total_amount: Number(row.total_amount ?? 0),
      printed_at: details.printed_at ?? null,
      print_count: details.print_count ?? 0,
      created_by: row.created_by,
      // Aliased to `items` in VOUCHER_SELECT; sorted by id so the printed
      // particulars keep the order they were entered in.
      items: (row.items ?? []).map(mapItem).sort((a: VoucherItemType, b: VoucherItemType) => a.id - b.id),
    }
  }

  async function fetchVouchers() {
    loading.value = true
    clearError()
    try {
      const { data, error: fetchError } = await supabase
        .from('transactions')
        .select(VOUCHER_SELECT)
        .eq('transaction_type', 'disbursement_voucher')
        .order('created_at', { ascending: false })
      if (fetchError) throw fetchError
      vouchers.value = (data ?? []).map(mapVoucher)
      return vouchers.value
    } catch (err) {
      handleError(err, 'Failed to fetch disbursement vouchers')
      return []
    } finally {
      loading.value = false
    }
  }

  async function fetchVoucherById(id: number) {
    clearError()
    try {
      const { data, error: fetchError } = await supabase
        .from('transactions')
        .select(VOUCHER_SELECT)
        .eq('id', id)
        .maybeSingle()
      if (fetchError) throw fetchError
      return data ? mapVoucher(data) : null
    } catch (err) {
      handleError(err, 'Failed to load voucher')
      return null
    }
  }

  // Voucher totals are the sum of the particulars, never typed by hand.
  function sumItems(items: VoucherItemInput[]): number {
    return items.reduce((total, line) => total + (Number(line.amount) || 0), 0)
  }

  // Creates a DRAFT voucher. No cash movement, no expense rows, no GL — this is
  // paper only until it is printed, signed and recorded.
  async function createVoucher(payload: VoucherInput) {
    loading.value = true
    clearError()

    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) {
      toast.error('User not authenticated.'); loading.value = false; return { success: false }
    }
    if (!payload.items.length) {
      toast.error('A voucher needs at least one particular.'); loading.value = false; return { success: false }
    }

    const total = sumItems(payload.items)
    const year = new Date().getFullYear().toString()

    const { data: created, docNo, error: insertError } = await insertWithDocRetry<{ id: number }>(
      () => generateNextNumber('dv_no', `DV-${year}-`),
      async (dvNo) => supabase
        .from('transactions')
        .insert({
          dv_no: dvNo,
          transaction_type: 'disbursement_voucher',
          status: 'draft',
          paid_at: payload.voucher_date,
          subtotal: total,
          total_amount: total,
          cash_account_id: payload.cash_account_id,
          remarks: payload.remarks || null,
          created_by: user.id,
        })
        .select('id')
        .single(),
    )
    if (insertError || !created) {
      handleError(insertError, 'Failed to create voucher.')
      toast.error(getErrorMessage(insertError) || 'Failed to create voucher.')
      loading.value = false
      return { success: false }
    }

    const ok = await writeVoucherDetails(created.id, payload)
    if (!ok) {
      await rollbackVoucher(created.id)
      loading.value = false
      return { success: false }
    }

    await logVoucher(user.id, 'voucher_create', `${docNo} | ${payload.payee} | ${total}`, created.id)
    toast.success(`Voucher ${docNo} created as draft.`)
    await fetchVouchers()
    loading.value = false
    return { success: true, voucherId: created.id, dvNo: docNo }
  }

  // finance_details (payee/TIN/check no) + the particulars. Shared by create
  // and update so the two can't drift apart.
  async function writeVoucherDetails(voucherId: number, payload: VoucherInput) {
    const { error: detailsError } = await supabase
      .from('finance_details')
      .upsert({
        transaction_id: voucherId,
        paid_to: payload.payee || null,
        payee_address: payload.payee_address || null,
        payee_tin: payload.payee_tin || null,
        check_no: payload.check_no || null,
        or_si_no: payload.or_si_no || null,
      }, { onConflict: 'transaction_id' })
    if (detailsError) {
      handleError(detailsError, 'Failed to save voucher details.')
      toast.error(getErrorMessage(detailsError) || 'Failed to save voucher details.')
      return false
    }

    const { error: itemsError } = await supabase
      .from('disbursement_voucher_items')
      .insert(payload.items.map((line) => ({
        voucher_id: voucherId,
        particular: line.particular,
        category: line.category,
        department: line.department,
        // Denormalized from the header onto every line, so the expense rows
        // spawned at record time each carry the voucher's receipt number.
        or_si_no: payload.or_si_no || null,
        amount: line.amount,
      })))
    if (itemsError) {
      handleError(itemsError, 'Failed to save voucher particulars.')
      toast.error(getErrorMessage(itemsError) || 'Failed to save voucher particulars.')
      return false
    }
    return true
  }

  // A voucher with no particulars is not a document — clean it up rather than
  // leave a numbered header that looks real.
  async function rollbackVoucher(voucherId: number) {
    await supabase.from('disbursement_voucher_items').delete().eq('voucher_id', voucherId)
    await supabase.from('finance_details').delete().eq('transaction_id', voucherId)
    await supabase.from('transactions').delete().eq('id', voucherId)
  }

  // Editable ONLY while draft. Once printed the paper is out for signature, so
  // the document is immutable — correct it by cancelling and issuing a new DV.
  async function updateVoucher(voucherId: number, payload: VoucherInput) {
    loading.value = true
    clearError()

    const current = await fetchVoucherById(voucherId)
    if (!current) { toast.error('Voucher not found.'); loading.value = false; return { success: false } }
    if (current.status !== 'draft') {
      toast.error(`Voucher ${current.dv_no} has been printed and can no longer be edited. Cancel it and issue a new voucher instead.`)
      loading.value = false
      return { success: false }
    }

    const total = sumItems(payload.items)
    const { error: updateError } = await supabase
      .from('transactions')
      .update({
        paid_at: payload.voucher_date,
        subtotal: total,
        total_amount: total,
        cash_account_id: payload.cash_account_id,
        remarks: payload.remarks || null,
      })
      .eq('id', voucherId)
      .eq('status', 'draft')
    if (updateError) {
      handleError(updateError, 'Failed to update voucher.')
      toast.error(getErrorMessage(updateError) || 'Failed to update voucher.')
      loading.value = false
      return { success: false }
    }

    // Particulars are replaced wholesale — simpler than diffing, and safe
    // because nothing references them until the voucher is recorded.
    await supabase.from('disbursement_voucher_items').delete().eq('voucher_id', voucherId)
    const ok = await writeVoucherDetails(voucherId, payload)
    loading.value = false
    if (!ok) return { success: false }

    toast.success('Voucher updated.')
    await fetchVouchers()
    return { success: true }
  }

  // Stamps the print. First print moves draft -> printed and locks the voucher;
  // every print after that is a reprint and the printed copy must say so.
  // Returns the copy number so the print view can render the REPRINTED mark.
  async function markPrinted(voucherId: number) {
    clearError()
    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) { toast.error('User not authenticated.'); return { success: false } }

    const current = await fetchVoucherById(voucherId)
    if (!current) { toast.error('Voucher not found.'); return { success: false } }
    if (current.status === 'cancelled') {
      toast.error('This voucher was cancelled and cannot be printed.')
      return { success: false }
    }

    const copyNo = (current.print_count ?? 0) + 1
    // printed_at/printed_by record the ORIGINAL print — the moment the document
    // was committed to paper. Reprints bump the counter but must not overwrite
    // who first printed it, or the audit trail loses the original.
    const printPatch: Record<string, unknown> = { print_count: copyNo }
    if (!current.printed_at) {
      printPatch.printed_at = new Date().toISOString()
      printPatch.printed_by = user.id
    }

    const { error: detailsError } = await supabase
      .from('finance_details')
      .update(printPatch)
      .eq('transaction_id', voucherId)
    if (detailsError) {
      handleError(detailsError, 'Failed to record the print.')
      toast.error(getErrorMessage(detailsError) || 'Failed to record the print.')
      return { success: false }
    }

    if (current.status === 'draft') {
      const { error: statusError } = await supabase
        .from('transactions')
        .update({ status: 'printed' })
        .eq('id', voucherId)
        .eq('status', 'draft')
      if (statusError) {
        handleError(statusError, 'Failed to lock the voucher after printing.')
        toast.error(getErrorMessage(statusError) || 'Failed to lock the voucher after printing.')
        return { success: false }
      }
    }

    await logVoucher(
      user.id,
      copyNo === 1 ? 'voucher_print' : 'voucher_reprint',
      `${current.dv_no} | copy ${copyNo}`,
      voucherId,
    )
    await fetchVouchers()
    return { success: true, copyNo, isReprint: copyNo > 1 }
  }

  // THE GATE the accountant asked for: expenses cannot be recorded until the
  // voucher has been printed and signed. Each particular becomes an ordinary
  // `expense` transaction, and cash is deducted ONCE for the voucher total
  // (one voucher = one payment = one check).
  async function recordVoucherExpenses(voucherId: number) {
    loading.value = true
    clearError()

    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) { toast.error('User not authenticated.'); loading.value = false; return { success: false } }

    const voucher = await fetchVoucherById(voucherId)
    if (!voucher) { toast.error('Voucher not found.'); loading.value = false; return { success: false } }

    if (voucher.status === 'recorded') {
      toast.info('This voucher has already been recorded.'); loading.value = false; return { success: false }
    }
    if (voucher.status !== 'printed') {
      toast.error('Print the voucher first — expenses can only be recorded against a printed, signed voucher.')
      loading.value = false
      return { success: false }
    }
    if (!voucher.items.length) {
      toast.error('This voucher has no particulars to record.'); loading.value = false; return { success: false }
    }
    if (!voucher.cash_account_id) {
      toast.error('This voucher has no cash account to pay from.'); loading.value = false; return { success: false }
    }

    // One payment, so one balance check against the voucher total rather than
    // per-particular. A half-funded voucher must not half-record.
    const { data: account, error: accountError } = await supabase
      .from('cash_accounts').select('balance').eq('id', voucher.cash_account_id).maybeSingle()
    if (accountError || !account) {
      toast.error('Cash account not found.'); loading.value = false; return { success: false }
    }
    if (voucher.total_amount > account.balance + 0.005) {
      toast.error(`Insufficient balance in the selected account (available: ${account.balance}).`)
      loading.value = false
      return { success: false }
    }

    const year = new Date().getFullYear().toString()
    const createdIds: number[] = []

    // Mirrors what the old Add Expense dialog derived: paying out of a petty
    // cash fund is 'petty_cash' regardless of anything else; otherwise a check
    // number on the voucher means it was paid by cheque.
    const paymentMethod = voucher.cash_account_classification === 'PETTY_CASH'
      ? 'petty_cash'
      : (voucher.check_no ? 'cheque' : null)

    for (const line of voucher.items) {
      const { data: expense, error: insertError } = await insertWithDocRetry<{ id: number }>(
        () => generateNextNumber('expense_no', `EXP-${year}-`, ['reference_no']),
        async (docNo) => supabase
          .from('transactions')
          .insert({
            expense_no: docNo,
            transaction_type: 'expense',
            status: 'recorded',
            payment_method: paymentMethod,
            subtotal: line.amount,
            total_amount: line.amount,
            paid_at: voucher.voucher_date ?? new Date().toISOString().slice(0, 10),
            // The voucher's single header remark is the purpose of the whole
            // disbursement, so it becomes each expense's description. Lines no
            // longer carry their own text; `particular` is the category title,
            // which is the fallback when no remark was written.
            remarks: voucher.remarks || line.particular,
            cash_account_id: voucher.cash_account_id,
            created_by: user.id,
          })
          .select('id')
          .single(),
      )
      if (insertError || !expense) {
        await rollbackRecordedExpenses(createdIds)
        handleError(insertError, 'Failed to record the voucher expenses.')
        toast.error(`${getErrorMessage(insertError) || 'Failed to record the voucher expenses.'} No expenses were recorded.`)
        loading.value = false
        return { success: false }
      }
      createdIds.push(expense.id)

      // Payee/OR details come from the voucher header — one payee per voucher.
      const { error: detailsError } = await supabase.from('finance_details').insert({
        transaction_id: expense.id,
        category: line.category,
        department: line.department,
        paid_to: voucher.payee,
        or_si_no: line.or_si_no ?? voucher.or_si_no,
      })
      if (detailsError) {
        await rollbackRecordedExpenses(createdIds)
        handleError(detailsError, 'Failed to record the voucher expenses.')
        toast.error(`${getErrorMessage(detailsError)} No expenses were recorded.`)
        loading.value = false
        return { success: false }
      }

      const { error: linkError } = await supabase
        .from('disbursement_voucher_items')
        .update({ expense_transaction_id: expense.id })
        .eq('id', line.id)
      if (linkError) {
        await rollbackRecordedExpenses(createdIds)
        handleError(linkError, 'Failed to link the voucher to its expenses.')
        toast.error(`${getErrorMessage(linkError)} No expenses were recorded.`)
        loading.value = false
        return { success: false }
      }
    }

    // Only now does money actually move. Best-effort, matching recordExpense.
    const { error: balanceError } = await supabase
      .from('cash_accounts')
      .update({ balance: account.balance - voucher.total_amount })
      .eq('id', voucher.cash_account_id)
    if (balanceError) console.warn('recordVoucherExpenses: cash account balance update failed:', balanceError.message)

    const { error: statusError } = await supabase
      .from('transactions')
      .update({ status: 'recorded' })
      .eq('id', voucherId)
      .eq('status', 'printed')
    if (statusError) console.warn('recordVoucherExpenses: voucher status update failed:', statusError.message)

    await logVoucher(user.id, 'voucher_record', `${voucher.dv_no} | ${createdIds.length} expense(s) | ${voucher.total_amount}`, voucherId)
    toast.success(`${createdIds.length} expense${createdIds.length === 1 ? '' : 's'} recorded from ${voucher.dv_no}.`)
    await fetchVouchers()
    loading.value = false
    return { success: true, expenseIds: createdIds }
  }

  // A partially-recorded voucher would double-count on retry, so undo whatever
  // landed before the failure and leave the voucher at 'printed' to try again.
  async function rollbackRecordedExpenses(expenseIds: number[]) {
    if (!expenseIds.length) return
    await supabase.from('disbursement_voucher_items')
      .update({ expense_transaction_id: null }).in('expense_transaction_id', expenseIds)
    await supabase.from('finance_details').delete().in('transaction_id', expenseIds)
    await supabase.from('transactions').delete().in('id', expenseIds)
  }

  // Cancelling a recorded voucher would strand real expenses, so it is blocked
  // — void those through the existing expense change-request flow instead.
  async function cancelVoucher(voucherId: number, reason: string) {
    loading.value = true
    clearError()
    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) { toast.error('User not authenticated.'); loading.value = false; return { success: false } }

    const voucher = await fetchVoucherById(voucherId)
    if (!voucher) { toast.error('Voucher not found.'); loading.value = false; return { success: false } }
    if (voucher.status === 'recorded') {
      toast.error('This voucher is already recorded. Void its expenses through a change request instead.')
      loading.value = false
      return { success: false }
    }

    const { error: cancelError } = await supabase
      .from('transactions')
      .update({ status: 'cancelled', remarks: reason ? `Cancelled: ${reason}` : voucher.remarks })
      .eq('id', voucherId)
      .neq('status', 'recorded')
    if (cancelError) {
      handleError(cancelError, 'Failed to cancel voucher.')
      toast.error(getErrorMessage(cancelError) || 'Failed to cancel voucher.')
      loading.value = false
      return { success: false }
    }

    await logVoucher(user.id, 'voucher_cancel', `${voucher.dv_no}${reason ? ` | ${reason}` : ''}`, voucherId)
    toast.success('Voucher cancelled.')
    await fetchVouchers()
    loading.value = false
    return { success: true }
  }

  // Which voucher (if any) an expense was recorded from — drives the DV chip on
  // the Expenses list. Batched by expense id rather than per row.
  async function fetchVoucherRefsForExpenses(expenseIds: number[]) {
    const refs = new Map<number, string>()
    if (!expenseIds.length) return refs
    const { data, error: fetchError } = await supabase
      .from('disbursement_voucher_items')
      .select('expense_transaction_id, voucher:voucher_id(dv_no)')
      .in('expense_transaction_id', expenseIds)
    if (fetchError) {
      handleError(fetchError, 'Failed to load voucher references')
      return refs
    }
    for (const row of (data ?? []) as any[]) {
      const dvNo = row.voucher?.dv_no
      if (row.expense_transaction_id && dvNo) refs.set(row.expense_transaction_id, dvNo)
    }
    return refs
  }

  async function logVoucher(userId: string, action: string, description: string, voucherId: number) {
    const { error: logError } = await supabase.from('logs').insert({
      created_by: userId, action, description, module: 'finance', transaction_id: voucherId,
    })
    if (logError) console.warn(`${action}: activity log insert failed:`, logError.message)
  }

  return {
    vouchers, loading, error, isLoading, hasError,
    fetchVouchers, fetchVoucherById,
    createVoucher, updateVoucher,
    markPrinted, recordVoucherExpenses, cancelVoucher,
    fetchVoucherRefsForExpenses,
    clearError,
  }
})

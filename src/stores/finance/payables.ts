// Supplier payments and Accounts Payable: the payment register, the reissue
// path change-request corrections use, and the per-supplier / per-invoice AP
// views.

import { supabase } from '@/lib/supabase'
import { useToast } from 'vue-toastification'
import { useAuthUserStore } from '@/stores/authUser'
import { nextDocNumber, insertWithDocRetry } from '@/utils/helpers'
import type { APAgingRow, DateRange, SupplierAPRow } from './types'
import { allocateSupplierPayments, applyDateRange, apBucketFor, supplierDocRefs } from './helpers'
import { mapSupplierPaymentRow } from './mappers'
import { fetchAllRows } from '@/stores/shared/paging'
import { supplierPayments, supplierAP, apAging, apUnapplied, loading, handleError, clearError } from './state'

const toast = useToast()

// Resolved lazily rather than at import time: a store factory called while
// this module is first evaluated can run before Pinia is installed.
let authStore: ReturnType<typeof useAuthUserStore> | null = null
const getAuthStore = () => (authStore ??= useAuthUserStore())

// Document list — voided payments stay visible and flagged (see fetchExpenses).
export async function fetchSupplierPayments(options: DateRange & { supplierId?: number } = {}) {
  loading.value = true
  clearError()
  try {
    // Paged past PostgREST's 1,000-row cap; id last keeps the pages stable.
    const data = await fetchAllRows<any>(() => {
      let q = supabase.from('transactions')
        .select('*, supplier:supplier_id(name)')
        .eq('transaction_type', 'supplier_payment')
      if (options.supplierId) q = q.eq('supplier_id', options.supplierId)
      q = applyDateRange(q, 'paid_at', options)
      return q.order('paid_at', { ascending: false }).order('id', { ascending: false })
    })
    supplierPayments.value = data.map(mapSupplierPaymentRow)
    return supplierPayments.value
  } catch (err) {
    handleError(err, 'Failed to fetch supplier payments')
    return []
  } finally {
    loading.value = false
  }
}

// Was record_supplier_payment. Best-effort, not atomic: a failure after the
// header insert can leave a payment recorded with no suppliers.balance
// decrement (accepted trade-off, JS-over-RPC convention).
/**
 * Re-record a supplier payment as part of a CORRECTION.
 *
 * NOT the way payments are made. A payment is raised as a disbursement
 * voucher (Paying: A supplier), which prints, gets signed, deducts the cash
 * account and then writes the supplier_payment row. This exists only for the
 * change-request reissue path: an edit to a recorded payment voids the
 * original and re-records it at the correction date, and that replacement has
 * to come from somewhere.
 *
 * Named for that single purpose deliberately. It used to be `recordSupplierPayment`
 * and was wired to a "Pay" button on the Supplier Payments page, which meant
 * two ways to pay a supplier and only one of them moving cash — the page is
 * now read-only monitoring and this is the sole remaining caller.
 */
export async function reissueSupplierPayment(payload: {
  supplierId: number
  amount: number
  paymentMethod?: string
  referenceNo?: string
  valueDate?: string
  remarks?: string
  /**
   * Which cash account paid. Optional only because historical callers had no
   * concept of one — every live payment now originates from a disbursement
   * voucher, which always has it. Without it gl_project_events has no account
   * to resolve and books the credit to 1020 whatever actually paid, so a
   * reissued correction must carry the original's forward.
   */
  cashAccountId?: number | null
}) {
  loading.value = true
  clearError()
  const { user, error: authError } = await getAuthStore().getCurrentUser()
  if (authError || !user) { toast.error('User not authenticated.'); loading.value = false; return { success: false } }

  if (payload.amount <= 0) {
    toast.error('Payment amount must be positive.'); loading.value = false; return { success: false }
  }
  const { data: supplier, error: supplierError } = await supabase
    .from('suppliers').select('id, balance').eq('id', payload.supplierId).maybeSingle()
  if (supplierError || !supplier) {
    toast.error(`Supplier ${payload.supplierId} not found.`); loading.value = false; return { success: false }
  }

  const [receivedRes, paidRes] = await Promise.all([
    supabase.from('transactions').select('total_amount').eq('transaction_type', 'stock_in').eq('supplier_id', payload.supplierId).neq('status', 'voided'),
    supabase.from('transactions').select('total_amount').eq('transaction_type', 'supplier_payment').eq('supplier_id', payload.supplierId).neq('status', 'voided'),
  ])
  const received = (receivedRes.data ?? []).reduce((sum, r) => sum + (r.total_amount ?? 0), 0)
  const paid = (paidRes.data ?? []).reduce((sum, r) => sum + (r.total_amount ?? 0), 0)
  const outstanding = received - paid
  if (payload.amount > outstanding + 0.005) {
    toast.error(`Payment (${payload.amount}) exceeds outstanding balance (${outstanding}).`)
    loading.value = false; return { success: false }
  }

  const year = new Date().getFullYear().toString()
  let remarks = payload.remarks || ''
  if (payload.referenceNo) remarks = `${remarks} | Ref: ${payload.referenceNo}`.replace(/^\s*\|\s*/, '')

  const { data: created, docNo: paymentNo, error: insertError } = await insertWithDocRetry<{ id: number }>(
    async () => {
      const { data: existingPayments } = await supabase
        .from('transactions')
        .select('reference_no')
        .like('reference_no', `SP-${year}-%`)
      return nextDocNumber((existingPayments ?? []).map(r => r.reference_no), `SP-${year}-`)
    },
    async (docNo) => supabase
      .from('transactions')
      .insert({
        reference_no: docNo, transaction_type: 'supplier_payment', status: 'recorded',
        supplier_id: payload.supplierId, payment_method: payload.paymentMethod || null,
        cash_account_id: payload.cashAccountId ?? null,
        subtotal: payload.amount, total_amount: payload.amount,
        paid_at: payload.valueDate || new Date().toISOString().slice(0, 10),
        remarks: remarks || null, created_by: user.id,
      })
      .select('id')
      .single(),
  )
  if (insertError || !created) {
    handleError(insertError, 'Failed to record supplier payment.')
    toast.error(insertError?.message || 'Failed to record supplier payment.')
    loading.value = false
    return { success: false }
  }

  const { error: balanceError } = await supabase
    .from('suppliers').update({ balance: (supplier.balance ?? 0) - payload.amount }).eq('id', payload.supplierId)
  if (balanceError) console.warn('reissueSupplierPayment: supplier balance update failed:', balanceError.message)

  // The cash leaves the account it is paid from. voidSupplierPayment gives a
  // payment's amount back to its cash account, so a correction that voided the
  // old payment (cash back) and records this one must take this amount out —
  // without it the account ended up higher by the corrected amount.
  if (payload.cashAccountId != null) {
    const { data: account } = await supabase
      .from('cash_accounts').select('balance').eq('id', payload.cashAccountId).maybeSingle()
    const { error: cashError } = account
      ? await supabase.from('cash_accounts')
        .update({ balance: (account.balance ?? 0) - payload.amount }).eq('id', payload.cashAccountId)
      : { error: { message: 'cash account not found' } }
    if (cashError) {
      console.warn('reissueSupplierPayment: cash account balance update failed:', cashError.message)
      toast.warning(`Payment ${paymentNo} recorded, but its cash account balance was not updated. Verify it manually.`)
    }
  }

  const { error: logError } = await supabase.from('logs').insert({
    created_by: user.id, action: 'supplier_payment',
    description: `${paymentNo} | supplier ${payload.supplierId} | ${payload.amount}`, module: 'finance', transaction_id: created.id,
  })
  if (logError) console.warn('reissueSupplierPayment: activity log insert failed:', logError.message)

  toast.success('Supplier payment recorded.')
  await Promise.all([fetchSupplierPayments(), fetchSupplierAP()])
  loading.value = false
  return { success: true, paymentId: created.id, paymentNo }
}

/**
 * Per-invoice AP aging.
 *
 * Nothing in the schema links a supplier_payment to the stock_in it settled,
 * but every payment raised from "Pay" names its PO in the remarks. So a payment
 * pays the invoice(s) whose PO / SI number it names (see
 * allocateSupplierPayments); only a payment that names none is spread over
 * the supplier's oldest unpaid invoices. A named payment never lands on a
 * different PO: whatever its invoice could not take is listed in apUnapplied
 * (paid twice, or no such invoice received) for the accountant to look at.
 * The page states this; keep that disclosure if this changes.
 */
export async function fetchAPAging() {
  loading.value = true
  clearError()
  try {
    // Paged past PostgREST's 1,000-row cap; id last keeps the pages stable.
    const [invoiceRows, paymentRows] = await Promise.all([
      fetchAllRows<any>(() => supabase.from('transactions')
        .select('id, reference_no, si_no, po_no, remarks, supplier_id, total_amount, created_at, paid_at, supplier:supplier_id(name)')
        .eq('transaction_type', 'stock_in').neq('status', 'voided')
        .not('supplier_id', 'is', null)
        .order('id')),
      fetchAllRows<any>(() => supabase.from('transactions')
        .select('id, reference_no, supplier_id, total_amount, remarks, paid_at, created_at, supplier:supplier_id(name)')
        .eq('transaction_type', 'supplier_payment').neq('status', 'voided')
        .not('supplier_id', 'is', null)
        .order('id')),
    ])

    const invoices = invoiceRows
      .map((r) => ({
        transaction_id: r.id as number,
        reference_no: (r.si_no ?? r.reference_no ?? null) as string | null,
        supplier_id: r.supplier_id as number,
        supplier_name: (r.supplier?.name ?? null) as string | null,
        po_no: (r.po_no ?? null) as string | null,
        supplier_docs: supplierDocRefs(r.remarks),
        invoice_date: (r.paid_at ?? r.created_at ?? '') as string,
        total_amount: Number(r.total_amount ?? 0),
      }))
      .sort((a, b) => a.invoice_date.localeCompare(b.invoice_date) || a.transaction_id - b.transaction_id)

    // Oldest payment first, so two payments on one PO fill it in date order.
    const payments = paymentRows
      .map((p) => ({
        supplier_id: p.supplier_id as number,
        supplier_name: (p.supplier?.name ?? null) as string | null,
        payment_no: (p.reference_no ?? null) as string | null,
        amount: Number(p.total_amount ?? 0),
        remarks: (p.remarks ?? null) as string | null,
        date: (p.paid_at ?? p.created_at ?? '') as string,
        id: p.id as number,
      }))
      .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)

    const { paid, unapplied } = allocateSupplierPayments(invoices, payments)
    const supplierNames = new Map(payments.map((p) => [p.supplier_id, p.supplier_name]))

    const now = Date.now()
    const rows: APAgingRow[] = []
    invoices.forEach((invoice, i) => {
      const balance = Math.round((invoice.total_amount - paid[i]) * 100) / 100
      // Settled invoices drop out — this is an aging of what is still owed.
      if (balance <= 0.01) return
      const days = invoice.invoice_date
        ? Math.max(0, Math.floor((now - new Date(invoice.invoice_date).getTime()) / 86400000))
        : 0
      rows.push({ ...invoice, paid: paid[i], balance, days_outstanding: days, bucket: apBucketFor(days) })
    })
    apAging.value = rows
    apUnapplied.value = unapplied.map((u) => ({ ...u, supplier_name: supplierNames.get(u.supplier_id) ?? null }))
    return rows
  } catch (err) {
    handleError(err, 'Failed to compute supplier aging')
    apAging.value = []
    apUnapplied.value = []
    return []
  } finally {
    loading.value = false
  }
}

export async function fetchSupplierAP() {
  loading.value = true
  clearError()
  try {
    const [receivedRes, paidRes, suppliersRes] = await Promise.all([
      supabase.from('transactions').select('supplier_id, total_amount').eq('transaction_type', 'stock_in').neq('status', 'voided'),
      supabase.from('transactions').select('supplier_id, total_amount').eq('transaction_type', 'supplier_payment').neq('status', 'voided'),
      supabase.from('suppliers').select('id, name, balance'),
    ])
    if (receivedRes.error) throw receivedRes.error
    if (paidRes.error) throw paidRes.error
    if (suppliersRes.error) throw suppliersRes.error

    const received = new Map<number, number>()
    for (const row of (receivedRes.data || []) as any[]) {
      if (row.supplier_id == null) continue
      received.set(row.supplier_id, (received.get(row.supplier_id) ?? 0) + (row.total_amount ?? 0))
    }
    const paid = new Map<number, number>()
    for (const row of (paidRes.data || []) as any[]) {
      if (row.supplier_id == null) continue
      paid.set(row.supplier_id, (paid.get(row.supplier_id) ?? 0) + (row.total_amount ?? 0))
    }

    const rows: SupplierAPRow[] = ((suppliersRes.data || []) as any[])
      .map((s) => {
        const totalReceived = received.get(s.id) ?? 0
        const totalPaid = paid.get(s.id) ?? 0
        const outstanding = totalReceived - totalPaid
        const cachedBalance = s.balance ?? null
        return {
          supplier_id: s.id,
          supplier_name: s.name,
          total_received: totalReceived,
          total_paid: totalPaid,
          outstanding,
          cached_balance: cachedBalance,
          has_drift: cachedBalance != null && Math.abs(outstanding - cachedBalance) > 0.01,
        }
      })
      .filter((r) => r.total_received > 0 || r.total_paid > 0 || (r.cached_balance ?? 0) !== 0)

    supplierAP.value = rows
    return rows
  } catch (err) {
    handleError(err, 'Failed to fetch supplier AP')
    return []
  } finally {
    loading.value = false
  }
}

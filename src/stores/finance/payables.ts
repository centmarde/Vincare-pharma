// Supplier payments and Accounts Payable: the payment register, the reissue
// path change-request corrections use, and the per-supplier / per-invoice AP
// views.

import { supabase } from '@/lib/supabase'
import { useToast } from 'vue-toastification'
import { useAuthUserStore } from '@/stores/authUser'
import { nextDocNumber, insertWithDocRetry } from '@/utils/helpers'
import type { APAgingRow, DateRange, SupplierAPRow } from './types'
import { applyDateRange, apBucketFor } from './helpers'
import { mapSupplierPaymentRow } from './mappers'
import { supplierPayments, supplierAP, apAging, loading, handleError, clearError } from './state'

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
    let q = supabase.from('transactions')
      .select('*, supplier:supplier_id(name)')
      .eq('transaction_type', 'supplier_payment')
    if (options.supplierId) q = q.eq('supplier_id', options.supplierId)
    q = applyDateRange(q, 'paid_at', options)
    q = q.order('paid_at', { ascending: false })

    const { data, error: fetchError } = await q
    if (fetchError) throw fetchError
    supplierPayments.value = (data || []).map(mapSupplierPaymentRow)
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
 * ⚠️ THE INVOICE-TO-PAYMENT ALLOCATION IS DERIVED, NOT RECORDED. Nothing in
 * the schema says which stock_in a given supplier_payment settled — payments
 * are lump sums against the supplier. Each supplier's payments are therefore
 * applied to their OLDEST unpaid invoice first.
 *
 * Consequence: supplier-level totals always tie exactly, but a single
 * invoice's paid/balance can SHIFT if an older invoice is added or
 * back-dated later. This is the same convention and the same caveat the AR
 * Statement of Accounts register carries for DR-to-OR; the page states it to
 * the user, and that disclosure should survive any edit here.
 *
 * Making it a recorded fact means a payment-to-invoice child table and a
 * picker on the voucher, at which point this becomes the legacy fallback.
 */
export async function fetchAPAging() {
  loading.value = true
  clearError()
  try {
    const [invoicesRes, paymentsRes] = await Promise.all([
      supabase.from('transactions')
        .select('id, reference_no, si_no, supplier_id, total_amount, created_at, paid_at, supplier:supplier_id(name)')
        .eq('transaction_type', 'stock_in').neq('status', 'voided')
        .not('supplier_id', 'is', null),
      supabase.from('transactions')
        .select('supplier_id, total_amount, paid_at, created_at')
        .eq('transaction_type', 'supplier_payment').neq('status', 'voided')
        .not('supplier_id', 'is', null),
    ])
    if (invoicesRes.error) throw invoicesRes.error
    if (paymentsRes.error) throw paymentsRes.error

    // Total paid per supplier, to be spent oldest-invoice-first below.
    const paidBySupplier = new Map<number, number>()
    for (const p of (paymentsRes.data ?? []) as any[]) {
      paidBySupplier.set(p.supplier_id, (paidBySupplier.get(p.supplier_id) ?? 0) + (p.total_amount ?? 0))
    }

    const invoices = ((invoicesRes.data ?? []) as any[])
      .map((r) => ({
        transaction_id: r.id as number,
        reference_no: (r.si_no ?? r.reference_no ?? null) as string | null,
        supplier_id: r.supplier_id as number,
        supplier_name: (r.supplier?.name ?? null) as string | null,
        invoice_date: (r.paid_at ?? r.created_at ?? '') as string,
        total_amount: Number(r.total_amount ?? 0),
      }))
      .sort((a, b) => a.invoice_date.localeCompare(b.invoice_date))

    const now = Date.now()
    const rows: APAgingRow[] = []
    for (const invoice of invoices) {
      const available = paidBySupplier.get(invoice.supplier_id) ?? 0
      const paid = Math.min(invoice.total_amount, available)
      paidBySupplier.set(invoice.supplier_id, available - paid)
      const balance = invoice.total_amount - paid
      // Settled invoices drop out — this is an aging of what is still owed.
      if (balance <= 0.01) continue
      const days = invoice.invoice_date
        ? Math.max(0, Math.floor((now - new Date(invoice.invoice_date).getTime()) / 86400000))
        : 0
      rows.push({ ...invoice, paid, balance, days_outstanding: days, bucket: apBucketFor(days) })
    }
    apAging.value = rows
    return rows
  } catch (err) {
    handleError(err, 'Failed to compute supplier aging')
    apAging.value = []
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

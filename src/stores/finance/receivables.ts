// Accounts Receivable: order-level aging, the per-receivable drill-down and the
// per-customer Statement of Account. Read-only — Finance never mutates orders.
// (A payment on a POS charge is recorded through salesChargesData, not here.)

import { supabase } from '@/lib/supabase'
import type {
  ARAgingRow, ARReceivableDetail, ARReceivableLine, ARReceivablePayment, ARSource, SOAEntry, StatementOfAccount,
} from './types'
import { termFor } from './helpers'
import { arAging, loading, handleError, clearError } from './state'
import { fetchAllRows, fetchAllRowsForIds } from '@/stores/shared/paging'
import { chargeToAccount } from '@/utils/paymentMethods'
import { parseTermDays, toLocalISODate } from '@/utils/helpers'

// ─── POS sales charged to a customer account ───────────────────────────────
// A sale keeps no amount_paid: what is paid is the sum of its non-voided
// payments, and its due date is the customer's terms counted from the sale.

/** A charge still counts while a void request on it is pending. */
const openChargeStatuses = ['completed', 'change_request']

async function paidBySale(saleIds: number[]): Promise<Map<number, number>> {
  const rows = await fetchAllRowsForIds<{ transaction_id: number; amount: number | null }>(saleIds, (batch) =>
    supabase.from('collections').select('id, transaction_id, amount')
      .in('transaction_id', batch).is('voided_at', null).order('id', { ascending: true }))
  const paid = new Map<number, number>()
  for (const r of rows) paid.set(Number(r.transaction_id), (paid.get(Number(r.transaction_id)) ?? 0) + Number(r.amount ?? 0))
  return paid
}

/** Sale date + the customer's terms ('30 Days' -> 30). Null when the terms carry no number. */
function chargeDueDate(saleDate: string, termText: string | null | undefined): string | null {
  const days = parseTermDays(termText)
  if (days == null) return null
  return toLocalISODate(new Date(new Date(saleDate).getTime() + days * 86400000))
}

export async function fetchARAging() {
  loading.value = true
  clearError()
  try {
    const [ethicalRes, inhouseRes, posCharges] = await Promise.all([
      supabase.from('transactions')
        .select('id, ethical_no, total_amount, customer_id, ethical_details(amount_paid, due_date), customer:customer_id(name)')
        .eq('transaction_type', 'ethical_order').in('status', ['invoiced', 'partial']),
      supabase.from('transactions')
        .select('id, inhouse_no, total_amount, customer_id, inhouse_details(amount_paid, due_date), status, customer:customer_id(name)')
        // Must match gl_project_events' own in-house recognition gate: AR/revenue
        // isn't booked until delivery (the invoice point for a govt contract), so
        // an order still raised/negotiating/agreed/awaiting_stock/ready has no GL
        // impact yet and isn't a receivable — counting it here overstated AR by
        // ~20M against orders nothing has shipped for. 'paid' stays in the list
        // (harmless — filtered by the balance<=0.01 check below) so a rounding
        // underpayment still surfaces.
        .eq('transaction_type', 'inhouse_order').in('status', ['delivered', 'paid', 'partial']),
      fetchAllRows<any>(() => supabase.from('transactions')
        .select('id, sale_no, created_at, total_amount, customer_id, customer:customer_id(name, term_days), pos_sale_details!inner(payment_method)')
        .eq('transaction_type', 'sale').in('status', openChargeStatuses)
        .eq('pos_sale_details.payment_method', chargeToAccount)
        .order('id', { ascending: true })),
    ])
    if (ethicalRes.error) throw ethicalRes.error
    if (inhouseRes.error) throw inhouseRes.error
    const posPaid = await paidBySale(posCharges.map((r) => Number(r.id)))

    const now = Date.now()
    const rows: ARAgingRow[] = []

    for (const r of (ethicalRes.data || []) as any[]) {
      const amountPaid = r.ethical_details?.amount_paid ?? 0
      const balance = (r.total_amount ?? 0) - amountPaid
      if (balance <= 0.01) continue
      const dueDate = r.ethical_details?.due_date ?? null
      const daysOverdue = dueDate ? Math.floor((now - new Date(dueDate).getTime()) / 86400000) : null
      rows.push({
        id: r.id, source: 'ethical_order', reference_no: r.ethical_no,
        customer_id: r.customer_id ?? null, customer_name: r.customer?.name ?? null, total_amount: r.total_amount ?? 0,
        amount_paid: amountPaid, balance, due_date: dueDate,
        days_overdue: daysOverdue, term: termFor(daysOverdue),
      })
    }

    for (const r of (inhouseRes.data || []) as any[]) {
      const amountPaid = r.inhouse_details?.amount_paid ?? 0
      const balance = (r.total_amount ?? 0) - amountPaid
      if (balance <= 0.01) continue
      // inhouse_details.due_date exists now, so an in-house order CAN age.
      // Rows without one keep the old behaviour (no-term) rather than being
      // aged from the document date, which would invent a deadline nobody
      // agreed to. customers.term_days cannot fill the gap — it is free text
      // ('Consignment', '30 - 60 Days') with no number to count from.
      const dueDate = r.inhouse_details?.due_date ?? null
      const daysOverdue = dueDate
        ? Math.floor((now - new Date(dueDate).getTime()) / 86400000)
        : null
      rows.push({
        id: r.id, source: 'inhouse_order', reference_no: r.inhouse_no,
        customer_id: r.customer_id ?? null, customer_name: r.customer?.name ?? null, total_amount: r.total_amount ?? 0,
        amount_paid: amountPaid, balance, due_date: dueDate,
        days_overdue: daysOverdue, term: termFor(daysOverdue),
      })
    }

    for (const r of posCharges) {
      const amountPaid = posPaid.get(Number(r.id)) ?? 0
      const balance = (r.total_amount ?? 0) - amountPaid
      if (balance <= 0.01) continue
      const dueDate = chargeDueDate(r.created_at, r.customer?.term_days)
      const daysOverdue = dueDate ? Math.floor((now - new Date(dueDate).getTime()) / 86400000) : null
      rows.push({
        id: r.id, source: 'sale', reference_no: r.sale_no,
        customer_id: r.customer_id ?? null, customer_name: r.customer?.name ?? null, total_amount: r.total_amount ?? 0,
        amount_paid: amountPaid, balance, due_date: dueDate,
        days_overdue: daysOverdue, term: termFor(daysOverdue),
      })
    }

    rows.sort((a, b) => (b.days_overdue ?? -1) - (a.days_overdue ?? -1))
    arAging.value = rows
    return rows
  } catch (err) {
    handleError(err, 'Failed to fetch AR aging')
    return []
  } finally {
    loading.value = false
  }
}

// ─── AR jacket drill-down: one receivable's full detail, traced to its source
//     document. Read-only — Finance never mutates the order. The billed qty
//     comes off the direction-specific column (Ethical bills at order time
//     from qty_stock_out; In-House bills at delivery from
//     actual_count_stock_out), so displayed qty × unit price reconciles to
//     line_total. Payments read from the shared `collections` ledger, which
//     both In-House recordPayment and Ethical recordCollection write to. ──
export async function fetchReceivableDetail(
  source: ARSource,
  transactionId: number,
): Promise<ARReceivableDetail | null> {
  loading.value = true
  clearError()
  try {
    const extension = source === 'ethical_order'
      ? 'ethical_details(amount_paid, due_date, terms_days)'
      // due_date too: aging (fetchARAging) ages In-House orders by it, so the
      // detail must show the date the order is reported overdue against.
      : source === 'inhouse_order'
        ? 'inhouse_details(amount_paid, govt_po_no, due_date)'
        : 'pos_sale_details(payment_method)'

    const [txnRes, paymentsRes] = await Promise.all([
      supabase.from('transactions')
        .select(`id, status, created_at, total_amount, po_no, ethical_no, inhouse_no, sale_no,
                 customer:customer_id(name, term_days),
                 ${extension},
                 transaction_items!transaction_items_transaction_id_fkey(qty_stock_out, actual_count_stock_out, unit_price, line_total, products(product_name, unit))`)
        .eq('id', transactionId)
        .eq('transaction_type', source)
        .maybeSingle(),
      supabase.from('collections')
        .select('id, created_at, amount, payment_method, reference_no')
        .eq('transaction_id', transactionId)
        .is('voided_at', null)   // statement figure — voided payments don't count
        .order('created_at', { ascending: true }),
    ])
    if (txnRes.error) throw txnRes.error
    if (paymentsRes.error) throw paymentsRes.error
    const t = txnRes.data as any
    if (!t) { handleError(null, 'Receivable not found'); return null }

    const isSale = source === 'sale'
    const ext = isSale ? {} : (t[source === 'ethical_order' ? 'ethical_details' : 'inhouse_details'] ?? {})
    const total = t.total_amount ?? 0

    // Ethical bills what was ordered and a POS sale what was rung up (both
    // qty_stock_out); In-House bills what was delivered.
    const lines: ARReceivableLine[] = (t.transaction_items || []).map((li: any) => ({
      product_name: li.products?.product_name ?? null,
      unit: li.products?.unit ?? null,
      qty: (source === 'inhouse_order' ? li.actual_count_stock_out : li.qty_stock_out) ?? 0,
      unit_price: li.unit_price ?? 0,
      line_total: li.line_total ?? 0,
    }))

    const payments: ARReceivablePayment[] = (paymentsRes.data || []).map((p: any) => ({
      id: p.id,
      date: p.created_at,
      amount: p.amount ?? 0,
      payment_method: p.payment_method ?? null,
      reference_no: p.reference_no ?? null,
    }))
    // A sale keeps no amount_paid: it is the sum of its (non-voided) payments.
    const amountPaid = isSale ? payments.reduce((sum, p) => sum + p.amount, 0) : (ext.amount_paid ?? 0)

    return {
      id: t.id,
      source,
      reference_no: source === 'ethical_order' ? t.ethical_no : source === 'inhouse_order' ? t.inhouse_no : t.sale_no,
      status: t.status ?? null,
      customer_name: t.customer?.name ?? null,
      invoice_date: t.created_at ?? null,
      po_no: source === 'inhouse_order' ? (t.po_no ?? null) : null,
      govt_po_no: source === 'inhouse_order' ? (ext.govt_po_no ?? null) : null,
      terms_days: source === 'ethical_order' ? (ext.terms_days ?? null) : isSale ? parseTermDays(t.customer?.term_days) : null,
      due_date: isSale ? chargeDueDate(t.created_at, t.customer?.term_days) : (ext.due_date ?? null),
      total_amount: total,
      amount_paid: amountPaid,
      balance: total - amountPaid,
      lines,
      payments,
    }
  } catch (err) {
    handleError(err, 'Failed to fetch receivable detail')
    return null
  } finally {
    loading.value = false
  }
}

// ─── Statement of Account (per customer, full order + payment history) ──────

/**
 * `sourceHint`: which documents to state for a customer with NO department
 * (most of the imported book, the drugstores among them, is unassigned). An
 * assigned customer's department always decides. Without a hint an unassigned
 * customer gets the In-House statement, as before.
 */
export async function fetchStatementOfAccount(customerId: number, sourceHint?: ARSource): Promise<StatementOfAccount | null> {
  loading.value = true
  clearError()
  try {
    const { data: customer, error: custError } = await supabase
      .from('customers')
      .select('id, name, address, contact_no, tin_number, department')
      .eq('id', customerId)
      .maybeSingle()
    if (custError) throw custError
    if (!customer) { handleError(null, 'Customer not found'); return null }

    // A customer belongs to exactly one department — that's which order
    // type + which per-type reference column ("refCol") this statement reads.
    // A POS customer's charges are their sales charged to account.
    const source: ARSource = customer.department === 'ethical'
      ? 'ethical_order'
      : customer.department === 'inhouse'
        ? 'inhouse_order'
        : customer.department === 'pos' ? 'sale' : (sourceHint ?? 'inhouse_order')
    const refCol = source === 'ethical_order' ? 'ethical_no' : source === 'sale' ? 'sale_no' : 'inhouse_no'

    const ordersQuery = source === 'sale'
      ? supabase
          .from('transactions')
          .select('id, created_at, approved_at, total_amount, sale_no, pos_sale_details!inner(payment_method)')
          .eq('transaction_type', 'sale')
          .eq('customer_id', customerId)
          // Only what was charged; a cash sale was paid at the till.
          .eq('pos_sale_details.payment_method', chargeToAccount)
          .neq('status', 'voided')
          .order('created_at', { ascending: true })
      : supabase
          .from('transactions')
          .select(`id, created_at, approved_at, total_amount, ${refCol}`)
          .eq('transaction_type', source)
          .eq('customer_id', customerId)
          // An Ethical draft is still being haggled — not a charge yet.
          .neq('status', 'draft')
          .order('created_at', { ascending: true })
    const { data: orders, error: ordersError } = await ordersQuery
    if (ordersError) throw ordersError

    const orderRows = (orders ?? []) as any[]
    const orderIds = orderRows.map((o) => o.id)
    const orderRefById = new Map(orderRows.map((o) => [o.id, o[refCol] as string | null]))

    const { data: payments, error: paymentsError } = orderIds.length
      ? await supabase.from('collections')
          .select('id, transaction_id, created_at, amount, payment_method, reference_no')
          .in('transaction_id', orderIds)
          .is('voided_at', null)   // statement of account — voided payments don't count
          .order('created_at', { ascending: true })
      : { data: [] as any[], error: null }
    if (paymentsError) throw paymentsError

    const unsorted = [
      ...orderRows.map((o) => ({
        // Dated when it was INVOICED, not when the draft was started.
        // gl_project_events books the sale on coalesce(approved_at,
        // created_at); using created_at here would date a draft-then-confirmed
        // order earlier on the customer's statement than in the ledger.
        date: (o.approved_at ?? o.created_at) as string,
        type: 'charge' as const,
        reference_no: (o[refCol] as string | null) ?? null,
        description: `${source === 'sale' ? 'Charged sale' : 'Order'} ${o[refCol] ?? `#${o.id}`}`,
        charge: o.total_amount ?? 0,
        payment: 0,
      })),
      ...(payments ?? []).map((p: any) => ({
        date: p.created_at as string,
        type: 'payment' as const,
        reference_no: p.reference_no ?? orderRefById.get(p.transaction_id) ?? null,
        description: `Payment${p.payment_method ? ` (${p.payment_method})` : ''}`,
        charge: 0,
        payment: p.amount ?? 0,
      })),
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    let runningBalance = 0
    const entries: SOAEntry[] = unsorted.map((e) => {
      runningBalance += e.charge - e.payment
      return { ...e, running_balance: runningBalance }
    })

    return {
      customer_id: customerId,
      customer_name: customer.name ?? null,
      customer_address: customer.address ?? null,
      customer_contact: customer.contact_no ?? null,
      customer_tin: customer.tin_number ?? null,
      source,
      entries,
      totalCharges: entries.reduce((s, e) => s + e.charge, 0),
      totalPayments: entries.reduce((s, e) => s + e.payment, 0),
      endingBalance: runningBalance,
      generated_at: new Date().toISOString(),
    }
  } catch (err) {
    handleError(err, 'Failed to generate statement of account')
    return null
  } finally {
    loading.value = false
  }
}

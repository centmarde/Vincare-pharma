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
import { chargeToAccount, chequeLabel, collectionMethodLabel, returnCredit } from '@/utils/paymentMethods'
import { isConsignmentTerm, parseTermDays, toLocalISODate } from '@/utils/helpers'

// ─── POS sales charged to a customer account ───────────────────────────────
// A sale keeps no amount_paid: what is paid is the sum of its non-voided
// payments, and its due date is the customer's terms counted from the sale.

/** A charge still counts while a void request on it is pending. */
const openChargeStatuses = ['completed', 'change_request']

/** Non-voided payments per document: the total, and the latest date. THROWS if unreadable. */
async function paymentsByDocument(ids: number[]): Promise<Map<number, { paid: number; last: string | null }>> {
  const rows = await fetchAllRowsForIds<{ transaction_id: number; amount: number | null; created_at: string }>(ids, (batch) =>
    supabase.from('collections').select('id, transaction_id, amount, created_at')
      .in('transaction_id', batch).is('voided_at', null).order('id', { ascending: true }))
  const byDoc = new Map<number, { paid: number; last: string | null }>()
  for (const r of rows) {
    const id = Number(r.transaction_id)
    const cur = byDoc.get(id) ?? { paid: 0, last: null }
    cur.paid += Number(r.amount ?? 0)
    if (!cur.last || r.created_at > cur.last) cur.last = r.created_at
    byDoc.set(id, cur)
  }
  return byDoc
}

/** Latest delivery receipt per In-House order — when its goods last went out. */
async function lastDeliveryByOrder(orderIds: number[]): Promise<Map<number, string>> {
  const rows = await fetchAllRowsForIds<{ order_id: number; created_at: string }>(orderIds, (batch) =>
    supabase.from('delivery_receipts').select('id, order_id, created_at')
      .in('order_id', batch).order('id', { ascending: true }))
  const last = new Map<number, string>()
  for (const r of rows) {
    const cur = last.get(Number(r.order_id))
    if (!cur || r.created_at > cur) last.set(Number(r.order_id), r.created_at)
  }
  return last
}

const daysSince = (dateISO: string, now: number) => Math.floor((now - new Date(dateISO).getTime()) / 86400000)

/**
 * One aging row. A consignment customer's receivable is never overdue — they
 * pay as they sell — so it gets no due date and term 'no-term' (which keeps it
 * out of every overdue figure, the executive dashboard's included), and is aged
 * by days since delivery in `age_term` instead.
 */
function agingRow(r: {
  id: number; source: ARSource; reference_no: string | null
  customer_id: number | null; customer_name: string | null
  total_amount: number; amount_paid: number
  due_date: string | null; delivered_at: string | null
  term_text: string | null; last_payment_at: string | null
}, now: number): ARAgingRow {
  const consignment = isConsignmentTerm(r.term_text)
  const dueDate = consignment ? null : r.due_date
  const daysOverdue = dueDate ? daysSince(dueDate, now) : null
  const daysSinceDelivery = r.delivered_at ? daysSince(r.delivered_at, now) : null
  return {
    ...r,
    balance: r.total_amount - r.amount_paid,
    due_date: dueDate,
    days_overdue: daysOverdue,
    term: termFor(daysOverdue),
    consignment,
    days_since_delivery: daysSinceDelivery,
    age_term: termFor(daysSinceDelivery),
  }
}

/** Sale date + the customer's terms ('30 Days' -> 30). Null when the terms carry no number. */
function chargeDueDate(saleDate: string, termText: string | null | undefined): string | null {
  const days = parseTermDays(termText)
  if (days == null) return null
  return toLocalISODate(new Date(new Date(saleDate).getTime() + days * 86400000))
}

/**
 * Every open receivable, or one customer's. THROWS if any part is unreadable —
 * an aging missing a source reads as "they owe less" rather than as an error.
 */
async function buildARRows(customerId: number | null = null): Promise<ARAgingRow[]> {
  const [ethical, inhouse, posCharges] = await Promise.all([
    fetchAllRows<any>(() => {
      let q = supabase.from('transactions')
        .select('id, ethical_no, created_at, approved_at, total_amount, customer_id, ethical_details(amount_paid, due_date), customer:customer_id(name, term_days)')
        .eq('transaction_type', 'ethical_order').in('status', ['invoiced', 'partial'])
      if (customerId != null) q = q.eq('customer_id', customerId)
      return q.order('id', { ascending: true })
    }),
    fetchAllRows<any>(() => {
      let q = supabase.from('transactions')
        .select('id, inhouse_no, created_at, total_amount, customer_id, inhouse_details(amount_paid, due_date), status, customer:customer_id(name, term_days)')
        // Must match gl_project_events' own in-house recognition gate: AR/revenue
        // isn't booked until delivery (the invoice point for a govt contract), so
        // an order still raised/negotiating/agreed/awaiting_stock/ready has no GL
        // impact yet and isn't a receivable — counting it here overstated AR by
        // ~20M against orders nothing has shipped for. 'paid' stays in the list
        // (harmless — filtered by the balance<=0.01 check below) so a rounding
        // underpayment still surfaces.
        .eq('transaction_type', 'inhouse_order').in('status', ['delivered', 'paid', 'partial'])
      if (customerId != null) q = q.eq('customer_id', customerId)
      return q.order('id', { ascending: true })
    }),
    fetchAllRows<any>(() => {
      let q = supabase.from('transactions')
        .select('id, sale_no, created_at, total_amount, customer_id, customer:customer_id(name, term_days), pos_sale_details!inner(payment_method)')
        .eq('transaction_type', 'sale').in('status', openChargeStatuses)
        .eq('pos_sale_details.payment_method', chargeToAccount)
      if (customerId != null) q = q.eq('customer_id', customerId)
      return q.order('id', { ascending: true })
    }),
  ])
  const [payments, lastDelivery] = await Promise.all([
    paymentsByDocument([...ethical, ...inhouse, ...posCharges].map((r) => Number(r.id))),
    lastDeliveryByOrder(inhouse.map((r) => Number(r.id))),
  ])

  const now = Date.now()
  const rows: ARAgingRow[] = []

  for (const r of ethical) {
    const row = agingRow({
      id: r.id, source: 'ethical_order', reference_no: r.ethical_no,
      customer_id: r.customer_id ?? null, customer_name: r.customer?.name ?? null,
      total_amount: r.total_amount ?? 0, amount_paid: r.ethical_details?.amount_paid ?? 0,
      due_date: r.ethical_details?.due_date ?? null,
      // Invoiced = delivered for Ethical; the same date the GL books the sale on.
      delivered_at: r.approved_at ?? r.created_at ?? null,
      term_text: r.customer?.term_days ?? null,
      last_payment_at: payments.get(Number(r.id))?.last ?? null,
    }, now)
    if (row.balance > 0.01) rows.push(row)
  }

  for (const r of inhouse) {
    // inhouse_details.due_date exists now, so an in-house order CAN age.
    // Rows without one keep the old behaviour (no-term) rather than being
    // aged from the document date, which would invent a deadline nobody
    // agreed to. customers.term_days cannot fill the gap — it is free text
    // ('Consignment', '30 - 60 Days') with no number to count from.
    const row = agingRow({
      id: r.id, source: 'inhouse_order', reference_no: r.inhouse_no,
      customer_id: r.customer_id ?? null, customer_name: r.customer?.name ?? null,
      total_amount: r.total_amount ?? 0, amount_paid: r.inhouse_details?.amount_paid ?? 0,
      due_date: r.inhouse_details?.due_date ?? null,
      // The last delivery receipt; an order delivered before DRs existed (or an
      // opening receivable) falls back to its own date. Not updated_at — a
      // payment moves that.
      delivered_at: lastDelivery.get(Number(r.id)) ?? r.created_at ?? null,
      term_text: r.customer?.term_days ?? null,
      last_payment_at: payments.get(Number(r.id))?.last ?? null,
    }, now)
    if (row.balance > 0.01) rows.push(row)
  }

  for (const r of posCharges) {
    const row = agingRow({
      id: r.id, source: 'sale', reference_no: r.sale_no,
      customer_id: r.customer_id ?? null, customer_name: r.customer?.name ?? null,
      total_amount: r.total_amount ?? 0, amount_paid: payments.get(Number(r.id))?.paid ?? 0,
      due_date: chargeDueDate(r.created_at, r.customer?.term_days),
      delivered_at: r.created_at ?? null,
      term_text: r.customer?.term_days ?? null,
      last_payment_at: payments.get(Number(r.id))?.last ?? null,
    }, now)
    if (row.balance > 0.01) rows.push(row)
  }

  rows.sort((a, b) => (b.days_overdue ?? -1) - (a.days_overdue ?? -1))
  return rows
}

export async function fetchARAging() {
  loading.value = true
  clearError()
  try {
    const rows = await buildARRows()
    arAging.value = rows
    return rows
  } catch (err) {
    handleError(err, 'Failed to fetch AR aging')
    return []
  } finally {
    loading.value = false
  }
}

/**
 * One customer's open receivables, oldest delivery first, without touching the
 * shared aging list. Null when they could not be read — so a picker says so
 * instead of offering nothing to apply against.
 */
export async function fetchCustomerReceivables(customerId: number): Promise<ARAgingRow[] | null> {
  try {
    const rows = await buildARRows(customerId)
    return rows.sort((a, b) => String(a.delivered_at ?? '').localeCompare(String(b.delivered_at ?? '')))
  } catch (err) {
    console.error('fetchCustomerReceivables:', err)
    return null
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
        // '*': the cheque columns (20261023) come along when present.
        .select('*')
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
      remarks: p.remarks ?? null,
      cheque_bank: p.cheque_bank ?? null,
      cheque_no: p.cheque_no ?? null,
      cheque_date: p.cheque_date ?? null,
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

const refColOf = (source: ARSource) =>
  source === 'ethical_order' ? 'ethical_no' : source === 'sale' ? 'sale_no' : 'inhouse_no'

/**
 * One customer's statement — or several records of the same customer stated
 * together, as one envelope (the live book holds up to four copies of a
 * customer, each with its own orders). The first id is the one whose name and
 * address head the statement.
 *
 * `sourceHint`: which documents to state for a customer with NO department
 * (most of the imported book, the drugstores among them, is unassigned). An
 * assigned customer's department always decides. Without a hint an unassigned
 * customer gets the In-House statement, as before.
 */
export async function fetchStatementOfAccount(customerIds: number | number[], sourceHint?: ARSource): Promise<StatementOfAccount | null> {
  loading.value = true
  clearError()
  try {
    const ids = [...new Set(Array.isArray(customerIds) ? customerIds : [customerIds])]
    const { data: customerRows, error: custError } = await supabase
      .from('customers')
      .select('id, name, address, contact_no, tin_number, department')
      .in('id', ids)
    if (custError) throw custError
    const customers = (customerRows ?? []) as any[]
    const customer = customers.find((c) => c.id === ids[0]) ?? customers[0]
    if (!customer) { handleError(null, 'Customer not found'); return null }

    // A customer belongs to exactly one department — that's which order
    // type + which per-type reference column ("refCol") this statement reads.
    // A POS customer's charges are their sales charged to account.
    const sourceOf = (c: { department: string | null }): ARSource => c.department === 'ethical'
      ? 'ethical_order'
      : c.department === 'inhouse'
        ? 'inhouse_order'
        : c.department === 'pos' ? 'sale' : (sourceHint ?? 'inhouse_order')
    const idsBySource = new Map<ARSource, number[]>()
    for (const c of customers) {
      const s = sourceOf(c)
      idsBySource.set(s, [...(idsBySource.get(s) ?? []), c.id])
    }

    const orderRows: any[] = []
    for (const [source, sourceIds] of idsBySource) {
      const refCol = refColOf(source)
      const ordersQuery = source === 'sale'
        ? supabase
            .from('transactions')
            .select('id, created_at, approved_at, total_amount, sale_no, pos_sale_details!inner(payment_method)')
            .eq('transaction_type', 'sale')
            .in('customer_id', sourceIds)
            // Only what was charged; a cash sale was paid at the till.
            .eq('pos_sale_details.payment_method', chargeToAccount)
            .neq('status', 'voided')
            .order('created_at', { ascending: true })
        : supabase
            .from('transactions')
            .select(`id, created_at, approved_at, total_amount, ${refCol}`)
            .eq('transaction_type', source)
            .in('customer_id', sourceIds)
            // An Ethical draft is still being haggled — not a charge yet.
            .neq('status', 'draft')
            .order('created_at', { ascending: true })
      const { data: orders, error: ordersError } = await ordersQuery
      if (ordersError) throw ordersError
      for (const o of (orders ?? []) as any[]) orderRows.push({ ...o, _source: source, _ref: o[refCol] ?? null })
    }

    // The statement's department line: whichever channel most of it is.
    const sourceCounts = new Map<ARSource, number>()
    for (const o of orderRows) sourceCounts.set(o._source, (sourceCounts.get(o._source) ?? 0) + 1)
    const source: ARSource = [...sourceCounts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? sourceOf(customer)

    const orderIds = orderRows.map((o) => o.id)
    const orderRefById = new Map(orderRows.map((o) => [o.id, o._ref as string | null]))

    const { data: payments, error: paymentsError } = orderIds.length
      ? await supabase.from('collections')
          // '*': the cheque columns (20261023) come along when present.
          .select('*')
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
        reference_no: (o._ref as string | null) ?? null,
        description: `${o._source === 'sale' ? 'Charged sale' : 'Order'} ${o._ref ?? `#${o.id}`}`,
        charge: o.total_amount ?? 0,
        payment: 0,
      })),
      ...(payments ?? []).map((p: any) => ({
        date: p.created_at as string,
        type: 'payment' as const,
        reference_no: p.reference_no ?? orderRefById.get(p.transaction_id) ?? null,
        // A return credit is not money: it is the value of goods they returned.
        description: p.payment_method === returnCredit
          ? `Returned goods${p.reference_no ? ` (${p.reference_no})` : ''}`
          : `Payment${p.payment_method ? ` (${[collectionMethodLabel(p.payment_method), chequeLabel(p)].filter(Boolean).join(' — ')})` : ''}`,
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
      customer_id: customer.id,
      customer_ids: customers.map((c) => c.id),
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

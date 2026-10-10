// Accounts Receivable: order-level aging, the per-receivable drill-down and the
// per-customer Statement of Account. Read-only — Finance never mutates orders.

import { supabase } from '@/lib/supabase'
import type {
  ARAgingRow, ARReceivableDetail, ARReceivableLine, ARReceivablePayment, SOAEntry, StatementOfAccount,
} from './types'
import { termFor } from './helpers'
import { arAging, loading, handleError, clearError } from './state'

export async function fetchARAging() {
  loading.value = true
  clearError()
  try {
    const [ethicalRes, inhouseRes] = await Promise.all([
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
    ])
    if (ethicalRes.error) throw ethicalRes.error
    if (inhouseRes.error) throw inhouseRes.error

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
  source: 'ethical_order' | 'inhouse_order',
  transactionId: number,
): Promise<ARReceivableDetail | null> {
  loading.value = true
  clearError()
  try {
    const extension = source === 'ethical_order'
      ? 'ethical_details(amount_paid, due_date, terms_days)'
      : 'inhouse_details(amount_paid, govt_po_no)'

    const [txnRes, paymentsRes] = await Promise.all([
      supabase.from('transactions')
        .select(`id, status, created_at, total_amount, po_no, ethical_no, inhouse_no,
                 customer:customer_id(name),
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

    const ext = t[source === 'ethical_order' ? 'ethical_details' : 'inhouse_details'] ?? {}
    const amountPaid = ext.amount_paid ?? 0
    const total = t.total_amount ?? 0

    const lines: ARReceivableLine[] = (t.transaction_items || []).map((li: any) => ({
      product_name: li.products?.product_name ?? null,
      unit: li.products?.unit ?? null,
      qty: (source === 'ethical_order' ? li.qty_stock_out : li.actual_count_stock_out) ?? 0,
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

    return {
      id: t.id,
      source,
      reference_no: source === 'ethical_order' ? t.ethical_no : t.inhouse_no,
      status: t.status ?? null,
      customer_name: t.customer?.name ?? null,
      invoice_date: t.created_at ?? null,
      po_no: source === 'inhouse_order' ? (t.po_no ?? null) : null,
      govt_po_no: source === 'inhouse_order' ? (ext.govt_po_no ?? null) : null,
      terms_days: source === 'ethical_order' ? (ext.terms_days ?? null) : null,
      due_date: source === 'ethical_order' ? (ext.due_date ?? null) : null,
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

export async function fetchStatementOfAccount(customerId: number): Promise<StatementOfAccount | null> {
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
    const source: 'ethical_order' | 'inhouse_order' = customer.department === 'ethical' ? 'ethical_order' : 'inhouse_order'
    const refCol = source === 'ethical_order' ? 'ethical_no' : 'inhouse_no'

    const { data: orders, error: ordersError } = await supabase
      .from('transactions')
      .select(`id, created_at, approved_at, total_amount, ${refCol}`)
      .eq('transaction_type', source)
      .eq('customer_id', customerId)
      // An Ethical draft is still being haggled — not a charge yet.
      .neq('status', 'draft')
      .order('created_at', { ascending: true })
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
        description: `Order ${o[refCol] ?? `#${o.id}`}`,
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

import { ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import { getErrorMessage } from '@/utils/helpers'
import type { ARAgingTerm } from '@/stores/financeData'

// ─────────────────────────────────────────────────────────────────────────────
// AR Statement of Accounts register — the accountant's Excel "STATEMENT OF
// ACCOUNTS" sheet, rebuilt off live data.
//
// GRAIN: one row per DELIVERY RECEIPT, not per order. This is the difference
// from financeData.ts's fetchStatementOfAccount (a per-customer running-balance
// ledger) and from fetchARAging (order-level buckets) — both stay as they are;
// this is a third, wider view over the same underlying receivables.
//
// ⚠️ THE ALLOCATION IS DERIVED, NOT RECORDED. Payments live in `collections`
// against the ORDER (collections.transaction_id -> transactions.id); nothing in
// the schema says which OR settled which DR. This store applies each order's
// payments to its DRs OLDEST-DR-FIRST (the chosen convention). So:
//   * a DR's OR/AR figures can SHIFT if an earlier DR is added, back-dated, or
//     a payment is voided — they are a projection, not a stored fact;
//   * order-level totals always tie out exactly; per-DR ones tie out only under
//     this convention.
// If the accountant ever needs the DR-to-OR link stated explicitly, that means
// a delivery_receipt_id on `collections` and a picker on the collection form —
// at which point this allocation becomes the fallback for legacy rows.
//
// NOT SOURCED: the sheet's CREDIT (credit memos) and PDC (post-dated cheques)
// columns have no table behind them and none is being added — they render blank
// in the register. Deliberate: recording either on an existing table (as a
// `collections` row, say) would overstate cash and misstate the GL. See
// supabase/migrations/20260729_ar_soa_register.sql for what wiring them up
// would actually take.
// ─────────────────────────────────────────────────────────────────────────────

export type SOARegisterRow = {
  // identity
  delivery_receipt_id: number
  order_id: number | null
  source: 'inhouse_order' | 'ethical_order' | null

  // customer
  customer_id: number | null
  customer_name: string | null
  area: string | null

  // documents
  dr_date: string
  dr_no: string | null
  so_no: string | null        // the parent order's own number (IH-/EO-YYYY-###)
  po_no: string | null        // customer/government PO number
  po_amount: number | null    // customer/government PO value

  // money
  dr_amount: number
  discount: number            // order-level discount, pro-rated across its DRs
  or_date: string | null      // latest OR applied (see or_count)
  or_no: string | null
  or_amount: number           // TOTAL applied to this DR, across every OR
  or_count: number            // how many ORs touched it (>1 => or_no is partial)
  accounts_receivable: number // dr_amount - discount - or_amount

  // aging
  due_date: string | null
  days_outstanding: number | null  // since DR date
  days_overdue: number | null      // past due date — what the buckets key off
  amount_unpaid: number
  term: ARAgingTerm
  bucket_1_30: number
  bucket_31_60: number
  bucket_61_90: number
  bucket_91_180: number
  bucket_180_plus: number
}

export type SOARegisterTotals = {
  dr_amount: number
  discount: number
  or_amount: number
  accounts_receivable: number
  bucket_1_30: number
  bucket_31_60: number
  bucket_61_90: number
  bucket_91_180: number
  bucket_180_plus: number
}

export type SOARegisterFilters = {
  customerId?: number | null
  area?: string | null
  source?: 'inhouse_order' | 'ethical_order' | null
  dateFrom?: string | null
  dateTo?: string | null
  outstandingOnly?: boolean
}

function daysBetween(fromISO: string, to: number): number {
  return Math.floor((to - new Date(fromISO).getTime()) / 86400000)
}

function termFor(daysOverdue: number | null): ARAgingTerm {
  if (daysOverdue == null) return 'no-term'
  if (daysOverdue <= 0) return 'current'
  if (daysOverdue <= 30) return '1-30'
  if (daysOverdue <= 60) return '31-60'
  if (daysOverdue <= 90) return '61-90'
  if (daysOverdue <= 180) return '91-180'
  return '180+'
}

function addDays(dateISO: string, days: number): string {
  const d = new Date(dateISO)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

const EMPTY_TOTALS: SOARegisterTotals = {
  dr_amount: 0, discount: 0, or_amount: 0, accounts_receivable: 0,
  bucket_1_30: 0, bucket_31_60: 0, bucket_61_90: 0,
  bucket_91_180: 0, bucket_180_plus: 0,
}

export const useARStatementDataStore = defineStore('arStatementData', () => {
  const register: Ref<SOARegisterRow[]> = ref([])
  const totals: Ref<SOARegisterTotals> = ref({ ...EMPTY_TOTALS })
  const loading = ref(false)
  const error = ref('')

  function handleError(err: unknown, defaultMessage: string) {
    error.value = err ? getErrorMessage(err) : defaultMessage
    console.error(defaultMessage, err)
  }

  async function fetchSOARegister(filters: SOARegisterFilters = {}) {
    loading.value = true
    error.value = ''
    try {
      // 1. Delivery receipts + their lines, the parent order, and the customer.
      let drQuery = supabase
        .from('delivery_receipts')
        .select(
          'id, created_at, dr_no, order_id, source, customer_id, po_no, ' +
          'delivery_receipt_items(line_total), ' +
          'customer:customer_id(id, name, area, term_days), ' +
          'order:order_id(id, transaction_type, inhouse_no, ethical_no, po_no, po_amount, ' +
          'inhouse_details(govt_po_no), ethical_details(discount_amount, due_date))',
        )
        .order('created_at', { ascending: true })

      if (filters.customerId) drQuery = drQuery.eq('customer_id', filters.customerId)
      if (filters.source) drQuery = drQuery.eq('source', filters.source)
      if (filters.dateFrom) drQuery = drQuery.gte('created_at', filters.dateFrom)
      if (filters.dateTo) drQuery = drQuery.lte('created_at', `${filters.dateTo}T23:59:59.999`)

      const { data: drData, error: drError } = await drQuery
      if (drError) throw drError

      const drRows = (drData ?? []) as any[]
      if (!drRows.length) {
        register.value = []
        totals.value = { ...EMPTY_TOTALS }
        return []
      }

      const orderIds = [...new Set(drRows.map((d) => d.order_id).filter(Boolean))] as number[]

      // 2. The payments against those orders.
      const { data: collectionData, error: collectionError } = orderIds.length
        ? await supabase
            .from('collections')
            .select('id, transaction_id, created_at, amount, reference_no')
            .in('transaction_id', orderIds)
            .is('voided_at', null) // a voided payment never settled anything
            .order('created_at', { ascending: true })
        : { data: [] as any[], error: null }
      if (collectionError) throw collectionError

      // 3. Group the DRs by order — allocation is per-order, oldest DR first.
      const drsByOrder = new Map<number, any[]>()
      for (const dr of drRows) {
        if (dr.order_id == null) continue
        const list = drsByOrder.get(dr.order_id) ?? []
        list.push(dr)
        drsByOrder.set(dr.order_id, list)
      }
      for (const list of drsByOrder.values()) {
        list.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      }

      // Per-DR accumulators.
      const grossOf = new Map<number, number>()      // sum of line totals
      const discountOf = new Map<number, number>()
      const paidOf = new Map<number, number>()
      const orCountOf = new Map<number, number>()
      const lastOrOf = new Map<number, { date: string; no: string | null }>()

      for (const dr of drRows) {
        const gross = ((dr.delivery_receipt_items ?? []) as any[])
          .reduce((sum, li) => sum + (li.line_total ?? 0), 0)
        grossOf.set(dr.id, gross)
        discountOf.set(dr.id, 0)
        paidOf.set(dr.id, 0)
        orCountOf.set(dr.id, 0)
      }

      // 3a. Order-level discount, pro-rated across that order's DRs by value.
      // (A discount is agreed on the order, not on a single delivery, so
      // spreading it by DR share is the only split that keeps each DR's own
      // net proportional to what it actually delivered.)
      for (const list of drsByOrder.values()) {
        const order = list[0]?.order
        const ed = Array.isArray(order?.ethical_details) ? order?.ethical_details[0] : order?.ethical_details
        const discount = ed?.discount_amount ?? 0
        if (!discount) continue
        const orderGross = list.reduce((sum, dr) => sum + (grossOf.get(dr.id) ?? 0), 0)
        if (orderGross <= 0) continue
        let allocated = 0
        list.forEach((dr, i) => {
          // Last DR absorbs the rounding remainder so the split sums exactly.
          const share = i === list.length - 1
            ? discount - allocated
            : Math.round(((grossOf.get(dr.id) ?? 0) / orderGross) * discount * 100) / 100
          discountOf.set(dr.id, share)
          allocated += share
        })
      }

      // 3b. Payments — oldest DR first, oldest OR first.
      for (const c of (collectionData ?? []) as any[]) {
        const list = drsByOrder.get(c.transaction_id) ?? []
        let remaining = c.amount ?? 0
        for (const dr of list) {
          if (remaining <= 0) break
          const room =
            (grossOf.get(dr.id) ?? 0) -
            (discountOf.get(dr.id) ?? 0) -
            (paidOf.get(dr.id) ?? 0)
          if (room <= 0) continue
          const take = Math.min(room, remaining)
          paidOf.set(dr.id, (paidOf.get(dr.id) ?? 0) + take)
          orCountOf.set(dr.id, (orCountOf.get(dr.id) ?? 0) + 1)
          lastOrOf.set(dr.id, { date: c.created_at, no: c.reference_no ?? null })
          remaining -= take
        }
      }

      // 4. Build the rows.
      const now = Date.now()
      const rows: SOARegisterRow[] = drRows.map((dr) => {
        const order = dr.order
        const ed = Array.isArray(order?.ethical_details) ? order?.ethical_details[0] : order?.ethical_details
        const ih = Array.isArray(order?.inhouse_details) ? order?.inhouse_details[0] : order?.inhouse_details
        const customer = Array.isArray(dr.customer) ? dr.customer[0] : dr.customer

        const drAmount = grossOf.get(dr.id) ?? 0
        const discount = discountOf.get(dr.id) ?? 0
        const orAmount = paidOf.get(dr.id) ?? 0
        const ar = drAmount - discount - orAmount

        // Due date: the ethical order's own terms if it has them, else the
        // customer's standard terms counted from the delivery date. In-House
        // orders have no due-date convention of their own — without
        // customers.term_days they cannot age at all.
        const termDays = customer?.term_days ?? null
        const dueDate: string | null =
          ed?.due_date ?? (termDays != null ? addDays(dr.created_at, termDays) : null)

        const daysOverdue = dueDate ? daysBetween(dueDate, now) : null
        const unpaid = ar > 0.01 ? ar : 0
        const term = termFor(daysOverdue)
        const lastOr = lastOrOf.get(dr.id) ?? null

        return {
          delivery_receipt_id: dr.id,
          order_id: dr.order_id ?? null,
          source: dr.source ?? null,
          customer_id: dr.customer_id ?? null,
          customer_name: customer?.name ?? null,
          area: customer?.area ?? null,
          dr_date: dr.created_at,
          dr_no: dr.dr_no ?? null,
          so_no: order?.inhouse_no ?? order?.ethical_no ?? null,
          // In-House carries TWO PO numbers and the customer's statement wants
          // THEIRS: inhouse_details.govt_po_no is the government's own PO issued
          // to us. transactions.po_no is our internal company PO from the shared
          // Purchasing series — meaningless to the client — so it's only the
          // fallback (and the only one Ethical has).
          po_no: ih?.govt_po_no ?? dr.po_no ?? order?.po_no ?? null,
          po_amount: order?.po_amount ?? null,
          dr_amount: drAmount,
          discount,
          or_date: lastOr?.date ?? null,
          or_no: lastOr?.no ?? null,
          or_amount: orAmount,
          or_count: orCountOf.get(dr.id) ?? 0,
          accounts_receivable: ar,
          due_date: dueDate,
          days_outstanding: daysBetween(dr.created_at, now),
          days_overdue: daysOverdue,
          amount_unpaid: unpaid,
          term,
          bucket_1_30: term === '1-30' ? unpaid : 0,
          bucket_31_60: term === '31-60' ? unpaid : 0,
          bucket_61_90: term === '61-90' ? unpaid : 0,
          bucket_91_180: term === '91-180' ? unpaid : 0,
          bucket_180_plus: term === '180+' ? unpaid : 0,
        }
      })

      const filtered = rows.filter((r) => {
        if (filters.area && r.area !== filters.area) return false
        if (filters.outstandingOnly && r.accounts_receivable <= 0.01) return false
        return true
      })

      register.value = filtered
      totals.value = filtered.reduce<SOARegisterTotals>((acc, r) => ({
        dr_amount: acc.dr_amount + r.dr_amount,
        discount: acc.discount + r.discount,
        or_amount: acc.or_amount + r.or_amount,
        accounts_receivable: acc.accounts_receivable + r.accounts_receivable,
        bucket_1_30: acc.bucket_1_30 + r.bucket_1_30,
        bucket_31_60: acc.bucket_31_60 + r.bucket_31_60,
        bucket_61_90: acc.bucket_61_90 + r.bucket_61_90,
        bucket_91_180: acc.bucket_91_180 + r.bucket_91_180,
        bucket_180_plus: acc.bucket_180_plus + r.bucket_180_plus,
      }), { ...EMPTY_TOTALS })

      return filtered
    } catch (err) {
      handleError(err, 'Failed to build the statement of accounts register')
      register.value = []
      totals.value = { ...EMPTY_TOTALS }
      return []
    } finally {
      loading.value = false
    }
  }

  function resetStore() {
    register.value = []
    totals.value = { ...EMPTY_TOTALS }
    loading.value = false
    error.value = ''
  }

  return { register, totals, loading, error, fetchSOARegister, resetStore }
})

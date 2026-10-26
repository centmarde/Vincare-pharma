import { ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import { fetchAllRows, fetchAllRowsForIds } from '@/stores/shared/paging'
import { chargeToAccount } from '@/utils/paymentMethods'
import { getErrorMessage, isConsignmentTerm, toLocalISODate } from '@/utils/helpers'

// Goods out at consignment customers, by batch, and when they expire.
//
// Consignment here is pay-as-you-sell credit: the goods are the customer's from
// delivery, but the company takes back whatever EXPIRES on their shelf (a
// return, credited against their bill). So the company carries the expiry risk
// on everything it has delivered to them and not had back, and needs to see it
// coming to schedule a pick-up.
//
// What is still on their shelf is not recorded anywhere — the customer sells
// without telling us — so this is "delivered, not returned": the most that can
// still come back. Read-only.

/** How far ahead a batch at a consignment customer is flagged. */
export const consignmentExpiryWarnMonths = 6

export type ConsignmentBatchState = 'expired' | 'expiring' | 'ok' | 'no_expiry'

export type ConsignmentBatch = {
  key: string
  customer_id: number
  customer_name: string | null
  customer_area: string | null
  term_text: string | null
  product_id: number
  product_name: string | null
  batch_no: string | null
  expiry_date: string | null
  unit: string | null
  delivered_qty: number
  returned_qty: number
  /** Delivered and not returned. */
  out_qty: number
  /** out_qty at the price it was delivered at. */
  out_value: number
  last_delivered_at: string | null
  /** The orders / sales it went out on. */
  documents: string[]
  days_to_expiry: number | null
  state: ConsignmentBatchState
}

type Delivery = {
  customerId: number
  productId: number
  qty: number
  unitPrice: number
  date: string | null
  document: string | null
  product: { product_name?: string | null; batch_no?: string | null; expiry_date?: string | null; unit?: string | null } | null
}

/** The date `months` calendar months after today, as YYYY-MM-DD. */
function monthsFromToday(months: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() + months)
  return toLocalISODate(d)
}

export function consignmentBatchState(expiryDate: string | null, today = toLocalISODate(new Date())): ConsignmentBatchState {
  if (!expiryDate) return 'no_expiry'
  if (expiryDate < today) return 'expired'
  if (expiryDate <= monthsFromToday(consignmentExpiryWarnMonths)) return 'expiring'
  return 'ok'
}

const lineSelect = 'product_id, qty_stock_out, actual_count_stock_out, unit_price, products(product_name, batch_no, expiry_date, unit)'

export const useConsignmentDataStore = defineStore('consignmentData', () => {
  const batches: Ref<ConsignmentBatch[]> = ref([])
  const loading = ref(false)
  const error = ref('')

  async function fetchConsignmentStock(): Promise<ConsignmentBatch[]> {
    loading.value = true
    error.value = ''
    try {
      // 1. Who is on consignment. ilike narrows the read; the JS check is the
      // rule (the same one AR aging uses), so the two can never disagree.
      const customers = (await fetchAllRows<any>(() => supabase
        .from('customers')
        .select('id, name, area, term_days')
        .ilike('term_days', '%consign%')
        .order('id', { ascending: true })))
        .filter((c) => isConsignmentTerm(c.term_days))
      const customerById = new Map(customers.map((c) => [Number(c.id), c]))
      const ids = [...customerById.keys()]
      if (!ids.length) {
        batches.value = []
        return []
      }

      // 2. Everything that went out to them, and everything that came back.
      const [ethical, inhouse, charges, returns] = await Promise.all([
        fetchAllRowsForIds<any>(ids, (batch) => supabase.from('transactions')
          .select(`id, status, customer_id, ethical_no, created_at, approved_at, transaction_items!transaction_items_transaction_id_fkey(${lineSelect})`)
          .eq('transaction_type', 'ethical_order').in('customer_id', batch)
          .order('id', { ascending: true })),
        fetchAllRowsForIds<any>(ids, (batch) => supabase.from('transactions')
          .select(`id, status, customer_id, inhouse_no, created_at, transaction_items!transaction_items_transaction_id_fkey(${lineSelect})`)
          .eq('transaction_type', 'inhouse_order').in('customer_id', batch)
          .order('id', { ascending: true })),
        fetchAllRowsForIds<any>(ids, (batch) => supabase.from('transactions')
          .select(`id, status, customer_id, sale_no, created_at, pos_sale_details!inner(payment_method), transaction_items!transaction_items_transaction_id_fkey(${lineSelect})`)
          .eq('transaction_type', 'sale').in('customer_id', batch)
          .eq('pos_sale_details.payment_method', chargeToAccount)
          .order('id', { ascending: true })),
        fetchAllRowsForIds<any>(ids, (batch) => supabase.from('transactions')
          .select('id, status, customer_id, transaction_items!transaction_items_transaction_id_fkey(product_id, qty_stock_in)')
          .eq('transaction_type', 'sales_return').in('customer_id', batch)
          .order('id', { ascending: true })),
      ])

      // In-House goods leave per delivery receipt; the latest one dates them.
      const inhouseIds = inhouse.map((o) => Number(o.id))
      const receipts = await fetchAllRowsForIds<any>(inhouseIds, (batch) => supabase
        .from('delivery_receipts').select('id, order_id, created_at')
        .in('order_id', batch).order('id', { ascending: true }))
      const lastReceipt = new Map<number, string>()
      for (const r of receipts) {
        const cur = lastReceipt.get(Number(r.order_id))
        if (!cur || r.created_at > cur) lastReceipt.set(Number(r.order_id), r.created_at)
      }

      const deliveries: Delivery[] = []
      const take = (order: any, qtyOf: (line: any) => number, date: string | null, document: string | null) => {
        for (const line of order.transaction_items ?? []) {
          const qty = Number(qtyOf(line) ?? 0)
          if (line.product_id == null || !(qty > 0)) continue
          deliveries.push({
            customerId: Number(order.customer_id), productId: Number(line.product_id), qty,
            unitPrice: Number(line.unit_price ?? 0), date, document, product: line.products ?? null,
          })
        }
      }
      // Ethical: billed and sent at invoicing — a draft never left, a cancelled
      // order's stock came back.
      for (const o of ethical) {
        if (['draft', 'cancelled', 'voided'].includes(o.status)) continue
        take(o, (l) => l.qty_stock_out, o.approved_at ?? o.created_at, o.ethical_no ?? null)
      }
      // In-House: only what was actually delivered, partial deliveries included.
      for (const o of inhouse) {
        if (['cancelled', 'voided'].includes(o.status)) continue
        take(o, (l) => l.actual_count_stock_out, lastReceipt.get(Number(o.id)) ?? o.created_at, o.inhouse_no ?? null)
      }
      // POS: sales charged to their account (a void request pending still counts).
      for (const o of charges) {
        if (!['completed', 'change_request'].includes(o.status)) continue
        take(o, (l) => l.qty_stock_out, o.created_at, o.sale_no ?? null)
      }

      const returned = new Map<string, number>()
      for (const r of returns) {
        if (r.status === 'voided') continue
        for (const line of r.transaction_items ?? []) {
          if (line.product_id == null) continue
          const key = `${r.customer_id}:${line.product_id}`
          returned.set(key, (returned.get(key) ?? 0) + Number(line.qty_stock_in ?? 0))
        }
      }

      // 3. One row per customer per batch.
      const byKey = new Map<string, ConsignmentBatch & { _value: number }>()
      for (const d of deliveries) {
        const key = `${d.customerId}:${d.productId}`
        let row = byKey.get(key)
        if (!row) {
          const customer = customerById.get(d.customerId)
          row = {
            key,
            customer_id: d.customerId,
            customer_name: customer?.name ?? null,
            customer_area: customer?.area ?? null,
            term_text: customer?.term_days ?? null,
            product_id: d.productId,
            product_name: d.product?.product_name ?? null,
            batch_no: d.product?.batch_no ?? null,
            expiry_date: d.product?.expiry_date ?? null,
            unit: d.product?.unit ?? null,
            delivered_qty: 0, returned_qty: 0, out_qty: 0, out_value: 0,
            last_delivered_at: null, documents: [],
            days_to_expiry: null, state: 'no_expiry',
            _value: 0,
          }
          byKey.set(key, row)
        }
        row.delivered_qty += d.qty
        row._value += d.qty * d.unitPrice
        if (d.date && (!row.last_delivered_at || d.date > row.last_delivered_at)) row.last_delivered_at = d.date
        if (d.document && !row.documents.includes(d.document)) row.documents.push(d.document)
      }

      const today = toLocalISODate(new Date())
      const now = Date.now()
      const rows: ConsignmentBatch[] = []
      for (const { _value, ...row } of byKey.values()) {
        row.returned_qty = returned.get(row.key) ?? 0
        row.out_qty = Math.max(0, row.delivered_qty - row.returned_qty)
        if (row.out_qty <= 0) continue
        // Valued at the average price it went out at.
        row.out_value = row.delivered_qty > 0 ? Math.round((_value / row.delivered_qty) * row.out_qty * 100) / 100 : 0
        row.days_to_expiry = row.expiry_date
          ? Math.ceil((new Date(row.expiry_date).getTime() - now) / 86400000)
          : null
        row.state = consignmentBatchState(row.expiry_date, today)
        rows.push(row)
      }

      // Soonest to expire first; batches with no expiry on record last.
      rows.sort((a, b) =>
        (a.expiry_date ?? '9999-12-31').localeCompare(b.expiry_date ?? '9999-12-31')
        || String(a.customer_name ?? '').localeCompare(String(b.customer_name ?? '')))
      batches.value = rows
      return rows
    } catch (err) {
      console.error('fetchConsignmentStock:', err)
      error.value = getErrorMessage(err) || 'Could not load consignment stock.'
      batches.value = []
      return []
    } finally {
      loading.value = false
    }
  }

  return { batches, loading, error, fetchConsignmentStock }
})

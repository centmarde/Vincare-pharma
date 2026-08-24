import { ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import { useToast } from 'vue-toastification'
import type { Shortfall } from '@/utils/canvassTypes'

const toast = useToast()

// Purchasing-side view of "orders that need procurement" — the lead-dev
// directive to stop In-House/Ethical staff from ever seeing supplier
// information. They now only send a request ("we need these items, can you
// buy some?"); the purchaser owns canvassing entirely. No new table/column:
// the connector is the existing `logs` table (module 'inhouse'|'ethical',
// action 'procurement_requested'), same pattern as every other cross-module
// audit trail. An order is on this queue while it is still `awaiting_stock`
// (in-house: transactions.status; ethical: ethical_details.fulfillment_status)
// AND has a procurement_requested log — i.e. explicitly sent, not just short.

export type ProcurementOrderType = 'inhouse_order' | 'ethical_order'

export type ProcurementLineType = {
  item_id: number
  product_id: number | null
  product_name: string
  needed: number          // max(0, remaining_ordered - warehouse_on_hand) — read-only
}

export type ProcurementRequestType = {
  order_id: number
  order_type: ProcurementOrderType
  order_no: string | null
  customer_name: string | null
  requested_at: string
  note: string | null
  already_canvassed: boolean   // any line already carries a supplier_quotes audit trail
  lines: ProcurementLineType[]
  // Minimal shape SupplierCanvass/useCanvass need (CanvassableOrder)
  items: { id: number; product_id: number | null; product?: { product_name?: string | null } | null }[]
}

type RawItem = {
  id: number
  product_id: number | null
  qty_stock_out: number | null
  actual_count_stock_out: number | null
  supplier_quotes: unknown
  product: { product_name: string | null } | null
}

export const useProcurementDataStore = defineStore('procurementData', () => {
  const loading = ref(false)
  const error: Ref<string> = ref('')
  const queue: Ref<ProcurementRequestType[]> = ref([])

  const handleError = (err: unknown, defaultMessage: string) => {
    error.value = err instanceof Error ? err.message : defaultMessage
  }
  const clearError = () => { error.value = '' }

  // Staff-side: send the "please buy these" ping. Idempotent-ish — sending
  // again while still awaiting_stock just adds a newer log (e.g. after a
  // partial delivery re-opens a shortfall).
  const notifyPurchasing = async (
    orderType: ProcurementOrderType,
    orderId: number,
    note: string | undefined,
    userId: string,
  ): Promise<boolean> => {
    const module = orderType === 'inhouse_order' ? 'inhouse' : 'ethical'
    const { error: logError } = await supabase.from('logs').insert({
      module, action: 'procurement_requested', transaction_id: orderId,
      description: note || 'Stock shortfall — requested procurement.',
      created_by: userId,
    })
    if (logError) {
      toast.error('Failed to notify Purchasing. Please try again.')
      return false
    }
    toast.success('Purchasing has been notified.')
    return true
  }

  // Purchaser-side: an RFQ sheet was printed for this order's shortfall.
  // Logged, not stored as a document — the RFQ carries a reference number
  // derived from the order, and the paper itself is the record. This row is
  // only the audit trail of who asked for costing and when.
  const logRfqPrinted = async (
    orderType: ProcurementOrderType,
    orderId: number,
    rfqNo: string,
    description: string,
    userId: string,
  ): Promise<boolean> => {
    const module = orderType === 'inhouse_order' ? 'inhouse' : 'ethical'
    const { error: logError } = await supabase.from('logs').insert({
      module, action: 'rfq_printed', transaction_id: orderId,
      description: `${rfqNo} — ${description}`,
      created_by: userId,
    })
    if (logError) {
      // Non-fatal: the sheet has already been generated, and failing to log it
      // must not make the purchaser think the print failed.
      console.error(logError)
      return false
    }
    return true
  }

  // Staff-side: latest procurement_requested log for this order, so the
  // dialog can show "Sent to Purchasing on {date}" and disable re-sending
  // until a fresh shortfall episode.
  const fetchLatestRequest = async (orderId: number): Promise<{ created_at: string; description: string | null } | null> => {
    const { data, error: fetchError } = await supabase
      .from('logs')
      .select('created_at, description')
      .eq('action', 'procurement_requested')
      .eq('transaction_id', orderId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (fetchError) return null
    return data
  }

  // Purchaser-side: everything currently awaiting stock AND explicitly sent.
  // Shortfall is computed read-only (no stock movement, no status flip) —
  // that stays the staff's job via their own "Re-check stock" action.
  const fetchQueue = async (): Promise<ProcurementRequestType[]> => {
    loading.value = true
    clearError()
    try {
      const [logsRes, inhouseRes, ethicalRes] = await Promise.all([
        supabase.from('logs')
          .select('transaction_id, created_at, description')
          .eq('action', 'procurement_requested')
          .order('created_at', { ascending: true }),
        supabase.from('transactions')
          .select('id, inhouse_no, customer:customer_id(name), transaction_items!transaction_items_transaction_id_fkey(id, product_id, qty_stock_out, actual_count_stock_out, supplier_quotes, product:product_id(product_name))')
          .eq('transaction_type', 'inhouse_order')
          .eq('status', 'awaiting_stock'),
        supabase.from('transactions')
          .select('id, ethical_no, customer:customer_id(name), ethical_details!inner(fulfillment_status), transaction_items!transaction_items_transaction_id_fkey(id, product_id, qty_stock_out, actual_count_stock_out, supplier_quotes, product:product_id(product_name))')
          .eq('transaction_type', 'ethical_order')
          .eq('ethical_details.fulfillment_status', 'awaiting_stock'),
      ])
      if (logsRes.error) throw logsRes.error
      if (inhouseRes.error) throw inhouseRes.error
      if (ethicalRes.error) throw ethicalRes.error

      // Latest request per order (logs fetched ascending, so last write wins).
      const requestedAt = new Map<number, { created_at: string; description: string | null }>()
      for (const l of (logsRes.data ?? []) as any[]) {
        if (l.transaction_id != null) requestedAt.set(l.transaction_id, { created_at: l.created_at, description: l.description })
      }

      type Candidate = { order_type: ProcurementOrderType; id: number; order_no: string | null; customer_name: string | null; items: RawItem[] }
      const candidates: Candidate[] = [
        ...((inhouseRes.data ?? []) as any[])
          .filter((row) => requestedAt.has(row.id))
          .map((row) => ({
            order_type: 'inhouse_order' as const, id: row.id, order_no: row.inhouse_no,
            customer_name: row.customer?.name ?? null, items: (row.transaction_items ?? []) as RawItem[],
          })),
        ...((ethicalRes.data ?? []) as any[])
          .filter((row) => requestedAt.has(row.id))
          .map((row) => ({
            order_type: 'ethical_order' as const, id: row.id, order_no: row.ethical_no,
            customer_name: row.customer?.name ?? null, items: (row.transaction_items ?? []) as RawItem[],
          })),
      ]

      // Batch-fetch warehouse on-hand for every product referenced, one query
      // (not N) — read-only, mirrors the same comparison recheckStock does
      // internally, but without its side effects (stock draw / status flip).
      const productIds = Array.from(new Set(
        candidates.flatMap((c) => c.items.map((i) => i.product_id).filter((id): id is number => id != null)),
      ))
      const onHand = new Map<number, number>()
      if (productIds.length) {
        const { data: products, error: productsError } = await supabase
          .from('products').select('id, current_stock').in('id', productIds)
        if (productsError) throw productsError
        for (const p of (products ?? []) as any[]) onHand.set(p.id, p.current_stock ?? 0)
      }

      const rows: ProcurementRequestType[] = []
      for (const c of candidates) {
        const lines: ProcurementLineType[] = []
        let alreadyCanvassed = false
        for (const it of c.items) {
          if (it.supplier_quotes != null) alreadyCanvassed = true
          const remaining = (it.qty_stock_out ?? 0) - (it.actual_count_stock_out ?? 0)
          if (remaining <= 0) continue
          const stock = it.product_id != null ? (onHand.get(it.product_id) ?? 0) : 0
          const needed = Math.max(0, remaining - stock)
          if (needed <= 0) continue
          lines.push({
            item_id: it.id, product_id: it.product_id,
            product_name: it.product?.product_name ?? `#${it.product_id}`,
            needed,
          })
        }
        if (!lines.length) continue // stock has since covered it — staff's re-check will clear the order
        const req = requestedAt.get(c.id)!
        rows.push({
          order_id: c.id, order_type: c.order_type, order_no: c.order_no, customer_name: c.customer_name,
          requested_at: req.created_at, note: req.description,
          already_canvassed: alreadyCanvassed, lines,
          items: c.items.map((i) => ({ id: i.id, product_id: i.product_id, product: i.product })),
        })
      }
      rows.sort((a, b) => a.requested_at.localeCompare(b.requested_at))
      queue.value = rows
      return rows
    } catch (err) {
      handleError(err, 'Failed to load procurement requests')
      return []
    } finally {
      loading.value = false
    }
  }

  const shortfallFor = (req: ProcurementRequestType): Shortfall[] =>
    req.lines.map((l) => ({ product_id: l.product_id ?? 0, ordered: l.needed, on_hand: 0, needed: l.needed }))

  return {
    loading, error, queue,
    fetchQueue, notifyPurchasing, logRfqPrinted, fetchLatestRequest, shortfallFor,
    clearError,
  }
})

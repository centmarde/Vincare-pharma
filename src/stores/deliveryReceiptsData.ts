import { ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import type { ProductType } from '@/stores/productsData'

// A Delivery Receipt is a shared, cross-module fulfillment document with its own
// dedicated tables (delivery_receipts + delivery_receipt_items) — NOT a
// transactions hub row. It links to its parent order (inhouse_order OR
// ethical_order) via delivery_receipts.order_id, and every DR event is logged in
// the shared `logs` table against the parent order's transaction_id (that log
// trail is how the app assembles a document's cross-module timeline). In-House
// creates DRs inside deliver() (stock-moving); Ethical via issueDeliveryReceipt()
// (document-only). Both delegate the actual DR write to createDeliveryReceipt
// here — this store owns the DR tables.

export type DeliveryReceiptItemType = {
  id: number
  product_id: number | null
  qty: number
  product?: ProductType | null
}

export type DeliveryReceiptSource = 'inhouse_order' | 'ethical_order' | null

export type DeliveryReceiptType = {
  id: number
  created_at: string
  dr_no: string | null
  order_id: number | null       // parent order id
  order_no: string | null       // parent reference (IH-/EO-YYYY-###)
  source: DeliveryReceiptSource // which module the parent order belongs to
  po_no: string | null          // snapshot of the order's derived PO number (In-House only)
  customer_name: string | null
  received_by: string | null    // signatory printed name
  created_by: string | null
  items: DeliveryReceiptItemType[]
}

export type CreateDeliveryReceiptPayload = {
  orderId: number
  orderNo: string | null   // parent order's own reference_no (IH-/EO-YYYY-###) — the
                           // DR number is derived from this, not an independent series
  source: Exclude<DeliveryReceiptSource, null>
  customerId: number | null
  poNo: string | null
  receivedBy: string | null
  lines: { product_id: number | null; qty: number; unit_price: number | null }[]
}

const SELECT_DR =
  '*, delivery_receipt_items(id, product_id, qty, product:product_id(*)), ' +
  'order:order_id(inhouse_no, ethical_no), customer:customer_id(name)'

function mapDR(row: any): DeliveryReceiptType {
  return {
    id:            row.id,
    created_at:    row.created_at,
    dr_no:         row.dr_no,
    order_id:      row.order_id,
    order_no:      row.order?.inhouse_no ?? row.order?.ethical_no ?? null,
    source:        row.source ?? null,
    po_no:         row.po_no ?? null,
    customer_name: row.customer?.name ?? null,
    received_by:   row.received_by ?? null,
    created_by:    row.created_by,
    items: (row.delivery_receipt_items ?? []).map((li: any) => ({
      id:         li.id,
      product_id: li.product_id,
      qty:        li.qty,
      product:    li.product,
    })),
  }
}

export const useDeliveryReceiptsDataStore = defineStore('deliveryReceiptsData', () => {
  const loading = ref(false)
  const error: Ref<string> = ref('')

  const handleError = (err: unknown, msg: string) => { error.value = err instanceof Error ? err.message : msg }
  const clearError = () => { error.value = '' }

  // All DRs across every order (both modules), for the registry.
  const fetchDeliveryReceipts = async (): Promise<DeliveryReceiptType[]> => {
    loading.value = true
    clearError()
    try {
      const { data, error: e } = await supabase.from('delivery_receipts')
        .select(SELECT_DR)
        .order('created_at', { ascending: false })
      if (e) throw e
      return (data || []).map(mapDR)
    } catch (err) {
      handleError(err, 'Failed to fetch delivery receipts')
      return []
    } finally {
      loading.value = false
    }
  }

  const fetchDeliveryReceiptById = async (id: number): Promise<DeliveryReceiptType | null> => {
    const { data, error: e } = await supabase.from('delivery_receipts')
      .select(SELECT_DR).eq('id', id).single()
    if (e || !data) { handleError(e, 'Failed to load delivery receipt'); return null }
    return mapDR(data)
  }

  // Owns the DR-document write for both modules. Best-effort, not atomic
  // (JS-over-RPC convention): a header insert that succeeds while a line insert
  // fails leaves a DR with missing lines rather than rolling back. The caller
  // keeps its own stock-movement / status / logs writes.
  //
  // DR number is DERIVED from the parent order's own reference number, not an
  // independent series (lead-dev rule: a document's number stays constant
  // across the whole chain — only the letter-code prefix changes, e.g.
  // IH-2026-009 -> PO-2026-009 -> DR-2026-009). An order can spawn more than
  // one DR (partial deliveries in In-House, reprints in Ethical), so a
  // per-order suffix disambiguates: DR-2026-009-1, DR-2026-009-2, ...
  const createDeliveryReceipt = async (
    payload: CreateDeliveryReceiptPayload,
    userId: string,
  ): Promise<{ success: boolean; drId?: number; drNo?: string }> => {
    const base = (payload.orderNo ?? '').replace(/^(IH|EO)-/, 'DR-')
    const { count } = await supabase
      .from('delivery_receipts')
      .select('id', { count: 'exact', head: true })
      .eq('order_id', payload.orderId)
    const drNo = base ? `${base}-${(count ?? 0) + 1}` : null

    const { data: dr, error: drError } = await supabase
      .from('delivery_receipts')
      .insert({
        dr_no: drNo,
        order_id: payload.orderId,
        source: payload.source,
        customer_id: payload.customerId,
        po_no: payload.poNo,
        received_by: payload.receivedBy,
        created_by: userId,
      })
      .select('id')
      .single()
    if (drError || !dr) {
      handleError(drError, 'Failed to create delivery receipt.')
      return { success: false }
    }

    const rows = payload.lines
      .filter(l => l.qty > 0)
      .map(l => ({
        delivery_receipt_id: dr.id,
        product_id: l.product_id,
        qty: l.qty,
        unit_price: l.unit_price,
        line_total: (l.unit_price ?? 0) * l.qty,
      }))
    if (rows.length) {
      const { error: linesError } = await supabase.from('delivery_receipt_items').insert(rows)
      if (linesError) console.warn('createDeliveryReceipt: DR lines insert failed:', linesError.message)
    }

    return { success: true, drId: dr.id, drNo: drNo ?? undefined }
  }

  return { loading, error, fetchDeliveryReceipts, fetchDeliveryReceiptById, createDeliveryReceipt, clearError }
})

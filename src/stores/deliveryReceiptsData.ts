import { ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import type { ProductType } from '@/stores/productsData'

// A Delivery Receipt is a shared, cross-module document: a 'delivery_receipt'
// transactions row linked to its parent order (inhouse_order OR ethical_order)
// via parent_transaction_id, with its per-trip quantities in transaction_items.
// The signatory (received_by printed name) is stored in the hub row's remarks.
// In-House issues DRs inside inhouse_deliver (stock-moving); Ethical issues them
// document-only via ethical_issue_dr. This store owns reading them.

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
  govt_po_no: string | null     // snapshot of the government's PO number (In-House only)
  customer_name: string | null
  received_by: string | null    // signatory printed name (from remarks)
  created_by: string | null
  items: DeliveryReceiptItemType[]
}

const SELECT_DR =
  '*, transaction_items(id, product_id, qty, product:product_id(*)), ' +
  'parent:parent_transaction_id(reference_no, po_no, transaction_type, customer:customer_id(name))'

function mapDR(row: any): DeliveryReceiptType {
  const parent = row.parent ?? {}
  return {
    id:            row.id,
    created_at:    row.created_at,
    dr_no:         row.reference_no,
    order_id:      row.parent_transaction_id,
    order_no:      parent.reference_no ?? null,
    source:        parent.transaction_type ?? null,
    govt_po_no:    parent.po_no ?? row.po_no ?? null,
    customer_name: parent.customer?.name ?? null,
    received_by:   row.remarks ?? null,
    created_by:    row.created_by,
    items: (row.transaction_items ?? []).map((li: any) => ({
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
      const { data, error: e } = await supabase.from('transactions')
        .select(SELECT_DR).eq('transaction_type', 'delivery_receipt')
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
    const { data, error: e } = await supabase.from('transactions')
      .select(SELECT_DR).eq('id', id).eq('transaction_type', 'delivery_receipt').single()
    if (e || !data) { handleError(e, 'Failed to load delivery receipt'); return null }
    return mapDR(data)
  }

  return { loading, error, fetchDeliveryReceipts, fetchDeliveryReceiptById, clearError }
})

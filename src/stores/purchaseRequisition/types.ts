// Types ug constants para sa purchaseRequisitionData store. Gisplit na kini
// dụng 'stores/purchaseRequisition/*' - treat nga barrel - aron ma-maintain.
import type { PurchaseBreakdown, SupplierCharges } from '@/utils/computationHelpers'

export type PRItem = {
  id: number
  no: number
  unit: string
  product_name: string
  qty: number
  cost_per_unit: number
  product_id?: number
  sku?: string | null
  batch_no?: string | null
  supplier_name?: string | null
  supplier_id?: string | null
  expiry_date?: string | null
  actual_count_stock_in?: number | null
  warehouse_id?: number | null
}

export type RequisitionItemType = {
  no: number
  unit: string
  product_name: string
  qty: number
  cost_per_unit: number
  supplier_id: string | null
  actual_count_stock_in?: number | null
  expiry_date?: string | null
  batch_no?: string | null
  product_id?: number | null
  reorder_request_id?: number | null
}

export type PR = {
  id: number
  reference_no: string | null // NEW — the "live" doc number for this stage
  recent_transaction_no: string | null
  requisition_no: string
  po_no: string | null
  status: string
  remarks: string | null
  total_amount: number
  supplier_id: string | null
  supplier_name?: string | null
  created_at: string
  created_by: string
  approved_by: string | null
  updated_at: string | null
  requester_name?: string
  reviewer_name?: string
  actual_count_stock_in?: number | null
  items: PRItem[]
}

export type PurchaseRequisitionType = {
  remarks: string | null
  status: string
  requested_by: string | null
  supplier_id: string | null
}

export type CreatedPR = {
  transactionId: number
  requisitionNo: string
  supplierId: number
  itemCount: number
}

export type SavePRResult = {
  success: boolean
  createdPRs?: CreatedPR[]
}

/** Default "new requisition" form shape; used to init state and resetStore. */
export const defaultPRForm: PurchaseRequisitionType = {
  remarks: null,
  status: 'pending_approval',
  requested_by: null,
  supplier_id: null,
}

// References kept for clarity (these come from @/utils/computationHelpers), so
// feature files import them directly rather than through here.
export type { PurchaseBreakdown, SupplierCharges }
import type { SupplierType } from '@/stores/suppliersData'

// Matches `public.products` schema (with FK join to suppliers)
export type ProductType = {
  id: number
  created_at: string
  barcode: string | null
  sku: string | null
  product_name: string | null
  category: string | null
  unit: string | null
  cost_price: number | null
  selling_price: number | null
  current_stock: number | null
  reorder_level: number | null
  supplier_id: number | null
  batch_no: string | null
  expiry_date: string | null
  status: string | null
  brand: string | null
  remarks: string | null
  is_reorder: boolean | null
  is_disposed: boolean | null
  // Joined supplier data (via FK)
  suppliers: SupplierType | null
}

export type CreateProductData = {
  barcode?: string | null
  sku?: string | null
  product_name?: string | null
  category?: string | null
  unit?: string | null
  cost_price?: number | null
  selling_price?: number | null
  current_stock?: number | null
  reorder_level?: number | null
  supplier_id?: number | null
  batch_no?: string | null
  expiry_date?: string | null
  status?: string | null
  brand?: string | null
  remarks?: string | null
}

export type UpdateProductData = CreateProductData

export type FetchProductsOptions = {
  search?: string
  category?: string | null
  supplier_id?: number | null
  orderBy?: keyof Pick<
    ProductType,
    'created_at' | 'product_name' | 'current_stock' | 'selling_price' | 'cost_price'
  >
  ascending?: boolean
  limit?: number
  offset?: number
  eligibleIds?: number[]
  expiryStart?: string // 'YYYY-MM-DD'
  expiryEnd?: string // 'YYYY-MM-DD'
}

// Mirrors products_batches's RETURNS TABLE exactly (see
// supabase/migrations/20260925_products_batches.sql).
//
// ONE ROW PER BATCH, because one `products` row IS one batch. The picker
// groups them by product_name for display: in `name` mode it shows only each
// name's first row, in `batch` mode it expands to all of them. Rows arrive
// FEFO-ordered within a name, so that first row is the first-expiring batch —
// a defensible default, unlike products_master's min(id), which handed callers
// an arbitrary batch with nothing on screen to judge it by.
//
// `stock` is LOCATION-RESOLVED by the RPC (main warehouse vs a branch), so it
// is NOT interchangeable with products.current_stock — see stockSourcingData,
// the single resolver this mirrors. supplier_id is returned (Purchasing's PR
// dialogs set the line's supplier from it); supplier NAME deliberately is not.
export type ProductPickerResult = {
  id: number
  product_name: string | null
  brand: string | null
  unit: string | null
  sku: string | null
  batch_no: string | null
  expiry_date: string | null
  stock: number | null
  cost_price: number | null
  selling_price: number | null
  supplier_id: number | null
  /** How many batch rows share this product_name, across the whole match. */
  batch_count: number
  /** Distinct product_names matching the search — the paging total. */
  total_count: number
}

export type ReceiveStockUpdate = {
  transaction_item_id: number
  product_id: number
  sku: string | null
  actual_count_stock_in: number
  expiry_date?: string | null
  batch_no?: string | null
  cost_price?: number | null
}

export type SkuConflict = {
  sku: string
  receivingProduct: string
  existingProduct: string
  inThisReceipt: boolean
}

export type StockStatusBucket =
  | 'out-of-stock'
  | 'low-stock'
  | 'no-reorder-level'
  | 'expiring-soon'
  | 'expired'

export type StockStatusCounts = Record<StockStatusBucket, number>

export type StockStatusRef = { year: number; month: number } | null

/** Page size when pulling the expired-product set. The RPC caps at its own
 *  `page_limit`, so the set is paged to exhaustion rather than truncated. */
export const expiredPageSize = 1000

/** How long a fetched expired set stays trusted. Expiry rolls over at
 *  midnight, so a long-lived session must not hold one indefinitely. */
export const expiredSetCacheMs = 5 * 60 * 1000

/** Buckets shown as the warehouse's stock-status cards, in fetch order. I-manage
 *  ni direa aron ang stockStatus module maka-consume sa ahensa nga consistently. */
export const STOCK_STATUS_BUCKETS: StockStatusBucket[] = [
  'out-of-stock',
  'low-stock',
  'no-reorder-level',
  'expiring-soon',
  'expired',
]

/** Transaction types that represent reorder requests. */
export const REORDER_TYPES = [
  'reorder_outofstock',
  'reorder_lowstock',
  'reorder_expiring',
  'reorder_expired',
]
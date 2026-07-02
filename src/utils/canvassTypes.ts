// Shared types for the supplier-canvass flow (stock shortfall -> raise PRs),
// used by both In-House and Ethical orders against the transactions hub.

export type Shortfall = { product_id: number; ordered: number; on_hand: number; needed: number }

// One supplier's quote for a shortfall item during canvassing.
export type CanvassQuote = {
  supplier_id: number | null
  supplier_name: string
  price: number
  expiry_date: string          // "MM/YYYY" batch expiry the supplier quoted
  months_to_expiry: number     // computed from today
  is_valid: boolean            // months_to_expiry >= 18
}

// A committed selection sent to the canvass->PR RPC (one per shortfall item).
export type CanvassSelection = {
  item_id: number              // the order's transaction_item id
  product_id: number
  supplier_id: number          // winning supplier
  unit_price: number           // winning quote price
  qty: number                  // final order qty (>= shortfall, buffer allowed)
  canvass: CanvassQuote[]      // full quote list, for audit
}

export type CanvassPRResult = { supplier_id: number; pr_id: number; pr_no: string; item_count: number; total: number }

// Minimal order shape the canvass composable/component need - either In-House
// or Ethical order types satisfy this.
export type CanvassableOrder = {
  id: number
  items?: { id: number; product_id: number | null; product?: { product_name?: string | null } | null }[]
}

export type CanvassCommitResult = { success: boolean; prs?: CanvassPRResult[] }
export type CanvassCommitFn = (orderId: number, selections: CanvassSelection[]) => Promise<CanvassCommitResult>

// Product picker: loads the picker list at BATCH grain (products_batches RPC).
// Search fires per keystroke, so the request is dedicated to the shared
// state's pickerRequestId to drop stale responses.

import { supabase } from '@/lib/supabase'
import type { ProductPickerResult } from './types'
import { pickerProducts, pickerTotalCount, loading } from './state'

// Search fires per keystroke, so a slow earlier response can land after a later
// one. Stamped at module scope so the counter survives between calls. Kept here
// (not in state.ts) because it's only used by this picker, and a module-level
// mutable counter cannot be mutated through an import binding.
let pickerRequestId = 0

/**
 * Loads the product picker list at BATCH grain (products_batches).
 *
 * @param locationId Where the caller is picking stock FOR, which decides what
 * `stock` means on each row: `null` = the main warehouse
 * (products.current_stock), an id = that branch (warehouse_products.total_qty).
 * The two are not interchangeable — passing the wrong one reports another
 * location's stock on the order. Purchasing passes null: a PR mints a new
 * batch row and is not drawing from anywhere yet.
 */
export async function fetchProductPicker({
  search = '',
  limit = 15,
  locationId = null,
}: {
  search?: string
  limit?: number
  locationId?: number | null
}) {
  const requestId = ++pickerRequestId
  loading.value = true

  try {
    const { data, error } = await supabase.rpc('products_batches', {
      search_term: search,
      location_id: locationId,
      page_limit: limit,
    })

    if (error) {
      console.error(error)
      return
    }

    // A newer keystroke already fired — discard this result rather than
    // clobbering the list with matches for a term the user has moved past.
    if (requestId !== pickerRequestId) return

    // Every column the picker and its callers read comes off this one RPC —
    // unit, cost, selling price and supplier included — so selecting a row
    // needs no follow-up query.
    pickerProducts.value = (data ?? []) as ProductPickerResult[]
    pickerTotalCount.value = data?.[0]?.total_count ?? 0
  } finally {
    if (requestId === pickerRequestId) loading.value = false
  }
}
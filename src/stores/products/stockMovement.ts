// Moving main-warehouse stock (products.current_stock) without losing updates.
//
// The pattern everywhere used to be "read the stock, subtract, write the
// result". Two movements on the same product at once — a delivery and a
// transfer approval, two clerks — both read the same figure and the second
// write erases the first: stock drifts and nobody sees it happen.
//
// adjustMainStock writes ONLY if the stock is still the figure it read
// (compare-and-set), and on a clash re-reads and tries again, so concurrent
// movements each land on top of the other instead of overwriting it.

import { supabase } from '@/lib/supabase'

export type StockAdjustResult =
  | { ok: true; before: number; after: number }
  | {
    ok: false
    /** insufficient: would go below zero. conflict: kept clashing with other writers. */
    reason: 'insufficient' | 'not_found' | 'conflict' | 'error'
    onHand?: number
    message?: string
  }

const maxAttempts = 5

/**
 * Add `delta` to a product's main-warehouse stock (negative to deduct).
 * Refuses to go below zero.
 */
export async function adjustMainStock(productId: number, delta: number): Promise<StockAdjustResult> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { data, error } = await supabase
      .from('products').select('current_stock').eq('id', productId).maybeSingle()
    if (error) return { ok: false, reason: 'error', message: error.message }
    if (!data) return { ok: false, reason: 'not_found' }

    // Captured once: the guard below must compare against exactly the figure
    // the new value was computed from.
    const asRead = data.current_stock as number | null
    const before = Number(asRead ?? 0)
    const after = before + delta
    if (after < 0) return { ok: false, reason: 'insufficient', onHand: before }

    // Guarded on the figure just read; a NULL stock needs `is`, not `eq`.
    const base = supabase.from('products').update({ current_stock: after }).eq('id', productId)
    const guarded = asRead == null
      ? base.is('current_stock', null)
      : base.eq('current_stock', asRead)
    const { data: updated, error: updateError } = await guarded.select('id')
    if (updateError) return { ok: false, reason: 'error', message: updateError.message }
    if (updated?.length) return { ok: true, before, after }
    // Another movement landed between the read and the write — go again on
    // the fresh figure rather than overwrite it.
  }
  return { ok: false, reason: 'conflict' }
}

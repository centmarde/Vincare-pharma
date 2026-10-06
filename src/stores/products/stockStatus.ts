// Stock status and expired set: the RPC counts for the dashboard cards, paging
// the expired / per-bucket product rows, and the 5-minute cached expired-ID
// set that the sales guard reads (fetchExpiredProductIds / ensureExpiredProductIds).

import { supabase } from '@/lib/supabase'
import type {
  ProductType,
  StockStatusBucket,
  StockStatusCounts,
  StockStatusRef,
} from './types'
import { expiredPageSize, expiredSetCacheMs, STOCK_STATUS_BUCKETS } from './types'
import {
  expiredProductIds,
  expiredProductIdsFetchedAt,
  stockStatusCounts,
  stockStatusProducts,
  stockStatusProductsTotal,
  stockStatusLoading,
  lastStockStatusParams,
  handleError,
} from './state'

/**
 * Fills {@link expiredProductIds} from the warehouse's own `expired` bucket.
 *
 * Deliberately reads the ID list rather than re-deriving expiry in TS: the
 * definition of "expired" stays in one place (the RPC's
 * `expiry_date < current_date`), so the sales guard and the warehouse's
 * Expired card can never disagree about which products they mean.
 *
 * Pages to exhaustion. `page_limit` defaults to 200 server-side, and a set
 * silently truncated at the first page would leave the overflow sellable.
 *
 * @returns false when the read failed. Callers MUST block on false rather
 * than treat it as "nothing is expired" — same fail-closed rule
 * stockSourcingData.planSourcing follows for a failed stock read.
 */
export async function fetchExpiredProductIds(): Promise<boolean> {
  try {
    const ids = new Set<number>()
    let offset = 0
    for (;;) {
      const { data, error: rpcError } = await supabase.rpc('get_stock_status_products', {
        bucket_type: 'expired',
        excluded_ids: [],
        page_limit: expiredPageSize,
        page_offset: offset,
      })
      if (rpcError) throw rpcError
      const rows = (data ?? []) as { id: number; total_count: number }[]
      if (!rows.length) break
      for (const row of rows) ids.add(Number(row.id))
      offset += rows.length
      if (ids.size >= Number(rows[0]?.total_count ?? ids.size)) break
    }
    expiredProductIds.value = ids
    expiredProductIdsFetchedAt.value = Date.now()
    return true
  } catch (err) {
    handleError(err, 'Failed to check which products have expired')
    // Leave any previous set in place but mark it unusable, so a caller
    // cannot pass a guard on a stale copy it believes is current.
    expiredProductIdsFetchedAt.value = 0
    return false
  }
}

/**
 * Refetches the expired set when it is missing or older than
 * {@link expiredSetCacheMs}. Expiry rolls over at midnight, so a set loaded
 * earlier in a long-lived session is not safe to trust indefinitely.
 *
 * @returns false when the set could not be made current — block, don't sell.
 */
export async function ensureExpiredProductIds(force = false): Promise<boolean> {
  const age = Date.now() - expiredProductIdsFetchedAt.value
  if (!force && expiredProductIdsFetchedAt.value > 0 && age < expiredSetCacheMs) return true
  return await fetchExpiredProductIds()
}

/** Which of `ids` have expired. Read {@link ensureExpiredProductIds} first. */
export function expiredAmong(ids: (number | null | undefined)[]): number[] {
  const seen = new Set<number>()
  for (const id of ids) {
    if (id != null && expiredProductIds.value.has(Number(id))) seen.add(Number(id))
  }
  return [...seen]
}

// Fetches just total_count for one bucket (page_limit: 1 keeps it cheap)
const fetchStockStatusCount = async (
  bucketType: StockStatusBucket,
  ref: StockStatusRef,
  excludedIds: number[],
): Promise<number> => {
  try {
    const { data, error: rpcError } = await supabase.rpc('get_stock_status_products', {
      bucket_type: bucketType,
      ref_year: ref?.year ?? null,
      ref_month: ref?.month ?? null,
      excluded_ids: excludedIds,
      page_limit: 1,
      page_offset: 0,
    })
    if (rpcError) throw rpcError
    return data?.[0]?.total_count ?? 0
  } catch (err) {
    console.error(`Failed to fetch count for ${bucketType}:`, err)
    return 0
  }
}

// Fetches all 5 bucket counts in parallel — powers StockStatusCards
export const fetchAllStockStatusCounts = async (
  ref: StockStatusRef = null,
  excludedIds: number[] = [],
) => {
  lastStockStatusParams.value = { ref, excludedIds }
  try {
    const results = await Promise.all(
      STOCK_STATUS_BUCKETS.map((bucket) => fetchStockStatusCount(bucket, ref, excludedIds)),
    )
    const counts = {} as StockStatusCounts
    STOCK_STATUS_BUCKETS.forEach((bucket, i) => {
      counts[bucket] = results[i]
    })
    stockStatusCounts.value = counts
    return counts
  } catch (err) {
    handleError(err, 'Failed to fetch stock status counts')
    return stockStatusCounts.value
  }
}

// Fetches the full row list for one bucket — powers StockStatusDialog
export const fetchStockStatusProducts = async (
  bucketType: StockStatusBucket,
  ref: StockStatusRef = null,
  excludedIds: number[] = [],
  limit = 200,
  offset = 0,
  searchTerm = '',
) => {
  stockStatusLoading.value = true
  try {
    const { data, error: rpcError } = await supabase.rpc('get_stock_status_products', {
      bucket_type: bucketType,
      ref_year: ref?.year ?? null,
      ref_month: ref?.month ?? null,
      excluded_ids: excludedIds,
      page_limit: limit,
      page_offset: offset,
      search_term: searchTerm,
    })
    if (rpcError) throw rpcError

    stockStatusProducts.value = (data || []) as ProductType[]
    stockStatusProductsTotal.value = data?.[0]?.total_count ?? 0
    return stockStatusProducts.value
  } catch (err) {
    handleError(err, `Failed to fetch products for ${bucketType}`)
    stockStatusProducts.value = []
    stockStatusProductsTotal.value = 0
    return []
  } finally {
    stockStatusLoading.value = false
  }
}
import { ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import { getErrorMessage } from '@/utils/helpers'
import { useStockSourcingStore } from '@/stores/stockSourcingData'

/**
 * EXPIRING INVENTORY — one month's worth of at-risk stock.
 *
 * Reads the product master for rows whose `expiry_date` falls inside one
 * calendar month. Remember a `products` row IS a batch (batch_no + expiry_date
 * are columns on the row), so "17 items expiring in October" means 17 batch
 * rows, not 17 distinct drugs.
 *
 * Valuation is at COST (`cost_price`), never selling price — this is a
 * write-down exposure figure, and cost is the basis an accountant writes down
 * against. The report says so on its face.
 *
 * Rows at zero stock are excluded: a spent batch carries no exposure, however
 * long ago it expired. (The `expired` card on the products widget does NOT
 * make this exclusion, which is why its count runs slightly high.)
 */

export type ExpiryItem = {
  product_id: number
  product_name: string
  sku: string | null
  category: string | null
  expiry_date: string
  quantity: number
  cost_price: number
  /** quantity × cost_price, precomputed so every consumer shows the same figure. */
  value: number
}

/** Where a month's at-risk stock sits, so the report can state the branch position. */
export type BranchHolding = {
  locationId: number
  locationName: string
  /** Total units of THIS month's expiring products held at that branch. */
  units: number
}

export type ExpiryMonthReport = {
  year: number
  month: number
  items: ExpiryItem[]
  totalValue: number
  totalUnits: number
  /**
   * Branches holding any of these products. An EMPTY array means every branch
   * was read and none holds any — which the report states explicitly. A `null`
   * means the branch read FAILED, and the report must say the branch position
   * is unknown rather than claim it is clear.
   */
  branchHoldings: BranchHolding[] | null
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * Month bounds as plain strings. Deliberately string arithmetic rather than JS
 * `Date` month math — the same choice `glData`'s date helpers make, for the
 * same reason: a `Date` here drifts by a day either side of midnight depending
 * on the viewer's timezone, and an expiry landing in the wrong month silently
 * moves money between two reports.
 */
function monthBounds(year: number, month: number): { start: string; end: string } {
  const nextYear = month === 12 ? year + 1 : year
  const nextMonth = month === 12 ? 1 : month + 1
  return {
    start: `${year}-${pad2(month)}-01`,
    end: `${nextYear}-${pad2(nextMonth)}-01`,
  }
}

export const useExpiryReportDataStore = defineStore('expiryReportData', () => {
  const stockSourcing = useStockSourcingStore()

  const report: Ref<ExpiryMonthReport | null> = ref(null)
  const loading = ref(false)
  const error: Ref<string> = ref('')

  function handleError(err: unknown, fallback: string) {
    console.error(err)
    error.value = getErrorMessage(err) || fallback
  }

  function clearError() {
    error.value = ''
  }

  /**
   * Which branches hold any of the expiring products. Reported per branch so
   * the recovery advice can name where to move stock FROM, and so "no branch
   * holds any of this" is a stated fact rather than an untested assumption.
   *
   * `availabilityAt` returns null on a failed read (distinct from an empty
   * map, which means "genuinely none"), so one failed branch makes the whole
   * branch position unknown rather than silently under-reporting it.
   */
  async function fetchBranchHoldings(productIds: number[]): Promise<BranchHolding[] | null> {
    if (!productIds.length) return []

    const locations = await stockSourcing.fetchLocations()
    const branches = locations.filter((l) => !l.isMain)
    if (!branches.length) return []

    const holdings: BranchHolding[] = []
    for (const branch of branches) {
      const available = await stockSourcing.availabilityAt(branch.id, productIds)
      if (available == null) return null

      let units = 0
      for (const qty of available.values()) units += qty
      if (units > 0) {
        holdings.push({ locationId: branch.id as number, locationName: branch.name, units })
      }
    }
    return holdings
  }

  /**
   * Everything expiring in one calendar month, ranked by value at cost.
   * @param year  four-digit year
   * @param month 1-12
   */
  async function fetchExpiryMonth(year: number, month: number): Promise<ExpiryMonthReport | null> {
    loading.value = true
    clearError()
    try {
      const { start, end } = monthBounds(year, month)
      const { data, error: fetchError } = await supabase
        .from('products')
        .select('id, product_name, sku, category, expiry_date, current_stock, cost_price')
        .gte('expiry_date', start)
        .lt('expiry_date', end)
        .gt('current_stock', 0)
      if (fetchError) throw fetchError

      const items: ExpiryItem[] = (data || []).map((row) => {
        const quantity = Number(row.current_stock ?? 0)
        const costPrice = Number(row.cost_price ?? 0)
        return {
          product_id: row.id as number,
          product_name: (row.product_name as string) || '—',
          sku: (row.sku as string) ?? null,
          category: (row.category as string) ?? null,
          expiry_date: row.expiry_date as string,
          quantity,
          cost_price: costPrice,
          value: quantity * costPrice,
        }
      })

      items.sort((a, b) => b.value - a.value)

      const branchHoldings = await fetchBranchHoldings(items.map((i) => i.product_id))

      report.value = {
        year,
        month,
        items,
        totalValue: items.reduce((sum, i) => sum + i.value, 0),
        totalUnits: items.reduce((sum, i) => sum + i.quantity, 0),
        branchHoldings,
      }
      return report.value
    } catch (err) {
      handleError(err, `Failed to load expiring inventory for ${year}-${pad2(month)}`)
      report.value = null
      return null
    } finally {
      loading.value = false
    }
  }

  /**
   * Which months actually have expiring stock, for the month picker — so it
   * offers months that hold something instead of an open-ended calendar.
   * Returned newest-first as `{ year, month, itemCount }`.
   */
  async function fetchMonthsWithExpiries(): Promise<
    { year: number; month: number; itemCount: number }[]
  > {
    clearError()
    try {
      const { data, error: fetchError } = await supabase
        .from('products')
        .select('expiry_date')
        .not('expiry_date', 'is', null)
        .gt('current_stock', 0)
      if (fetchError) throw fetchError

      const counts = new Map<string, number>()
      for (const row of data || []) {
        const key = String(row.expiry_date).slice(0, 7) // 'YYYY-MM'
        counts.set(key, (counts.get(key) ?? 0) + 1)
      }

      return [...counts.entries()]
        .map(([key, itemCount]) => ({
          year: Number(key.slice(0, 4)),
          month: Number(key.slice(5, 7)),
          itemCount,
        }))
        .sort((a, b) => b.year - a.year || b.month - a.month)
    } catch (err) {
      handleError(err, 'Failed to load months with expiring stock')
      return []
    }
  }

  /**
   * How many products carry no expiry date at all. Not part of any month's
   * exposure, but a coverage caveat the report states so the totals are not
   * read as the whole picture.
   */
  async function fetchMissingExpiryCount(): Promise<number> {
    clearError()
    try {
      const { count, error: fetchError } = await supabase
        .from('products')
        .select('id', { count: 'exact', head: true })
        .is('expiry_date', null)
      if (fetchError) throw fetchError
      return count ?? 0
    } catch (err) {
      handleError(err, 'Failed to count products without an expiry date')
      return 0
    }
  }

  /**
   * Total catalogue size, so the report can say "17 of 1,074 SKUs" and the
   * reader can judge how much of the product master the figures cover.
   */
  async function fetchCatalogueCount(): Promise<number> {
    clearError()
    try {
      const { count, error: fetchError } = await supabase
        .from('products')
        .select('id', { count: 'exact', head: true })
      if (fetchError) throw fetchError
      return count ?? 0
    } catch (err) {
      handleError(err, 'Failed to count catalogue products')
      return 0
    }
  }

  function resetStore() {
    report.value = null
    loading.value = false
    clearError()
  }

  return {
    // State
    report,
    loading,
    error,

    // Actions
    fetchExpiryMonth,
    fetchMonthsWithExpiries,
    fetchMissingExpiryCount,
    fetchCatalogueCount,
    clearError,
    resetStore,
  }
})

import { ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import { getErrorMessage } from '@/utils/helpers'

/**
 * WHERE STOCK LIVES — the single resolver.
 *
 * Stock sits in two shapes that are NOT interchangeable:
 *
 *   main warehouse   products.current_stock          (a column, no `warehouses` row)
 *   a branch/store   warehouse_products.total_qty    (keyed by warehouse_id)
 *
 * Every screen that picks a location, asks "how much is there", or moves stock
 * goes through this store, so the main-vs-branch split is written down ONCE.
 * Inlining that check elsewhere is how two copies drift apart and a screen
 * quietly reports (or draws from) the wrong place — the same failure mode
 * `glAccountCodeFor` exists to prevent.
 *
 * A location id of `null` means the main warehouse: it has no `warehouses` row
 * to point at. If it is ever given one, only this file changes.
 */

/** `null` = the main warehouse (products.current_stock). */
export type StockLocationId = number | null

export type StockLocation = {
  id: StockLocationId
  name: string
  isMain: boolean
}

/** How much of one product sits at one location. */
export type LocationStock = {
  location: StockLocation
  qty: number
}

/**
 * What one order line can draw from the chosen location. `take` is what the
 * location can actually supply; `short` is the remainder needing a transfer or a
 * purchase. There is deliberately NO automatic fall-through to another location
 * — the source is the user's choice, not the system's.
 */
export type SourcingLine = {
  product_id: number
  need: number
  take: number
  short: number
}

export const mainWarehouseName = 'Main Warehouse'

export const mainLocation: StockLocation = { id: null, name: mainWarehouseName, isMain: true }

// A long `.in()` list can outgrow the request URL. Same chunk width
// productsData.fetchProductsByIds already uses.
const idChunkSize = 500

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

export const useStockSourcingStore = defineStore('stockSourcing', () => {
  const locations: Ref<StockLocation[]> = ref([])
  const loading = ref(false)
  const error = ref('')

  function handleError(err: unknown, fallback: string) {
    console.error(err)
    error.value = getErrorMessage(err) || fallback
  }

  function clearError() {
    error.value = ''
  }

  /**
   * Every place stock can be held: the main warehouse first (it holds the bulk
   * of the catalogue), then each branch. Ordered so a picker's default lands on
   * main rather than on whichever warehouse happens to sort first.
   */
  async function fetchLocations(): Promise<StockLocation[]> {
    loading.value = true
    clearError()
    try {
      const { data, error: fetchError } = await supabase
        .from('warehouses')
        .select('id, name')
        .order('name', { ascending: true })
      if (fetchError) throw fetchError

      const branches: StockLocation[] = (data || []).map((w) => ({
        id: w.id as number,
        name: (w.name as string) || `Warehouse #${w.id}`,
        isMain: false,
      }))
      locations.value = [mainLocation, ...branches]
      return locations.value
    } catch (err) {
      handleError(err, 'Failed to load stock locations')
      return []
    } finally {
      loading.value = false
    }
  }

  function locationById(id: StockLocationId): StockLocation {
    if (id == null) return mainLocation
    return (
      locations.value.find((l) => l.id === id) ?? { id, name: `Warehouse #${id}`, isMain: false }
    )
  }

  /**
   * On-hand per product AT ONE LOCATION. Products with no row at that location
   * are simply absent from the map — callers read a missing key as zero, which
   * is what "this branch has never held it" means.
   *
   * Returns `null` if the read FAILED, which is not the same as "nothing in
   * stock": an empty map would let a dropped connection look like a genuine
   * shortage and quietly produce an order sourced with nothing.
   */
  async function availabilityAt(
    locationId: StockLocationId,
    productIds: number[],
  ): Promise<Map<number, number> | null> {
    const result = new Map<number, number>()
    const unique = [...new Set(productIds.filter((id) => id != null))]
    if (!unique.length) return result

    clearError()
    try {
      for (const ids of chunk(unique, idChunkSize)) {
        if (locationId == null) {
          const { data, error: fetchError } = await supabase
            .from('products')
            .select('id, current_stock')
            .in('id', ids)
          if (fetchError) throw fetchError
          for (const row of data || []) {
            result.set(row.id as number, (row.current_stock as number | null) ?? 0)
          }
        } else {
          const { data, error: fetchError } = await supabase
            .from('warehouse_products')
            .select('product_id, total_qty')
            .eq('warehouse_id', locationId)
            .in('product_id', ids)
          if (fetchError) throw fetchError
          for (const row of data || []) {
            const pid = row.product_id as number | null
            if (pid == null) continue
            // A product can hold more than one row at a branch; sum rather than
            // let the last one win, or stock silently disappears from the total.
            result.set(pid, (result.get(pid) ?? 0) + ((row.total_qty as number | null) ?? 0))
          }
        }
      }
      return result
    } catch (err) {
      handleError(err, 'Failed to read stock for this location')
      return null
    }
  }

  /**
   * Every location holding each product, for the "it is short here, but we have
   * it over there" panel. Locations with nothing are omitted.
   */
  async function availabilityAcross(productIds: number[]): Promise<Map<number, LocationStock[]>> {
    const result = new Map<number, LocationStock[]>()
    const unique = [...new Set(productIds.filter((id) => id != null))]
    if (!unique.length) return result

    clearError()
    if (!locations.value.length) await fetchLocations()

    try {
      for (const ids of chunk(unique, idChunkSize)) {
        const [mainRes, branchRes] = await Promise.all([
          supabase.from('products').select('id, current_stock').in('id', ids),
          supabase
            .from('warehouse_products')
            .select('product_id, warehouse_id, total_qty')
            .not('warehouse_id', 'is', null)
            .in('product_id', ids),
        ])
        if (mainRes.error) throw mainRes.error
        if (branchRes.error) throw branchRes.error

        const push = (pid: number, location: StockLocation, qty: number) => {
          if (qty <= 0) return
          const list = result.get(pid) ?? []
          const existing = list.find((e) => e.location.id === location.id)
          if (existing) existing.qty += qty
          else list.push({ location, qty })
          result.set(pid, list)
        }

        for (const row of mainRes.data || []) {
          push(row.id as number, mainLocation, (row.current_stock as number | null) ?? 0)
        }
        for (const row of branchRes.data || []) {
          const pid = row.product_id as number | null
          const wid = row.warehouse_id as number | null
          if (pid == null || wid == null) continue
          push(pid, locationById(wid), (row.total_qty as number | null) ?? 0)
        }
      }
      return result
    } catch (err) {
      handleError(err, 'Failed to read stock across locations')
      return new Map()
    }
  }

  /**
   * THE shared sourcing decision. The order form calls this to preview, and
   * order creation calls it to decide what to actually draw — so the figures a
   * user approves and the figures that get written cannot disagree. Keep it that
   * way: a second copy of this arithmetic is the bug this design exists to avoid.
   *
   * Read-only. It moves nothing. Returns `null` when the stock read failed, so
   * a caller stops rather than treating a failed read as "nothing available".
   */
  async function planSourcing(
    locationId: StockLocationId,
    lines: { product_id: number; quantity: number }[],
  ): Promise<SourcingLine[] | null> {
    const onHand = await availabilityAt(
      locationId,
      lines.map((l) => l.product_id),
    )
    if (!onHand) return null
    // Two lines can name the same product; the second must see what the first
    // already claimed, or both get promised the same units.
    const claimed = new Map<number, number>()
    return lines.map((line) => {
      const need = Math.max(0, line.quantity)
      const already = claimed.get(line.product_id) ?? 0
      const free = Math.max(0, (onHand.get(line.product_id) ?? 0) - already)
      const take = Math.min(need, free)
      claimed.set(line.product_id, already + take)
      return { product_id: line.product_id, need, take, short: need - take }
    })
  }

  /**
   * Remove `qty` from a location. Returns false on failure so the caller can
   * report it rather than assume the stock moved.
   */
  async function drawStock(
    locationId: StockLocationId,
    productId: number,
    qty: number,
  ): Promise<boolean> {
    if (qty <= 0) return true
    clearError()
    try {
      if (locationId == null) {
        const { data, error: readError } = await supabase
          .from('products')
          .select('current_stock')
          .eq('id', productId)
          .maybeSingle()
        if (readError) throw readError
        const onHand = (data?.current_stock as number | null) ?? 0
        const { error: writeError } = await supabase
          .from('products')
          .update({ current_stock: onHand - qty })
          .eq('id', productId)
        if (writeError) throw writeError
        return true
      }

      // A branch can hold MORE THAN ONE row for the same product — nothing in
      // the schema prevents it, and both this store and transfer-receiving
      // insert a row when they find none. availabilityAt sums them, so drawing
      // has to span them too; maybeSingle() would error on exactly the data
      // availability just reported as in stock.
      const { data, error: readError } = await supabase
        .from('warehouse_products')
        .select('id, total_qty')
        .eq('warehouse_id', locationId)
        .eq('product_id', productId)
        .order('id', { ascending: true })
      if (readError) throw readError

      const rows = data ?? []
      const available = rows.reduce((sum, r) => sum + ((r.total_qty as number | null) ?? 0), 0)
      // Fail closed. A partial draw would be recorded by the caller as a full
      // one, so take all of it or none — no row means the branch has never held
      // it, and inventing a negative row would conjure stock that never existed.
      if (available < qty) return false

      let remaining = qty
      for (const row of rows) {
        if (remaining <= 0) break
        const onHand = (row.total_qty as number | null) ?? 0
        const take = Math.min(remaining, onHand)
        if (take <= 0) continue
        const { error: writeError } = await supabase
          .from('warehouse_products')
          .update({ total_qty: onHand - take })
          .eq('id', row.id)
        if (writeError) throw writeError
        remaining -= take
      }
      return true
    } catch (err) {
      handleError(err, 'Failed to draw stock')
      return false
    }
  }

  /**
   * Put `qty` back at a location — the mirror of drawStock, used when an order
   * is cancelled. A branch that no longer has a row for the product gets one
   * created, the same way receiving a transfer does.
   */
  async function returnStock(
    locationId: StockLocationId,
    productId: number,
    qty: number,
  ): Promise<boolean> {
    if (qty <= 0) return true
    clearError()
    try {
      if (locationId == null) {
        const { data, error: readError } = await supabase
          .from('products')
          .select('current_stock')
          .eq('id', productId)
          .maybeSingle()
        if (readError) throw readError
        const onHand = (data?.current_stock as number | null) ?? 0
        const { error: writeError } = await supabase
          .from('products')
          .update({ current_stock: onHand + qty })
          .eq('id', productId)
        if (writeError) throw writeError
        return true
      }

      // Same multi-row reality as drawStock. Everything goes back onto the
      // lowest-id row so a return is deterministic and never creates yet
      // another duplicate for a product the branch already carries.
      const { data, error: readError } = await supabase
        .from('warehouse_products')
        .select('id, total_qty')
        .eq('warehouse_id', locationId)
        .eq('product_id', productId)
        .order('id', { ascending: true })
      if (readError) throw readError

      const target = (data ?? [])[0]
      if (target) {
        const { error: writeError } = await supabase
          .from('warehouse_products')
          .update({ total_qty: ((target.total_qty as number | null) ?? 0) + qty })
          .eq('id', target.id)
        if (writeError) throw writeError
        return true
      }

      const { error: insertError } = await supabase.from('warehouse_products').insert({
        warehouse_id: locationId,
        product_id: productId,
        total_qty: qty,
        is_main_warehouse: false,
      })
      if (insertError) throw insertError
      return true
    } catch (err) {
      handleError(err, 'Failed to restore stock')
      return false
    }
  }

  return {
    locations,
    loading,
    error,
    fetchLocations,
    locationById,
    availabilityAt,
    availabilityAcross,
    planSourcing,
    drawStock,
    returnStock,
  }
})

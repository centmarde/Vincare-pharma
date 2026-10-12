// Products CRUD and filtering: catalogue fetch, by-id lookups, SKUs-by-name,
// reorder-flag sync, and the classic create/update/delete plus local helpers
// (upsert/remove/reset) that realtime and reset rely on.

import { supabase } from '@/lib/supabase'
import type { ProductType, FetchProductsOptions, CreateProductData, UpdateProductData } from './types'
import {
  products,
  currentProduct,
  loading,
  error,
  totalCount,
  handleError,
  clearError,
} from './state'

export const fetchEligibleProductIds = async (category?: string | null): Promise<number[]> => {
  try {
    const { data, error: rpcError } = await supabase.rpc('get_eligible_product_ids', {
      p_category: category ?? null,
    })
    if (rpcError) throw rpcError
    return (data || []).map((row: { product_id: number }) => row.product_id)
  } catch (err) {
    handleError(err, 'Failed to fetch eligible product IDs')
    return []
  }
}

export const fetchProducts = async (options: FetchProductsOptions = {}) => {
  let productsRequestId = 0 // NEW — track the latest request ID
  const requestId = ++productsRequestId // NEW — stamp this call
  loading.value = true
  clearError()

  try {
    const {
      search,
      category,
      supplier_id,
      orderBy = 'current_stock',
      ascending = true,
      limit,
      offset,
      eligibleIds,
      expiryStart,
      expiryEnd,
    } = options

    let q = supabase.from('products').select('*, suppliers(*)', { count: 'exact' })

    q = q.not('sku', 'is', null).neq('sku', 'null')

    // we must match false/null explicitly rather than using is_reorder.neq.true).
    q = q.or('current_stock.neq.0,current_stock.is.null,is_reorder.eq.false,is_reorder.is.null')

    if (category) q = q.eq('category', category)
    if (typeof supplier_id === 'number') q = q.eq('supplier_id', supplier_id)
    if (search && search.trim()) {
      const s = search.trim().replace(/,/g, '')
      q = q.or(`product_name.ilike.%${s}%,barcode.ilike.%${s}%,sku.ilike.%${s}%`)
    }
    // eligibleIds is now warehouse-scoped only (see useProductsWidget.fetchProducts)
    if (eligibleIds && eligibleIds.length > 0) q = q.in('id', eligibleIds)
    if (expiryStart && expiryEnd)
      q = q.gte('expiry_date', expiryStart).lte('expiry_date', expiryEnd)

    if (orderBy === 'current_stock') {
      // comment to make the curren_stock order by ascending or descending and nulls first or last
      // q = q.order('reorder_level', { ascending: false, nullsFirst: false })
      q = q.order(orderBy as string, { ascending })
    } else {
      q = q.order(orderBy as string, { ascending })
    }

    if (typeof limit === 'number' && typeof offset === 'number') {
      q = q.range(offset, offset + limit - 1)
    } else if (typeof limit === 'number') {
      q = q.limit(limit)
    }

    const { data, count, error: fetchError } = await q

    if (fetchError) throw fetchError

    // NEW — a newer request has already started (or finished) since this
    // one was fired. Its result is stale — discard it instead of clobbering
    // the table with out-of-date rows.
    if (requestId !== productsRequestId) {
      return products.value
    }

    products.value = (data || []) as ProductType[]
    totalCount.value = count ?? 0
    return products.value
  } catch (err) {
    handleError(err, 'Failed to fetch products')
    return []
  } finally {
    // Only the most recent request should clear the loading spinner
    if (requestId === productsRequestId) loading.value = false
  }
}

/**
 * Fetch a specific set of products by id, for joining product details onto
 * rows that only carry a product_id (warehouse_products, POS lines, branch
 * inventory).
 *
 * Deliberately NOT `fetchProducts()` + find-in-JS: that query matches ~1,072
 * rows and PostgREST caps a response at 1,000, so the catalogue it returns is
 * silently incomplete and any product outside the window resolves to nothing
 * (blank name, zero price). It also applies the Products page's own filters,
 * which have no business deciding whether a product a branch is holding can
 * be displayed. Chunked so a long id list cannot hit the same cap.
 */
export const fetchProductsByIds = async (ids: number[]) => {
  const unique = [...new Set(ids.filter((id) => typeof id === 'number'))]
  if (!unique.length) return []
  clearError()
  try {
    const chunkSize = 500
    const found: ProductType[] = []
    for (let i = 0; i < unique.length; i += chunkSize) {
      const { data, error: fetchError } = await supabase
        .from('products')
        .select('*')
        .in('id', unique.slice(i, i + chunkSize))
      if (fetchError) throw fetchError
      found.push(...((data ?? []) as ProductType[]))
    }
    return found
  } catch (err) {
    handleError(err, 'Failed to fetch products by id')
    return []
  }
}

export const fetchProductById = async (id: number) => {
  loading.value = true
  clearError()

  try {
    const { data, error: fetchError } = await supabase
      .from('products')
      .select('*, suppliers(*)')
      .eq('id', id)
      .single()

    if (fetchError) throw fetchError

    currentProduct.value = data as ProductType
    return currentProduct.value
  } catch (err) {
    handleError(err, `Failed to fetch product with ID ${id}`)
    return undefined
  } finally {
    loading.value = false
  }
}

/**
 * Queries products directly by product_name (case-insensitive) and returns a
 * map of lowercase product_name -> sku. Intentionally ignores the (warehouse /
 * id-scoped) `products` list so the returned SKUs resolve even when the
 * product isn't in the currently loaded rows.
 * @param names - the product names to look up
 * @returns a Map keyed by trimmed, lowercase product_name
 */
export async function fetchSkusByProductNames(names: string[]): Promise<Map<string, string>> {
  const results = new Map<string, string>()
  const unique = [...new Set(names.map((n) => (n || '').trim()).filter(Boolean))]

  if (!unique.length) return results

  const orFilter = unique.map((name) => `product_name.ilike.${JSON.stringify(name)}`).join(',')

  try {
    const { data, error } = await supabase
      .from('products')
      .select('product_name, sku')
      .or(orFilter)
      .not('sku', 'is', null)
      .neq('sku', 'null')

    if (error) throw error

    // Map product_name -> sku (last one wins if a name somehow repeats).
    for (const row of data ?? []) {
      const key = (row.product_name || '').trim().toLowerCase()
      const sku = row.sku?.toString().trim() ?? ''
      if (key && sku) results.set(key, sku)
    }
  } catch (err) {
    handleError(err, 'Failed to fetch product SKUs by product name')
    console.error('[productsData] Failed to fetch product SKUs by product_name', err)
  }

  return results
}

/**
 * Sets the `is_reorder` flag for the given products and syncs the local
 * `products` list / `currentProduct` to match.
 * @param productIds - products to update
 * @param isReorder - the flag value to set
 */
export async function setProductsReorderFlag(
  productIds: number[],
  isReorder: boolean,
): Promise<boolean> {
  const ids = [...new Set(productIds)].filter((id): id is number => id != null)
  if (!ids.length) return true

  try {
    const { error } = await supabase
      .from('products')
      .update({ is_reorder: isReorder })
      .in('id', ids)

    if (error) throw error

    // Sync local state so the UI reflects the flag without a refetch.
    for (const id of ids) {
      const localIndex = products.value.findIndex((p) => p.id === id)
      if (localIndex !== -1) products.value[localIndex].is_reorder = isReorder
      if (currentProduct.value?.id === id) currentProduct.value.is_reorder = isReorder
    }
    return true
  } catch (err) {
    handleError(err, 'Failed to update product reorder flag')
    console.error('[productsData] Failed to set is_reorder flag', err)
    return false
  }
}

export const createProduct = async (productData: CreateProductData) => {
  loading.value = true
  clearError()

  try {
    const { data, error: createError } = await supabase
      .from('products')
      .insert([productData])
      .select('*, suppliers(*)')
      .single()

    if (createError) throw createError

    const created = data as ProductType
    products.value.unshift(created)
    currentProduct.value = created
    return created
  } catch (err) {
    handleError(err, 'Failed to create product')
    return undefined
  } finally {
    loading.value = false
  }
}

export const updateProduct = async (id: number, updateData: UpdateProductData) => {
  loading.value = true
  clearError()

  try {
    const { suppliers, id: _id, created_at, ...payload } = updateData as any

    const { data, error: updateError } = await supabase
      .from('products')
      .update(payload)
      .eq('id', id)
      .select('*, suppliers(*)')
      .single()

    if (updateError) throw updateError

    const updated = data as ProductType
    const index = products.value.findIndex((p) => p.id === id)
    if (index !== -1) products.value[index] = updated
    if (currentProduct.value?.id === id) currentProduct.value = updated
    return updated
  } catch (err) {
    handleError(err, `Failed to update product with ID ${id}`)
    return undefined
  } finally {
    loading.value = false
  }
}

export const deleteProduct = async (id: number) => {
  loading.value = true
  clearError()

  try {
    const { error: deleteError } = await supabase.from('products').delete().eq('id', id)
    if (deleteError) throw deleteError

    products.value = products.value.filter((p) => p.id !== id)
    if (currentProduct.value?.id === id) currentProduct.value = undefined
    return true
  } catch (err) {
    handleError(err, `Failed to delete product with ID ${id}`)
    return false
  } finally {
    loading.value = false
  }
}

export const upsertProductLocal = (product: ProductType) => {
  const idx = products.value.findIndex((p) => p.id === product.id)
  if (idx === -1) products.value.unshift(product)
  else products.value[idx] = product

  if (currentProduct.value?.id === product.id) currentProduct.value = product
}

export const removeProductLocal = (id: number) => {
  products.value = products.value.filter((p) => p.id !== id)
  if (currentProduct.value?.id === id) currentProduct.value = undefined

  // statusProductExpiry.value = statusProductExpiry.value.filter((p) => p.id !== id)
}

export const resetStore = () => {
  products.value = []
  currentProduct.value = undefined
  loading.value = false
  error.value = ''
}
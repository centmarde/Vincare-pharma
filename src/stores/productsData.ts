import { generateRONumber, insertWithDocRetry } from '@/utils/generativeHelpers'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { SupplierType } from '@/stores/suppliersData'
import { useAuthUserStore } from './authUser'
import { useLogsDataStore } from './logsData'
import { useToast } from 'vue-toastification'
import { supabase } from '@/lib/supabase'
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { Ref } from 'vue'


const toast = useToast()

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

type FetchProductsOptions = {
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
  expiryEnd?: string   // 'YYYY-MM-DD'
}

// Mirrors search_products_with_sku's RETURNS TABLE exactly (see
// supabase/migrations/20260823_search_products_with_sku_brand.sql).
// supplier_name / supplier_is_active are deliberately NOT here: the RPC stopped
// returning them because supplier identity is confidential. supplier_id stays —
// Purchasing's PR dialogs set the line's supplier from it.
export type ProductPickerResult = {
  id: number
  product_name: string | null
  brand: string | null
  unit: string | null
  current_stock: number | null
  cost_price: number | null
  selling_price: number | null
  supplier_id: number | null
  total_count: number
}

export type ReceiveStockUpdate ={
  transaction_item_id: number
  product_id: number
  sku: string | null
  actual_count_stock_in: number
  expiry_date?: string | null
  batch_no?: string | null
  cost_price?: number | null
}

export type StockStatusBucket =
  | 'out-of-stock' | 'low-stock' | 'no-reorder-level' | 'expiring-soon' | 'expired'

export type StockStatusCounts = Record<StockStatusBucket, number>

export type StockStatusRef = { year: number; month: number } | null

export const useProductsDataStore = defineStore('productsData', () => {
  const authStore = useAuthUserStore()
  // State
  const products: Ref<ProductType[]> = ref([])
  const currentProduct: Ref<ProductType | undefined> = ref(undefined)
  const eligibleProductIds: Ref<Set<number>> = ref(new Set())
  const loading = ref(false)
  const error: Ref<string> = ref('')
  const pickerProducts = ref<ProductPickerResult[]>([])
  const pickerTotalCount = ref(0)
  // Search now fires per keystroke, so a slow earlier response can land after a
  // later one. Stamped at store scope so the counter survives between calls.
  let pickerRequestId = 0
  const reorderRequests: Ref<any[]> = ref([])
  const reorderCount:    Ref<number> = ref(0)
  // const statusProductExpiry: Ref<ProductType[]> = ref([])
  const REORDER_TYPES = ['reorder_outofstock', 'reorder_lowstock', 'reorder_expiring', 'reorder_expired']
  
  

  // Realtime
  const realtimeChannel: Ref<RealtimeChannel | null> = ref(null)
  const realtimeStatus: Ref<'idle' | 'subscribing' | 'subscribed' | 'error'> = ref('idle')

  // Computed
  const productsCount = computed(() => products.value.length)
  const hasProducts = computed(() => products.value.length > 0)
  const isLoading = computed(() => loading.value)
  const hasError = computed(() => error.value !== '')
  const isRealtimeSubscribed = computed(() => realtimeStatus.value === 'subscribed')

  // Helpers
  const handleError = (err: unknown, defaultMessage: string) => {
    const errorMessage = err instanceof Error ? err.message : defaultMessage
    error.value = errorMessage
  }

  const clearError = () => {
    error.value = ''
  }
  const totalCount = ref(0)

  // RPC for fetchStockStatusCounts
  const STOCK_STATUS_BUCKETS: StockStatusBucket[] = [
    'out-of-stock', 'low-stock', 'no-reorder-level', 'expiring-soon', 'expired',
  ]

  const stockStatusCounts: Ref<StockStatusCounts> = ref({
    'out-of-stock': 0, 'low-stock': 0, 'no-reorder-level': 0, 'expiring-soon': 0, 'expired': 0,
  })
  const stockStatusProducts: Ref<ProductType[]> = ref([])
  const stockStatusProductsTotal = ref(0)
  const stockStatusLoading = ref(false)

  // cached so realtime changes can silently re-sync counts with the same params
  const lastStockStatusParams: Ref<{ ref: StockStatusRef; excludedIds: number[] }> = ref({
    ref: null,
    excludedIds: [],
  })

  const startRealtime = () => {
    // Avoid double subscriptions
    if (realtimeChannel.value) return realtimeChannel.value

    realtimeStatus.value = 'subscribing'

    const channel = supabase
      .channel('custom-all-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, (payload) => {
        // Keep the user's debug log (requested)
        console.log('Change received!', payload)

        const eventType = payload.eventType

        if (eventType === 'INSERT' || eventType === 'UPDATE') {
          const row = payload.new as ProductType
          if (row?.id != null) upsertProductLocal(row)
        }

        if (eventType === 'DELETE') {
          const row = payload.old as Partial<ProductType> | null
          const id = row?.id
          if (typeof id === 'number') removeProductLocal(id)
        }

        fetchAllStockStatusCounts(lastStockStatusParams.value.ref, lastStockStatusParams.value.excludedIds)
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') realtimeStatus.value = 'subscribed'
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          realtimeStatus.value = 'error'
        }
      })

    realtimeChannel.value = channel
    return channel
  }

  const stopRealtime = async () => {
    const channel = realtimeChannel.value
    if (!channel) return

    realtimeChannel.value = null
    realtimeStatus.value = 'idle'

    // Ensure it's actually removed on the client
    await supabase.removeChannel(channel)
  }

  const fetchEligibleProductIds = async (): Promise<number[]> => {
    try {
      const { data, error: rpcError } = await supabase.rpc('get_eligible_product_ids')
      if (rpcError) throw rpcError
      return (data || []).map((row: { product_id: number }) => row.product_id)
    } catch (err) {
      handleError(err, 'Failed to fetch eligible product IDs')
      return []
    }
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
  const fetchAllStockStatusCounts = async (
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
  const fetchStockStatusProducts = async (
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

  // Actions
  const fetchProducts = async (options: FetchProductsOptions = {}) => {
    let productsRequestId = 0 // NEW — track the latest request ID
    const requestId = ++productsRequestId // NEW — stamp this call
    loading.value = true
    clearError()

    try {
      const {
        search, category, supplier_id,
        orderBy = 'current_stock', ascending = true,
        limit, offset, eligibleIds, expiryStart, expiryEnd,
      } = options

      let q = supabase.from('products').select('*, suppliers(*)', { count: 'exact' })

      q = q.not('sku', 'is', null).neq('sku', 'null')

      // Hide products that are flagged for reorder AND sitting at zero stock —
      // keep showing rows where is_reorder isn't true OR current_stock > 0.
      q = q.or('is_reorder.neq.true,current_stock.gt.0')

      if (category) q = q.eq('category', category)
      if (typeof supplier_id === 'number') q = q.eq('supplier_id', supplier_id)
      if (search && search.trim()) {
        const s = search.trim().replace(/,/g, '')
        q = q.or(`product_name.ilike.%${s}%,barcode.ilike.%${s}%,sku.ilike.%${s}%`)
      }
      // eligibleIds is now warehouse-scoped only (see useProductsWidget.fetchProducts)
      if (eligibleIds && eligibleIds.length > 0) q = q.in('id', eligibleIds)
      if (expiryStart && expiryEnd) q = q.gte('expiry_date', expiryStart).lte('expiry_date', expiryEnd)

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
  const fetchProductsByIds = async (ids: number[]) => {
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

  const fetchProductById = async (id: number) => {
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

  async function fetchProductPicker({ search = '', limit = 15 }: { search?: string; limit?: number }) {
    const requestId = ++pickerRequestId
    loading.value = true

    try {
      const { data, error } = await supabase.rpc('search_products_with_sku', {
        search_term: search,
        page_limit: limit,
      })

      if (error) {
        console.error(error)
        return
      }

      // A newer keystroke already fired — discard this result rather than
      // clobbering the list with matches for a term the user has moved past.
      if (requestId !== pickerRequestId) return

      // current_stock and brand now come straight off the RPC — the second
      // round-trip that used to fetch stock per search is gone.
      pickerProducts.value = (data ?? []) as ProductPickerResult[]
      pickerTotalCount.value = data?.[0]?.total_count ?? 0
    } finally {
      if (requestId === pickerRequestId) loading.value = false
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
  async function fetchSkusByProductNames(names: string[]): Promise<Map<string, string>> {
    const results = new Map<string, string>()
    const unique = [...new Set(names.map((n) => (n || '').trim()).filter(Boolean))]

    if (!unique.length) return results

    const orFilter = unique
      .map((name) => `product_name.ilike.${JSON.stringify(name)}`)
      .join(',')

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
  async function setProductsReorderFlag(productIds: number[], isReorder: boolean): Promise<boolean> {
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


  const createProduct = async (productData: CreateProductData) => {
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
    
    async function createReorderRequest(payload: {
    product_id: number
    reason: 'reorder_outofstock' | 'reorder_lowstock' | 'reorder_expiring' | 'reorder_expired'
  }) {
    loading.value = true

    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) {
      toast.error('User not authenticated.')
      loading.value = false
      return { success: false }
    }

    const { data: existing } = await supabase
      .from('transactions')
      .select('id, transaction_items!transaction_items_transaction_id_fkey!inner(product_id)')
      .in('transaction_type', REORDER_TYPES)
      .eq('status', 'pending')
      .eq('transaction_items.product_id', payload.product_id)
      .maybeSingle()

    if (existing) {
      toast.info('This product already has a pending reorder request.')
      loading.value = false
      return { success: false }
    }

    // Fetch product name for a meaningful log description
    const { data: productData } = await supabase
      .from('products')
      .select('product_name')
      .eq('id', payload.product_id)
      .single()


    const productName = productData?.product_name ?? `Product #${payload.product_id}`
    const reasonLabel = payload.reason.replace('reorder_', '').replace('_', ' ')  

    const { data: txData, error: txError } = await insertWithDocRetry<{ id: number }>(
      () => generateRONumber(),
      async (docNo) => supabase
        .from('transactions')
        .insert({
          transaction_type: payload.reason,
          status:           'pending',
          created_by:       user.id,
          reference_no:     docNo,
          remarks:          `Reorder "${productName}" flagged from warehouse (${reasonLabel})`,
        })
        .select('id')
        .single(),
    )

    if (txError || !txData) {
      toast.error('Failed to submit reorder request.')
      loading.value = false
      return { success: false }
    }

    const { error: itemError } = await supabase
      .from('transaction_items')
      .insert({
        transaction_id: txData.id,
        product_id:     payload.product_id,
      })

    if (itemError) {
      toast.error('Failed to save reorder item.')
      loading.value = false
      return { success: false }
    }

    // Flag the product for reorder on the products table.
    await supabase
      .from('products')
      .update({ is_reorder: true })
      .eq('id', payload.product_id)

    // Keep the local products list in sync with the flag.
    const localIndex = products.value.findIndex((p) => p.id === payload.product_id)
    if (localIndex !== -1) products.value[localIndex].is_reorder = true
    if (currentProduct.value?.id === payload.product_id) {
      currentProduct.value.is_reorder = true
    }


    // Log the reorder request
    const logsStore = useLogsDataStore()
    await logsStore.createLog({
      action:         'reorder_request',
      description:    `Reorder requested for "${productName}" — ${reasonLabel}`,
      module:         'reorder',
      transaction_id: txData.id,
      created_by:     user.id,
    })

    loading.value = false
    toast.success('Reorder request submitted.')
    return { success: true, id: txData.id }
  }

  /**
   * Fetches the reorder request IDs associated with a transaction's line items
   * @param transactionId - The transaction ID to fetch reorder request IDs for
   * @returns Array of reorder request IDs
   */
  async function fetchReorderRequestIdsForTransaction(transactionId: number): Promise<number[]> {
    const { data, error } = await supabase
      .from('transaction_items')
      .select('reorder_request_id')
      .eq('transaction_id', transactionId)
      .not('reorder_request_id', 'is', null)

    if (error) {
      console.error('Failed to fetch reorder_request_id list for transaction', transactionId, error)
      return []
    }
    return (data || [])
      .map((r: any) => r.reorder_request_id)
      .filter((id: number | null): id is number => id != null)
  }

  // An unreadable result drops every link rather than risk resolving a reorder request the PR no longer owns.
  async function filterPendingReorderRequestIds(ids: number[]): Promise<number[]> {
    if (!ids.length) return []

    const { data, error } = await supabase
      .from('transactions')
      .select('id')
      .in('id', ids)
      .in('transaction_type', REORDER_TYPES)
      .eq('status', 'pending')

    if (error) {
      console.error('Failed to check reorder request statuses', error)
      return []
    }
    return (data || []).map((row: any) => row.id)
  }

  async function fetchReorderRequests(includeResolved = false) {
    loading.value = true
    if (!authStore.users.length) await authStore.getAllUsers()

    const statuses = includeResolved ? ['pending', 'approved', 'awaiting_stock', 'rejected'] : ['pending']

    const { data, error } = await supabase
      .from('transactions')
      .select(`
        id, transaction_type, status, created_at, created_by, remarks,
        transaction_items!transaction_items_transaction_id_fkey (
          id, product_id,
          products ( id, product_name, sku, unit, current_stock, reorder_level, expiry_date, supplier_id, cost_price, suppliers ( name ) )
        )
      `)
      .in('transaction_type', REORDER_TYPES)
      .in('status', statuses)
      .order('created_at', { ascending: false })

    loading.value = false
    if (error) {
      toast.error('Failed to fetch reorder requests.')
      return
    }

    reorderRequests.value = (data || []).map((tx: any) => {
      const item = tx.transaction_items?.[0]
      return {
        id:               tx.id,
        transaction_type: tx.transaction_type,
        status:           tx.status,
        product:          item?.products
          ? { ...item.products, supplier_name: item.products.suppliers?.name ?? null }
          : null,
        requester_name: authStore.users.find(u => u.id === tx.created_by)?.full_name?.toUpperCase() ?? '—',
        created_at:     tx.created_at,
      }
    })
    reorderCount.value = reorderRequests.value.filter(r => r.status === 'pending').length
  }

  async function fetchReorderCount() {
    const { count } = await supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .in('transaction_type', REORDER_TYPES)
      .eq('status', 'pending')
    reorderCount.value = count ?? 0
  }

  async function transitionReorderRequestsById(
    reorderRequestIds: number[],
    fromStatus: string,
    toStatus: string,
    logAction: string,
    describe: (productName: string) => string,
  ) {
    if (!reorderRequestIds.length) return

    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) return

    const { data: matches, error: fetchError } = await supabase
      .from('transactions')
      .select(`id, transaction_items!transaction_items_transaction_id_fkey!inner ( product_id, products ( product_name ) )`)
      .in('id', reorderRequestIds)
      .in('transaction_type', REORDER_TYPES)
      .eq('status', fromStatus)

    if (fetchError || !matches?.length) return

    const ids = matches.map((m: any) => m.id)

    const { error: updateError } = await supabase
      .from('transactions')
      .update({ status: toStatus })
      .in('id', ids)

    if (updateError) {
      console.error(`Failed to transition reorder requests to ${toStatus}:`, updateError)
      return
    }

    const logsStore = useLogsDataStore()
    await Promise.all(matches.map((m: any) => {
      const productName = m.transaction_items?.[0]?.products?.product_name
        ?? `Product #${m.transaction_items?.[0]?.product_id}`
      return logsStore.createLog({
        action: logAction,
        description: describe(productName),
        module: 'reorder',
        transaction_id: m.id,
        created_by: user.id,
      })
    })).catch(err => console.error('Failed to log reorder transition:', err))

    reorderRequests.value = reorderRequests.value.map(r =>
      ids.includes(r.id) ? { ...r, status: toStatus } : r
    )
    reorderCount.value = reorderRequests.value.filter(r => r.status === 'pending').length
  }

  /**
   * Approves reorder requests by their IDs, transitioning them from pending to approved status
   * @param reorderRequestIds - Array of reorder request IDs to approve
   */
  async function approveReorderRequestsById(reorderRequestIds: number[]) {
    await transitionReorderRequestsById(
      reorderRequestIds, 'pending', 'approved', 'reorder_approved',
      productName => `Reorder approved for "${productName}" (Purchase Requisition approved)`,
    )
  }

  /**
   * Rejects reorder requests by their IDs, transitioning them from pending to rejected status
   * @param reorderRequestIds - Array of reorder request IDs to reject
   */
  async function rejectReorderRequestsById(reorderRequestIds: number[]) {
    await transitionReorderRequestsById(
      reorderRequestIds, 'pending', 'rejected', 'reorder_rejected',
      productName => `Reorder rejected for "${productName}" (Purchase Requisition rejected)`,
    )
  }

  /**
   * Marks reorder requests as awaiting stock by their IDs, transitioning from approved to awaiting_stock
   * @param reorderRequestIds - Array of reorder request IDs to mark as awaiting stock
   */
  async function markReorderRequestsAwaitingStockById(reorderRequestIds: number[]) {
    await transitionReorderRequestsById(
      reorderRequestIds, 'approved', 'awaiting_stock', 'reorder_awaiting_stock',
      productName => `Reorder awaiting stock for "${productName}" (Purchase Order issued)`,
    )
  }

  /**
   * Completes reorder requests by their IDs, transitioning from awaiting_stock to complete status
   * @param reorderRequestIds - Array of reorder request IDs to mark as complete
   */
  async function completeReorderRequestsById(reorderRequestIds: number[]) {
    if (!reorderRequestIds.length) return

    loading.value = true

    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) {
      toast.error('User not authenticated.')
      loading.value = false
      return
    }

    const { data: matches, error: fetchError } = await supabase
      .from('transactions')
      .select(`id, transaction_items!transaction_items_transaction_id_fkey!inner ( product_id, products ( product_name ) )`)
      .in('id', reorderRequestIds)
      .in('transaction_type', REORDER_TYPES)
      .eq('status', 'awaiting_stock')

    if (fetchError) {
      toast.error('Failed to look up reorder requests.')
      loading.value = false
      return
    }

    const ids = (matches || []).map((m: any) => m.id)
    if (!ids.length) {
      loading.value = false
      return
    }

    const { error: updateError } = await supabase
      .from('transactions')
      .update({ status: 'complete' })
      .in('id', ids)

    if (updateError) {
      toast.error('Failed to complete reorder requests.')
      loading.value = false
      return
    }

    const logsStore = useLogsDataStore()
    await Promise.all((matches || []).map((m: any) => {
      const productName = m.transaction_items?.[0]?.products?.product_name
        ?? `Product #${m.transaction_items?.[0]?.product_id}`
      return logsStore.createLog({
        action:         'reorder_completed',
        description:    `Reorder completed for "${productName}"`,
        module:         'reorder',
        transaction_id: m.id,
        created_by:     user.id,
      })
    })).catch(err => {
      console.error('Failed to log reorder completion:', err)
    })

    reorderRequests.value = reorderRequests.value.filter(r => !ids.includes(r.id))
    reorderCount.value = reorderRequests.value.length

    loading.value = false
  }

  const updateProduct = async (id: number, updateData: UpdateProductData) => {
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

  const deleteProduct = async (id: number) => {
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

  // A batch row back at zero stock can still be a spent batch, so any receipt or issue on it rules out re-dating.
  const hasStockHistory = async (productId: number, exceptTransactionItemId: number) => {
    const readHistory = async () => supabase
      .from('transaction_items')
      .select('id')
      .eq('product_id', productId)
      .neq('id', exceptTransactionItemId)
      .or('actual_count_stock_in.not.is.null,actual_count_stock_out.not.is.null')
      .limit(1)

    let result = await readHistory()
    if (result.error) result = await readHistory()
    if (result.error) throw result.error
    return (result.data ?? []).length > 0
  }

  const assertExpiryEditable = async (product: ProductType, transactionItemId: number) => {
    const priorStock = product.current_stock ?? 0
    if (priorStock > 0) {
      throw new Error(
        `Cannot change expiry on product ID ${product.id}: it already holds ${priorStock} in stock from an earlier batch.`,
      )
    }
    if (await hasStockHistory(product.id, transactionItemId)) {
      throw new Error(
        `Cannot change expiry on product ID ${product.id}: it has already been received or issued against an earlier batch.`,
      )
    }
  }

  
  const updateProductSkuAndCount = async (
    updates: ReceiveStockUpdate[]
  ): Promise<boolean> => {
    if (!updates.length) return true
    clearError()

    try {
      for (const { transaction_item_id, product_id, sku, actual_count_stock_in, expiry_date, batch_no, cost_price } of updates) {
        const { data: existingItem, error: existingError } = await supabase
          .from('transaction_items')
          .select('actual_count_stock_in')
          .eq('id', transaction_item_id)
          .maybeSingle()
        if (existingError) throw existingError

        if (existingItem?.actual_count_stock_in != null) {
          // Already applied in a prior attempt — stock was already
          // incremented, so only the SKU and an expiry the row can still
          // take are corrected here.
          const applied = await fetchProductById(product_id)
          if (!applied) throw new Error(`Failed to fetch product ID ${product_id}`)

          const appliedExpiryChanged = expiry_date != null && expiry_date !== applied.expiry_date
          if (appliedExpiryChanged) await assertExpiryEditable(applied, transaction_item_id)

          if (sku || appliedExpiryChanged || batch_no || cost_price != null) {
            const result = await updateProduct(product_id, {
              ...(sku ? { sku } : {}),
              ...(appliedExpiryChanged ? { expiry_date } : {}),
              ...(batch_no ? { batch_no } : {}),
              ...(cost_price != null ? { cost_price } : {}),
            })
            if (!result) throw new Error(`Failed to update product ID ${product_id}`)
          }
          continue
        }

        // 1. Fetch current product stock so we can increment it correctly
        const product = await fetchProductById(product_id)
        if (!product) throw new Error(`Failed to fetch product ID ${product_id}`)

        const priorStock = product.current_stock ?? 0
        const newStock = priorStock + actual_count_stock_in

        // Correcting expiry is only safe on an empty row — the batch row the PR
        // created. Re-dating a row that already holds stock would mis-date it.
        const expiryChanged = expiry_date != null && expiry_date !== product.expiry_date
        if (expiryChanged) await assertExpiryEditable(product, transaction_item_id)

        // 2. Apply the stock increment first
        const result = await updateProduct(product_id, {
          current_stock: newStock,
          ...(sku ? { sku } : {}),
          ...(expiryChanged ? { expiry_date } : {}),
          ...(batch_no ? { batch_no } : {}),
          ...(cost_price != null ? { cost_price } : {}),
        })
        if (!result) throw new Error(`Failed to update product ID ${product_id}`)

          // NEW — check if the delivery cleared the shortage
        if (product.reorder_level != null && newStock < product.reorder_level) {
          const reason = newStock <= 0 ? 'reorder_outofstock' : 'reorder_lowstock'
          await createReorderRequest({ product_id, reason })
        }

        // 3. Only now stamp the "this was received" marker
        const { error: tiError } = await supabase
          .from('transaction_items')
          .update({ actual_count_stock_in })
          .eq('id', transaction_item_id)
        if (tiError) throw tiError
      }
      return true
    } catch (err) {
      handleError(err, 'Failed saving received stock information.')
      return false
    }
  }

  const upsertProductLocal = (product: ProductType) => {
    const idx = products.value.findIndex((p) => p.id === product.id)
    if (idx === -1) products.value.unshift(product)
    else products.value[idx] = product

    if (currentProduct.value?.id === product.id) currentProduct.value = product
  }

  const removeProductLocal = (id: number) => {
    products.value = products.value.filter((p) => p.id !== id)
    if (currentProduct.value?.id === id) currentProduct.value = undefined

    // statusProductExpiry.value = statusProductExpiry.value.filter((p) => p.id !== id)
  }

  const resetStore = () => {
    products.value = []
    currentProduct.value = undefined
    loading.value = false
    error.value = ''
  }

  return {
    // State
    products,
    currentProduct,
    eligibleProductIds,
    loading,
    error,
    pickerProducts,
    pickerTotalCount,

    // Computed
    productsCount,
    hasProducts,
    isLoading,
    hasError,
    isRealtimeSubscribed,
    totalCount,

    // Actions
    fetchEligibleProductIds,
    fetchProducts,
    fetchProductsByIds,
    fetchProductById,
    fetchProductPicker,
    fetchSkusByProductNames,
    setProductsReorderFlag,
    createProduct,
    updateProduct,
    deleteProduct,
    updateProductSkuAndCount,
    clearError,
    resetStore,

    // Reorder Requests
    fetchReorderRequests,
    fetchReorderCount,
    createReorderRequest,
    fetchReorderRequestIdsForTransaction, // NEW
    filterPendingReorderRequestIds,
    approveReorderRequestsById,   // RENAMED
    rejectReorderRequestsById,    // RENAMED
    markReorderRequestsAwaitingStockById,  // RENAMED
    completeReorderRequestsById,  // RENAMED
    reorderRequests,
    reorderCount,
    // Realtime
    startRealtime,
    stopRealtime,

    // Local helpers (optional)
    upsertProductLocal,
    removeProductLocal,

    // Product expiry status
    stockStatusCounts,
    stockStatusProducts,
    stockStatusProductsTotal,
    stockStatusLoading,
    fetchAllStockStatusCounts,
    fetchStockStatusProducts,
  }
})

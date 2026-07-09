import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { SupplierType } from '@/stores/suppliersData'
import { useAuthUserStore } from './authUser'
import { useLogsDataStore } from './logsData'
import { useToast } from 'vue-toastification'

const toast = useToast()

// Matches `public.products` schema (with FK join to suppliers)
export type ProductType = {
  id: number
  created_at: string
  barcode: string | null
  sku: string | null
  product_name: string | null
  generic_name: string | null
  category: string | null
  unit: string | null
  cost_price: number | null
  selling_price: number | null
  qty_stock_in: number | null
  current_stock: number | null
  reorder_level: number | null
  supplier_id: number | null
  batch_no: number | null
  expiry_date: string | null
  status: string | null
  item_decription: string | null
  offer_per_unit: number | null
  cost_per_unit: number | null
  no: number | null
  // Joined supplier data (via FK)
  suppliers: SupplierType | null
}

export type CreateProductData = {
  barcode?: string | null
  sku?: string | null
  product_name?: string | null
  generic_name?: string | null
  category?: string | null
  unit?: string | null
  cost_price?: number | null
  selling_price?: number | null
  current_stock?: number | null
  reorder_level?: number | null
  supplier_id?: number | null
  batch_no?: number | null
  expiry_date?: string | null
  status?: string | null
  item_decription?: string | null
  offer_per_unit?: number | null
  cost_per_unit?: number | null
  no?: number | null
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
}

export type ProductPickerResult = {
  id: number
  product_name: string | null
  unit: string | null
  current_stock: number | null
  reorder_level: number | null
  cost_price: number | null
  selling_price: number | null
  supplier_id: number | null
  supplier_name: string | null
  supplier_is_active: boolean | null
  total_count: number
}

export type ReceiveStockUpdate ={
  transaction_item_id: number
  product_id: number
  sku: string | null
  actual_count_stock_in: number
}

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
  const reorderRequests: Ref<any[]> = ref([])
  const reorderCount:    Ref<number> = ref(0)
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

  // Actions
  const fetchProducts = async (options: FetchProductsOptions = {}) => {
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
      } = options

      let q = supabase.from('products').select('*, suppliers(*)', { count: 'exact' })

      if (category) {
        q = q.eq('category', category)
      }
      if (typeof supplier_id === 'number') {
        q = q.eq('supplier_id', supplier_id)
      }
      if (search && search.trim()) {
        // Supabase: use `or` for simple multi-column search
        const s = search.trim().replace(/,/g, '')
        q = q.or(
          `product_name.ilike.%${s}%,generic_name.ilike.%${s}%,barcode.ilike.%${s}%,sku.ilike.%${s}%`,
        )
      }
      if (eligibleIds && eligibleIds.length > 0) {
        q = q.in('id', eligibleIds)
      }

      // When sorting by stock, use reorder_level percentage (stock health) ordering
      if (orderBy === 'current_stock') {
        // Order by reorder_level descending first (prioritize items needing reorder),
        // then by current_stock as requested (asc/desc)
        q = q.order('reorder_level', { ascending: false, nullsFirst: false })
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

      products.value = (data || []) as ProductType[]
      totalCount.value = count ?? 0
      return products.value
    } catch (err) {
      handleError(err, 'Failed to fetch products')
      return []
    } finally {
      loading.value = false
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
    loading.value = true

    const { data, error } = await supabase.rpc('search_products_with_sku', {
      search_term: search,
      page_limit: limit,
    })

    loading.value = false

    if (error) {
      console.error(error)
      return
    }

    pickerProducts.value = (data ?? []) as ProductPickerResult[]
    pickerTotalCount.value = data?.[0]?.total_count ?? 0
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
      .select('id, transaction_items!inner(product_id)')
      .in('transaction_type', REORDER_TYPES)
      .eq('status', 'pending')
      .eq('transaction_items.product_id', payload.product_id)
      .maybeSingle()

    if (existing) {
      toast.info('This product already has a pending reorder request.')
      loading.value = false
      return { success: false }
    }

    const { data: txData, error: txError } = await supabase
      .from('transactions')
      .insert({
        transaction_type: payload.reason,
        status:           'pending',
        created_by:       user.id,
        remarks:          `Reorder flagged from warehouse (${payload.reason})`,
      })
      .select('id')
      .single()

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

    // Fetch product name for a meaningful log description
    const { data: productData } = await supabase
      .from('products')
      .select('product_name')
      .eq('id', payload.product_id)
      .single()

    const reasonLabel = payload.reason.replace('reorder_', '').replace('_', ' ')
    const productName = productData?.product_name ?? `Product #${payload.product_id}`

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
    return { success: true }
  }

  async function fetchReorderRequests() {
    loading.value = true
    if (!authStore.users.length) await authStore.getAllUsers()

    const { data, error } = await supabase
      .from('transactions')
      .select(`
        id, transaction_type, status, created_at, created_by, remarks,
        transaction_items (
          id, product_id,
          products ( id, product_name, sku, unit, current_stock, reorder_level, expiry_date, supplier_id, cost_price, selling_price, suppliers ( name ) )
        )
      `)
      .in('transaction_type', REORDER_TYPES)
      .eq('status', 'pending')
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
        product:          item?.products
          ? { ...item.products, supplier_name: item.products.suppliers?.name ?? null }
          : null,
        requester_name: authStore.users.find(u => u.id === tx.created_by)?.full_name?.toUpperCase() ?? '—',
        created_at:     tx.created_at,
      }
    })
    reorderCount.value = reorderRequests.value.length
  }

  async function fetchReorderCount() {
    const { count } = await supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .in('transaction_type', REORDER_TYPES)
      .eq('status', 'pending')
    reorderCount.value = count ?? 0
  }

  async function resolveReorderRequests(ids: number[]) {
    if (!ids.length) return

    loading.value = true

    // Need the current user for created_by on the log entries —
    // same pattern as createReorderRequest above.
    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) {
      toast.error('User not authenticated.')
      loading.value = false
      return
    }

    const { error } = await supabase
      .from('transactions')
      .update({ status: 'resolved' })
      .in('id', ids)

    // Check the update result BEFORE logging anything — a failed status
    // update shouldn't produce a "resolved" log entry.
    if (error) {
      toast.error('Failed to update reorder request status.')
      loading.value = false
      return
    }

    // Snapshot the matching requests before reorderRequests.value gets filtered
    // below, so we still have product info to describe in the log.
    const resolvedRequests = ids
      .map(id => reorderRequests.value.find(r => r.id === id))
      .filter((r): r is NonNullable<typeof r> => r != null)

    // Log each resolution — don't let a logging hiccup block the UI update,
    // but surface it if it happens so it isn't silently lost.
    const logsStore = useLogsDataStore()
    await Promise.all(resolvedRequests.map(request =>
      logsStore.createLog({
        action:         'reorder_resolved',
        description:    `Reorder resolved for "${request.product?.product_name ?? `Product #${request.product_id}`}"`,
        module:         'reorder',
        transaction_id: request.id,
        created_by:     user.id,
      })
    )).catch(err => {
      console.error('Failed to log reorder resolution:', err)
    })

    // Optimistically drop them locally
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

  // The caller (PODetailViewModal.vue's saveAllItems) rebuilds `updates` from
  // local form state on every call, including "Mark as Received" retries
  // after a partial failure — it has no way to know which lines already
  // landed. Without a guard, retrying re-applies `current_stock + actual_count`
  // for lines that already succeeded, double-counting real physical stock.
  // Fix: skip a line entirely if its transaction_item already carries a
  // non-null actual_count_stock_in (only the SKU can still be corrected).
  // Within a not-yet-applied line, the stock increment is written BEFORE the
  // actual_count_stock_in marker (reverse of the old order) so that "marker
  // is set" reliably implies "stock was applied" — matching every other
  // premature-marker fix in this sweep. This isn't fully atomic (a failure
  // between those two writes is still possible, same best-effort trade-off
  // accepted project-wide for JS-over-RPC) but it closes the actual retry
  // scenario that caused double-counting.
  const updateProductSkuAndCount = async (
    updates: ReceiveStockUpdate[]
  ): Promise<boolean> => {
    if (!updates.length) return true
    clearError()

    try {
      for (const { transaction_item_id, product_id, sku, actual_count_stock_in } of updates) {
        const { data: existingItem, error: existingError } = await supabase
          .from('transaction_items')
          .select('actual_count_stock_in')
          .eq('id', transaction_item_id)
          .maybeSingle()
        if (existingError) throw existingError

        if (existingItem?.actual_count_stock_in != null) {
          // Already applied in a prior attempt — stock was already
          // incremented, so only the SKU can still be corrected here.
          if (sku) {
            const result = await updateProduct(product_id, { sku })
            if (!result) throw new Error(`Failed to update product ID ${product_id}`)
          }
          continue
        }

        // 1. Fetch current product stock so we can increment it correctly
        const product = await fetchProductById(product_id)
        if (!product) throw new Error(`Failed to fetch product ID ${product_id}`)

        const newStock = (product.current_stock ?? 0) + actual_count_stock_in

        // 2. Apply the stock increment first
        const result = await updateProduct(product_id, {
          current_stock: newStock,
          ...(sku ? { sku } : {}),
        })
        if (!result) throw new Error(`Failed to update product ID ${product_id}`)

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
    fetchProductById,
    fetchProductPicker,
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
    resolveReorderRequests,
    reorderRequests,
    reorderCount,

    // Realtime
    startRealtime,
    stopRealtime,

    // Local helpers (optional)
    upsertProductLocal,
    removeProductLocal,
  }
})

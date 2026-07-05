import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { SupplierType } from '@/stores/suppliersData'

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
  // State
  const products: Ref<ProductType[]> = ref([])
  const currentProduct: Ref<ProductType | undefined> = ref(undefined)
  const eligibleProductIds: Ref<Set<number>> = ref(new Set())
  const loading = ref(false)
  const error: Ref<string> = ref('')
  const pickerProducts = ref<ProductPickerResult[]>([])
  const pickerTotalCount = ref(0)

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

  const updateProductSkuAndCount = async (
    updates: ReceiveStockUpdate[]
  ): Promise<boolean> => {
    if (!updates.length) return true
    clearError()

    try {
      for (const { transaction_item_id, product_id, sku, actual_count_stock_in } of updates) {
        // 1. Record the actual delivered qty on the transaction line
        const { error: tiError } = await supabase
          .from('transaction_items')
          .update({ actual_count_stock_in })
          .eq('id', transaction_item_id)

        if (tiError) throw tiError

        // 2. Fetch current product stock so we can increment it correctly
        const product = await fetchProductById(product_id)
        if (!product) throw new Error(`Failed to fetch product ID ${product_id}`)

        const newStock = (product.current_stock ?? 0) + actual_count_stock_in

        // 3. Update product: new stock total, and sku if provided
        const result = await updateProduct(product_id, {
          current_stock: newStock,
          ...(sku ? { sku } : {}),
        })

        if (!result) throw new Error(`Failed to update product ID ${product_id}`)
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

    // Realtime
    startRealtime,
    stopRealtime,

    // Local helpers (optional)
    upsertProductLocal,
    removeProductLocal,
  }
})

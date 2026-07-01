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
  actual_count: number | null
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
  actual_count?: number | null
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
  eligibleIds?: number[]  // ← new option for filtering by eligible IDs
  
}

export const useProductsDataStore = defineStore('productsData', () => {
  // State
  const products: Ref<ProductType[]> = ref([])
  const currentProduct: Ref<ProductType | undefined> = ref(undefined)
  const eligibleProductIds: Ref<Set<number>> = ref(new Set())
  const loading = ref(false)
  const error: Ref<string> = ref('')

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
  const totalCount = ref(0)  // ← add this

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
      if (eligibleIds && eligibleIds.length > 0) {  // ← here
        q = q.in('id', eligibleIds)
      }

      q = q.order(orderBy as string, { ascending })

      if (typeof limit === 'number' && typeof offset === 'number') {
        q = q.range(offset, offset + limit - 1)
      } else if (typeof limit === 'number') {
        q = q.limit(limit)
      }


      const { data, count,  error: fetchError } = await q

      if (fetchError) throw fetchError

      products.value = (data || []) as ProductType[]
      totalCount.value = count ?? 0  // ← must be here
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
    updates: { product_id: number; sku: string; actual_count: number }[]
  ): Promise<boolean> => {
    if (!updates.length) return true
    clearError()

    try {
      for (const { product_id, sku, actual_count } of updates) {
        const result = await updateProduct(product_id, { sku, actual_count, current_stock: actual_count })
        if (!result) throw new Error(`Failed to update product ID ${product_id}`)
      }
      return true
    } catch (err) {
      handleError(err, 'Failed saving product information.')
      return false
    }
  }

  const fetchEligibleProductIds = async () => {
    loading.value = true
    clearError()

    try {
      const { data, error: fetchError } = await supabase
        .from('transactions')
        .select('transaction_items!inner(product_id)')
        .eq('transaction_type', 'stock_in')

      if (fetchError) throw fetchError

      const productIds = new Set<number>()
      for (const tx of (data || []) as any[]) {
        if (Array.isArray(tx.transaction_items)) {
          for (const item of tx.transaction_items) {
            if (item.product_id) productIds.add(item.product_id)
          }
        }
      }

      eligibleProductIds.value = productIds
      return eligibleProductIds.value
    } catch (err) {
      handleError(err, 'Failed to fetch eligible products')
      eligibleProductIds.value = new Set()
      return eligibleProductIds.value
    } finally {
      loading.value = false
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

    // Computed
    productsCount,
    hasProducts,
    isLoading,
    hasError,
    isRealtimeSubscribed,
    totalCount,

    // Actions
    fetchProducts,
    fetchProductById,
    createProduct,
    updateProduct,
    deleteProduct,
    updateProductSkuAndCount,
    fetchEligibleProductIds,
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
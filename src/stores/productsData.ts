import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'

// Matches `public.products` schema
export type ProductType = {
  id: number
  created_at: string
  name: string | null
  brand: string | null
  quantity: number | null
  category: number | null
  supplier_name: string | null
  unit_cost: number | null
  lot_number: string | null
  exp_number: string | null
}

export type CreateProductData = {
  name?: string | null
  brand?: string | null
  quantity?: number | null
  category?: number | null
  supplier_name?: string | null
  unit_cost?: number | null
  lot_number?: string | null
  exp_number?: string | null
}

export type UpdateProductData = CreateProductData

type FetchProductsOptions = {
  search?: string
  category?: number | null
  supplier_name?: string | null
  orderBy?: keyof Pick<ProductType, 'created_at' | 'name' | 'brand' | 'quantity' | 'unit_cost'>
  ascending?: boolean
  limit?: number
  offset?: number
}

export const useProductsDataStore = defineStore('productsData', () => {
  // State
  const products: Ref<ProductType[]> = ref([])
  const currentProduct: Ref<ProductType | undefined> = ref(undefined)
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
        supplier_name,
        orderBy = 'created_at',
        ascending = false,
        limit,
        offset,
      } = options

      let q = supabase.from('products').select('*')

      if (typeof category === 'number') {
        q = q.eq('category', category)
      }
      if (supplier_name && supplier_name.trim()) {
        q = q.eq('supplier_name', supplier_name.trim())
      }
      if (search && search.trim()) {
        // Supabase: use `or` for simple multi-column search
        const s = search.trim().replace(/,/g, '')
        q = q.or(
          `name.ilike.%${s}%,brand.ilike.%${s}%,lot_number.ilike.%${s}%,exp_number.ilike.%${s}%,supplier_name.ilike.%${s}%`,
        )
      }

      q = q.order(orderBy as string, { ascending })

      if (typeof limit === 'number' && typeof offset === 'number') {
        q = q.range(offset, offset + limit - 1)
      } else if (typeof limit === 'number') {
        q = q.limit(limit)
      }

      const { data, error: fetchError } = await q

      if (fetchError) throw fetchError

      products.value = (data || []) as ProductType[]
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
        .select('*')
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
        .select()
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
      const { data, error: updateError } = await supabase
        .from('products')
        .update(updateData)
        .eq('id', id)
        .select()
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
    loading,
    error,

    // Computed
    productsCount,
    hasProducts,
    isLoading,
    hasError,
    isRealtimeSubscribed,

    // Actions
    fetchProducts,
    fetchProductById,
    createProduct,
    updateProduct,
    deleteProduct,
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

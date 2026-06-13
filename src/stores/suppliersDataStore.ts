import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { useToast } from 'vue-toastification'

const toast = useToast()

// Matches `public.vendors` schema
export type SupplierType = {
  id: string
  name: string
  address: string | null
  city: string | null
  contact_no: string | null
  email: string | null
  contact_person: string | null
  is_active: boolean
  created_at: string
}

export type CreateSupplierData = {
  name: string
  address?: string | null
  city?: string | null
  contact_no?: string | null
  email?: string | null
  contact_person?: string | null
  is_active?: boolean
}

export type UpdateSupplierData = Partial<CreateSupplierData>

type FetchSuppliersOptions = {
  search?: string
  orderBy?: keyof Pick<SupplierType, 'created_at' | 'name'>
  ascending?: boolean
  limit?: number
  offset?: number
  activeOnly?: boolean
}

export const useSuppliersDataStore = defineStore('suppliersData', () => {

  // ─── State ──────────────────────────────────────────────────────────────────

  const suppliers: Ref<SupplierType[]> = ref([])
  const currentSupplier: Ref<SupplierType | undefined> = ref(undefined)
  const loading = ref(false)
  const error: Ref<string> = ref('')

  // ─── Realtime ────────────────────────────────────────────────────────────────

  const realtimeChannel: Ref<RealtimeChannel | null> = ref(null)
  const realtimeStatus: Ref<'idle' | 'subscribing' | 'subscribed' | 'error'> = ref('idle')

  // ─── Computed ────────────────────────────────────────────────────────────────

  const suppliersCount = computed(() => suppliers.value.length)
  const hasSuppliers = computed(() => suppliers.value.length > 0)
  const isLoading = computed(() => loading.value)
  const hasError = computed(() => error.value !== '')
  const isRealtimeSubscribed = computed(() => realtimeStatus.value === 'subscribed')

  // Active suppliers only — for dropdowns in PR/PO forms
  const activeSuppliers = computed(() =>
    suppliers.value.filter(s => s.is_active)
  )

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  const handleError = (err: unknown, defaultMessage: string) => {
    error.value = err instanceof Error ? err.message : defaultMessage
  }

  const clearError = () => {
    error.value = ''
  }

  // ─── Realtime ────────────────────────────────────────────────────────────────

  const startRealtime = () => {
    if (realtimeChannel.value) return realtimeChannel.value

    realtimeStatus.value = 'subscribing'

    const channel = supabase
      .channel('suppliers-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'suppliers' }, (payload) => {
        const eventType = payload.eventType

        if (eventType === 'INSERT' || eventType === 'UPDATE') {
          upsertSupplierLocal(payload.new as SupplierType)
        }

        if (eventType === 'DELETE') {
          const id = (payload.old as Partial<SupplierType>)?.id
          if (id) removeSupplierLocal(id)
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
    await supabase.removeChannel(channel)
  }

  // ─── Actions ─────────────────────────────────────────────────────────────────

  const fetchSuppliers = async (options: FetchSuppliersOptions = {}) => {
    loading.value = true
    clearError()

    try {
      const {
        search,
        orderBy = 'name',
        ascending = true,
        limit,
        offset,
        activeOnly = false,
      } = options

      let q = supabase.from('suppliers').select('*')

      if (activeOnly) {
        q = q.eq('is_active', true)
      }

      if (search?.trim()) {
        const s = search.trim()
        q = q.or(
          `name.ilike.%${s}%,email.ilike.%${s}%,contact_no.ilike.%${s}%,contact_person.ilike.%${s}%`
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

      suppliers.value = (data || []) as SupplierType[]
      return suppliers.value

    } catch (err) {
      handleError(err, 'Failed to fetch suppliers')
      return []
    } finally {
      loading.value = false
    }
  }

  const fetchSupplierById = async (id: string) => {
    loading.value = true
    clearError()

    try {
      const { data, error: fetchError } = await supabase
        .from('suppliers')
        .select('*')
        .eq('id', id)
        .single()

      if (fetchError) throw fetchError

      currentSupplier.value = data as SupplierType
      return currentSupplier.value

    } catch (err) {
      handleError(err, `Failed to fetch supplier with ID ${id}`)
      return undefined
    } finally {
      loading.value = false
    }
  }

  const createSupplier = async (supplierData: CreateSupplierData) => {
    loading.value = true
    clearError()

    try {
      const { data, error: createError } = await supabase
        .from('suppliers')
        .insert([supplierData])
        .select()
        .single()

      if (createError) throw createError

      const created = data as SupplierType
      suppliers.value.unshift(created)
      currentSupplier.value = created
      toast.success('Supplier created successfully')
      return created

    } catch (err) {
      handleError(err, 'Failed to create supplier')
      return undefined
    } finally {
      loading.value = false
    }
  }

  const updateSupplier = async (id: string, updateData: UpdateSupplierData) => {
    loading.value = true
    clearError()

    try {
      const { data, error: updateError } = await supabase
        .from('suppliers')
        .update(updateData)
        .eq('id', id)
        .select()
        .single()

      if (updateError) throw updateError

      const updated = data as SupplierType
      const index = suppliers.value.findIndex(s => s.id === id)
      if (index !== -1) suppliers.value[index] = updated
      if (currentSupplier.value?.id === id) currentSupplier.value = updated
      toast.success('Supplier updated successfully')
      return updated

    } catch (err) {
      handleError(err, `Failed to update supplier with ID ${id}`)
      return undefined
    } finally {
      loading.value = false
    }
  }

  const deleteSupplier = async (id: string) => {
    loading.value = true
    clearError()

    try {
      const { error: deleteError } = await supabase
        .from('suppliers')
        .delete()
        .eq('id', id)

      if (deleteError) throw deleteError

      removeSupplierLocal(id)
      toast.success('Supplier deleted successfully')
      return true

    } catch (err) {
      handleError(err, `Failed to delete supplier with ID ${id}`)
      return false
    } finally {
      loading.value = false
    }
  }

  // ─── Local Helpers ────────────────────────────────────────────────────────────

  const upsertSupplierLocal = (supplier: SupplierType) => {
    const idx = suppliers.value.findIndex(s => s.id === supplier.id)
    if (idx === -1) suppliers.value.unshift(supplier)
    else suppliers.value[idx] = supplier

    if (currentSupplier.value?.id === supplier.id) currentSupplier.value = supplier
  }

  const removeSupplierLocal = (id: string) => {
    suppliers.value = suppliers.value.filter(s => s.id !== id)
    if (currentSupplier.value?.id === id) currentSupplier.value = undefined
  }

  const resetStore = () => {
    suppliers.value = []
    currentSupplier.value = undefined
    loading.value = false
    error.value = ''
  }

  // ─── Expose ───────────────────────────────────────────────────────────────────

  return {
    // State
    suppliers,
    currentSupplier,
    loading,
    error,

    // Computed
    suppliersCount,
    hasSuppliers,
    activeSuppliers,
    isLoading,
    hasError,
    isRealtimeSubscribed,

    // Actions
    fetchSuppliers,
    fetchSupplierById,
    createSupplier,
    updateSupplier,
    deleteSupplier,
    clearError,
    resetStore,

    // Realtime
    startRealtime,
    stopRealtime,

    // Local helpers
    upsertSupplierLocal,
    removeSupplierLocal,
  }
})
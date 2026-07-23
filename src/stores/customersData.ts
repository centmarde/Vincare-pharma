import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { useToast } from 'vue-toastification'

const toast = useToast()

export type BusinessStructure = 'corporation' | 'sole_proprietorship' | 'partnership' | 'other'
export type RebatePaymentMode = 'cash' | 'gcash' | 'bank' | 'other'
export type SchemeType = 'pushing' | 'tie_up' | 'dispensing' | 'trade_discount' | 'free_goods'

export type CustomerType = {
  id: number
  created_at: string
  name: string | null
  agency_type: string | null
  contact_person: string | null
  contact_no: string | null
  email: string | null
  address: string | null
  is_active: boolean | null
  department: string | null
  agent_id: number | null
  is_vat_registered: boolean | null
  tin_number: string | null
  business_structure: BusinessStructure | null
  sec_registration_no: string | null
  dti_registration_no: string | null
  name_of_pmr: string | null
  area: string | null
  rebate_payment_mode: RebatePaymentMode | null
  rebate_payment_account_no: string | null
  scheme: SchemeType[] | null
  term_days: number | null
  product_sales_list: string | null
  owner_name: string | null
  owner_contact_no: string | null
  purchaser_name: string | null
  purchaser_contact_no: string | null
  target_sales: number | null
  discount_rate: number | null
  rebate_rate: number | null
  markup_percent: number | null
  rebate_ratio_distribution: string | null
}

export type CreateCustomerData = {
  name?: string | null
  agency_type?: string | null
  contact_person?: string | null
  contact_no?: string | null
  email?: string | null
  address?: string | null
  is_active?: boolean | null
  department?: string | null
  agent_id?: number | null
  is_vat_registered?: boolean | null
  tin_number?: string | null
  business_structure?: BusinessStructure | null
  sec_registration_no?: string | null
  dti_registration_no?: string | null
  name_of_pmr?: string | null
  area?: string | null
  rebate_payment_mode?: RebatePaymentMode | null
  rebate_payment_account_no?: string | null
  scheme?: SchemeType[] | null
  term_days?: number | null
  product_sales_list?: string | null
  owner_name?: string | null
  owner_contact_no?: string | null
  purchaser_name?: string | null
  purchaser_contact_no?: string | null
  target_sales?: number | null
  discount_rate?: number | null
  rebate_rate?: number | null
  markup_percent?: number | null
  rebate_ratio_distribution?: string | null
}

export type UpdateCustomerData = CreateCustomerData

type FetchCustomersOptions = {
  search?: string
  activeOnly?: boolean
  department?: string
}

export const useCustomersDataStore = defineStore('customersData', () => {
  const customers: Ref<CustomerType[]> = ref([])
  const currentCustomer: Ref<CustomerType | undefined> = ref(undefined)
  const loading = ref(false)
  const error: Ref<string> = ref('')

  const realtimeChannel: Ref<RealtimeChannel | null> = ref(null)
  const realtimeStatus: Ref<'idle' | 'subscribing' | 'subscribed' | 'error'> = ref('idle')

  const isLoading = computed(() => loading.value)
  const hasError = computed(() => error.value !== '')

  const handleError = (err: unknown, defaultMessage: string) => {
    error.value = err instanceof Error ? err.message : defaultMessage
  }
  const clearError = () => { error.value = '' }

  const upsertLocal = (c: CustomerType) => {
    const idx = customers.value.findIndex((x) => x.id === c.id)
    if (idx === -1) customers.value.unshift(c)
    else customers.value[idx] = c
  }
  const removeLocal = (id: number) => {
    customers.value = customers.value.filter((x) => x.id !== id)
  }

  const startRealtime = () => {
    if (realtimeChannel.value) return realtimeChannel.value
    realtimeStatus.value = 'subscribing'
    const channel = supabase
      .channel('customers-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          upsertLocal(payload.new as CustomerType)
        } else if (payload.eventType === 'DELETE') {
          const id = (payload.old as Partial<CustomerType>)?.id
          if (typeof id === 'number') removeLocal(id)
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') realtimeStatus.value = 'subscribed'
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') realtimeStatus.value = 'error'
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

  const fetchCustomers = async (options: FetchCustomersOptions = {}) => {
    loading.value = true
    clearError()
    try {
      const { search, activeOnly, department } = options
      let q = supabase.from('customers').select('*')
      if (activeOnly) q = q.eq('is_active', true)
      if (department) q = q.eq('department', department)
      if (search?.trim()) {
        const s = search.trim().replace(/,/g, '')
        q = q.or(`name.ilike.%${s}%,contact_person.ilike.%${s}%`)
      }
      q = q.order('created_at', { ascending: false })

      const { data, error: fetchError } = await q
      if (fetchError) throw fetchError
      customers.value = (data || []) as CustomerType[]
      return customers.value
    } catch (err) {
      handleError(err, 'Failed to fetch customers')
      return []
    } finally {
      loading.value = false
    }
  }

  const createCustomer = async (data: CreateCustomerData) => {
    loading.value = true
    clearError()
    try {
      const { data: created, error: createError } = await supabase
        .from('customers').insert([data]).select().single()
      if (createError) throw createError
      upsertLocal(created as CustomerType)
      toast.success('Customer created.')
      return created as CustomerType
    } catch (err) {
      handleError(err, 'Failed to create customer')
      toast.error('Failed to create customer.')
      return undefined
    } finally {
      loading.value = false
    }
  }

  const updateCustomer = async (id: number, data: UpdateCustomerData) => {
    loading.value = true
    clearError()
    try {
      const { data: updated, error: updateError } = await supabase
        .from('customers').update(data).eq('id', id).select().single()
      if (updateError) throw updateError
      upsertLocal(updated as CustomerType)
      toast.success('Customer updated.')
      return updated as CustomerType
    } catch (err) {
      handleError(err, 'Failed to update customer')
      toast.error('Failed to update customer.')
      return undefined
    } finally {
      loading.value = false
    }
  }

  const deleteCustomer = async (id: number) => {
    loading.value = true
    clearError()
    try {
      const { error: deleteError } = await supabase.from('customers').delete().eq('id', id)
      if (deleteError) throw deleteError
      removeLocal(id)
      toast.success('Customer deleted.')
      return true
    } catch (err) {
      handleError(err, 'Failed to delete customer')
      toast.error('Failed to delete customer.')
      return false
    } finally {
      loading.value = false
    }
  }

  const resetStore = () => {
    customers.value = []
    currentCustomer.value = undefined
    loading.value = false
    error.value = ''
  }

  return {
    customers, currentCustomer, loading, error,
    isLoading, hasError,
    fetchCustomers, createCustomer, updateCustomer, deleteCustomer,
    startRealtime, stopRealtime, clearError, resetStore,
  }
})

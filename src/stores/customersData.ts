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
  // FREE TEXT in the live data ('60 Days', 'COD', 'Consignment ') — the real
  // customer import records payment arrangements, not day counts. Read it
  // through parseTermDays(); never do arithmetic on it directly.
  term_days: string | null
  product_sales_list: string | null
  owner_name: string | null
  owner_contact_no: string | null
  purchaser_name: string | null
  purchaser_contact_no: string | null
  // Free text in the live data ('20,000.00 PER MONTH'), not a number.
  target_sales: string | null
  discount_rate: number | null
  rebate_rate: number | null
  markup_percent: number | null
  rebate_ratio_distribution: string | null

  // ── Columns the real-customer import added ────────────────────────────────
  // These carry the same commercial terms as the numeric columns above, but as
  // the narrative the business actually records. They are the source of truth
  // for what was AGREED; the numeric columns are what the app computes from.
  /** DRUGSTORE | PRIVATE HOSPITAL | DISPENSING MDS | LGU | GOVERNMENT HOSPITAL. A hint for which department a customer belongs to — never a rule, since a drugstore can be POS or Ethical. */
  category: string | null
  /** Pricing basis + markup as prose: 'SYSTEM PRICE', 'SYSTEM PRICE + 30%', 'PLUS 15%'. Narrative source for markup_percent. */
  price_offered: string | null
  /** Rebate recipient(s) and rate(s): 'JUAN DELA CRUZ | 20% + 5% ADS'. May list SEVERAL recipients across newlines — a flat rebate_rate cannot represent those. */
  receipt_details: string | null
  recipients_name: string | null
  payment_method: string | null
  is_inquire: boolean | null
  remarks: string | null
  updated_at: string | null
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
  term_days?: string | null
  product_sales_list?: string | null
  owner_name?: string | null
  owner_contact_no?: string | null
  purchaser_name?: string | null
  purchaser_contact_no?: string | null
  target_sales?: string | null
  category?: string | null
  price_offered?: string | null
  receipt_details?: string | null
  recipients_name?: string | null
  payment_method?: string | null
  is_inquire?: boolean | null
  remarks?: string | null
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
  /**
   * Widen a `department` filter to also return customers with NO department.
   *
   * The real customer file has no department on most rows, and a customer can
   * legitimately trade through more than one channel (a drugstore may be both a
   * POS and an Ethical account). `department` is therefore a HOME-CHANNEL LABEL,
   * not a gate — filtering strictly on it hides customers that staff still need
   * to see, which is what made both module lists come up empty.
   */
  includeUnassigned?: boolean
}

export const useCustomersDataStore = defineStore('customersData', () => {
  const customers: Ref<CustomerType[]> = ref([])
  // Kept apart from `customers` on purpose — see searchCustomers().
  const searchResults: Ref<CustomerType[]> = ref([])
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
      const { search, activeOnly, department, includeUnassigned } = options
      let q = supabase.from('customers').select('*')
      if (activeOnly) q = q.eq('is_active', true)
      if (department) {
        q = includeUnassigned
          ? q.or(`department.eq.${department},department.is.null`)
          : q.eq('department', department)
      }
      if (search?.trim()) {
        const s = search.trim().replace(/,/g, '')
        q = q.or(`name.ilike.%${s}%,contact_person.ilike.%${s}%,contact_no.ilike.%${s}%`)
      }
      // Ordered by NAME, not created_at. This is a directory people look
      // customers up in, and newest-first also skewed what you see: the
      // customers carrying agreed rates are mostly older rows, so a
      // created_at-descending first page showed rates on only 8% of it.
      q = q.order('name', { ascending: true })

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

  /**
   * Typeahead lookup for order pickers — searches EVERY customer regardless of
   * department, because the channel a customer belongs to is a label, not a
   * gate, and staff choose the customer at transaction time.
   *
   * Results land in their own `searchResults` ref rather than `customers`: this
   * store is shared by the In-House, Ethical and Sales customer pages, so a
   * picker writing to `customers` would silently replace whatever list the page
   * behind it is rendering.
   *
   * Server-side and capped — there are ~5.3k customers, far too many to load
   * into an autocomplete.
   */
  async function searchCustomers(term: string, limit = 50) {
    clearError()
    try {
      let q = supabase.from('customers').select('*').eq('is_active', true)
      const s = term.trim().replace(/[,()]/g, '')
      if (s) {
        q = q.or(`name.ilike.%${s}%,contact_person.ilike.%${s}%,contact_no.ilike.%${s}%`)
      }
      const { data, error: searchError } = await q.order('name', { ascending: true }).limit(limit)
      if (searchError) throw searchError
      searchResults.value = (data || []) as CustomerType[]
      return searchResults.value
    } catch (err) {
      handleError(err, 'Failed to search customers')
      searchResults.value = []
      return []
    }
  }

  /**
   * Record the home channel the FIRST time a customer transacts. Never
   * overwrites an existing stamp: once a customer is marked as belonging to a
   * department they belong there, and a cross-channel sale must not relabel
   * them. Best-effort — a failure here must never block the order.
   */
  async function stampDepartmentIfBlank(customerId: number, department: string) {
    const { error: stampError } = await supabase
      .from('customers')
      .update({ department })
      .eq('id', customerId)
      .is('department', null)
    if (stampError) console.warn('stampDepartmentIfBlank failed:', stampError.message)
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
    customers, searchResults, currentCustomer, loading, error,
    isLoading, hasError,
    fetchCustomers, searchCustomers, stampDepartmentIfBlank,
    createCustomer, updateCustomer, deleteCustomer,
    startRealtime, stopRealtime, clearError, resetStore,
  }
})

import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useToast } from 'vue-toastification'
import { useCustomersDataStore } from '@/stores/customersData'
import { useDiscountsDataStore } from '@/stores/discountsData'
import type { CustomerType, CreateCustomerData } from '@/stores/customersData'

export const headers = [
  { title: 'NAME',     key: 'name',        sortable: true,  align: 'start' as const },
  { title: 'CATEGORY', key: 'category',    sortable: true,  align: 'center' as const },
  { title: 'AREA',     key: 'area',        sortable: true,  align: 'center' as const },
  { title: 'CONTACT',  key: 'contact_no',  sortable: false, align: 'center' as const },
  { title: 'TERMS',    key: 'term_days',   sortable: false, align: 'center' as const },
  { title: 'RATES',    key: 'terms',       sortable: false, align: 'center' as const },
  { title: 'CHANNEL',  key: 'department',  sortable: true,  align: 'center' as const },
  { title: '',         key: 'actions',     sortable: false, align: 'end' as const },
] as const

const emptyForm = (): CreateCustomerData => ({
  name: '', contact_person: '', contact_no: '', email: '', address: '',
  area: '', category: '', term_days: null, is_active: true,
})

/**
 * Customers for the store channel (POS).
 *
 * POS records a customer at the till from free text, matching an existing one
 * by contact number — it has no picker of its own. That makes this page the
 * only place a store customer's details can actually be corrected: checkout
 * deliberately fills blanks and never overwrites a name, so a mistyped entry at
 * the till can no longer rename a real account.
 */
export function useSalesCustomers() {
  const store = useCustomersDataStore()
  const discountsStore = useDiscountsDataStore()
  const { customers, loading } = storeToRefs(store)
  const toast = useToast()

  const search = ref('')
  const showForm = ref(false)
  const editingId = ref<number | null>(null)
  const form = ref<CreateCustomerData>(emptyForm())

  // Store customers plus everyone not yet assigned a channel — a customer is
  // stamped with a department only when they first transact, so most of the
  // real file is unassigned and would otherwise be invisible here.
  const showAll = ref(false)

  async function reload() {
    await store.fetchCustomers({
      ...(showAll.value ? {} : { department: 'pos', includeUnassigned: true }),
      search: search.value || undefined,
    })
  }
  watch(showAll, () => { void reload() })

  // Search SERVER-SIDE — a 1000-row response cap over ~5.3k customers means a
  // client-side filter would hide anyone outside the first page.
  let searchDebounce: ReturnType<typeof setTimeout> | undefined
  watch(search, () => {
    if (searchDebounce) clearTimeout(searchDebounce)
    searchDebounce = setTimeout(() => { void reload() }, 300)
  })

  const filtered = computed(() => {
    const s = search.value.trim().toLowerCase()
    if (!s) return customers.value
    return customers.value.filter((c) =>
      (c.name?.toLowerCase().includes(s) ?? false) ||
      (c.contact_no?.toLowerCase().includes(s) ?? false) ||
      (c.area?.toLowerCase().includes(s) ?? false),
    )
  })

  const rules = {
    required: (v: unknown) => (!!v && String(v).trim() !== '') || 'Required',
  }

  function openCreate() {
    editingId.value = null
    form.value = emptyForm()
    showForm.value = true
  }

  function openEdit(c: CustomerType) {
    editingId.value = c.id
    form.value = {
      name: c.name, contact_person: c.contact_person, contact_no: c.contact_no,
      email: c.email, address: c.address, area: c.area, category: c.category,
      term_days: c.term_days, is_active: c.is_active,
    }
    showForm.value = true
  }

  function cancelForm() {
    showForm.value = false
    editingId.value = null
    form.value = emptyForm()
  }

  async function submit(): Promise<boolean> {
    if (!form.value.name?.trim()) return false
    // Only a NEW customer is stamped 'pos'. Editing never rewrites the channel:
    // once a customer belongs to a department they belong there, and this page
    // also lists unassigned and (optionally) other channels' customers.
    const payload = editingId.value ? { ...form.value } : { ...form.value, department: 'pos' }
    const result = editingId.value
      ? await store.updateCustomer(editingId.value, payload)
      : await store.createCustomer(payload)
    if (result) {
      toast.success(editingId.value ? 'Customer updated.' : 'Customer created.')
      cancelForm()
      return true
    }
    return false
  }

  function profileFor(customerId: number | null | undefined) {
    return discountsStore.profileFor(customerId)
  }

  async function init() {
    await Promise.all([reload(), discountsStore.ensureProfilesLoaded()])
  }

  return {
    customers, loading, search, filtered, showAll, reload, profileFor,
    showForm, editingId, form, rules, headers,
    openCreate, openEdit, cancelForm, submit, init,
  }
}

import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useCustomersDataStore } from '@/stores/customersData'
import type { CustomerType, CreateCustomerData } from '@/stores/customersData'

export const headers = [
  { title: 'NAME',     key: 'name',           sortable: true,  align: 'start' as const },
  { title: 'TYPE',     key: 'agency_type',    sortable: true,  align: 'center' as const },
  { title: 'CONTACT',  key: 'contact_person', sortable: false, align: 'start' as const },
  { title: 'NO.',      key: 'contact_no',     sortable: false, align: 'center' as const },
  { title: 'ACTIVE',   key: 'is_active',      sortable: false, align: 'center' as const },
  { title: '',         key: 'actions',        sortable: false, align: 'end' as const },
] as const

export const agencyTypes = [
  { title: 'Government', value: 'government' },
  { title: 'LGU', value: 'lgu' },
  { title: 'Private', value: 'private' },
]

const emptyForm = (): CreateCustomerData => ({
  name: '', agency_type: 'government', contact_person: '', contact_no: '', email: '', address: '', is_active: true,
})

export function useCustomers() {
  const store = useCustomersDataStore()
  const { customers, loading } = storeToRefs(store)

  const search = ref('')
  const showForm = ref(false)
  const editingId = ref<number | null>(null)
  const form = ref<CreateCustomerData>(emptyForm())

  const rules = { required: (v: unknown) => (!!v && String(v).trim() !== '') || 'Required' }

  const filtered = computed(() => {
    const s = search.value.trim().toLowerCase()
    if (!s) return customers.value
    return customers.value.filter((c) =>
      (c.name?.toLowerCase().includes(s) ?? false) ||
      (c.contact_person?.toLowerCase().includes(s) ?? false),
    )
  })

  function openCreate() {
    editingId.value = null
    form.value = emptyForm()
    showForm.value = true
  }
  function openEdit(c: CustomerType) {
    editingId.value = c.id
    form.value = {
      name: c.name, agency_type: c.agency_type, contact_person: c.contact_person,
      contact_no: c.contact_no, email: c.email, address: c.address, is_active: c.is_active,
    }
    showForm.value = true
  }

  async function submit(): Promise<boolean> {
    if (!form.value.name?.trim()) return false
    const payload = { ...form.value, department: 'inhouse' }
    const result = editingId.value
      ? await store.updateCustomer(editingId.value, payload)
      : await store.createCustomer(payload)
    if (result) { showForm.value = false; return true }
    return false
  }

  async function remove(c: CustomerType) {
    await store.deleteCustomer(c.id)
  }

  async function init() {
    await store.fetchCustomers({ department: 'inhouse' })
  }

  return {
    customers, loading, search, filtered,
    showForm, editingId, form, rules,
    openCreate, openEdit, submit, remove, init,
  }
}

import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useCustomersDataStore } from '@/stores/customersData'
import type { CustomerType, CreateCustomerData } from '@/stores/customersData'

export const headers = [
  { title: 'NAME',     key: 'name',           sortable: true,  align: 'start' as const },
  { title: 'TYPE',     key: 'agency_type',    sortable: true,  align: 'center' as const },
  { title: 'CONTACT',  key: 'contact_person', sortable: false, align: 'start' as const },
  { title: 'NO.',      key: 'contact_no',     sortable: false, align: 'center' as const },
  { title: 'TIN',      key: 'tin_number',     sortable: false, align: 'center' as const },
  { title: 'VAT',      key: 'is_vat_registered', sortable: false, align: 'center' as const },
  { title: 'STRUCTURE', key: 'business_structure', sortable: false, align: 'center' as const },
  { title: 'SEC/DTI #', key: 'reg_no',         sortable: false, align: 'center' as const },
  { title: 'ACTIVE',   key: 'is_active',      sortable: false, align: 'center' as const },
  { title: '',         key: 'actions',        sortable: false, align: 'end' as const },
] as const

export const agencyTypes = [
  { title: 'Government', value: 'government' },
  { title: 'LGU', value: 'lgu' },
  { title: 'Private', value: 'private' },
]

// Legal structure drives which registration number is required — captured
// per the accountant's "avoid ghost transactions" requirement: every AR
// balance should tie to a verifiably real, registered entity.
export const businessStructures = [
  { title: 'Corporation', value: 'corporation' },
  { title: 'Partnership', value: 'partnership' },
  { title: 'Sole Proprietorship', value: 'sole_proprietorship' },
  { title: 'Other (govt. agency, cooperative, etc.)', value: 'other' },
]

const emptyForm = (): CreateCustomerData => ({
  name: '', agency_type: 'government', contact_person: '', contact_no: '', email: '', address: '', is_active: true,
  is_vat_registered: false, tin_number: '',
  business_structure: 'other', sec_registration_no: '', dti_registration_no: '',
  // Both feed the AR Statement of Accounts register: `area` is a column on it,
  // and without `term_days` an In-House receivable has no due date at all
  // (In-House orders carry no due-date convention of their own) so it can never
  // land in an aging bucket.
  area: '', term_days: null,
})

export function useCustomers() {
  const store = useCustomersDataStore()
  const { customers, loading } = storeToRefs(store)

  const search = ref('')
  const showForm = ref(false)
  const editingId = ref<number | null>(null)
  const form = ref<CreateCustomerData>(emptyForm())

  const rules = {
    required: (v: unknown) => (!!v && String(v).trim() !== '') || 'Required',
    requiredIfSec: (v: unknown) =>
      (form.value.business_structure !== 'corporation' && form.value.business_structure !== 'partnership') ||
      (!!v && String(v).trim() !== '') || 'SEC Registration No. is required for this business structure',
    requiredIfDti: (v: unknown) =>
      form.value.business_structure !== 'sole_proprietorship' ||
      (!!v && String(v).trim() !== '') || 'DTI Registration No. is required for this business structure',
  }

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
      is_vat_registered: c.is_vat_registered, tin_number: c.tin_number,
      business_structure: c.business_structure, sec_registration_no: c.sec_registration_no,
      dti_registration_no: c.dti_registration_no,
      area: c.area, term_days: c.term_days,
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

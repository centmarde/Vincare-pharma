import { ref, computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useCustomersDataStore } from '@/stores/customersData'
import { useDiscountsDataStore } from '@/stores/discountsData'
import type { CustomerType, CreateCustomerData } from '@/stores/customersData'

// Deliberately narrow: business structure and SEC/DTI are blank for almost
// every row and already live on the edit form, and carrying them here pushed
// the useful columns off the screen. TIN stays — government contracts need it
// visible ("avoid ghost transactions").
export const headers = [
  { title: 'Customer',       key: 'name',        sortable: true,  align: 'start' as const },
  { title: 'Type',           key: 'agency_type', sortable: true,  align: 'center' as const },
  { title: 'Contact No.',    key: 'contact_no',  sortable: false, align: 'center' as const },
  { title: 'Area',           key: 'area',        sortable: false, align: 'center' as const },
  { title: 'Payment Terms',  key: 'term_days',   sortable: false, align: 'center' as const },
  { title: 'Agreed Rates',   key: 'rates',       sortable: false, align: 'center' as const },
  { title: 'Active',         key: 'is_active',   sortable: false, align: 'center' as const },
  { title: '',               key: 'actions',     sortable: false, align: 'end' as const },
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
  const discountsStore = useDiscountsDataStore()
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

  function profileFor(customerId: number | null | undefined) {
    return discountsStore.profileFor(customerId)
  }

  async function init() {
    await Promise.all([reload(), discountsStore.ensureProfilesLoaded()])
  }

  // Unassigned customers are shown alongside In-House ones: most of the real
  // customer file has no department yet, and one gets stamped only when it
  // first transacts. `showAll` widens this to every department for the times
  // staff need to find a customer that already belongs to another channel.
  const showAll = ref(false)

  async function reload() {
    await store.fetchCustomers({
      ...(showAll.value ? {} : { department: 'inhouse', includeUnassigned: true }),
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

  return {
    customers, loading, search, filtered, showAll, reload, profileFor,
    showForm, editingId, form, rules,
    openCreate, openEdit, submit, remove, init,
  }
}

import { ref, computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useToast } from 'vue-toastification'
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
  // How to make SEC/DTI to have a wrap in the header?
  { title: 'SEC/DTI #', key: 'reg_no',         sortable: false, align: 'center' as const, width: 100 },
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

const PAGE_SIZE = 10

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
  const { pagedCustomers, pagedTotalCount, pagedLoading } = storeToRefs(store)
  const toast = useToast()

  const searchInput = ref('')
  const search = ref('')
  const page = ref(1)

  const showForm = ref(false)
  const editingId = ref<number | null>(null)
  const form = ref<CreateCustomerData>(emptyForm())

  // Unassigned customers are shown alongside In-House ones: most of the real
  // customer file has no department yet, and one gets stamped only when it
  // first transacts. `showAll` widens this to every department for the times
  // staff need to find a customer that already belongs to another channel.
  const showAll = ref(false)

  async function reload() {
    await store.fetchCustomersRPC({
      department: showAll.value ? null : 'inhouse',
      includeUnassigned: !showAll.value,
      search: search.value,
      page: page.value,
      pageSize: PAGE_SIZE,
    })
  }

  function applySearch() {
    search.value = searchInput.value.trim()
    page.value = 1
    void reload()
  }

  function clearSearch() {
    searchInput.value = ''
    search.value = ''
    page.value = 1
    void reload()
  }

  watch(showAll, () => {
    page.value = 1
    void reload()
  })

  watch(page, () => {
    void reload()
  })

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
    if (!s) return pagedCustomers.value
    return pagedCustomers.value.filter((c) =>
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

  function cancelForm() {
    showForm.value = false
    editingId.value = null
    form.value = emptyForm()
  }

  async function submit(): Promise<boolean> {
    if (!form.value.name?.trim()) return false
    // Only a NEW customer is stamped 'inhouse'. Editing never rewrites the
    // channel: once a customer belongs to a department they belong there, and
    // this page also lists unassigned and (optionally) other channels' customers.
    const payload = editingId.value ? { ...form.value } : { ...form.value, department: 'inhouse' }
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

  async function remove(c: CustomerType) {
    await store.deleteCustomer(c.id)
  }

  async function init() {
    await reload()
  }

  return {
    // paginated data
    customers: pagedCustomers,
    totalCount: pagedTotalCount,
    loading: pagedLoading,
    page,
    pageSize: PAGE_SIZE,
    reload,
    // search
    searchInput, search, applySearch, clearSearch,
    // filters
    showAll,
    // form
    showForm, editingId, form, rules, headers,
    openCreate, openEdit, cancelForm, submit, remove, init,
  }
}
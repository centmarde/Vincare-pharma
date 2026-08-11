import { ref, computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useToast } from 'vue-toastification'
import { useCustomersDataStore } from '@/stores/customersData'
import { useDiscountsDataStore } from '@/stores/discountsData'
import type { CustomerType, CreateCustomerData } from '@/stores/customersData'

export const headers = [
  {title: 'Customer',key: 'name',sortable: true,align: 'start' as const,},
  {title: 'Type',key: 'agency_type',sortable: true,align: 'center' as const,},
  {title: 'Contact',key: 'contact_person',sortable: false,align: 'start' as const,},
  {title: 'Contact No.',key: 'contact_no',sortable: false,align: 'center' as const,},
  {title: 'Area',key: 'area',sortable: false,align: 'center' as const,},
  {title: 'Payment Terms',key: 'term_days',sortable: false,align: 'center' as const,},
  {title: 'TIN',key: 'tin_number',sortable: false,align: 'center' as const,},
  {title: 'VAT',key: 'is_vat_registered',sortable: false,align: 'center' as const,},
  {title: 'Structure',key: 'business_structure',sortable: false,align: 'center' as const,},
  {title: 'SEC/DTI #',key: 'reg_no',sortable: false,align: 'center' as const,width: 100,},
  {title: 'Agreed Rates',key: 'rates',sortable: false,align: 'center' as const,},
  {title: 'Active',key: 'is_active',sortable: false,align: 'center' as const,},
  {title: 'Channel',key: 'department',sortable: true,align: 'center' as const,},
  {title: '',key: 'actions',sortable: false,align: 'end' as const,},
] as const

export const agencyTypes = [
  {title: 'Government',value: 'government',},
  {title: 'LGU',value: 'lgu',},
  {title: 'Private',value: 'private',},
]

export const businessStructures = [
  {title: 'Corporation',value: 'corporation',},
  {title: 'Partnership',value: 'partnership',},
  {title: 'Sole Proprietorship',value: 'sole_proprietorship',},
  {title: 'Other (govt. agency, cooperative, etc.)',value: 'other',},
]

const PAGE_SIZE = 10

const emptyForm = (): CreateCustomerData => ({
  name: '',
  agency_type: 'government',
  contact_person: '',
  contact_no: '',
  email: '',
  address: '',
  is_active: true,

  is_vat_registered: false,
  tin_number: '',

  business_structure: 'other',
  sec_registration_no: '',
  dti_registration_no: '',

  area: '',
  term_days: null,
})

export function useCustomers() {
  const store = useCustomersDataStore()
  const discountsStore = useDiscountsDataStore()

  const { pagedCustomers, pagedTotalCount, pagedLoading } = storeToRefs(store)

  const toast = useToast()

  const searchInput = ref('')
  const search = ref('')
  const page = ref(1)

  const showForm = ref(false)
  const editingId = ref<number | null>(null)
  const form = ref<CreateCustomerData>(emptyForm())

  const showAll = ref(false)

  const rules = {
    required: (v: unknown) => (!!v && String(v).trim() !== '') || 'Required',

    requiredIfSec: (v: unknown) =>
      (form.value.business_structure !== 'corporation' &&
        form.value.business_structure !== 'partnership') ||
      (!!v && String(v).trim() !== '') ||
      'SEC Registration No. is required for this business structure',

    requiredIfDti: (v: unknown) =>
      form.value.business_structure !== 'sole_proprietorship' ||
      (!!v && String(v).trim() !== '') ||
      'DTI Registration No. is required for this business structure',
  }

  async function reload() {
    await store.fetchCustomersRPC({
      department: showAll.value ? null : 'inhouse',
      includeUnassigned: !showAll.value,
      search: search.value.trim() || null,
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

  watch(search, (value) => {
    if (searchInput.value !== value) {
      searchInput.value = value
    }
  })

  watch(showAll, () => {
    page.value = 1
    void reload()
  })

  watch(page, (newPage, oldPage) => {
    if (newPage === oldPage) {
      return
    }

    void reload()
  })

  const filtered = computed(() => pagedCustomers.value)

  function openCreate() {
    editingId.value = null
    form.value = emptyForm()
    showForm.value = true
  }

  function openEdit(customer: CustomerType) {
    editingId.value = customer.id

    form.value = {
      name: customer.name,
      agency_type: customer.agency_type,
      contact_person: customer.contact_person,
      contact_no: customer.contact_no,
      email: customer.email,
      address: customer.address,
      is_active: customer.is_active,

      is_vat_registered: customer.is_vat_registered,
      tin_number: customer.tin_number,

      business_structure: customer.business_structure,
      sec_registration_no: customer.sec_registration_no,
      dti_registration_no: customer.dti_registration_no,

      area: customer.area,
      term_days: customer.term_days,
    }

    showForm.value = true
  }

  function cancelForm() {
    showForm.value = false
    editingId.value = null
    form.value = emptyForm()
  }

  async function submit(): Promise<boolean> {
    if (!form.value.name?.trim()) {
      return false
    }

    const payload = editingId.value
      ? { ...form.value }
      : {
          ...form.value,
          department: 'inhouse',
        }

    const result = editingId.value
      ? await store.updateCustomer(editingId.value, payload)
      : await store.createCustomer(payload)

    if (!result) {
      return false
    }

    toast.success(editingId.value ? 'Customer updated.' : 'Customer created.')

    cancelForm()

    await reload()

    return true
  }

  async function remove(customer: CustomerType) {
    const success = await store.deleteCustomer(customer.id)

    if (success) {
      await reload()
    }
  }

  function profileFor(customerId: number | null | undefined) {
    return discountsStore.profileFor(customerId)
  }

  async function init() {
    await Promise.all([reload(), discountsStore.ensureProfilesLoaded()])
  }

  return {
    customers: pagedCustomers,
    totalCount: pagedTotalCount,
    loading: pagedLoading,
    page,
    pageSize: PAGE_SIZE,
    filtered,
    reload,
    searchInput,
    search,
    applySearch,
    clearSearch,
    showAll,
    profileFor,
    showForm,
    editingId,
    form,
    rules,
    headers,
    openCreate,
    openEdit,
    cancelForm,
    submit,
    remove,
    init,
  }
}
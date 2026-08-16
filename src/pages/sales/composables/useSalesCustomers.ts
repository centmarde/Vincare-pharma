import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useToast } from 'vue-toastification'
import { useCustomersDataStore } from '@/stores/customersData'
import { useDiscountsDataStore } from '@/stores/discountsData'
import type { CustomerType, CreateCustomerData } from '@/stores/customersData'

export const headers = [
  {title: 'Customer',key: 'name',sortable: true,align: 'start' as const,},
  {title: 'Category',key: 'category',sortable: true,align: 'center' as const,},
  {title: 'Area',key: 'area',sortable: true,align: 'center' as const,},
  {title: 'Address',key: 'address',sortable: true,align: 'center' as const,},
  {title: 'Contact No.',key: 'contact_no',sortable: false,align: 'center' as const,},
  {title: 'Payment Terms',key: 'term_days',sortable: false,align: 'center' as const,},
  {title: 'Agreed Rates',key: 'rates',sortable: false,align: 'center' as const, width: 240,},
  {title: 'Channel',key: 'department',sortable: true,align: 'center' as const,},
  {title: '',key: 'actions',sortable: false,align: 'end' as const,},
] as const

const PAGE_SIZE = 10

const emptyForm = (): CreateCustomerData => ({
  name: '',
  contact_person: '',
  contact_no: '',
  email: '',
  address: '',
  area: '',
  category: '',
  term_days: null,
  is_active: true,
})

export function useSalesCustomers() {
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

  async function reload() {
    await store.fetchCustomersRPC({
      department: showAll.value ? null : 'pos',
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

  const rules = {
    required: (value: unknown) =>
      (!!value && String(value).trim() !== '') || 'Required',
  }

  function openCreate() {
    editingId.value = null
    form.value = emptyForm()
    showForm.value = true
  }

  function openEdit(customer: CustomerType) {
    editingId.value = customer.id

    form.value = {
      name: customer.name,
      contact_person: customer.contact_person,
      contact_no: customer.contact_no,
      email: customer.email,
      address: customer.address,
      area: customer.area,
      category: customer.category,
      term_days: customer.term_days,
      is_active: customer.is_active,
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
          department: 'pos',
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

    init,
  }
}
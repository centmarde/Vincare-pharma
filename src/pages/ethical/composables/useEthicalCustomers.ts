import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useToast } from 'vue-toastification'
import { useCustomersDataStore } from '@/stores/customersData'
import { useAgentsDataStore } from '@/stores/agentsData'
import { useDiscountsDataStore } from '@/stores/discountsData'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import type { CreateCustomerData } from '@/stores/customersData'

const toast = useToast()
const { confirmDialog } = useConfirmDialog()

// Server-side pagination size — the same 25 rows per page the list already
// showed when the per-page dropdown was used.
const PAGE_SIZE = 10

export function useEthicalCustomers() {
  const customersStore = useCustomersDataStore()
  const agentsStore = useAgentsDataStore()
  const discountsStore = useDiscountsDataStore()
  const { pagedCustomers, pagedTotalCount, pagedLoading } = storeToRefs(customersStore)
  const { agents } = storeToRefs(agentsStore)

  const searchText = ref('')
  const page = ref(1)
  const showCreateDialog = ref(false)
  const showEditDialog = ref(false)
  const editingId = ref<number | null>(null)

  // Deliberately narrow. TIN, VAT, business structure and SEC/DTI are
  // compliance fields that are blank for almost every row and already live on
  // the edit form — carrying them here only pushed Status off the screen.
  const headers = [
    { title: 'Customer', key: 'name' },
    { title: 'Type', key: 'agency_type', width: 90 },
    { title: 'Contact No.', key: 'contact_no', width: 160 },
    { title: 'Area', key: 'area', width: 120 },
    { title: 'Sales Rep', key: 'agent_name', width: 160 },
    { title: 'Payment Terms', key: 'term_days', sortable: false, width: 140 },
    { title: 'Agreed Rates', key: 'rates', sortable: false, width: 250 },
    { title: 'Active', key: 'is_active', width: 90 },
    { title: '', key: 'actions', sortable: false, align: 'end' as const, width: 90 },
  ]

  const agencyTypeOptions = [
    { title: 'Government', value: 'government' },
    { title: 'LGU', value: 'lgu' },
    { title: 'Private', value: 'private' },
  ]

  // Legal structure drives which registration number is required — the
  // accountant's "avoid ghost transactions" control: every AR balance should
  // tie to a verifiably real, registered entity.
  const businessStructureOptions = [
    { title: 'Corporation', value: 'corporation' },
    { title: 'Partnership', value: 'partnership' },
    { title: 'Sole Proprietorship', value: 'sole_proprietorship' },
    { title: 'Other (govt. agency, cooperative, etc.)', value: 'other' },
  ]

  const structureLabel = (value: string | null): string =>
    businessStructureOptions.find((s) => s.value === value)?.title ?? '—'

  const agentName = (agentId: number | null): string =>
    agents.value.find(a => a.id === agentId)?.name ?? ''

  // The RPC returns exactly the page the server resolved — department scope,
  // search and pagination all happen in SQL. The only enrichment needed here
  // is the agent name for the Sales Rep column.
  const customers = computed(() =>
    pagedCustomers.value.map(c => ({ ...c, agent_name: agentName(c.agent_id) })))

  const editingCustomer = computed(() => {
    if (editingId.value === null) return null
    return customers.value.find(c => c.id === editingId.value)
  })

  const agentOptions = computed(() =>
    agents.value.map(a => ({ title: a.name, value: a.id })))


  const showAll = ref(false)

  async function reload() {
    await customersStore.fetchCustomersRPC({
      department: showAll.value ? null : 'ethical',
      includeUnassigned: !showAll.value,
      search: searchText.value.trim() || null,
      page: page.value,
      pageSize: PAGE_SIZE,
    })
  }

  function resetAndReload() {
    if (page.value === 1) {
      void reload()
    } else {
      page.value = 1
    }
  }

  watch(showAll, resetAndReload)

  let searchDebounce: ReturnType<typeof setTimeout> | undefined
  watch(searchText, () => {
    if (searchDebounce) clearTimeout(searchDebounce)
    searchDebounce = setTimeout(() => { void resetAndReload() }, 300)
  })

  
  watch(page, (newPage, oldPage) => {
    if (newPage === oldPage) return
    void reload()
  })

  function profileFor(customerId: number | null | undefined) {
    return discountsStore.profileFor(customerId)
  }

  async function init() {
    await Promise.all([reload(), discountsStore.ensureProfilesLoaded()])
    if (!agents.value.length) await agentsStore.fetchAgents({ activeOnly: true })
  }

  async function createCustomer(data: CreateCustomerData) {
    const result = await customersStore.createCustomer({
      ...data,
      department: 'ethical',
    })
    if (result) {
      showCreateDialog.value = false
      toast.success('Customer created.')
      await reload()
    }
  }

  async function updateCustomer(data: CreateCustomerData) {
    if (editingId.value === null) return
    const result = await customersStore.updateCustomer(editingId.value, {
      ...data,
      department: 'ethical',
    })
    if (result) {
      showEditDialog.value = false
      editingId.value = null
      toast.success('Customer updated.')
      await reload()
    }
  }

  async function deleteCustomer(id: number) {
    if (!(await confirmDialog('Delete this customer?', { title: 'Confirm Delete', confirmText: 'Delete' }))) return
    const result = await customersStore.deleteCustomer(id)
    if (result) {
      toast.success('Customer deleted.')
      if (page.value > 1 && pagedCustomers.value.length === 1) {
        page.value -= 1
      } else {
        await reload()
      }
    }
  }

  function openCreateDialog() {
    showCreateDialog.value = true
  }

  function cancelCreate() {
    showCreateDialog.value = false
  }

  function openEdit(id: number) {
    editingId.value = id
    showEditDialog.value = true
  }

  function cancelEdit() {
    showEditDialog.value = false
    editingId.value = null
  }

  return {
    customers,
    loading: pagedLoading,
    totalCount: pagedTotalCount,
    page,
    pageSize: PAGE_SIZE,
    searchText,
    showAll,
    reload,
    profileFor,
    showCreateDialog,
    showEditDialog,
    editingCustomer,
    headers,
    agencyTypeOptions,
    businessStructureOptions,
    structureLabel,
    agentOptions,
    createCustomer,
    updateCustomer,
    deleteCustomer,
    openCreateDialog,
    cancelCreate,
    openEdit,
    cancelEdit,
    init,
  }
}
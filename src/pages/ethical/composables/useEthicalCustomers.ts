import { ref, computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useToast } from 'vue-toastification'
import { useCustomersDataStore } from '@/stores/customersData'
import { useAgentsDataStore } from '@/stores/agentsData'
import { useDiscountsDataStore } from '@/stores/discountsData'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import type { CreateCustomerData } from '@/stores/customersData'

const toast = useToast()
const { confirmDialog } = useConfirmDialog()

export function useEthicalCustomers() {
  const customersStore = useCustomersDataStore()
  const agentsStore = useAgentsDataStore()
  const discountsStore = useDiscountsDataStore()
  const { customers, loading } = storeToRefs(customersStore)
  const { agents } = storeToRefs(agentsStore)

  const searchText = ref('')
  const showCreateDialog = ref(false)
  const showEditDialog = ref(false)
  const editingId = ref<number | null>(null)

  // Deliberately narrow. TIN, VAT, business structure and SEC/DTI are
  // compliance fields that are blank for almost every row and already live on
  // the edit form — carrying them here only pushed Status off the screen.
  const headers = [
    { title: 'Customer', key: 'name' },
    { title: 'Type', key: 'agency_type', width: 110 },
    { title: 'Contact No.', key: 'contact_no', width: 150 },
    { title: 'Area', key: 'area', width: 120 },
    { title: 'Sales Rep', key: 'agent_name', width: 150 },
    { title: 'Payment Terms', key: 'term_days', sortable: false, width: 140 },
    { title: 'Agreed Rates', key: 'rates', sortable: false, width: 210 },
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

  const filteredCustomers = computed(() => {
    // NO department filter here — `reload()` already scopes the query to
    // ethical + unassigned (or every channel when showAll is on). Filtering
    // again for department === 'ethical' emptied the page completely, since
    // every customer in the real file is still unassigned.
    let result = customers.value
    if (searchText.value) {
      const s = searchText.value.toLowerCase()
      result = result.filter(c =>
        (c.name?.toLowerCase().includes(s)) ||
        (c.contact_person?.toLowerCase().includes(s))
      )
    }
    return result.map(c => ({ ...c, agent_name: agentName(c.agent_id) }))
  })

  const editingCustomer = computed(() => {
    if (editingId.value === null) return null
    return filteredCustomers.value.find(c => c.id === editingId.value)
  })

  const agentOptions = computed(() =>
    agents.value.map(a => ({ title: a.name, value: a.id })))

  // Unassigned customers show alongside Ethical ones: most of the real customer
  // file has no department yet, and one is stamped only when it first
  // transacts. `showAll` widens this to every department for when staff need a
  // customer already stamped to another channel.
  const showAll = ref(false)

  async function reload() {
    await customersStore.fetchCustomers({
      ...(showAll.value ? {} : { department: 'ethical', includeUnassigned: true }),
      search: searchText.value || undefined,
    })
  }

  watch(showAll, () => { void reload() })

  // Search SERVER-SIDE. PostgREST caps a response at 1000 rows and there are
  // ~5.3k customers, so filtering the loaded array client-side silently hides
  // anyone outside the first page.
  let searchDebounce: ReturnType<typeof setTimeout> | undefined
  watch(searchText, () => {
    if (searchDebounce) clearTimeout(searchDebounce)
    searchDebounce = setTimeout(() => { void reload() }, 300)
  })

  // Agreed rates for every customer, so the list can show them per row.
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
    }
  }

  async function deleteCustomer(id: number) {
    if (!(await confirmDialog('Delete this customer?', { title: 'Confirm Delete', confirmText: 'Delete' }))) return
    const result = await customersStore.deleteCustomer(id)
    if (result) toast.success('Customer deleted.')
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
    customers: filteredCustomers,
    loading,
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

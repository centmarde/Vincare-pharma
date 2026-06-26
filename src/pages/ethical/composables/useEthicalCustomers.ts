import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useToast } from 'vue-toastification'
import { useCustomersDataStore } from '@/stores/customersData'
import { useAgentsDataStore } from '@/stores/agentsData'
import type { CreateCustomerData } from '@/stores/customersData'

const toast = useToast()

export function useEthicalCustomers() {
  const customersStore = useCustomersDataStore()
  const agentsStore = useAgentsDataStore()
  const { customers, loading } = storeToRefs(customersStore)
  const { agents } = storeToRefs(agentsStore)

  const searchText = ref('')
  const showCreateDialog = ref(false)
  const showEditDialog = ref(false)
  const editingId = ref<number | null>(null)

  const headers = [
    { title: 'Name', key: 'name' },
    { title: 'Type', key: 'agency_type' },
    { title: 'Contact', key: 'contact_person' },
    { title: 'Phone', key: 'contact_no' },
    { title: 'Agent', key: 'agent_name' },
    { title: 'Status', key: 'is_active' },
    { title: '', key: 'actions', sortable: false, align: 'end' as const },
  ]

  const agencyTypeOptions = [
    { title: 'Government', value: 'government' },
    { title: 'LGU', value: 'lgu' },
    { title: 'Private', value: 'private' },
  ]

  const agentName = (agentId: number | null): string =>
    agents.value.find(a => a.id === agentId)?.name ?? '—'

  const filteredCustomers = computed(() => {
    let result = customers.value.filter(c => c.department === 'ethical')
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

  async function init() {
    await customersStore.fetchCustomers({ department: 'ethical' })
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
    if (!confirm('Delete this customer?')) return
    const result = await customersStore.deleteCustomer(id)
    if (result) toast.success('Customer deleted.')
  }

  return {
    customers: filteredCustomers,
    loading,
    searchText,
    showCreateDialog,
    showEditDialog,
    editingCustomer,
    headers,
    agencyTypeOptions,
    agentOptions,
    createCustomer,
    updateCustomer,
    deleteCustomer,
    openEdit: (id: number) => {
      editingId.value = id
      showEditDialog.value = true
    },
    init,
  }
}

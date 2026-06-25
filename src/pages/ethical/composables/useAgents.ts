import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useToast } from 'vue-toastification'
import { useAgentsDataStore } from '@/stores/agentsData'
import type { CreateAgentData } from '@/stores/agentsData'

const toast = useToast()

export function useAgents() {
  const store = useAgentsDataStore()
  const { agents, loading } = storeToRefs(store)

  const searchText = ref('')
  const showCreateDialog = ref(false)
  const showEditDialog = ref(false)
  const editingId = ref<number | null>(null)

  const headers = [
    { title: 'Name', key: 'name' },
    { title: 'Area', key: 'area' },
    { title: 'Email', key: 'email' },
    { title: 'Phone', key: 'contact_no' },
    { title: 'Commission %', key: 'commission_rate', align: 'end' as const },
    { title: 'Status', key: 'is_active' },
  ]

  const filteredAgents = computed(() => {
    let result = agents.value
    if (searchText.value) {
      const s = searchText.value.toLowerCase()
      result = result.filter(a =>
        (a.name?.toLowerCase().includes(s)) ||
        (a.email?.toLowerCase().includes(s)) ||
        (a.area?.toLowerCase().includes(s))
      )
    }
    return result
  })

  const editingAgent = computed(() => {
    if (editingId.value === null) return null
    return filteredAgents.value.find(a => a.id === editingId.value)
  })

  async function init() {
    if (!agents.value.length) await store.fetchAgents()
  }

  async function createAgent(data: CreateAgentData) {
    const result = await store.createAgent(data)
    if (result) showCreateDialog.value = false
  }

  async function updateAgent(data: CreateAgentData) {
    if (editingId.value === null) return
    const result = await store.updateAgent(editingId.value, data)
    if (result) {
      showEditDialog.value = false
      editingId.value = null
    }
  }

  async function deleteAgent(id: number) {
    if (!confirm('Delete this agent?')) return
    await store.deleteAgent(id)
  }

  return {
    agents: filteredAgents,
    loading,
    searchText,
    showCreateDialog,
    showEditDialog,
    editingAgent,
    headers,
    createAgent,
    updateAgent,
    deleteAgent,
    openEdit: (id: number) => {
      editingId.value = id
      showEditDialog.value = true
    },
    init,
  }
}

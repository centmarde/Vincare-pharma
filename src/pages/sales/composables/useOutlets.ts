import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useOutletsDataStore } from '@/stores/outletsData'
import type { CreateOutletData } from '@/stores/outletsData'

export function useOutlets() {
  const store = useOutletsDataStore()
  const { outlets, loading } = storeToRefs(store)

  const searchText = ref('')
  const showCreateDialog = ref(false)
  const showEditDialog = ref(false)
  const editingId = ref<number | null>(null)

  const headers = [
    { title: 'Code', key: 'code' },
    { title: 'Name', key: 'name' },
    { title: 'Channel', key: 'channel' },
    { title: 'Region', key: 'region' },
    { title: 'Status', key: 'is_active' },
    { title: '', key: 'actions', sortable: false, align: 'end' as const },
  ]

  const filteredOutlets = computed(() => {
    let result = outlets.value
    if (searchText.value) {
      const s = searchText.value.toLowerCase()
      result = result.filter(o =>
        o.name.toLowerCase().includes(s) ||
        o.code.toLowerCase().includes(s) ||
        (o.region?.toLowerCase().includes(s) ?? false)
      )
    }
    return result
  })

  const editingOutlet = computed(() => {
    if (editingId.value === null) return null
    return filteredOutlets.value.find(o => o.id === editingId.value)
  })

  async function init() {
    if (!outlets.value.length) await store.fetchOutlets()
  }

  async function createOutlet(data: CreateOutletData) {
    const result = await store.createOutlet(data)
    if (result) showCreateDialog.value = false
  }

  async function updateOutlet(data: CreateOutletData) {
    if (editingId.value === null) return
    const result = await store.updateOutlet(editingId.value, data)
    if (result) {
      showEditDialog.value = false
      editingId.value = null
    }
  }

  async function deleteOutlet(id: number) {
    if (!confirm('Delete this branch? If it already has stock or transactions, deactivate it instead.')) return
    await store.deleteOutlet(id)
  }

  return {
    outlets: filteredOutlets,
    loading,
    searchText,
    showCreateDialog,
    showEditDialog,
    editingOutlet,
    headers,
    createOutlet,
    updateOutlet,
    deleteOutlet,
    openEdit: (id: number) => {
      editingId.value = id
      showEditDialog.value = true
    },
    init,
  }
}

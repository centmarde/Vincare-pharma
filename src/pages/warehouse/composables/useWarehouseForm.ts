import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useWarehousesDataStore } from '@/stores/warehouseData'
import type { WarehouseType, CreateWarehouseData, UpdateWarehouseData } from '@/stores/warehouseData'

export function useWarehouseForm() {
  const store = useWarehousesDataStore()
  const { loading, error, warehouses } = storeToRefs(store)
  const { createWarehouse, updateWarehouse, deleteWarehouse, clearError, fetchWarehouses } = store

  const editingWarehouse = ref<WarehouseType | null>(null)
  const warehouseToDelete = ref<WarehouseType | null>(null)

  const form = ref<CreateWarehouseData>({
    name: '',
    location: '',
  })

  const rules = {
    required: (v: string) => !!v?.trim() || 'This field is required.',
  }

  function resetForm() {
    form.value = {
      name: '',
      location: '',
    }
  }

  function openCreate() {
    editingWarehouse.value = null
    resetForm()
    clearError()
  }

  function openEdit(warehouse: WarehouseType) {
    editingWarehouse.value = warehouse
    form.value = {
      name: warehouse.name ?? '',
      location: warehouse.location ?? '',
    }
    clearError()
  }

  function openDelete(warehouse: WarehouseType) {
    warehouseToDelete.value = warehouse
  }

  async function handleSubmit(): Promise<boolean> {
    if (editingWarehouse.value) {
      await updateWarehouse(editingWarehouse.value.id, form.value as UpdateWarehouseData)
    } else {
      await createWarehouse(form.value)
    }
    return !error.value
  }

  async function handleDelete(): Promise<boolean> {
    if (!warehouseToDelete.value) return false
    await deleteWarehouse(warehouseToDelete.value.id)
    return !error.value
  }

  return {
    loading,
    error,
    form,
    editingWarehouse,
    warehouseToDelete,
    rules,
    openCreate,
    openEdit,
    openDelete,
    resetForm,
    handleSubmit,
    handleDelete,
    fetchWarehouses,
    warehouses,
  }
}
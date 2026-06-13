import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useSuppliersDataStore } from '@/stores/suppliersDataStore'
import type { SupplierType } from '@/stores/suppliersDataStore'

export function useSuppliers() {
  const store = useSuppliersDataStore()
  const { suppliers, loading, error } = storeToRefs(store)
  const { fetchSuppliers, createSupplier, updateSupplier, deleteSupplier, clearError } = store

  // ─── Form State ─────────────────────────────────────────────────
  const editingSupplier = ref<SupplierType | null>(null)
  const supplierToDelete = ref<SupplierType | null>(null)

  const form = ref({
    name: '',
    contact_person: null as string | null,
    phone: null as string | null,
    email: null as string | null,
    city: null as string | null,
    address: null as string | null,
    is_active: true,
  })

  // ─── Table Headers ──────────────────────────────────────────────
  const headers = [
    { title: 'NAME',           key: 'name',           sortable: true,  align: 'center' as const },
    { title: 'CONTACT PERSON', key: 'contact_person', sortable: true,  align: 'center' as const },
    { title: 'PHONE',          key: 'phone',          sortable: false, align: 'center' as const },
    { title: 'EMAIL',          key: 'email',          sortable: false, align: 'center' as const },
    { title: 'CITY',           key: 'city',           sortable: true,  align: 'center' as const },
    { title: 'STATUS',         key: 'is_active',      sortable: true,  align: 'center' as const },
    { title: 'DATE ADDED',     key: 'created_at',     sortable: true,  align: 'center' as const },
    { title: 'ACTIONS',        key: 'actions',        sortable: false, align: 'center' as const },
  ]

  // ─── Validation Rules ───────────────────────────────────────────
  const rules = {
    required: (v: string) => !!v?.trim() || 'This field is required.',
    email: (v: string) => !v || /.+@.+\..+/.test(v) || 'Enter a valid email address.',
  }

  // ─── Helpers ────────────────────────────────────────────────────
  function resetForm() {
    form.value = {
      name: '',
      contact_person: null,
      phone: null,
      email: null,
      city: null,
      address: null,
      is_active: true,
    }
  }

  function openCreate() {
    editingSupplier.value = null
    resetForm()
    clearError()
  }

  function openEdit(supplier: SupplierType) {
    editingSupplier.value = supplier
    form.value = {
      name: supplier.name,
      contact_person: supplier.contact_person,
      phone: supplier.contact_no,
      email: supplier.email,
      city: supplier.city,
      address: supplier.address,
      is_active: supplier.is_active,
    }
    clearError()
  }

  function openDelete(supplier: SupplierType) {
    supplierToDelete.value = supplier
  }

  // ─── Actions ────────────────────────────────────────────────────
  async function handleSubmit(formRef: any): Promise<boolean> {
    const { valid } = await formRef.validate()
    if (!valid) return false

    if (editingSupplier.value) {
      await updateSupplier(editingSupplier.value.id, form.value)
    } else {
      await createSupplier(form.value)
    }

    return !error.value
  }

  async function handleDelete(): Promise<boolean> {
    if (!supplierToDelete.value) return false
    await deleteSupplier(supplierToDelete.value.id)
    return !error.value
  }

  return {
    // Store
    suppliers, loading, error,
    fetchSuppliers,
    // State
    form, editingSupplier, supplierToDelete,
    // Constants
    headers, rules,
    // Helpers
    openCreate, openEdit, openDelete, resetForm,
    // Actions
    handleSubmit, handleDelete,
  }
}
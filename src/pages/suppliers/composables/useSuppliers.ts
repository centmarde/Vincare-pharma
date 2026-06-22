import { ref } from 'vue'
import { emailValidator } from '@/lib/validator'
import { storeToRefs } from 'pinia'
import { useSuppliersDataStore } from '@/stores/suppliersData'
import type { SupplierType } from '@/stores/suppliersData'

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
    contact_no: null as string | null,
    email: null as string | null,
    address: null as string | null,
    balance: null as number | null,
    is_active: true,
  })

  // ─── Table Headers ──────────────────────────────────────────────
  const headers = [
    { title: 'NAME',           key: 'name',           sortable: true,  align: 'center' as const },
    { title: 'CONTACT PERSON', key: 'contact_person', sortable: true,  align: 'center' as const },
    { title: 'PHONE',          key: 'contact_no',     sortable: true,  align: 'center' as const },
    { title: 'EMAIL',          key: 'email',          sortable: true,  align: 'center' as const },
    { title: 'ADDRESS',        key: 'address',        sortable: true,  align: 'center' as const },
    { title: 'BALANCE',        key: 'balance',        sortable: true,  align: 'center' as const },
    { title: 'STATUS',         key: 'is_active',      sortable: true,  align: 'center' as const },
    { title: 'DATE ADDED',     key: 'created_at',     sortable: true,  align: 'center' as const },
    { title: 'ACTIONS',        key: 'actions',        sortable: false, align: 'center' as const },
  ]

  // ─── Validation Rules ───────────────────────────────────────────
  const rules = {
    required: (v: string) => !!v?.trim() || 'This field is required.',
    email: (v: string) => emailValidator(v) as string | boolean,
  }

  // ─── Helpers ────────────────────────────────────────────────────
  function resetForm() {
    form.value = {
      name: '',
      contact_person: null,
      contact_no: null,
      email: null,
      address: null,
      balance: null,
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
      name: supplier.name ?? '',
      contact_person: supplier.contact_person,
      contact_no: supplier.contact_no,
      email: supplier.email,
      address: supplier.address,
      balance: supplier.balance,
      is_active: supplier.is_active ?? true,
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
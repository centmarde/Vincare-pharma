import { ref, computed, watch } from 'vue'
import { useSuppliersDataStore } from '@/stores/suppliersData'
import { supabase } from '@/lib/supabase'
import { useToast } from 'vue-toastification'

import type { PR } from './usePurchaseRequisitionList'

export function useIssuePOModal(
  props: { modelValue: boolean; pr: PR | null },
  emit: (e: 'update:modelValue', value: boolean) => void,
) {
  const toast = useToast()
  const supplierStore = useSuppliersDataStore()

  // ─── Constants ──────────────────────────────────────────────────
  const company = ref({
    name:    'VINCARE PHARMA',
    address: '2F N.B. BLDG., Ochua Avenue',
    city:    'Butuan City, 8600',
    contact: '0968-879-5589',
  })

  const shipViaOptions    = ['Ground', 'Air', 'Sea', 'Courier']
  const shipMethodOptions = ['Pick-up', 'Delivery', 'Door-to-door']
  const today = new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })

  // ─── Form ───────────────────────────────────────────────────────
  const form = ref({ ship_via: '', ship_method: '' })
  watch(() => props.modelValue, (val) => { if (val) form.value = { ship_via: '', ship_method: '' } })

  // ─── Confirmation Dialog State ───────────────────────────────────
  const showConfirm = ref(false)
  const loading = ref(false)

  // ─── Computed ───────────────────────────────────────────────────
  const declaredValue    = computed(() => props.pr?.items.reduce((sum, i) => sum + i.qty * i.cost_per_unit, 0) ?? 0)
  const emptyRows        = computed(() => Math.max(0, 7 - (props.pr?.items.length ?? 0)))

  // Supplier lookup — uses id which may be string or number
  const resolvedSupplier = computed(() => {
    const sid = props.pr?.supplier_id
    if (sid == null) return null
    return supplierStore.suppliers.find(s => Number(s.id) === Number(sid)) ?? null
  })

  // ─── Helpers ────────────────────────────────────────────────────
  function updateCompany(field: 'name' | 'address' | 'city' | 'contact', event: Event) {
    const target = event.target as HTMLElement
    company.value[field] = target.innerText
  }

  // ─── Actions ────────────────────────────────────────────────────
  function promptIssuePO() {
    showConfirm.value = true
  }

  function closeConfirm() {
    showConfirm.value = false
  }

  async function handleConfirmIssue() {
    if (!props.pr) return
    loading.value = true

    try {
      const { data: { user } } = await supabase.auth.getUser()

      const { error: createError } = await supabase
        .from('purchase_orders')
        .insert([{
          requisition_id: props.pr.id,
          supplier_id:    props.pr.supplier_id,
          ship_via:       form.value.ship_via,
          ship_method:    form.value.ship_method,
          declared_value: declaredValue.value,
          issued_by:      user?.id ?? null,
          po_number:      `PO-${Date.now()}`,
          status:         'issued',
          is_delivered:   false,
        }])

      if (createError) throw createError

      toast.success('Purchase order issued successfully!')
      showConfirm.value = false
      emit('update:modelValue', false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to issue purchase order')
    } finally {
      loading.value = false
    }
  }

  return {
    company,
    shipViaOptions,
    shipMethodOptions,
    today,
    form,
    showConfirm,
    loading,
    declaredValue,
    emptyRows,
    resolvedSupplier,
    updateCompany,
    promptIssuePO,
    closeConfirm,
    handleConfirmIssue,
  }
}
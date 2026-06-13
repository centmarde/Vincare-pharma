import { ref, computed, watch } from 'vue'
import { usePurchaseOrderStore } from '@/stores/purchaseOrderData'
import { useSuppliersDataStore } from '@/stores/suppliersDataStore'
import { supabase } from '@/lib/supabase'
import type { PR } from '@/stores/purchaseRequisition'

export function useIssuePOModal(
  props: { modelValue: boolean; pr: PR | null },
  emit: (e: 'update:modelValue', value: boolean) => void,
) {
  const poStore       = usePurchaseOrderStore()
  const supplierStore = useSuppliersDataStore()

  // ─── Constants ──────────────────────────────────────────────────
  const company = ref({
    name:    'EXELMED PHARMA TRADE',
    address: '2F N.B. BLDG., OCHOA AVENUE',
    city:    'BUTUAN CITY, 8600',
    contact: '09123456789',
  })

  const shipViaOptions    = ['Ground', 'Air', 'Sea', 'Courier']
  const shipMethodOptions = ['Pick-up', 'Delivery', 'Door-to-door']
  const today = new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })

  // ─── Form ───────────────────────────────────────────────────────
  const form = ref({ ship_via: '', ship_method: '' })
  watch(() => props.modelValue, (val) => { if (val) form.value = { ship_via: '', ship_method: '' } })

  // ─── Confirmation Dialog State ───────────────────────────────────
  const showConfirm = ref(false)

  // ─── Computed ───────────────────────────────────────────────────
  const declaredValue    = computed(() => props.pr?.items.reduce((sum, i) => sum + i.qty * i.cost_per_unit, 0) ?? 0)
  const emptyRows        = computed(() => Math.max(0, 7 - (props.pr?.items.length ?? 0)))
  const resolvedSupplier = computed(() => supplierStore.suppliers.find(s => s.id == (props.pr as any)?.supplier_id) ?? null)

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
    const { data: { user } } = await supabase.auth.getUser()

    await poStore.createPurchaseOrder({
      requisition_id: String(props.pr.id),
      supplier_id:    (props.pr as any).supplier_id ?? null,
      ship_via:       form.value.ship_via,
      ship_method:    form.value.ship_method,
      declared_value: declaredValue.value,
      issued_by:      user?.id ?? null,
      po_number:      '',
      status:         'issued',
      is_delivered:   false,
    })

    if (typeof poStore.fetchPurchaseOrders === 'function') {
      await poStore.fetchPurchaseOrders()
    }

    showConfirm.value = false
    emit('update:modelValue', false)
  }

  return {
    company,
    shipViaOptions,
    shipMethodOptions,
    today,
    form,
    showConfirm,
    declaredValue,
    emptyRows,
    resolvedSupplier,
    updateCompany,
    promptIssuePO,
    closeConfirm,
    handleConfirmIssue,
  }
}
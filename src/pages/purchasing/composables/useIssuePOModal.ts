import { ref, computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useSuppliersDataStore, type SupplierType } from '@/stores/suppliersData'
import { useTransactionsDataStore } from '@/stores/transactionsData'
import { supabase } from '@/lib/supabase'
import type { PR } from '@/stores/transactionsData'

export function useIssuePOModal(
  props: { modelValue: boolean; pr: PR | null },
  emit: (e: 'update:modelValue', value: boolean) => void,
) {
  const supplierStore      = useSuppliersDataStore()
  const transactionsStore  = useTransactionsDataStore()
  const { suppliers }      = storeToRefs(supplierStore)
  const { loading }        = storeToRefs(transactionsStore)

  // ─── Company Header ───────────────────────────────────────────────
  const company = ref({
    name:    'VINCARE PHARMA',
    address: '2F N.B. BLDG., Ochua Avenue, Butuan City',
    city:    'Butuan City, 8600',
    contact: '0968-879-5589',
  })

  const shipViaOptions    = ['Ground', 'Air', 'Sea', 'Courier']
  const shipMethodOptions = ['Pick-up', 'Delivery', 'Door-to-door']

  const today = new Date().toLocaleDateString('en-PH', {
    month: 'short', day: '2-digit', year: 'numeric',
    timeZone: 'Asia/Manila',
  })

  // ─── Form ─────────────────────────────────────────────────────────
  const form        = ref({ ship_via: '', ship_method: '' })
  const showConfirm = ref(false)

  watch(() => props.modelValue, val => {
    if (val) form.value = { ship_via: '', ship_method: '' }
  })

  // ─── Computed ─────────────────────────────────────────────────────
  const declaredValue = computed(() =>
    props.pr?.items.reduce((sum, i) => sum + i.qty * (i.cost_per_unit ?? 0), 0) ?? 0
  )

  const emptyRows = computed(() =>
    Math.max(0, 7 - (props.pr?.items.length ?? 0))
  )

  const uniqueSuppliers = computed(() => {
  if (!props.pr?.items?.length) return []
  const names = [...new Set(props.pr.items.map(i => i.supplier_name).filter(Boolean))]
  return names
    .map(name => suppliers.value.find(s => s.name === name))
    .filter(Boolean) as SupplierType[]
  })

  // ─── Helpers ──────────────────────────────────────────────────────
  function updateCompany(field: keyof typeof company.value, event: Event) {
    company.value[field] = (event.target as HTMLElement).innerText
  }

  function promptIssuePO()  { showConfirm.value = true  }
  function closeConfirm()   { showConfirm.value = false }

  // ─── Actions ──────────────────────────────────────────────────────
  async function handleConfirmIssue() {
    if (!props.pr) return

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const result = await transactionsStore.issuePurchaseOrder({
      pr:         props.pr,
      ship_via:   form.value.ship_via,
      ship_method: form.value.ship_method,
      userId:     user.id,
    })

    if (result.success) {
      showConfirm.value = false
      emit('update:modelValue', false)
    }
  }

  return {
    company, shipViaOptions, shipMethodOptions, today,
    form, showConfirm, loading,
    declaredValue, emptyRows, uniqueSuppliers,
    updateCompany, promptIssuePO, closeConfirm, handleConfirmIssue,
  }
}
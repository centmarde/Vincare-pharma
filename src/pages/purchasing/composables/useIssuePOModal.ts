import { ref, computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useSuppliersDataStore } from '@/stores/suppliersData'
import { supabase } from '@/lib/supabase'
import { useToast } from 'vue-toastification'
import type { PR } from '@/stores/purchaseRequisitionStore'

export function useIssuePOModal(
  props: { modelValue: boolean; pr: PR | null },
  emit: (e: 'update:modelValue', value: boolean) => void,
) {
  const toast         = useToast()
  const supplierStore = useSuppliersDataStore()
  const { suppliers } = storeToRefs(supplierStore)

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
  const loading     = ref(false)

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

  const resolvedSupplier = computed(() => {
    const sid = props.pr?.supplier_id
    if (sid == null) return null
    return suppliers.value.find(s => Number(s.id) === Number(sid)) ?? null
  })

  // ─── PO Number Generator ──────────────────────────────────────────
  async function generatePONumber(): Promise<string> {
    const year   = new Date().getFullYear()
    const prefix = `PO-${year}-`

    const { data } = await supabase
      .from('transactions')
      .select('reference_no')
      .ilike('reference_no', `${prefix}%`)
      .order('reference_no', { ascending: false })
      .limit(1)

    const latest  = data?.[0]?.reference_no
    const lastNum = latest ? parseInt(latest.split('-')[2], 10) : 0
    const next    = String(lastNum + 1).padStart(3, '0')

    return `${prefix}${next}`
  }

  // ─── Helpers ──────────────────────────────────────────────────────
  function updateCompany(field: keyof typeof company.value, event: Event) {
    company.value[field] = (event.target as HTMLElement).innerText
  }

  // ─── Actions ──────────────────────────────────────────────────────
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
      if (!user) throw new Error('User not authenticated.')

      const poNumber = await generatePONumber()

      const { error: createError } = await supabase
        .from('transactions')
        .insert({
          reference_no:     poNumber,
          transaction_type: 'purchase_order',
          status:           'issued',
          supplier_id:      props.pr.supplier_id,
          total_amount:     declaredValue.value,
          remarks:          props.pr.remarks ?? '',
          created_by:       user.id,
          ship_via:         form.value.ship_via,
          ship_method:      form.value.ship_method,
          requisition_id:   props.pr.id,
        })

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
    company, shipViaOptions, shipMethodOptions, today,
    form, showConfirm, loading,
    declaredValue, emptyRows, resolvedSupplier,
    updateCompany, promptIssuePO, closeConfirm, handleConfirmIssue,
  }
}
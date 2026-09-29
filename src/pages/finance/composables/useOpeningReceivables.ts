import { ref, computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useOpeningReceivablesStore } from '@/stores/openingReceivablesData'
import { useCustomersDataStore } from '@/stores/customersData'
import { useFinanceDataStore } from '@/stores/financeData'

// Form state for the opening-receivables migration screen. See the store for
// why these are recorded as documents and why the ledger entry is written
// there rather than left to the projector.

const todayISO = () => new Date().toISOString().slice(0, 10)

const addDays = (iso: string, days: number) =>
  new Date(new Date(iso).getTime() + days * 86400000).toISOString().slice(0, 10)

const daysBetween = (fromISO: string, toISO: string) =>
  Math.floor((new Date(toISO).getTime() - new Date(fromISO).getTime()) / 86400000)

/**
 * Common credit terms, offered as a picker so the numeric term is captured
 * rather than typed as prose.
 *
 * customers.term_days is free text on live data — '60 Days', 'Consignment ',
 * 'COD', '30 - 60 Days' — which is why aging cannot be computed from it. Here
 * the number and the label are captured separately: the number drives the due
 * date, the label preserves their own wording for the document.
 */
export const termPresets = [
  { days: 0, label: 'COD' },
  { days: 15, label: '15 Days' },
  { days: 30, label: '30 Days' },
  { days: 45, label: '45 Days' },
  { days: 60, label: '60 Days' },
  { days: 90, label: '90 Days' },
  { days: 120, label: '120 Days' },
] as const

export function useOpeningReceivables() {
  const store = useOpeningReceivablesStore()
  const customersStore = useCustomersDataStore()
  const financeStore = useFinanceDataStore()
  const { loading } = storeToRefs(store)
  const { customers } = storeToRefs(customersStore)

  const department = ref<'inhouse' | 'ethical'>('inhouse')
  const customerId = ref<number | null>(null)
  const originalNo = ref('')
  const invoiceDate = ref(todayISO())
  const termDays = ref<number | null>(30)
  const termLabel = ref('30 Days')
  const originalAmount = ref<number | null>(null)
  const alreadyPaid = ref<number | null>(null)
  const cutoverDate = ref(todayISO())
  const remarks = ref('')

  /** Customers of the chosen department — the same list their orders use. */
  const customerOptions = computed(() =>
    customers.value
      .filter((c) => c.department === department.value && c.is_active !== false)
      .map((c) => ({ value: c.id, title: c.name ?? `Customer ${c.id}` })),
  )

  const outstanding = computed(() =>
    Math.max(0, (Number(originalAmount.value) || 0) - (Number(alreadyPaid.value) || 0)),
  )

  const dueDate = computed(() =>
    termDays.value === null || !invoiceDate.value ? null : addDays(invoiceDate.value, termDays.value),
  )

  /** How far into the term the customer is, as of today. */
  const daysElapsed = computed(() =>
    invoiceDate.value ? Math.max(0, daysBetween(invoiceDate.value, todayISO())) : 0,
  )

  const daysRemaining = computed(() =>
    termDays.value === null ? null : termDays.value - daysElapsed.value,
  )

  const isOverdue = computed(() => daysRemaining.value !== null && daysRemaining.value < 0)

  /**
   * The live sentence under the date fields.
   *
   * Reading back what was entered, in the accountant's own terms, is what
   * catches a mistyped year before it becomes a ledger entry.
   */
  const termSummary = computed(() => {
    if (!invoiceDate.value) return ''
    if (termDays.value === null) return `Invoiced ${invoiceDate.value} · no agreed term · ${daysElapsed.value} days old`
    const position = `day ${daysElapsed.value} of ${termDays.value}`
    const tail = isOverdue.value
      ? `${Math.abs(daysRemaining.value ?? 0)} days OVERDUE`
      : `${daysRemaining.value} days remaining`
    return `Invoiced ${invoiceDate.value} · ${termDays.value}-day term · ${position} · due ${dueDate.value} — ${tail}`
  })

  /**
   * Back-compute the invoice date from how far along the customer is.
   *
   * For the common migration case where they know "they're about 45 days into
   * a 60-day term" but would have to dig for the actual invoice date.
   */
  function setDaysElapsed(days: number) {
    if (!Number.isFinite(days) || days < 0) return
    invoiceDate.value = addDays(todayISO(), -days)
  }

  /** Picking a preset sets the number and the label together. */
  function applyTermPreset(days: number) {
    const preset = termPresets.find((t) => t.days === days)
    termDays.value = days
    if (preset) termLabel.value = preset.label
  }

  /** No agreed term — consignment, COD-on-delivery, or simply unrecorded. */
  function clearTerm() {
    termDays.value = null
    termLabel.value = ''
  }

  const blockers = computed(() => {
    const missing: string[] = []
    if (customerId.value === null) missing.push('a customer')
    if (!invoiceDate.value) missing.push('the invoice date')
    if (!cutoverDate.value) missing.push('the cutover date')
    if (!((Number(originalAmount.value) || 0) > 0)) missing.push('the original amount')
    if ((Number(alreadyPaid.value) || 0) < 0) missing.push('a non-negative amount collected')
    if (outstanding.value <= 0.005 && (Number(originalAmount.value) || 0) > 0) {
      missing.push('an outstanding balance — this invoice is already fully paid')
    }
    return missing
  })

  const canSubmit = computed(() => blockers.value.length === 0 && !loading.value)

  function resetForm() {
    customerId.value = null
    originalNo.value = ''
    invoiceDate.value = todayISO()
    applyTermPreset(30)
    originalAmount.value = null
    alreadyPaid.value = null
    remarks.value = ''
  }

  async function submit() {
    if (!canSubmit.value || customerId.value === null) return { success: false }
    const result = await store.addOpeningReceivable({
      customerId: customerId.value,
      department: department.value,
      originalNo: originalNo.value.trim(),
      invoiceDate: invoiceDate.value,
      termDays: termDays.value,
      termLabel: termLabel.value.trim(),
      originalAmount: Number(originalAmount.value) || 0,
      alreadyPaid: Number(alreadyPaid.value) || 0,
      cutoverDate: cutoverDate.value,
      remarks: remarks.value,
    })
    if (result.success) {
      // Cutover date and department persist — a migration session enters many
      // in a row, all dated the same and usually for one department.
      resetForm()
      await financeStore.fetchARAging()
    }
    return result
  }

  async function load() {
    await Promise.all([customersStore.fetchCustomers(), financeStore.fetchARAging()])
  }

  onMounted(load)

  return {
    loading,
    department, customerId, originalNo, invoiceDate, termDays, termLabel,
    originalAmount, alreadyPaid, cutoverDate, remarks,
    customerOptions, outstanding, dueDate, daysElapsed, daysRemaining, isOverdue, termSummary,
    blockers, canSubmit,
    setDaysElapsed, applyTermPreset, clearTerm, resetForm, submit, load,
  }
}

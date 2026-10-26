import { ref, computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useOpeningReceivablesStore } from '@/stores/openingReceivablesData'
import type { OpeningReceivableRow } from '@/stores/openingReceivablesData'
import type { ChangeRequestConfig } from '@/composables/useChangeRequestFiling'
import { openingReceivableKey } from '@/stores/changeRequests/types'
import { useFinanceDataStore } from '@/stores/financeData'
import { useCustomerPicker } from '@/composables/useCustomerPicker'
import { formatCurrency, toLocalISODate } from '@/utils/helpers'

// Form state for the opening-receivables migration screen. See the store for
// why these are recorded as documents and why the ledger entry is written
// there rather than left to the projector.

// Local date, not toISOString(): that is the UTC date, a day behind before
// 08:00 in Manila — and the cutover date is what the journal entry is dated.
const todayISO = () => toLocalISODate(new Date())

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
  const financeStore = useFinanceDataStore()
  const { loading, recorded, recordedLoading } = storeToRefs(store)

  const department = ref<'inhouse' | 'ethical'>('inhouse')
  const customerId = ref<number | null>(null)
  const originalNo = ref('')
  const invoiceDate = ref(todayISO())
  const termDays = ref<number | null>(30)
  const termLabel = ref('30 Days')
  const originalAmount = ref(0)
  const alreadyPaid = ref(0)
  const cutoverDate = ref(todayISO())
  const remarks = ref('')

  /**
   * The same customer search the In-House and Ethical order dialogs use.
   *
   * This used to load the customer table and keep only rows whose department
   * matched — but 5,276 of 5,287 customers have no department (it is a label,
   * not a gate; see useCustomerPicker), so In-House offered 11 customers and
   * Ethical none. The load was also capped at the first 1,000 rows by name.
   * The picker searches all of them server-side as you type.
   */
  const { search: customerSearch, customerOptions, init: initCustomerPicker, reset: resetCustomerPicker } =
    useCustomerPicker(customerId)

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
    resetCustomerPicker()
    originalNo.value = ''
    invoiceDate.value = todayISO()
    applyTermPreset(30)
    originalAmount.value = 0
    alreadyPaid.value = 0
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
      await Promise.all([financeStore.fetchARAging(), store.fetchOpeningReceivables()])
    }
    return result
  }

  async function load() {
    await Promise.all([initCustomerPicker(), financeStore.fetchARAging(), store.fetchOpeningReceivables()])
  }

  async function reloadRecorded() {
    await store.fetchOpeningReceivables()
  }

  /**
   * Narrows the recorded list as you type: our number, customer, their
   * invoice number, terms or notes — or an amount, typed with or without
   * commas ("23683", "23,683.00").
   */
  // null after the field's clear button.
  const recordedSearch = ref<string | null>('')
  const recordedFiltered = computed(() => {
    const q = (recordedSearch.value ?? '').trim().toLowerCase()
    if (!q) return recorded.value
    const digits = q.replace(/[₱,\s]/g, '')
    const isAmount = /^\d+(\.\d+)?$/.test(digits)
    return recorded.value.filter((r) => {
      const text = [r.docNo, r.customerName, r.originalNo, r.termLabel, r.notes]
        .some((v) => (v ?? '').toLowerCase().includes(q))
      if (text) return true
      if (!isAmount) return false
      return [r.originalAmount, r.outstanding].some((a) => a.toFixed(2).includes(digits))
    })
  })

  /**
   * A change request on a recorded opening receivable — the way to correct or
   * back out one entered wrongly, approved by an executive. Field keys are what
   * the applier (changeRequests/openingReceivables.ts) reads; the values are
   * the row's, so the request can tell if the record moved since.
   */
  function changeConfigFor(row: OpeningReceivableRow): ChangeRequestConfig {
    return {
      id: row.id,
      ref: row.docNo,
      fields: [
        { key: 'original_amount', label: 'Original invoice amount', value: row.originalAmount, type: 'number' },
        { key: 'paid_before_cutover', label: 'Collected before cutover', value: row.paidBeforeCutover, type: 'number' },
        { key: 'invoice_date', label: 'Invoice date', value: row.invoiceDate, type: 'date' },
        { key: 'term_days', label: 'Credit term (days)', value: row.termDays, type: 'number' },
        { key: 'original_no', label: 'Their invoice number', value: row.originalNo, type: 'text' },
        { key: 'term_label', label: 'Term as they word it', value: row.termLabel, type: 'text' },
        { key: 'notes', label: 'Notes', value: row.notes, type: 'text' },
      ],
      voidSummary: `Void ${row.docNo ?? 'this opening receivable'} (${formatCurrency(row.outstanding)} outstanding) — reverses its DR Accounts Receivable / CR Opening Balance Equity entry and cancels it. Refused if payments were collected against it.`,
      allowEdit: true,
      allowVoid: true,
      meta: { [openingReceivableKey]: { from: true, to: true } },
    }
  }

  onMounted(load)

  return {
    loading,
    department, customerId, originalNo, invoiceDate, termDays, termLabel,
    originalAmount, alreadyPaid, cutoverDate, remarks,
    customerSearch, customerOptions, outstanding, dueDate, daysElapsed, daysRemaining, isOverdue, termSummary,
    blockers, canSubmit,
    setDaysElapsed, applyTermPreset, clearTerm, resetForm, submit, load,
    recorded, recordedLoading, reloadRecorded, changeConfigFor, recordedSearch, recordedFiltered,
  }
}

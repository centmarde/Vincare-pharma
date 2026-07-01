import { ref, computed, onMounted } from 'vue'
import { useToast } from 'vue-toastification'
import { useGLDataStore } from '@/stores/glData'
import type { ReferenceType, JournalLineInput } from '@/stores/glData'

const toast = useToast()

const REFERENCE_TYPE_OPTIONS: { value: ReferenceType; title: string }[] = [
  { value: 'sales_invoice', title: 'Sales Invoice' },
  { value: 'sales_return', title: 'Sales Return' },
  { value: 'payment', title: 'Payment' },
  { value: 'collection', title: 'Collection' },
  { value: 'purchase_invoice', title: 'Purchase Invoice' },
  { value: 'disbursement', title: 'Disbursement' },
  { value: 'manual', title: 'Manual' },
  { value: 'closing', title: 'Closing' },
]

export function useGeneralJournal() {
  const gl = useGLDataStore()

  const filterFrom = ref('')
  const filterTo = ref('')
  const filterReferenceType = ref<ReferenceType | null>(null)

  const entries = computed(() => gl.journal)
  const loading = computed(() => gl.loading)
  const accountOptions = computed(() =>
    gl.accounts.map((a) => ({ title: `${a.code} — ${a.name}`, value: a.code })))

  const showManualEntryDialog = ref(false)
  const manualEntryDate = ref(new Date().toISOString().slice(0, 10))
  const manualDescription = ref('')
  const manualLines = ref<JournalLineInput[]>([
    { account_code: '', debit: 0, credit: 0 },
    { account_code: '', debit: 0, credit: 0 },
  ])

  const manualTotalDebit = computed(() => manualLines.value.reduce((s, l) => s + (l.debit || 0), 0))
  const manualTotalCredit = computed(() => manualLines.value.reduce((s, l) => s + (l.credit || 0), 0))
  const manualIsBalanced = computed(() =>
    manualTotalDebit.value > 0 && Math.abs(manualTotalDebit.value - manualTotalCredit.value) < 0.01)

  function addManualLine() {
    manualLines.value.push({ account_code: '', debit: 0, credit: 0 })
  }
  function removeManualLine(idx: number) {
    if (manualLines.value.length > 2) manualLines.value.splice(idx, 1)
  }

  async function init() {
    await Promise.all([gl.fetchAccounts(), fetchJournal()])
  }

  async function fetchJournal() {
    await gl.fetchJournal({
      from: filterFrom.value || undefined,
      to: filterTo.value || undefined,
      referenceType: filterReferenceType.value ?? undefined,
    })
  }

  async function submitManualEntry() {
    if (!manualIsBalanced.value) { toast.warning('Debits must equal credits before posting.'); return }
    const lines = manualLines.value.filter((l) => l.account_code && (l.debit > 0 || l.credit > 0))
    if (lines.length < 2) { toast.warning('A journal entry needs at least 2 lines.'); return }

    const result = await gl.postManualEntry({
      entryDate: manualEntryDate.value,
      description: manualDescription.value || undefined,
      lines,
    })
    if (result.success) {
      showManualEntryDialog.value = false
      manualDescription.value = ''
      manualLines.value = [
        { account_code: '', debit: 0, credit: 0 },
        { account_code: '', debit: 0, credit: 0 },
      ]
      await fetchJournal()
    }
  }

  async function approveEntry(entryId: number) {
    const result = await gl.approveManualEntry(entryId)
    if (result.success) await fetchJournal()
  }

  async function reverseEntry(entryId: number) {
    if (!confirm('Reverse this entry? A mirror entry will be posted; the original cannot be edited.')) return
    const result = await gl.reverseEntry(entryId)
    if (result.success) await fetchJournal()
  }

  async function resyncLedger() {
    const count = await gl.projectEvents({
      from: filterFrom.value || undefined,
      to: filterTo.value || undefined,
    })
    toast.success(count > 0 ? `Posted ${count} new entr${count === 1 ? 'y' : 'ies'}.` : 'Ledger is already up to date.')
    await fetchJournal()
  }

  onMounted(init)

  return {
    filterFrom, filterTo, filterReferenceType, REFERENCE_TYPE_OPTIONS,
    entries, loading, accountOptions,
    showManualEntryDialog, manualEntryDate, manualDescription, manualLines,
    manualTotalDebit, manualTotalCredit, manualIsBalanced,
    addManualLine, removeManualLine,
    fetchJournal, submitManualEntry, approveEntry, reverseEntry, resyncLedger,
  }
}

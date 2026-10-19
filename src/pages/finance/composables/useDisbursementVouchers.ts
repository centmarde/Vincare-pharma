import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useFinanceDataStore } from '@/stores/financeData'
import { useDisbursementVouchersStore } from '@/stores/disbursementVouchersData'
import type { VoucherType, VoucherInput } from '@/stores/disbursementVouchersData'
import { isCashAdvanceAccount } from '@/utils/cashAccountTypes'
import { useExpenseAccounts } from './useExpenseAccounts'

// List + lifecycle actions for the Disbursement Vouchers page. Form state lives
// in useVoucherForm (called inside the dialog) — see the note there on why the
// two are separate composables.

export const headers = [
  { title: 'DV NO.',      key: 'dv_no',             sortable: true,  align: 'center' as const },
  { title: 'DATE',        key: 'voucher_date',      sortable: true,  align: 'center' as const },
  { title: 'PAYEE',       key: 'payee',             sortable: true,  align: 'center' as const },
  // The check number first, the account it's drawn on beneath it — staff look
  // for which check paid which voucher without opening each one.
  { title: 'CHECK DETAILS', key: 'cash_account_name', sortable: false, align: 'center' as const },
  { title: 'PARTICULARS', key: 'particulars',       sortable: false, align: 'center' as const },
  { title: 'AMOUNT',      key: 'total_amount',      sortable: true,  align: 'center' as const },
  { title: 'STATUS',      key: 'status',            sortable: true,  align: 'center' as const },
  { title: 'ACTIONS',     key: 'actions',           sortable: false, align: 'center' as const },
] as const

/** The account filter's value for every Cash Advances account (1060–1090) at once. */
export const cashAdvancesFilter = '@cash-advances'

/**
 * An amount typed into the search box: "3776", "3,776", "₱3,776.50". Null
 * when the text is not a plain amount, so it is searched as text only.
 *
 * Without decimals it means the whole peso — "3776" finds ₱3,776.00 to
 * ₱3,776.99, the way people quote an amount from memory. With decimals it is
 * exact to the centavo.
 */
export function parseAmountQuery(text: string): { amount: number; wholePeso: boolean } | null {
  const cleaned = text.trim().replace(/^php/i, '').replace(/[₱,\s]/g, '')
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null
  return { amount: Number(cleaned), wholePeso: !/\.\d/.test(cleaned) }
}

export function amountMatches(value: number | null | undefined, query: { amount: number; wholePeso: boolean }): boolean {
  if (value == null) return false
  // Compared in centavos: 0.1 + 0.2 style float error must not make ₱3,776.00 miss.
  const cents = Math.round(value * 100)
  const wanted = Math.round(query.amount * 100)
  return query.wholePeso ? cents >= wanted && cents < wanted + 100 : cents === wanted
}

// In Manila time, the zone the DATE column shows (formatDatePR_ISO), so a
// voucher always sits in the month its date reads, whatever zone the browser
// is in. Not the first 7 characters of the value: paid_at is a timestamp,
// stored in UTC.
const manilaMonth = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit' })

/** "2026-08" for a voucher, from its own date (falling back to when it was made). */
function voucherMonth(voucher: VoucherType): string {
  const raw = voucher.voucher_date ?? voucher.created_at
  if (!raw) return ''
  const date = new Date(raw)
  if (isNaN(date.getTime())) return ''
  const parts = manilaMonth.formatToParts(date)
  const year = parts.find((p) => p.type === 'year')?.value
  const month = parts.find((p) => p.type === 'month')?.value
  return year && month ? `${year}-${month}` : ''
}

const voucherStatusMeta: Record<string, { color: string; label: string; hint: string }> = {
  draft:     { color: 'grey',    label: 'DRAFT',     hint: 'Not yet printed. Editable; nothing has been recorded and no cash has moved.' },
  printed:   { color: 'info',    label: 'PRINTED',   hint: 'Printed and locked, out for signature. Ready to record.' },
  recorded:  { color: 'success', label: 'RECORDED',  hint: 'Expenses recorded and cash disbursed.' },
  cancelled: { color: 'error',   label: 'CANCELLED', hint: 'Cancelled before recording.' },
}

export function useDisbursementVouchers() {
  const voucherStore = useDisbursementVouchersStore()
  const financeStore = useFinanceDataStore()
  const { vouchers, loading } = storeToRefs(voucherStore)
  const { cashAccounts } = storeToRefs(financeStore)
  const { expenseAccountLabel, ensureLoaded: ensureAccountsLoaded } = useExpenseAccounts()

  const showFormDialog = ref(false)
  const editTarget = ref<VoucherType | null>(null)

  const showPrintDialog = ref(false)
  const printTarget = ref<VoucherType | null>(null)
  // The RECORDED overprint, laid onto the already-signed sheet.
  const showStampDialog = ref(false)
  const stampTarget = ref<VoucherType | null>(null)
  // Which physical copy the open print view represents. Anything above 1 is a
  // reprint and must render the REPRINTED COPY mark, so a second copy can never
  // be mistaken for the original.
  const printCopyNo = ref(1)

  const showCancelDialog = ref(false)
  const cancelTarget = ref<VoucherType | null>(null)
  const cancelReason = ref('')

  function statusMeta(status: string) {
    return voucherStatusMeta[status] ?? voucherStatusMeta.draft
  }

  // The gate the accountant asked for. Everything the row renders keys off these.
  /**
   * Editable right up until it is recorded — a printed voucher with a typo can
   * be fixed rather than cancelled and re-issued.
   *
   * Editing a PRINTED voucher sends it back to draft (see updateVoucher), so
   * the print-before-record gate still holds: whatever gets recorded is
   * whatever was last printed and signed, never an edit made after the fact.
   * Once recorded it is closed — corrections go through a change request,
   * which reverses and reissues rather than rewriting history.
   */
  const canEdit = (voucher: VoucherType) =>
    voucher.status === 'draft' || voucher.status === 'printed'
  const canPrint = (voucher: VoucherType) => voucher.status !== 'cancelled'
  const canRecord = (voucher: VoucherType) => voucher.status === 'printed'
  const canCancel = (voucher: VoucherType) => voucher.status !== 'recorded' && voucher.status !== 'cancelled'

  // Why Record Expense is unavailable, so a disabled button is never just dead.
  function recordBlockedReason(voucher: VoucherType): string {
    if (voucher.status === 'draft') return 'Print the voucher first — expenses can only be recorded against a printed, signed voucher.'
    if (voucher.status === 'recorded') return 'Expenses have already been recorded from this voucher.'
    if (voucher.status === 'cancelled') return 'This voucher was cancelled.'
    return ''
  }

  const search = ref('')
  // A month RANGE, "2026-08" to "2026-10", either end open (null): From alone
  // is that month onward, To alone is up to that month, both null is every
  // month, and the same month in both is that one month.
  const monthFrom = ref<string | null>(null)
  const monthTo = ref<string | null>(null)
  /** An account code, cashAdvancesFilter for all Cash Advances, or null for every account. */
  const accountFilter = ref<string | null>(null)

  const isFiltering = computed(() =>
    !!search.value?.trim() || !!monthFrom.value || !!monthTo.value || !!accountFilter.value)

  /** Months that have vouchers, newest first. */
  const voucherMonths = computed(() =>
    [...new Set(vouchers.value.map(voucherMonth).filter(Boolean))].sort().reverse())

  const monthOption = (month: string) => {
    const [year, mm] = month.split('-').map(Number)
    return { title: new Date(year, mm - 1, 1).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' }), value: month as string | null }
  }

  // Each end only offers months that fit the other, so From can never be
  // picked after To.
  const monthFromOptions = computed(() => [
    { title: 'Earliest', value: null as string | null },
    ...voucherMonths.value.filter((m) => !monthTo.value || m <= monthTo.value).map(monthOption),
  ])
  const monthToOptions = computed(() => [
    { title: 'Latest', value: null as string | null },
    ...voucherMonths.value.filter((m) => !monthFrom.value || m >= monthFrom.value).map(monthOption),
  ])

  /** Accounts the vouchers actually charge, after "All accounts" and the Cash Advances group. */
  const accountOptions = computed(() => {
    const codes = [...new Set(vouchers.value.flatMap((v) => v.items.map((line) => line.category)).filter(Boolean))]
      .sort((a, b) => String(a).localeCompare(String(b)))
    return [
      { title: 'All accounts', value: null as string | null },
      { title: 'All Cash Advances', value: cashAdvancesFilter as string | null },
      ...codes.map((code) => ({ title: expenseAccountLabel(code), value: code as string | null })),
    ]
  })

  function lineMatchesAccount(category: string | null | undefined): boolean {
    if (!accountFilter.value) return true
    if (accountFilter.value === cashAdvancesFilter) return isCashAdvanceAccount(category)
    return category === accountFilter.value
  }

  /**
   * What a voucher contributes under the account filter: its whole total with
   * no filter, otherwise only its lines in that account. A voucher of ₱3,000
   * cash advance and ₱776 fuel is ₱3,000 of Cash Advances, not ₱3,776.
   */
  function matchedAmount(voucher: VoucherType): number {
    if (!accountFilter.value) return voucher.total_amount ?? 0
    return voucher.items
      .filter((line) => lineMatchesAccount(line.category))
      .reduce((sum, line) => sum + (line.amount ?? 0), 0)
  }

  /** Whether the row should show a matched part under the account filter. */
  function isPartialMatch(voucher: VoucherType): boolean {
    return !!accountFilter.value && Math.abs(matchedAmount(voucher) - (voucher.total_amount ?? 0)) > 0.005
  }

  // AMOUNT shows matchedAmount, so it sorts on it too: under the account
  // filter a "₱50 of ₱1,000" row sorts as ₱50. With no filter it is the total.
  const tableHeaders = headers.map((header) =>
    header.key === 'total_amount'
      ? { ...header, sortRaw: (a: VoucherType, b: VoucherType) => matchedAmount(a) - matchedAmount(b) }
      : header)

  /**
   * Vouchers matching the search box.
   *
   * Filtered HERE rather than handed to v-data-table's own `search` prop, and
   * that is the whole point: the table only knows about the page it is
   * rendering, so a total built from it would be the total of one page. The
   * table and the footer total both read THIS list, so the figure under the
   * search is by construction the total of everything that matched — it cannot
   * drift from what is on screen, and paging does not change it.
   *
   * Searches every column the table shows, so typing what you can see works:
   * the voucher number, payee, the particulars, the paying account, and the
   * status chip.
   */
  const filteredVouchers = computed(() => {
    const query = (search.value ?? '').trim().toLowerCase()
    // Typed as an amount, it also matches the voucher total or any one line —
    // as well as any text containing those digits (a voucher number, say).
    const amountQuery = query ? parseAmountQuery(query) : null
    return vouchers.value.filter((voucher) => {
      const month = voucherMonth(voucher)
      if (monthFrom.value && month < monthFrom.value) return false
      if (monthTo.value && month > monthTo.value) return false
      if (accountFilter.value && !voucher.items.some((line) => lineMatchesAccount(line.category))) return false
      if (!query) return true
      if (amountQuery && (amountMatches(voucher.total_amount, amountQuery)
        || voucher.items.some((line) => amountMatches(line.amount, amountQuery)))) return true
      const haystack = [
        voucher.dv_no,
        voucher.payee,
        voucher.supplier_name,
        voucher.cash_account_name,
        voucher.check_no,
        voucher.status,
        voucher.remarks,
        ...voucher.items.map((line) => line.particular),
      ]
      return haystack.some((field) => (field ?? '').toLowerCase().includes(query))
    })
  })

  /**
   * What the matches add up to — the number their old system showed and the
   * reason this search exists: "what did all the LIQ. vouchers come to?"
   * Under an account filter, only the lines in that account are added (see
   * matchedAmount).
   *
   * CANCELLED vouchers are counted but NOT added. A cancelled voucher is a
   * document that exists and should still be findable, but no money left the
   * business for it, so folding it into the total would overstate the spend.
   * The count is reported separately so the exclusion is visible rather than
   * silently making the arithmetic look wrong.
   */
  const searchTotals = computed(() => {
    const rows = filteredVouchers.value
    const cancelled = rows.filter((voucher) => voucher.status === 'cancelled')
    const counted = rows.filter((voucher) => voucher.status !== 'cancelled')
    return {
      matches: rows.length,
      counted: counted.length,
      cancelled: cancelled.length,
      total: counted.reduce((sum, voucher) => sum + matchedAmount(voucher), 0),
    }
  })

  function particularsSummary(voucher: VoucherType): string {
    if (!voucher.items.length) return '—'
    const [first] = voucher.items
    const rest = voucher.items.length - 1
    return rest > 0 ? `${first.particular} (+${rest} more)` : first.particular
  }

  async function init() {
    // The chart names the accounts in the account filter.
    await Promise.all([voucherStore.fetchVouchers(), financeStore.fetchCashAccounts(), ensureAccountsLoaded()])
  }

  function openCreateDialog() {
    editTarget.value = null
    showFormDialog.value = true
  }

  function openEditDialog(voucher: VoucherType) {
    if (!canEdit(voucher)) return
    editTarget.value = voucher
    showFormDialog.value = true
  }

  function closeFormDialog() {
    showFormDialog.value = false
    editTarget.value = null
  }

  async function handleSubmit(payload: VoucherInput) {
    const result = editTarget.value
      ? await voucherStore.updateVoucher(editTarget.value.id, payload)
      : await voucherStore.createVoucher(payload)
    if (result.success) closeFormDialog()
    return result
  }

  /**
   * Open the printable view WITHOUT stamping it.
   *
   * It used to call markPrinted first, so merely looking at a voucher burned a
   * copy number and locked a draft — a preview that silently mutates the
   * document. The copy number shown here is the PROSPECTIVE one (print_count +
   * 1); stampPrint below commits it when a PDF is actually produced.
   */
  async function openPrint(voucher: VoucherType) {
    const fresh = await voucherStore.fetchVoucherById(voucher.id)
    if (!fresh) return
    printTarget.value = fresh
    printCopyNo.value = (fresh.print_count ?? 0) + 1
    showPrintDialog.value = true
  }

  /**
   * Commit the print: increments the copy count and locks a draft to 'printed'.
   *
   * Fired by the dialog once a PDF has actually been generated, which is the
   * only moment a copy really leaves the system. markPrinted returns the
   * authoritative number; it should equal what the preview showed, but trust
   * the server's and not the optimistic one.
   */
  async function stampPrint() {
    const target = printTarget.value
    if (!target) return
    const result = await voucherStore.markPrinted(target.id)
    if (!result.success) return
    printCopyNo.value = result.copyNo ?? printCopyNo.value
    printTarget.value = await voucherStore.fetchVoucherById(target.id)
  }

  // Re-fetched rather than reusing the row, so the stamp reads the expense
  // numbers created by recording — the list row predates them.
  async function openStamp(voucher: VoucherType) {
    stampTarget.value = await voucherStore.fetchVoucherById(voucher.id)
    showStampDialog.value = true
  }

  function closeStampDialog() {
    showStampDialog.value = false
    stampTarget.value = null
  }

  function closePrintDialog() {
    showPrintDialog.value = false
    printTarget.value = null
  }

  async function handleRecord(voucher: VoucherType) {
    await voucherStore.recordVoucherExpenses(voucher.id)
  }

  function openCancelDialog(voucher: VoucherType) {
    cancelTarget.value = voucher
    cancelReason.value = ''
    showCancelDialog.value = true
  }

  function closeCancelDialog() {
    showCancelDialog.value = false
    cancelTarget.value = null
    cancelReason.value = ''
  }

  async function handleCancel() {
    if (!cancelTarget.value) return
    const result = await voucherStore.cancelVoucher(cancelTarget.value.id, cancelReason.value.trim())
    if (result.success) closeCancelDialog()
  }

  return {
    vouchers, cashAccounts, loading,
    showFormDialog, editTarget,
    showPrintDialog, printTarget, printCopyNo, stampPrint,
    showStampDialog, stampTarget, openStamp, closeStampDialog,
    showCancelDialog, cancelTarget, cancelReason,
    statusMeta, canEdit, canPrint, canRecord, canCancel, recordBlockedReason, particularsSummary,
    search, monthFrom, monthTo, monthFromOptions, monthToOptions, accountFilter, accountOptions, isFiltering,
    matchedAmount, isPartialMatch, tableHeaders, filteredVouchers, searchTotals,
    init, openCreateDialog, openEditDialog, closeFormDialog, handleSubmit,
    openPrint, closePrintDialog, handleRecord,
    openCancelDialog, closeCancelDialog, handleCancel,
  }
}

import { ref, computed, watch } from 'vue'
import type { LocationQuery } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useFinanceDataStore } from '@/stores/financeData'
import { useDisbursementVouchersStore } from '@/stores/disbursementVouchersData'
import type { VoucherType, VoucherInput } from '@/stores/disbursementVouchersData'
import { isCashAdvanceAccount } from '@/utils/cashAccountTypes'
import { useExpenseAccounts } from './useExpenseAccounts'
import type { VoucherPrefill } from './useVoucherForm'

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
  // Left-aligned: it wraps to two lines, and centred wrapped text is hard to read.
  { title: 'PARTICULARS', key: 'particulars',       sortable: false, align: 'start' as const },
  { title: 'AMOUNT',      key: 'total_amount',      sortable: true,  align: 'center' as const },
  { title: 'STATUS',      key: 'status',            sortable: true,  align: 'center' as const },
  { title: 'ACTIONS',     key: 'actions',           sortable: false, align: 'center' as const },
] as const

/** The account filter's value for every Cash Advances account (1060–1090) at once. */
export const cashAdvancesFilter = '@cash-advances'

/** Whether a line's account is one of `filters` (codes, or cashAdvancesFilter). */
export function accountInFilters(category: string | null | undefined, filters: readonly string[]): boolean {
  return filters.some((filter) =>
    filter === cashAdvancesFilter ? isCashAdvanceAccount(category) : category === filter)
}

// Which columns this viewer has switched on. Kept in the browser: it is a
// viewing preference, not data, and it should outlast a logout.
const columnsStorageKey = 'vincare:dv-columns'

function loadVisibleColumns(): string[] {
  const all = headers.map((header) => header.key as string)
  try {
    const saved = JSON.parse(localStorage.getItem(columnsStorageKey) ?? 'null')
    if (!Array.isArray(saved)) return all
    // Drop keys from an older column set; never come back with nothing shown.
    const known = all.filter((key) => saved.includes(key))
    return known.length ? known : all
  } catch {
    return all
  }
}

/** One invoice being paid: our receipt (SI) and PO numbers, and the supplier's own. */
export type PaidInvoice = { si: string; po: string | null; docs: string[] }

/**
 * The prefill a Supplier Payments link carries:
 * `?new&supplier=12&supplierName=AHMM&amount=190000&invoices=[{"si":…,"po":…,"docs":[…]}]`.
 * Null when the link is a plain "new voucher" or the values do not parse.
 */
export function prefillFromQuery(query: LocationQuery): VoucherPrefill | null {
  const first = (value: LocationQuery[string]) => (Array.isArray(value) ? value[0] : value) ?? ''
  const supplierId = Number(first(query.supplier))
  const amount = Math.round(Number(first(query.amount)) * 100) / 100
  if (!Number.isInteger(supplierId) || supplierId <= 0 || !(amount > 0)) return null
  const invoices = parseInvoices(first(query.invoices))
  return {
    supplierId,
    supplierName: first(query.supplierName) || null,
    amount,
    particulars: invoicesParticulars(invoices),
    remarks: [...new Set(invoices.map((invoice) => invoice.po).filter(Boolean))].join(', '),
  }
}

/** The invoices from a link; tolerates a hand-edited or truncated one. */
function parseInvoices(raw: string): PaidInvoice[] {
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item) => item && typeof item.si === 'string')
      .map((item) => ({
        si: item.si,
        po: typeof item.po === 'string' ? item.po : null,
        docs: Array.isArray(item.docs) ? item.docs.filter((doc: unknown) => typeof doc === 'string') : [],
      }))
  } catch {
    return []
  }
}

/** "DO NO. 2026-557 (SI-2026-044)" — theirs first, ours in brackets. */
function invoiceLabel(invoice: PaidInvoice): string {
  return invoice.docs.length ? `${invoice.docs.join(' / ')} (${invoice.si})` : invoice.si
}

/** Invoices listed one per line before the rest are summed up as "AND n MORE". */
const invoicesListed = 5

/**
 * The printed particulars for a supplier payment, upper case like the rest of
 * theirs: the supplier's own DO / DR / SI number, which is what ties the cheque
 * to their paper, with our receipt number beside it.
 *
 * One invoice is one line. Several are one per line under "PAYMENT FOR:", and
 * past five the rest are counted, so the text never runs past the seven lines
 * the printed box holds (maxParticularsLines). PO numbers go in the remarks,
 * which are not printed, to keep each line short enough not to wrap.
 */
export function invoicesParticulars(invoices: readonly PaidInvoice[]): string {
  if (!invoices.length) return 'PAYMENT TO SUPPLIER'
  if (invoices.length === 1) return `PAYMENT FOR ${invoiceLabel(invoices[0])}`
  const shown = invoices.slice(0, invoicesListed).map(invoiceLabel)
  const rest = invoices.length - shown.length
  return ['PAYMENT FOR:', ...shown, ...(rest > 0 ? [`AND ${rest} MORE`] : [])].join('\n')
}

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
// voucher always sits on the day its date reads, whatever zone the browser
// is in. Not the first 10 characters of the value: paid_at is a timestamp,
// stored in UTC.
const manilaDay = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' })

/** "2026-08-14" for a voucher, from its own date (falling back to when it was made). */
export function voucherDay(voucher: VoucherType): string {
  return manilaDayOf(voucher.voucher_date ?? voucher.created_at)
}

/**
 * "2026-08-14" — the Manila calendar day of a date or timestamp, the day the
 * DATE columns show. Shared by the pages that filter by a date range.
 */
export function manilaDayOf(raw: string | null | undefined): string {
  if (!raw) return ''
  const date = new Date(raw)
  if (isNaN(date.getTime())) return ''
  const parts = manilaDay.formatToParts(date)
  const part = (type: string) => parts.find((p) => p.type === type)?.value
  const [year, month, day] = [part('year'), part('month'), part('day')]
  return year && month && day ? `${year}-${month}-${day}` : ''
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
  /** Set when the new voucher was raised from Supplier Payments. */
  const createPrefill = ref<VoucherPrefill | null>(null)

  // The printable register: a list of vouchers with its total.
  const showRegisterPrint = ref(false)

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
  // A DATE range, both ends inclusive, either end open (empty): From alone is
  // that day onward, To alone is up to and including that day, the same day in
  // both is that one day. Was a month picker — too coarse to find one voucher.
  // Strings ("2026-08-14") from the date fields; null after their clear button.
  const dateFrom = ref<string | null>(null)
  const dateTo = ref<string | null>(null)
  /** An account code, cashAdvancesFilter for all Cash Advances, or null for every account. */
  const accountFilter = ref<string | null>(null)

  const isFiltering = computed(() =>
    !!search.value?.trim() || !!dateFrom.value || !!dateTo.value || !!accountFilter.value)

  /** From after To matches nothing — said in the field rather than an empty list. */
  const dateRangeError = computed(() =>
    dateFrom.value && dateTo.value && dateFrom.value > dateTo.value ? 'From is after To' : '')

  function clearDates() {
    dateFrom.value = null
    dateTo.value = null
  }

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
    return !accountFilter.value || accountInFilters(category, [accountFilter.value])
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

  // The column chooser. Staff pick which columns the table shows; the choice
  // is remembered in this browser.
  const visibleColumns = ref<string[]>(loadVisibleColumns())
  watch(visibleColumns, (keys) => {
    try {
      localStorage.setItem(columnsStorageKey, JSON.stringify(keys))
    } catch {
      // Private browsing or storage full: the choice just won't be remembered.
    }
  })

  const columnOptions = headers.map((header) => ({ key: header.key as string, title: header.title }))

  function isColumnVisible(key: string) {
    return visibleColumns.value.includes(key)
  }

  /** Show or hide a column. The last one showing cannot be hidden. */
  function toggleColumn(key: string) {
    if (!isColumnVisible(key)) {
      // Kept in the table's own order, whatever order they were ticked in.
      visibleColumns.value = columnOptions.map((c) => c.key).filter((k) => k === key || isColumnVisible(k))
    } else if (visibleColumns.value.length > 1) {
      visibleColumns.value = visibleColumns.value.filter((k) => k !== key)
    }
  }

  function showAllColumns() {
    visibleColumns.value = columnOptions.map((c) => c.key)
  }

  // AMOUNT shows matchedAmount, so it sorts on it too: under the account
  // filter a "₱50 of ₱1,000" row sorts as ₱50. With no filter it is the total.
  // The expand toggle comes first and is not in the column chooser: it is how a
  // voucher is read in full without opening Edit, so it is always there.
  const tableHeaders = computed(() => [
    { title: '', key: 'data-table-expand', sortable: false, width: 40 },
    ...headers
      .filter((header) => isColumnVisible(header.key))
      .map((header) =>
        header.key === 'total_amount'
          ? { ...header, sortRaw: (a: VoucherType, b: VoucherType) => matchedAmount(a) - matchedAmount(b) }
          : header),
  ])

  /** Vouchers opened up in the list to read in full. Vuetify types this as
   *  string[]; it holds the item-value (the voucher id) as given. */
  const expanded = ref<string[]>([])

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
      const day = voucherDay(voucher)
      if (dateFrom.value && day < dateFrom.value) return false
      if (dateTo.value && day > dateTo.value) return false
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
        // The account names shown under the particulars, so "utilities" finds them.
        accountsSummary(voucher),
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

  /**
   * The voucher's particulars, in full.
   *
   * There is ONE per voucher, copied onto every line — the list used to add
   * "(+1 more)" for each extra line, which only counted account lines repeating
   * the same sentence. Read with the same rule as the form and the printout:
   * the first line holding a real description, not a copy of its account's
   * own name (what vouchers from the per-line era stored as a fallback).
   */
  function particularsOf(voucher: VoucherType): string {
    const real = voucher.items.find(
      (line) => line.particular?.trim() && line.particular !== expenseAccountLabel(line.category),
    )
    return (real ?? voucher.items.find((line) => line.particular?.trim()))?.particular ?? ''
  }

  /** The accounts a voucher is charged to, by name — what "+1 more" was hiding. */
  function accountsSummary(voucher: VoucherType): string {
    return [...new Set(voucher.items.map((line) => expenseAccountLabel(line.category)))].join(' · ')
  }

  async function init() {
    // The chart names the accounts in the account filter.
    await Promise.all([voucherStore.fetchVouchers(), financeStore.fetchCashAccounts(), ensureAccountsLoaded()])
  }

  function openCreateDialog(prefill: VoucherPrefill | null = null) {
    editTarget.value = null
    createPrefill.value = prefill
    showFormDialog.value = true
  }

  function openRegisterPrint() {
    showRegisterPrint.value = true
  }

  function openEditDialog(voucher: VoucherType) {
    if (!canEdit(voucher)) return
    editTarget.value = voucher
    showFormDialog.value = true
  }

  function closeFormDialog() {
    showFormDialog.value = false
    editTarget.value = null
    createPrefill.value = null
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
    showFormDialog, editTarget, createPrefill,
    showRegisterPrint, openRegisterPrint,
    visibleColumns, columnOptions, isColumnVisible, toggleColumn, showAllColumns,
    showPrintDialog, printTarget, printCopyNo, stampPrint,
    showStampDialog, stampTarget, openStamp, closeStampDialog,
    showCancelDialog, cancelTarget, cancelReason,
    statusMeta, canEdit, canPrint, canRecord, canCancel, recordBlockedReason, particularsOf, accountsSummary, expanded,
    search, dateFrom, dateTo, dateRangeError, clearDates, accountFilter, accountOptions, isFiltering,
    matchedAmount, isPartialMatch, tableHeaders, filteredVouchers, searchTotals,
    init, openCreateDialog, openEditDialog, closeFormDialog, handleSubmit,
    openPrint, closePrintDialog, handleRecord,
    openCancelDialog, closeCancelDialog, handleCancel,
  }
}

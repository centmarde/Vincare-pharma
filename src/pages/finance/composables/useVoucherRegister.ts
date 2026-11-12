import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useDisbursementVouchersStore } from '@/stores/disbursementVouchersData'
import type { VoucherStatus, VoucherType } from '@/stores/disbursementVouchersData'
import { useFinanceDataStore } from '@/stores/financeData'
import { formatDateOnly, formatDateOnlyLongMonth } from '@/utils/helpers'
import { useExpenseAccounts } from './useExpenseAccounts'
import { accountInFilters, cashAdvancesFilter, voucherDay } from './useDisbursementVouchers'
import { defaultCompanyFor } from '@/utils/companyProfiles'
import type { CompanyKey } from '@/utils/companyProfiles'

// The printable voucher register: every voucher in a date span, narrowed to
// the accounts asked for, with what they add up to. State for
// VoucherRegisterPrintDialog — the dialog is markup only.
//
// Its filters are its own rather than the list's: the list filters one
// account at a time for finding a voucher, while a register is asked for as
// "these accounts, this month", often several accounts at once. They start
// from the list's dates and account so the print matches what was on screen.

/** Columns the printed register can carry. Amount is always printed — the total is the point of it. */
export const registerColumns = [
  { key: 'dv_no', title: 'DV No.' },
  { key: 'voucher_date', title: 'Date' },
  { key: 'payee', title: 'Payee' },
  { key: 'check', title: 'Check Details' },
  { key: 'particulars', title: 'Particulars' },
  { key: 'accounts', title: 'Charged To' },
  { key: 'status', title: 'Status' },
] as const

export type RegisterColumnKey = (typeof registerColumns)[number]['key']

// The list's column keys that have a printed counterpart.
const fromListColumn: Record<string, RegisterColumnKey> = {
  dv_no: 'dv_no',
  voucher_date: 'voucher_date',
  payee: 'payee',
  cash_account_name: 'check',
  particulars: 'particulars',
  status: 'status',
}

export const registerStatusOptions: { value: VoucherStatus; title: string }[] = [
  { value: 'draft', title: 'Draft' },
  { value: 'printed', title: 'Printed' },
  { value: 'recorded', title: 'Recorded' },
  { value: 'cancelled', title: 'Cancelled' },
]

export type RegisterStart = {
  dateFrom: string | null
  dateTo: string | null
  /** The list's account filter, if any. */
  account: string | null
  /** The list's visible column keys. */
  columns: readonly string[]
}

export function useVoucherRegister() {
  const voucherStore = useDisbursementVouchersStore()
  const financeStore = useFinanceDataStore()
  const { vouchers } = storeToRefs(voucherStore)
  const { cashAccounts } = storeToRefs(financeStore)
  const { expenseAccountLabel, ensureLoaded: ensureAccountsLoaded } = useExpenseAccounts()

  const dateFrom = ref<string | null>(null)
  const dateTo = ref<string | null>(null)
  /** Cash accounts the vouchers were paid from; empty = any. */
  const paidFrom = ref<number[]>([])
  /** GL accounts (or cashAdvancesFilter) the lines were charged to; empty = any. */
  const chargedTo = ref<string[]>([])
  // Cancelled vouchers are left out by default: no money left for them.
  const statuses = ref<VoucherStatus[]>(['draft', 'printed', 'recorded'])
  const columns = ref<RegisterColumnKey[]>(registerColumns.map((c) => c.key))
  const companyKey = ref<CompanyKey>(defaultCompanyFor('disbursement_voucher'))

  /** Reset the filters to match what the list is showing. */
  function startFrom(start: RegisterStart) {
    dateFrom.value = start.dateFrom
    dateTo.value = start.dateTo
    paidFrom.value = []
    chargedTo.value = start.account ? [start.account] : []
    statuses.value = ['draft', 'printed', 'recorded']
    const listed = start.columns.map((key) => fromListColumn[key]).filter(Boolean)
    // "Charged To" has no list column; it is worth printing once accounts are picked.
    columns.value = registerColumns
      .map((c) => c.key)
      .filter((key) => listed.includes(key) || (key === 'accounts' && chargedTo.value.length > 0))
    void ensureAccountsLoaded()
  }

  const dateRangeError = computed(() =>
    dateFrom.value && dateTo.value && dateFrom.value > dateTo.value ? 'From is after To' : '')

  const paidFromOptions = computed(() =>
    cashAccounts.value.map((account) => ({ value: account.id, title: account.name })))

  /** Every account any voucher charges, plus the Cash Advances group. */
  const chargedToOptions = computed(() => {
    const codes = [...new Set(vouchers.value.flatMap((v) => v.items.map((line) => line.category)).filter(Boolean))]
      .sort((a, b) => String(a).localeCompare(String(b)))
    return [
      { title: 'All Cash Advances', value: cashAdvancesFilter },
      ...codes.map((code) => ({ title: expenseAccountLabel(code), value: code as string })),
    ]
  })

  function lineCounts(category: string | null | undefined) {
    return !chargedTo.value.length || accountInFilters(category, chargedTo.value)
  }

  /** What a voucher adds to the register: only its lines in the chosen accounts. */
  function amountFor(voucher: VoucherType): number {
    return voucher.items
      .filter((line) => lineCounts(line.category))
      .reduce((sum, line) => sum + (line.amount ?? 0), 0)
  }

  /** Oldest first, like a register is read; same-day vouchers by number. */
  const rows = computed(() =>
    vouchers.value
      .filter((voucher) => {
        if (!statuses.value.includes(voucher.status)) return false
        const day = voucherDay(voucher)
        if (dateFrom.value && day < dateFrom.value) return false
        if (dateTo.value && day > dateTo.value) return false
        if (paidFrom.value.length && !paidFrom.value.includes(voucher.cash_account_id ?? -1)) return false
        return !chargedTo.value.length || voucher.items.some((line) => lineCounts(line.category))
      })
      .sort((a, b) =>
        voucherDay(a).localeCompare(voucherDay(b)) || (a.dv_no ?? '').localeCompare(b.dv_no ?? '', undefined, { numeric: true })),
  )

  // A cancelled voucher is listed when asked for but never added: no money
  // left the business for it. Same rule as the list's total.
  const counted = computed(() => rows.value.filter((voucher) => voucher.status !== 'cancelled'))
  const total = computed(() => counted.value.reduce((sum, voucher) => sum + amountFor(voucher), 0))

  /** The total split by account, largest first — ties the register to the ledger. */
  const byAccount = computed(() => {
    const sums = new Map<string, number>()
    for (const voucher of counted.value) {
      for (const line of voucher.items) {
        if (!lineCounts(line.category)) continue
        sums.set(line.category, (sums.get(line.category) ?? 0) + (line.amount ?? 0))
      }
    }
    return [...sums.entries()]
      .map(([code, amount]) => ({ code, label: expenseAccountLabel(code), amount }))
      .sort((a, b) => b.amount - a.amount)
  })

  function hasColumn(key: RegisterColumnKey) {
    return columns.value.includes(key)
  }

  function toggleColumn(key: RegisterColumnKey) {
    columns.value = hasColumn(key)
      ? columns.value.filter((k) => k !== key)
      : registerColumns.map((c) => c.key).filter((k) => k === key || hasColumn(k))
  }

  /** The full description, not the list's one-line summary. Older vouchers
   *  can differ line to line, so each distinct one is kept. */
  function particularsOf(voucher: VoucherType): string {
    return [...new Set(voucher.items.map((line) => line.particular?.trim()).filter(Boolean))].join('; ')
  }

  function accountsOf(voucher: VoucherType): string {
    return [...new Set(voucher.items.filter((line) => lineCounts(line.category)).map((line) => expenseAccountLabel(line.category)))]
      .join('; ')
  }

  function dateOf(voucher: VoucherType): string {
    return formatDateOnly(voucher.voucher_date ?? voucher.created_at)
  }

  /** Whether the amount printed is only part of the voucher (account filter). */
  function isPartial(voucher: VoucherType) {
    return Math.abs(amountFor(voucher) - (voucher.total_amount ?? 0)) > 0.005
  }

  // Noon, so the long date reads the picked day whatever the time zone.
  const longDate = (day: string) => formatDateOnlyLongMonth(`${day}T12:00:00+08:00`)

  const periodLine = computed(() => {
    if (dateFrom.value && dateTo.value) {
      return dateFrom.value === dateTo.value
        ? longDate(dateFrom.value)
        : `${longDate(dateFrom.value)} to ${longDate(dateTo.value)}`
    }
    if (dateFrom.value) return `From ${longDate(dateFrom.value)}`
    if (dateTo.value) return `Up to ${longDate(dateTo.value)}`
    return 'All dates'
  })

  const paidFromLine = computed(() =>
    paidFrom.value.length
      ? paidFromOptions.value.filter((o) => paidFrom.value.includes(o.value)).map((o) => o.title).join(', ')
      : 'All accounts')

  const chargedToLine = computed(() =>
    chargedTo.value.length
      ? chargedToOptions.value.filter((o) => chargedTo.value.includes(o.value)).map((o) => o.title).join(', ')
      : 'All accounts')

  const filename = computed(() =>
    `DV-Register-${dateFrom.value ?? 'start'}-to-${dateTo.value ?? new Date().toISOString().slice(0, 10)}.pdf`)

  return {
    dateFrom, dateTo, paidFrom, chargedTo, statuses, columns, companyKey,
    dateRangeError, paidFromOptions, chargedToOptions,
    rows, counted, total, byAccount,
    periodLine, paidFromLine, chargedToLine, filename,
    startFrom, hasColumn, toggleColumn,
    amountFor, isPartial, particularsOf, accountsOf, dateOf,
  }
}

import { ref, computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useDisbursementVouchersStore, advanceRebateCodes, isRebateAccount } from '@/stores/disbursementVouchersData'
import type { VoucherStatus, VoucherType } from '@/stores/disbursementVouchersData'
import { useCustomersDataStore } from '@/stores/customersData'
import { voucherDay } from '@/pages/finance/composables/useDisbursementVouchers'

// Rebates as they are actually paid: by disbursement voucher, for In-House and
// Ethical customers alike. The order-based queue on this page was built for
// Ethical but has never been used — staff raise a voucher charged to 6030
// (earned) or 1060 / 1070 (paid in advance) instead. This lists those vouchers
// by the customer each one is linked to, and links the ones that are not.

export type RebateDepartmentFilter = 'all' | 'inhouse' | 'ethical' | 'unlinked'

export type RebateVoucherRow = {
  id: number
  dv_no: string | null
  date: string
  payee: string | null
  particulars: string
  status: VoucherStatus
  customer_id: number | null
  customer_name: string | null
  department: 'inhouse' | 'ethical' | null
  /** 1060 / 1070 — paid before it was earned. */
  advance: number
  /** 6030 — the earned rebate. */
  earned: number
  total: number
}

export type RebateCustomerRow = {
  customer_id: number
  customer_name: string
  department: 'inhouse' | 'ethical' | null
  vouchers: number
  /** Paid — recorded vouchers only. */
  advance: number
  earned: number
  total: number
  /** Draft or printed: raised, but no money has left yet. */
  pending: number
}

/** Only a recorded voucher has paid anything; draft and printed are still paper. */
const isPaid = (row: RebateVoucherRow) => row.status === 'recorded'

export const departmentLabels: Record<'inhouse' | 'ethical', string> = {
  inhouse: 'In-House',
  ethical: 'Ethical',
}

export const departmentFilterOptions: { title: string; value: RebateDepartmentFilter }[] = [
  { title: 'All customers', value: 'all' },
  { title: 'In-House', value: 'inhouse' },
  { title: 'Ethical', value: 'ethical' },
  { title: 'Not linked to a customer', value: 'unlinked' },
]

export const voucherStatusOptions: { title: string; value: VoucherStatus }[] = [
  { title: 'Draft', value: 'draft' },
  { title: 'Printed', value: 'printed' },
  { title: 'Recorded', value: 'recorded' },
]

export const voucherHeaders = [
  { title: 'DV No.', key: 'dv_no' },
  { title: 'Date', key: 'date' },
  { title: 'Payee', key: 'payee' },
  { title: 'Customer', key: 'customer_name' },
  { title: 'Advance', key: 'advance', align: 'end' as const },
  { title: 'Earned', key: 'earned', align: 'end' as const },
  { title: 'Status', key: 'status' },
  { title: '', key: 'actions', sortable: false, align: 'end' as const },
]

export const customerHeaders = [
  { title: 'Customer', key: 'customer_name' },
  { title: 'Department', key: 'department' },
  { title: 'Vouchers', key: 'vouchers', align: 'end' as const },
  { title: 'Advances paid', key: 'advance', align: 'end' as const },
  { title: 'Earned paid', key: 'earned', align: 'end' as const },
  { title: 'Total paid', key: 'total', align: 'end' as const },
  { title: 'Not yet recorded', key: 'pending', align: 'end' as const },
]

function asDepartment(value: string | null): 'inhouse' | 'ethical' | null {
  return value === 'inhouse' || value === 'ethical' ? value : null
}

function toRow(voucher: VoucherType): RebateVoucherRow {
  const lines = voucher.items.filter((line) => isRebateAccount(line.category))
  const sum = (codes: (code: string) => boolean) =>
    lines.filter((line) => codes(line.category)).reduce((total, line) => total + (line.amount ?? 0), 0)
  const advance = sum((code) => (advanceRebateCodes as readonly string[]).includes(code))
  const earned = sum((code) => code === '6030')
  return {
    id: voucher.id,
    dv_no: voucher.dv_no,
    date: voucherDay(voucher),
    payee: voucher.payee,
    particulars: voucher.items.find((line) => line.particular?.trim())?.particular ?? '',
    status: voucher.status,
    customer_id: voucher.customer_id,
    customer_name: voucher.customer_name,
    department: asDepartment(voucher.customer_department),
    advance,
    earned,
    total: advance + earned,
  }
}

export function useRebateVouchers() {
  const voucherStore = useDisbursementVouchersStore()
  const customersStore = useCustomersDataStore()
  const { vouchers, loading } = storeToRefs(voucherStore)
  const { rebateCustomers } = storeToRefs(customersStore)

  const search = ref('')
  const departmentFilter = ref<RebateDepartmentFilter>('all')
  // Drafts are listed by default — most rebate vouchers sit as drafts for a
  // while — but they can be dropped to see only what has gone out on paper.
  const statuses = ref<VoucherStatus[]>(['draft', 'printed', 'recorded'])
  const dateFrom = ref<string | null>(null)
  const dateTo = ref<string | null>(null)
  /** Narrow the voucher list to one customer, from the summary table. */
  const customerFilter = ref<number | null>(null)

  /** Every non-cancelled voucher with a rebate line. Cancelled paid nothing. */
  const allRows = computed(() =>
    vouchers.value
      .filter((voucher) => voucher.status !== 'cancelled' && voucher.items.some((line) => isRebateAccount(line.category)))
      .map(toRow))

  /** Everything except the customer narrowing — what the summary is built from. */
  const scopedRows = computed(() => {
    const query = search.value?.trim().toLowerCase() ?? ''
    return allRows.value.filter((row) => {
      if (!statuses.value.includes(row.status)) return false
      if (dateFrom.value && row.date < dateFrom.value) return false
      if (dateTo.value && row.date > dateTo.value) return false
      if (departmentFilter.value === 'unlinked' && row.customer_id !== null) return false
      if (departmentFilter.value === 'inhouse' && row.department !== 'inhouse') return false
      if (departmentFilter.value === 'ethical' && row.department !== 'ethical') return false
      if (!query) return true
      return [row.dv_no, row.payee, row.customer_name, row.particulars]
        .some((field) => (field ?? '').toLowerCase().includes(query))
    })
  })

  /** Newest first, like the voucher list. */
  const rows = computed(() =>
    scopedRows.value
      .filter((row) => customerFilter.value === null || row.customer_id === customerFilter.value)
      .sort((a, b) => b.date.localeCompare(a.date) || (b.dv_no ?? '').localeCompare(a.dv_no ?? '', undefined, { numeric: true })))

  /** One line per customer, largest first. */
  const byCustomer = computed<RebateCustomerRow[]>(() => {
    const groups = new Map<number, RebateCustomerRow>()
    for (const row of scopedRows.value) {
      if (row.customer_id === null) continue
      const group = groups.get(row.customer_id) ?? {
        customer_id: row.customer_id,
        customer_name: row.customer_name ?? `Customer ${row.customer_id}`,
        department: row.department,
        vouchers: 0, advance: 0, earned: 0, total: 0, pending: 0,
      }
      group.vouchers += 1
      if (isPaid(row)) {
        group.advance += row.advance
        group.earned += row.earned
        group.total += row.total
      } else {
        group.pending += row.total
      }
      groups.set(row.customer_id, group)
    }
    return [...groups.values()].sort((a, b) => b.total - a.total || b.pending - a.pending)
  })

  /**
   * What a set of vouchers paid, and what is raised but not paid yet. Drafts
   * stay listed (most rebate vouchers sit as drafts a while) but are never
   * counted as paid — no money leaves until a voucher is recorded.
   */
  function totalsOf(list: RebateVoucherRow[]) {
    const paid = list.filter(isPaid)
    const unpaid = list.filter((row) => !isPaid(row))
    const sum = (rows: RebateVoucherRow[], key: 'advance' | 'earned' | 'total') =>
      rows.reduce((total, row) => total + row[key], 0)
    return {
      count: list.length,
      advance: sum(paid, 'advance'),
      earned: sum(paid, 'earned'),
      total: sum(paid, 'total'),
      pending: sum(unpaid, 'total'),
      pendingCount: unpaid.length,
    }
  }

  // The cards: what each department's customers were paid, and what is not
  // yet attributed to anyone. Under the date/status/search filters, not the
  // department one — they are the department split.
  const cardRows = computed(() => {
    const query = search.value?.trim().toLowerCase() ?? ''
    return allRows.value.filter((row) =>
      statuses.value.includes(row.status)
      && (!dateFrom.value || row.date >= dateFrom.value)
      && (!dateTo.value || row.date <= dateTo.value)
      && (!query || [row.dv_no, row.payee, row.customer_name, row.particulars]
        .some((field) => (field ?? '').toLowerCase().includes(query))))
  })
  const inhouseTotals = computed(() => totalsOf(cardRows.value.filter((row) => row.department === 'inhouse')))
  const ethicalTotals = computed(() => totalsOf(cardRows.value.filter((row) => row.department === 'ethical')))
  const unlinkedTotals = computed(() => totalsOf(cardRows.value.filter((row) => row.customer_id === null)))
  const listTotals = computed(() => totalsOf(rows.value))

  const customerFilterName = computed(() =>
    byCustomer.value.find((c) => c.customer_id === customerFilter.value)?.customer_name
    ?? allRows.value.find((r) => r.customer_id === customerFilter.value)?.customer_name
    ?? null)

  function showCustomer(customerId: number | null) {
    customerFilter.value = customerFilter.value === customerId ? null : customerId
  }

  // Unlinked vouchers have no customer, so a customer picked before would
  // leave the list empty while the card says there are vouchers to link.
  watch(departmentFilter, (filter) => {
    if (filter === 'unlinked') customerFilter.value = null
  })

  const customerOptions = computed(() =>
    rebateCustomers.value.map((customer) => ({
      value: customer.id,
      title: customer.name ?? `Customer ${customer.id}`,
      subtitle: customer.department === 'inhouse' ? 'In-House' : 'Ethical',
    })))

  // Linking dialog
  const showLinkDialog = ref(false)
  const linkTarget = ref<RebateVoucherRow | null>(null)
  const linkCustomerId = ref<number | null>(null)
  const linking = ref(false)

  function openLink(row: RebateVoucherRow) {
    linkTarget.value = row
    linkCustomerId.value = row.customer_id
    showLinkDialog.value = true
  }

  function cancelLink() {
    showLinkDialog.value = false
    linkTarget.value = null
    linkCustomerId.value = null
  }

  async function confirmLink() {
    if (!linkTarget.value || linking.value) return
    linking.value = true
    try {
      const result = await voucherStore.linkCustomer(linkTarget.value.id, linkCustomerId.value)
      if (result.success) cancelLink()
    } finally {
      linking.value = false
    }
  }

  async function init() {
    await Promise.all([voucherStore.fetchVouchers(), customersStore.fetchRebateCustomers()])
  }

  return {
    loading, search, departmentFilter, statuses, dateFrom, dateTo,
    customerFilter, customerFilterName, showCustomer,
    rows, byCustomer, listTotals, inhouseTotals, ethicalTotals, unlinkedTotals,
    customerOptions,
    showLinkDialog, linkTarget, linkCustomerId, linking, openLink, cancelLink, confirmLink,
    init,
  }
}

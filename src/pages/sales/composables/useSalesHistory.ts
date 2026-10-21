import { ref, computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useSalesDataStore } from '@/stores/salesData'
import { useSalesChargesStore } from '@/stores/salesChargesData'
import { chargeToAccount } from '@/utils/paymentMethods'
import { useWarehousesDataStore } from '@/stores/warehouseData'
import type { WarehouseType } from '@/stores/warehouseData'
import { useAuthUserStore } from '@/stores/authUser'
import type { SaleType } from '@/stores/salesData'
import { buildReceiptFromSale, type Receipt } from './usePosCheckout'

export const headers = [
  { title: 'SALE #',   key: 'sale_no',      sortable: true,  align: 'start' as const },
  { title: 'BRANCH',   key: 'warehouse',    sortable: false, align: 'center' as const },
  { title: 'DATE',     key: 'created_at',   sortable: true,  align: 'center' as const },
  { title: 'CUSTOMER', key: 'customer',     sortable: false, align: 'start' as const },
  { title: 'CASHIER',  key: 'cashier',      sortable: false, align: 'center' as const },
  { title: 'ITEMS',    key: 'items',        sortable: false, align: 'center' as const },
  { title: 'TOTAL',    key: 'total_amount', sortable: true,  align: 'center' as const },
  { title: 'STATUS',   key: 'status',       sortable: false, align: 'center' as const },
  { title: '',         key: 'actions',      sortable: false, align: 'end' as const },
] as const

export function useSalesHistory() {
  const salesStore = useSalesDataStore()
  const chargesStore = useSalesChargesStore()
  const warehousesStore = useWarehousesDataStore()
  const authStore = useAuthUserStore()
  const { sales, loading } = storeToRefs(salesStore)
  const { warehouses } = storeToRefs(warehousesStore)

  // Default to the last 30 days so a fresh page load doesn't pull the
  // pharmacy's entire sales history — the user can still clear/widen it.
  function defaultDateFrom(): string {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return d.toISOString().slice(0, 10)
  }

  const search = ref('')
  const filterStatus = ref<'all' | 'completed' | 'voided'>('all')
  const filterWarehouseId = ref<number | null>(null)
  const dateFrom = ref(defaultDateFrom())
  const dateTo = ref('')
  const statusOptions = [
    { title: 'All', value: 'all' },
    { title: 'Completed', value: 'completed' },
    { title: 'Voided', value: 'voided' },
  ]
  const warehouseOptions = computed(() => [
    { title: 'All Branches', value: null },
    ...warehouses.value.map((w: WarehouseType) => ({ title: w.name, value: w.id })),
  ])

  // Dialog state
  const showReceipt = ref(false)
  const receipt = ref<Receipt | null>(null)
  const showVoid = ref(false)
  const voidReason = ref('')
  const selectedSale = ref<SaleType | null>(null)

  function cashierName(id: string | null): string {
    if (!id) return '—'
    return authStore.users.find((u) => u.id === id)?.full_name ?? '—'
  }

  const filteredSales = computed(() => {
    let list = sales.value
    if (filterStatus.value !== 'all') list = list.filter((s) => s.status === filterStatus.value)
    const q = search.value.trim().toLowerCase()
    if (q) {
      list = list.filter((s) =>
        (s.sale_no?.toLowerCase().includes(q) ?? false) ||
        (s.customer?.name?.toLowerCase().includes(q) ?? false),
      )
    }
    return list
  })

  function canVoid(sale: SaleType): boolean {
    return sale.status === 'completed' && sale.remittance_id == null
  }

  // ── Sales charged to a customer account ─────────────────────────────────
  // What is still owed on each, read after the list loads. Payments are taken
  // at the office (Finance → Accounts Receivable), not here.
  const paidOnCharges = ref<Map<number, number> | null>(new Map())
  const isCharged = (sale: SaleType) => sale.payment_method === chargeToAccount

  /** Still owed on a charged sale; null when the payments could not be read. */
  function chargeOwed(sale: SaleType): number | null {
    if (!paidOnCharges.value) return null
    return Math.max(0, (sale.total_amount ?? 0) - (paidOnCharges.value.get(sale.id) ?? 0))
  }

  async function loadChargePayments() {
    const ids = sales.value.filter((s) => isCharged(s) && s.status !== 'voided').map((s) => s.id)
    try {
      paidOnCharges.value = ids.length ? await chargesStore.paidBySale(ids) : new Map()
    } catch {
      paidOnCharges.value = null
    }
  }

  async function load() {
    if (!authStore.users.length) await authStore.getAllUsers()
    if (!warehouses.value.length) await warehousesStore.fetchWarehouses()
    await salesStore.fetchSales({
      warehouseId: filterWarehouseId.value ?? undefined,
      dateFrom: dateFrom.value || undefined,
      dateTo: dateTo.value ? `${dateTo.value}T23:59:59` : undefined,
    })
    await loadChargePayments()
  }

  function openReceipt(sale: SaleType) {
    receipt.value = buildReceiptFromSale(sale, cashierName(sale.cashier_id))
    showReceipt.value = true
  }

  function openVoid(sale: SaleType) {
    selectedSale.value = sale
    voidReason.value = ''
    showVoid.value = true
  }

  async function confirmVoid() {
    if (!selectedSale.value) return
    const result = await salesStore.voidSale(selectedSale.value.id, voidReason.value)
    if (result.success) showVoid.value = false
  }

  onMounted(load)

  return {
    loading, sales, search, filterStatus, filterWarehouseId, warehouseOptions, dateFrom, dateTo, statusOptions,
    filteredSales, cashierName, canVoid, isCharged, chargeOwed,
    showReceipt, receipt, showVoid, voidReason, selectedSale,
    load, openReceipt, openVoid, confirmVoid,
  }
}

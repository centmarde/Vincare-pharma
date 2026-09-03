import { ref, computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useSalesDataStore } from '@/stores/salesData'
import { useOutletsDataStore } from '@/stores/outletsData'
import { useAuthUserStore } from '@/stores/authUser'
import type { SaleType } from '@/stores/salesData'
import { buildReceiptFromSale, type Receipt } from './usePosCheckout'

export const headers = [
  { title: 'SALE #',   key: 'sale_no',      sortable: true,  align: 'start' as const },
  { title: 'BRANCH',   key: 'outlet',       sortable: false, align: 'center' as const },
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
  const outletsStore = useOutletsDataStore()
  const authStore = useAuthUserStore()
  const { sales, loading } = storeToRefs(salesStore)
  const { outlets } = storeToRefs(outletsStore)

  // Default to the last 30 days so a fresh page load doesn't pull the
  // pharmacy's entire sales history — the user can still clear/widen it.
  function defaultDateFrom(): string {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return d.toISOString().slice(0, 10)
  }

  const search = ref('')
  const filterStatus = ref<'all' | 'completed' | 'voided'>('all')
  const filterOutletId = ref<number | null>(null)
  const dateFrom = ref(defaultDateFrom())
  const dateTo = ref('')
  const statusOptions = [
    { title: 'All', value: 'all' },
    { title: 'Completed', value: 'completed' },
    { title: 'Voided', value: 'voided' },
  ]
  const outletOptions = computed(() => [
    { title: 'All Branches', value: null },
    ...outlets.value.filter(o => o.channel === 'pos').map(o => ({ title: o.name, value: o.id })),
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

  async function load() {
    if (!authStore.users.length) await authStore.getAllUsers()
    if (!outlets.value.length) await outletsStore.fetchOutlets()
    await salesStore.fetchSales({
      warehouseId: filterOutletId.value ?? undefined,
      dateFrom: dateFrom.value || undefined,
      dateTo: dateTo.value ? `${dateTo.value}T23:59:59` : undefined,
    })
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
    loading, sales, search, filterStatus, filterOutletId, outletOptions, dateFrom, dateTo, statusOptions,
    filteredSales, cashierName, canVoid,
    showReceipt, receipt, showVoid, voidReason, selectedSale,
    load, openReceipt, openVoid, confirmVoid,
  }
}

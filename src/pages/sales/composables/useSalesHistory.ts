import { ref, computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useSalesDataStore, EXELMED_OUTLET } from '@/stores/salesData'
import { useAuthUserStore } from '@/stores/authUser'
import type { SaleType } from '@/stores/salesData'
import { buildReceiptFromSale, type Receipt } from './usePosCheckout'

export const headers = [
  { title: 'SALE #',   key: 'sale_no',      sortable: true,  align: 'start' as const },
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
  const authStore = useAuthUserStore()
  const { sales, loading } = storeToRefs(salesStore)

  const search = ref('')
  const filterStatus = ref<'all' | 'completed' | 'voided'>('all')
  const dateFrom = ref('')
  const dateTo = ref('')
  const statusOptions = [
    { title: 'All', value: 'all' },
    { title: 'Completed', value: 'completed' },
    { title: 'Voided', value: 'voided' },
  ]

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
        (s.customer_name?.toLowerCase().includes(q) ?? false),
      )
    }
    return list
  })

  function canVoid(sale: SaleType): boolean {
    return sale.status === 'completed' && sale.remittance_id == null
  }

  async function load() {
    if (!authStore.users.length) await authStore.getAllUsers()
    await salesStore.fetchSales({
      outlet: EXELMED_OUTLET,
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
    loading, sales, search, filterStatus, dateFrom, dateTo, statusOptions,
    filteredSales, cashierName, canVoid,
    showReceipt, receipt, showVoid, voidReason, selectedSale,
    load, openReceipt, openVoid, confirmVoid,
  }
}

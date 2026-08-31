// src/pages/executive/composables/usePRHistory.ts
import { usePurchaseRequisitionStore } from '@/stores/purchaseRequisitionData'
import { useTransactionsDataStore } from '@/stores/transactionsData'
import { useAuthUserStore } from '@/stores/authUser'
import type { PR, PRItem } from '@/stores/purchaseRequisitionData'
import { ref, computed } from 'vue'

// ─── Types ────────────────────────────────────────────────────────────────────

// One row = one product purchased on one completed PR, with its price.
export type ProductPurchaseRow = {
  product_id: number | null
  product_name: string
  requisition_no: string
  unit: string
  qty: number
  expiry_date: string | null
  cost_per_unit: number
  total_cost: number
  supplier_name: string
  created_at: string
}

// ─── Headers ──────────────────────────────────────────────────────────────────

export const historyHeaders = [
  { title: 'PRODUCT',     key: 'product_name',    sortable: true,  align: 'center' as const },
  { title: 'PR #',        key: 'requisition_no',  sortable: true,  align: 'center' as const },
  { title: 'UNIT',        key: 'unit',            sortable: false, align: 'center' as const },
  { title: 'QTY',         key: 'qty',             sortable: true,  align: 'center' as const },
  { title: 'EXPIRY',      key: 'expiry_date',     sortable: true,  align: 'center' as const },
  { title: 'COST/UNIT',   key: 'cost_per_unit',   sortable: true,  align: 'center' as const },
  { title: 'TOTAL COST',  key: 'total_cost',      sortable: true,  align: 'center' as const },
  { title: 'SUPPLIER',    key: 'supplier_name',   sortable: true,  align: 'center' as const },
  { title: 'DATE',        key: 'created_at',      sortable: true,  align: 'center' as const },
]

// ─── Composable ───────────────────────────────────────────────────────────────

export function usePRHistory() {
  const txStore   = useTransactionsDataStore()
  const prStore   = usePurchaseRequisitionStore()
  const authStore = useAuthUserStore()

  const loading      = ref(false)
  const search        = ref('')
  const searchInput   = ref('')
  const allRows       = ref<ProductPurchaseRow[]>([])

  // Flatten a PR's items into one product-purchase row per line item.
  function flattenPR(pr: PR): ProductPurchaseRow[] {
    return (pr.items || []).map((item: PRItem) => ({
      product_id:     item.product_id ?? null,
      product_name:   item.item_description,
      requisition_no: pr.requisition_no,
      unit:           item.unit,
      qty:            item.qty,
      expiry_date:    item.expiry_date ?? null,
      cost_per_unit:  item.cost_per_unit,
      total_cost:     item.qty * item.cost_per_unit,
      supplier_name:  item.supplier_name ?? '—',
      created_at:     pr.created_at,
    }))
  }

  // Fetch ALL completed PRs (paginated by PR via the RPC), then flatten
  // every line item into a product-purchase row. Client-side filtering,
  // sorting, and pagination happen in the dialog via v-data-table.
  async function loadItems() {
    loading.value = true

    if (!authStore.users.length) await authStore.getAllUsers()

    const allPRs: PR[] = []
    const pageSize = 100
    let offset = 0

    // Loop through RPC pages until we've collected every completed PR.
    while (true) {
      const { rows } = await txStore.fetchPurchaseRequisitionsRPC({
        status:    'complete',
        orderBy:   'created_at',
        ascending: false,
        limit:     pageSize,
        offset,
      })

      if (!rows.length) break

      const prs = rows.map(row => {
        const names = prStore.resolveUserNames(row.created_by, row.approved_by)
        return prStore.mapRPCRowToPR(row, names)
      })
      allPRs.push(...prs)

      if (rows.length < pageSize) break
      offset += pageSize
    }

    allRows.value = allPRs.flatMap(flattenPR)
    loading.value = false
  }

  // Client-side search across product name, PR #, and supplier.
  const filteredRows = computed(() => {
    const s = search.value.trim().toLowerCase()
    if (!s) return allRows.value
    return allRows.value.filter(row =>
      row.product_name.toLowerCase().includes(s) ||
      row.requisition_no.toLowerCase().includes(s) ||
      row.supplier_name.toLowerCase().includes(s)
    )
  })

  function commitSearch() { search.value = searchInput.value }
  function clearSearch()  { searchInput.value = ''; search.value = '' }

  return {
    loading, searchInput, commitSearch, clearSearch,
    serverItems: filteredRows, loadItems,
  }
}
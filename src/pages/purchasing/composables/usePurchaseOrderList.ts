import { ref, computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { supabase } from '@/lib/supabase'
import { useToast } from 'vue-toastification'
import { useSuppliersDataStore } from '@/stores/suppliersData'
import type { PR } from '@/stores/purchaseRequisitionStore'
import type { PurchaseOrder } from './usePODetailModal'

export const headers = [
  { title: 'PO #',           key: 'reference_no',  sortable: true,  align: 'center' as const },
  { title: 'SUPPLIER',       key: 'supplier_id',   sortable: false, align: 'center' as const },
  { title: 'DECLARED VALUE', key: 'total_amount',  sortable: false, align: 'center' as const },
  { title: 'SHIP VIA',       key: 'ship_via',      sortable: true,  align: 'center' as const },
  { title: 'SHIP METHOD',    key: 'ship_method',   sortable: true,  align: 'center' as const },
  { title: 'ISSUED AT',      key: 'created_at',    sortable: true,  align: 'center' as const },
  { title: 'STATUS',         key: 'status',        sortable: true,  align: 'center' as const },
  { title: 'ACTIONS',        key: 'actions',       sortable: false, align: 'center' as const },
] as const

export function usePurchaseOrderList() {
  const toast         = useToast()
  const supplierStore = useSuppliersDataStore()
  const { suppliers } = storeToRefs(supplierStore)

  // ─── State ────────────────────────────────────────────────────────
  const loading         = ref(false)
  const search          = ref('')
  const filterStatus    = ref<string | null>(null)
  const showDetailModal = ref(false)
  const selectedPO      = ref<PurchaseOrder | null>(null)
  const selectedPR      = ref<PR | null>(null)
  const serverItems     = ref<PurchaseOrder[]>([])
  const totalItems      = ref(0)
  const page            = ref(1)
  const itemsPerPage    = ref(10)
  const sortKey         = ref('created_at')
  const sortOrder       = ref<'asc' | 'desc'>('desc')
  const showSkuEditModal = ref(false)


  const confirmDialog = ref({
    show:     false,
    poId:     0,
    poNumber: '',
  })

  // ─── Computed ─────────────────────────────────────────────────────
  const statusOptions = computed(() => {
    const unique = [...new Set(serverItems.value.map(po => po.status).filter(Boolean))]
    const mapped = unique.map(s => ({ title: s.charAt(0).toUpperCase() + s.slice(1), value: s }))
    return [{ title: 'All', value: null }, ...mapped]
  })

  // ─── Helpers ──────────────────────────────────────────────────────
  const resolveSupplier = (id: string | null) =>
    suppliers.value.find(s => Number(s.id) === Number(id))?.name ?? '—'

  const statusLabel = (status: string) => {
    const labels: Record<string, string> = {
      issued:   'Issued',
      received: 'Received',
      pending:  'Pending',
    }
    return labels[status] ?? status
  }

  // Parse ship_via and ship_method from remarks "ship_via|ship_method"
  const parseRemarks = (remarks: string | null) => {
    if (!remarks) return { ship_via: null, ship_method: null }
    const parts = remarks.split('|')
    return {
      ship_via:    parts[0]?.trim() || null,
      ship_method: parts[1]?.trim() || null,
    }
  }

  // ─── Server Load ──────────────────────────────────────────────────
  async function loadItems({ page, itemsPerPage, sortBy }: {
    page: number
    itemsPerPage: number
    sortBy: { key: string; order: string }[]
  }) {
    loading.value = true

    try {
      let query = supabase
        .from('transactions')
        .select('*', { count: 'exact' })
        .eq('transaction_type', 'purchase_order')

      if (filterStatus.value)  query = query.eq('status', filterStatus.value)
      if (search.value.trim()) query = query.ilike('reference_no', `%${search.value.trim()}%`)

      if (sortBy.length) {
        sortKey.value   = sortBy[0].key === 'reference_no' ? 'reference_no' : sortBy[0].key
        sortOrder.value = sortBy[0].order as 'asc' | 'desc'
      }

      query = query.order(sortKey.value, { ascending: sortOrder.value === 'asc' })

      const from = (page - 1) * itemsPerPage
      const { data, count } = await query.range(from, from + itemsPerPage - 1)

      serverItems.value = (data ?? []).map((tx: any) => ({
        id:           tx.id,
        reference_no: tx.reference_no,
        status:       tx.status ?? 'issued',
        supplier_id:  tx.supplier_id,
        total_amount: tx.total_amount,
        created_at:   tx.created_at,
        created_by:   tx.created_by,
        is_delivered: tx.status === 'received',
        ship_via:     tx.ship_via ?? null,
        ship_method:  tx.ship_method ?? null,
        requisition_id: tx.requisition_id ?? null,
      }))

      totalItems.value = count ?? 0

    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load purchase orders')
    } finally {
      loading.value = false
    }
  }

  // ─── Actions ──────────────────────────────────────────────────────
  async function openDetail(po: PurchaseOrder) {
  selectedPO.value = po

  if (!po.requisition_id) {
    selectedPR.value  = null
    showDetailModal.value = true
    return
  }

  const { data } = await supabase
    .from('transactions')
    .select(`
      *,
      transaction_items (
        id,
        products (
          id,
          product_name,
          unit,
          cost_price,
          selling_price,
          current_stock
        )
      )
    `)
    .eq('id', po.requisition_id)
    .single()

  if (data) {
    const items = (data.transaction_items || []).map((ti: any, index: number) => ({
      id:               ti.id,
      no:               index + 1,
      unit:             ti.products?.unit         ?? '—',
      item_description: ti.products?.product_name ?? '—',
      qty:              ti.products?.current_stock ?? 0,
      offer_per_unit:   ti.products?.selling_price ?? 0,
      cost_per_unit:    ti.products?.cost_price    ?? 0,
    }))

    const [requesterRes, reviewerRes] = await Promise.all([
      data.created_by
        ? supabase.rpc('get_user_full_name', { user_id: data.created_by })
        : Promise.resolve({ data: null }),
      data.approved_by
        ? supabase.rpc('get_user_full_name', { user_id: data.approved_by })
        : Promise.resolve({ data: null }),
    ])

    selectedPR.value = {
      id:             data.id,
      reference_no:   data.reference_no,
      status:         data.status,
      remarks:        data.remarks,
      total_amount:   data.total_amount,
      supplier_id:    data.supplier_id,
      created_at:     data.created_at,
      created_by:     data.created_by,
      approved_by:    data.approved_by,
      updated_at:     data.updated_at,
      requester_name: requesterRes.data?.toUpperCase() ?? '—',
      reviewer_name:  reviewerRes.data?.toUpperCase()  ?? '—',
      items,
    }
  } else {
    selectedPR.value = null
  }

  showDetailModal.value = true
}

  function openConfirm(po: PurchaseOrder) {
    confirmDialog.value = { show: true, poId: po.id, poNumber: po.reference_no }
  }

  async function handleMarkReceived() {
    loading.value = true
    try {
      const { error } = await supabase
        .from('transactions')
        .update({ status: 'received' })
        .eq('id', confirmDialog.value.poId)

      if (error) throw error

      toast.success('Purchase order marked as received.')
      confirmDialog.value.show = false
      await loadItems({ page: page.value, itemsPerPage: itemsPerPage.value, sortBy: [] })

    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to mark as received')
    } finally {
      loading.value = false
    }
  }

  watch([search, filterStatus], () =>
    loadItems({ page: 1, itemsPerPage: itemsPerPage.value, sortBy: [] })
  )

  async function init() {
    await supplierStore.fetchSuppliers()
  }

  async function openDetailForSku(po: PurchaseOrder) {
  selectedPO.value = po

  if (!po.requisition_id) {
    selectedPR.value = null
    showSkuEditModal.value = true
    return
  }

  const { data } = await supabase
    .from('transactions')
    .select(`
      *,
      transaction_items (
        id,
        products (
          id,
          product_name,
          unit,
          cost_price,
          selling_price,
          current_stock,
          sku
        )
      )
    `)
    .eq('id', po.requisition_id)
    .single()

  if (data) {
    const items = (data.transaction_items || []).map((ti: any, index: number) => ({
      id:               ti.id,
      no:               index + 1,
      unit:             ti.products?.unit          ?? '—',
      item_description: ti.products?.product_name  ?? '—',
      qty:              ti.products?.current_stock  ?? 0,
      offer_per_unit:   ti.products?.selling_price  ?? 0,
      cost_per_unit:    ti.products?.cost_price     ?? 0,
      product: {
        id:           ti.products?.id,
        product_name: ti.products?.product_name,
        sku:          ti.products?.sku ?? '',
        cost_per_unit: ti.products?.cost_price ?? 0,
      },
    }))

    const [requesterRes, reviewerRes] = await Promise.all([
      data.created_by
        ? supabase.rpc('get_user_full_name', { user_id: data.created_by })
        : Promise.resolve({ data: null }),
      data.approved_by
        ? supabase.rpc('get_user_full_name', { user_id: data.approved_by })
        : Promise.resolve({ data: null }),
    ])

    selectedPR.value = {
      id:             data.id,
      reference_no:   data.reference_no,
      status:         data.status,
      remarks:        data.remarks,
      total_amount:   data.total_amount,
      supplier_id:    data.supplier_id,
      created_at:     data.created_at,
      created_by:     data.created_by,
      approved_by:    data.approved_by,
      updated_at:     data.updated_at,
      requester_name: requesterRes.data?.toUpperCase() ?? '—',
      reviewer_name:  reviewerRes.data?.toUpperCase()  ?? '—',
      items,
    }
  } else {
    selectedPR.value = null
  }

  showSkuEditModal.value = true
}
  return {
    loading, search, filterStatus,
    showDetailModal, selectedPO, selectedPR,
    confirmDialog, serverItems, totalItems,
    page, itemsPerPage, statusOptions,
    resolveSupplier, statusLabel,
    loadItems, openDetail, openConfirm,
    handleMarkReceived, init, showSkuEditModal, openDetailForSku,
  }
}
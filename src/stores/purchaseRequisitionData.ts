import { useTransactionsDataStore } from './transactionsData'
import { generateDocNumber } from '@/utils/helpers'
import { useAuthUserStore } from './authUser'
import { useToast } from 'vue-toastification'
import { supabase } from '@/lib/supabase'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Ref } from 'vue'

const toast = useToast()

export type PRItem = {
  id:               number
  no:               number
  unit:             string
  item_description: string
  qty:              number
  offer_per_unit:   number
  cost_per_unit:    number
  product_id?:      number
  sku?:             string | null
  supplier_name?:   string | null
  actual_count_stock_in?: number | null
}

export type RequisitionItemType = {
  no:               number
  unit:             string
  item_description: string
  qty:              number
  offer_per_unit:   number
  cost_per_unit:    number
  supplier_id:      string | null
  actual_count_stock_in?:    number | null
  expiry_date?:     string | null
}

export type PR = {
  id:              number
  requisition_no:  string
  po_no:           string | null
  status:          string
  remarks:         string | null
  total_amount:    number
  supplier_id:     string | null
  supplier_name?:  string | null
  created_at:      string
  created_by:      string
  approved_by:     string | null
  updated_at:      string | null
  requester_name?: string
  reviewer_name?:  string
  actual_count_stock_in?:   number | null
  items:           PRItem[]
}

export type PurchaseRequisitionType = {
  remarks:      string | null
  status:       string
  requested_by: string | null
  supplier_id:  string | null
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const usePurchaseRequisitionStore = defineStore('purchaseRequisitionData', () => {
  const authStore         = useAuthUserStore()
  const transactionsStore = useTransactionsDataStore()

  // ─── State ──────────────────────────────────────────────────────
  const loading:             Ref<boolean>                = ref(false)
  const error:               Ref<string>                 = ref('')
  const prs:                 Ref<PR[]>                   = ref([])
  const selectedPR:          Ref<PR | null>              = ref(null)
  const filterStatus:        Ref<string | null>          = ref(null)
  const items:               Ref<RequisitionItemType[]>  = ref([])
  const subscriptionChannel: Ref<any>                    = ref(null)

  const currentPR: Ref<PurchaseRequisitionType> = ref({
    remarks:      null,
    status:       'pending_approval',
    requested_by: null,
    supplier_id:  null,
  })

  // ─── Computed ───────────────────────────────────────────────────
  const isLoading = computed(() => loading.value)
  const hasError  = computed(() => error.value !== '')

  // ─── Helpers ────────────────────────────────────────────────────
  const handleError = (err: unknown, message: string) => {
    error.value = err instanceof Error ? err.message : message
  }

  function resetStore() {
    currentPR.value = { remarks: null, status: 'pending_approval', requested_by: null, supplier_id: null }
    items.value     = []
    error.value     = ''
  }

  //  ─── Reference Number Generators ──────────────────────────────────
  async function getLatestReferenceNo(column: 'requisition_no' | 'po_no' | 'reference_no', prefix: string): Promise<number> {
    const { data } = await supabase
      .from('transactions')
      .select(column)
      .ilike(column, `${prefix}%`)
      .order(column, { ascending: false })
      .limit(1)

    const row    = (data as Record<string, string>[] | null)?.[0]
    const latest = row ? row[column] : null
    return latest ? parseInt(latest.split('-')[2], 10) : 0
  }

  // ─── Mappers ────────────────────────────────────────────────────
  function mapTransactionItems(transactionItems: any[]): PRItem[] {
    return transactionItems.map((ti: any, index: number) => ({
      id:               ti.id,
      no:               index + 1,
      unit:             ti.products?.unit           ?? '—',
      item_description: ti.products?.product_name   ?? '—',
      qty:              ti.qty_stock_in   ?? 0,
      offer_per_unit:   ti.products?.selling_price   ?? 0,
      cost_per_unit:    ti.products?.cost_price      ?? 0,
      product_id:       ti.product_id,
      sku:              ti.products?.sku             ?? null,
      supplier_name:    ti.products?.suppliers?.name ?? '—',
      actual_count_stock_in:  ti.actual_count_stock_in      ?? null,
    }))
  }

  function resolveUserNames(createdBy: string | null, approvedBy: string | null) {
    const findName = (id: string | null) =>
      authStore.users.find(u => u.id === id)?.full_name?.toUpperCase() ?? '—'
    return {
      requester_name: findName(createdBy),
      reviewer_name:  findName(approvedBy),
    }
  }

  function mapToPR(
    tx: any,
    prItems: PRItem[],
    names: { requester_name: string; reviewer_name: string }
  ): PR {
    return {
      id:             tx.id,
      requisition_no: tx.requisition_no,
      po_no:          tx.po_no,
      status:         tx.status,
      remarks:        tx.remarks,
      total_amount:   tx.total_amount,
      supplier_id:    tx.supplier_id,
      created_at:     tx.created_at,
      created_by:     tx.created_by,
      approved_by:    tx.approved_by,
      updated_at:     tx.updated_at,
      requester_name: names.requester_name,
      reviewer_name:  names.reviewer_name,
      actual_count_stock_in:   tx.actual_count_stock_in,
      items:          prItems,
    }
  }

  // ─── PR Actions ─────────────────────────────────────────────────
  async function savePurchaseRequisition() {
    loading.value = true
    error.value   = ''

    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) {
      toast.error('User not authenticated.')
      loading.value = false
      return { success: false }
    }

    const prNumber = await generateDocNumber('PR', getLatestReferenceNo)
    const companyCostTotal = items.value.reduce((sum, i) => sum + i.qty * i.cost_per_unit, 0)

    const { data: txData, error: txError } = await supabase
      .from('transactions')
      .insert({
        requisition_no:   prNumber,
        po_no:            null,
        transaction_type: 'purchase_requisition',
        status:           'pending_approval',
        remarks:          currentPR.value.remarks ?? '',
        total_amount:     companyCostTotal,
        supplier_id:      null,
        created_by:       user.id,
      })
      .select('id, requisition_no')
      .single()

    if (txError || !txData) {
      handleError(txError, 'Failed to save purchase requisition.')
      toast.error('Failed to save Purchase Requisition. Please try again.')
      loading.value = false
      return { success: false }
    }

    // ─── Check for existing products (matched by product_name + supplier_id) ──
    const names = [...new Set(items.value.map(i => i.item_description))]
    const { data: existingProducts, error: existingError } = await supabase
      .from('products')
      .select('id, product_name, supplier_id')
      .in('product_name', names)

    if (existingError) {
      handleError(existingError, 'Failed to check existing products.')
      toast.error('Failed to check existing products. Please try again.')
      loading.value = false
      return { success: false }
    }

    const findExisting = (name: string, supplierId: number | null) =>
      (existingProducts || []).find(
        p => p.product_name === name && (p.supplier_id ?? null) === (supplierId ?? null)
      )

    // One slot per PR item: existing product id, or null if it needs to be created
    const productIdByIndex: (number | null)[] = items.value.map(item => {
      const supplierId = item.supplier_id ? Number(item.supplier_id) : null
      const match = findExisting(item.item_description, supplierId)
      return match ? match.id : null
    })

    // ─── Only insert products that don't already exist ──
    const newItemIndexes = productIdByIndex
      .map((id, idx) => (id === null ? idx : -1))
      .filter(idx => idx !== -1)

    if (newItemIndexes.length) {
      const productInserts = newItemIndexes.map(idx => {
        const item = items.value[idx]
        return {
          product_name:  item.item_description,
          unit:          item.unit,
          cost_price:    item.cost_per_unit,
          selling_price: item.offer_per_unit,
          supplier_id:   item.supplier_id ? Number(item.supplier_id) : null,
          status:        'active',
          expiry_date:   item.expiry_date ?? null,
          current_stock: 0,
        }
      })

      const { data: productData, error: productError } = await supabase
        .from('products').insert(productInserts).select('id')

      if (productError || !productData) {
        handleError(productError, 'Failed to save products.')
        toast.error('Failed to save products. Please try again.')
        loading.value = false
        return { success: false }
      }

      newItemIndexes.forEach((idx, i) => {
        productIdByIndex[idx] = productData[i].id
      })
    }

    const { error: itemsError } = await supabase
      .from('transaction_items')
      .insert(items.value.map((item, index) => ({
        transaction_id: txData.id,
        product_id:     productIdByIndex[index]!,
        qty_stock_in:    item.qty,
      })))

    if (itemsError) {
      handleError(itemsError, 'Failed to save transaction items.')
      toast.error('Failed to save transaction items. Please try again.')
      loading.value = false
      return { success: false }
    }

    toast.success('Purchase Requisition saved successfully.')
    resetStore()
    loading.value = false
    return { success: true, transactionId: txData.id, requisitionNo: prNumber }
  }

  async function fetchPurchaseRequisition() {
    loading.value = true
    error.value   = ''

    if (!authStore.users.length) await authStore.getAllUsers()

    const { data, error: fetchError } = await supabase
      .from('transactions')
      .select(`
        *,
        transaction_items (
          id, product_id, qty_stock_in, actual_count_stock_in,
          products ( id, product_name, unit, cost_price, selling_price, sku, supplier_id, suppliers ( name ) )
        )
      `)
      .not('requisition_no', 'is', null)
      .order('created_at', { ascending: false })

    if (fetchError) {
      toast.error('Failed to fetch Purchase Requisitions. Please try again.')
      loading.value = false
      return
    }

    prs.value = (data || []).map((tx: any) => {
      const names = resolveUserNames(tx.created_by, tx.approved_by)
      return mapToPR(tx, mapTransactionItems(tx.transaction_items || []), names)
    })

    loading.value = false
  }

  async function fetchPRByRequisitionId(requisitionId: number): Promise<PR | null> {
    if (!authStore.users.length) await authStore.getAllUsers()

    const { data } = await supabase
      .from('transactions')
      .select(`
        *,
        transaction_items (
          id, product_id, qty_stock_in, actual_count_stock_in,
          products ( id, product_name, unit, cost_price, selling_price, sku, supplier_id, suppliers ( name ) )
        )
      `)
      .eq('id', requisitionId)
      .single()

    if (!data) return null

    const names = resolveUserNames(data.created_by, data.approved_by)
    return mapToPR(data, mapTransactionItems(data.transaction_items || []), names)
  }

  async function approvePR(prId: number) {
    loading.value = true

    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) {
      toast.error('User not authenticated.')
      loading.value = false
      return { success: false }
    }

    const { error: updateError } = await supabase
      .from('transactions')
      .update({ status: 'approved', approved_by: user.id, updated_at: new Date().toISOString() })
      .eq('id', prId)

    if (updateError) {
      toast.error('Failed to approve Purchase Requisition. Please try again.')
      loading.value = false
      return
    }

    toast.success('Purchase Requisition approved successfully.')
    await fetchPurchaseRequisition()
    loading.value = false
  }

  async function rejectPR(prId: number) {
    loading.value = true

    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) {
      toast.error('User not authenticated.')
      loading.value = false
      return { success: false }
    }

    const { error: updateError } = await supabase
      .from('transactions')
      .update({ status: 'rejected', approved_by: user.id, updated_at: new Date().toISOString() })
      .eq('id', prId)

    if (updateError) {
      toast.error('Failed to reject Purchase Requisition. Please try again.')
      loading.value = false
      return
    }

    toast.success('Purchase Requisition rejected successfully.')
    await fetchPurchaseRequisition()
    loading.value = false
  }

  // ─── PO Actions ─────────────────────────────────────────────────
  async function issuePurchaseOrder(payload: {
    pr:          PR
    ship_via:    string
    ship_method: string
  }) {
    loading.value = true

    const poNumber = await generateDocNumber('PO', getLatestReferenceNo)

    const { error: updateError } = await supabase
      .from('transactions')
      .update({
        transaction_type: 'purchase_order',
        status:           'issued',
        po_no:            poNumber,
        ship_via:         payload.ship_via,
        ship_method:      payload.ship_method,
        updated_at:       new Date().toISOString(),
      })
      .eq('id', payload.pr.id)

    loading.value = false

    if (updateError) {
      handleError(updateError, 'Failed to issue purchase order.')
      toast.error('Failed to issue purchase order.')
      return { success: false }
    }

    toast.success('Purchase order issued successfully!')
    return { success: true }
  }

  async function markPOAsReceived(poId: number): Promise<boolean> {
    loading.value = true

    const siNumber = await generateDocNumber('SI', getLatestReferenceNo)
    const { error: updateError } = await supabase
      .from('transactions')
      .update({
        reference_no:     siNumber,
        transaction_type: 'stock_in',
        status:           'complete',
        updated_at:       new Date().toISOString(),
      })
      .eq('id', poId)

    loading.value = false

    if (updateError) {
      handleError(updateError, 'Failed to mark as received.')
      toast.error('Failed to mark purchase order as received.')
      return false
    }

    toast.success('Purchase order marked as received.')
    return true
  }

  // ─── Realtime ───────────────────────────────────────────────────
  function subscribeToPurchaseRequisitions() {
    subscriptionChannel.value = supabase
      .channel('transactions_pr_changes')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'transactions',
        filter: 'transaction_type=eq.purchase_requisition',
      }, async () => { await fetchPurchaseRequisition() })
      .subscribe()
  }

  function unsubscribeFromPurchaseRequisitions() {
    if (subscriptionChannel.value) {
      supabase.removeChannel(subscriptionChannel.value)
      subscriptionChannel.value = null
    }
  }

  // ─── Expose ─────────────────────────────────────────────────────
  return {

    // Generate reference numbers

    getLatestReferenceNo,
    // State
    prs, selectedPR, filterStatus, items, currentPR, loading, error,

    // Computed
    isLoading, hasError,

    // PR actions
    savePurchaseRequisition, resetStore,
    fetchPurchaseRequisition, fetchPRByRequisitionId,
    approvePR, rejectPR,

    // PO actions
    issuePurchaseOrder, markPOAsReceived,

    // Realtime
    subscribeToPurchaseRequisitions, unsubscribeFromPurchaseRequisitions,
  }
})
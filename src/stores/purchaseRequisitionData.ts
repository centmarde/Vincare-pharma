import { generateDocNumber, getLatestReferenceNo } from '@/utils/helpers'
import type { TransactionRPCRow } from './transactionsData'
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
  product_id?:      number | null
  reorder_request_id?: number | null
}

export type PR = {
  id:              number
  reference_no:    string | null   // NEW — the "live" doc number for this stage
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
      reference_no:   tx.reference_no,
      actual_count_stock_in:   tx.actual_count_stock_in,
      items:          prItems,
    }
  }

  function mapRPCItemsToPR(items: TransactionRPCRow['items']): PRItem[] {
    return (items || []).map((it, index) => ({
      id:                    it.id,
      no:                    index + 1,
      unit:                  it.unit          ?? '—',
      item_description:      it.product_name  ?? '—',
      qty:                   it.qty_stock_in  ?? 0,
      offer_per_unit:        it.selling_price ?? 0,
      cost_per_unit:         it.cost_price    ?? 0,
      product_id:            it.product_id,
      sku:                   it.sku           ?? null,
      supplier_name:         it.supplier_name ?? '—',
      actual_count_stock_in: it.actual_count_stock_in ?? null,
    }))
  }

  function mapRPCRowToPR(
    row: TransactionRPCRow,
    names: { requester_name: string; reviewer_name: string }
  ): PR {
    return {
      id:                    row.id,
      requisition_no:        row.requisition_no ?? '',
      po_no:                 row.po_no,
      status:                row.status ?? '',
      remarks:               row.remarks,
      total_amount:          row.total_amount ?? 0,
      supplier_id:           row.supplier_id ? String(row.supplier_id) : null,
      created_at:            row.created_at,
      created_by:            row.created_by ?? '',
      approved_by:           row.approved_by,
      updated_at:            row.updated_at,
      requester_name:        names.requester_name,
      reviewer_name:         names.reviewer_name,
      reference_no:          row.reference_no,
      actual_count_stock_in: null,
      items:                 mapRPCItemsToPR(row.items),
    }
  }

  // ─── PR Actions ─────────────────────────────────────────────────
  // A failure after the header insert used to leave a real, numbered PR
  // (status='pending_approval') sitting in the DB with zero line items —
  // approvable-looking but nothing to actually approve. Roll it back instead.
  async function rollbackPR(id: number) {
    await supabase.from('transaction_items').delete().eq('transaction_id', id)
    const { error } = await supabase.from('transactions').delete().eq('id', id).eq('transaction_type', 'purchase_requisition')
    if (error) console.warn('savePurchaseRequisition: rollback of partial PR failed — orphan header left behind, id:', id, error.message)
  }

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

    // Collect the source reorder request ids (if any) so we can stamp their
    // RO-####-### reference numbers onto this PR for traceability.
    const reorderRequestIds = items.value
      .map(i => i.reorder_request_id)
      .filter((id): id is number => id != null)

    let reorderNo: string | null = null
    if (reorderRequestIds.length) {
      const { data: roRows, error: roError } = await supabase
        .from('transactions')
        .select('reference_no')
        .in('id', reorderRequestIds)

      if (!roError && roRows?.length) {
        // Unique, non-null RO numbers joined with commas, e.g. "RO-2026-003,RO-2026-005"
        reorderNo = [...new Set(roRows.map(r => r.reference_no).filter((n): n is string => !!n))].join(',')
      }
    }

    const { data: txData, error: txError } = await supabase
      .from('transactions')
      .insert({
        reference_no:   prNumber,
        reorder_no:       reorderNo,
        po_no:            null,
        transaction_type: 'purchase_requisition',
        status:           'pending_approval',
        remarks:          currentPR.value.remarks ?? '',
        total_amount:     companyCostTotal,
        supplier_id:      null,
        created_by:       user.id,
      })
      .select('id, reference_no')
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
      .select('id, product_name, supplier_id, unit')
      .in('product_name', names)

    if (existingError) {
      handleError(existingError, 'Failed to check existing products.')
      toast.error('Failed to check existing products. Please try again.')
      await rollbackPR(txData.id)
      loading.value = false
      return { success: false }
    }

    const findExisting = (name: string, supplierId: number | null, unit: string) =>
      (existingProducts || []).find(
        p => p.product_name === name && (p.supplier_id ?? null) === (supplierId ?? null) && p.unit === unit
      )

    // One slot per PR item: existing product id, or null if it needs to be created
    const productIdByIndex: (number | null)[] = items.value.map(item => {
      const supplierId = item.supplier_id ? Number(item.supplier_id) : null

      if (item.product_id != null) {
        const pickedProduct = (existingProducts || []).find(p => p.id === item.product_id)

        if (pickedProduct && pickedProduct.unit === item.unit && pickedProduct.product_name === item.item_description) {
          return item.product_id   // NEW: trust reorder-sourced items directly
        }
      }

      const match = findExisting(item.item_description, supplierId, item.unit)
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
        await rollbackPR(txData.id)
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
      await rollbackPR(txData.id)
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

    console.log('[issuePurchaseOrder] Updating transaction:', {
      id: payload.pr.id,
      po_no: poNumber,
      reference_no: poNumber,
      ship_via: payload.ship_via,
      ship_method: payload.ship_method,
    })

    // Guarded on status='approved' + .select() so a stale/duplicate click
    // (e.g. the PR got rejected in another tab between load and confirm)
    // can't re-issue a PO and re-mint a number for it — a no-op update
    // (0 rows) is reported as a failure instead of silently "succeeding."
    const { data, error: updateError } = await supabase
      .from('transactions')
      .update({
        transaction_type: 'purchase_order',
        status:           'issued',
        reference_no:     poNumber,
        requisition_no:   payload.pr.reference_no,
        ship_via:         payload.ship_via,
        ship_method:      payload.ship_method,
        updated_at:       new Date().toISOString(),
      })
      .eq('id', payload.pr.id)
      .eq('status', 'approved')
      .eq('reference_no', payload.pr.reference_no)
      .select('id')

    console.log('[issuePurchaseOrder] Supabase response:', { data, error: updateError })
    console.log('[issuePurchaseOrder] poNumber value:', poNumber)

    loading.value = false

    if (updateError) {
      handleError(updateError, 'Failed to issue purchase order.')
      toast.error('Failed to issue purchase order.')
      return { success: false }
    }
    if (!data?.length) {
      toast.error('This purchase requisition is no longer approved — refresh and try again.')
      return { success: false }
    }

    toast.success('Purchase order issued successfully!')
    return { success: true }
  }

  async function markPOAsReceived(po: { id: number; reference_no: string | null }): Promise<boolean> {
    loading.value = true

    const siNumber = await generateDocNumber('SI', getLatestReferenceNo)
    // Guarded on status='issued' so a retry after a failed/partial receive
    // can't re-mint a second SI number for a PO already marked complete.
    const { data, error: updateError } = await supabase
      .from('transactions')
      .update({
        reference_no:     siNumber,
        po_no:            po.reference_no,
        transaction_type: 'stock_in',
        status:           'complete',
        updated_at:       new Date().toISOString(),
      })
      .eq('id', po.id)
      .eq('status', 'issued')
      .select('id')

    loading.value = false

    if (updateError) {
      handleError(updateError, 'Failed to mark as received.')
      toast.error('Failed to mark purchase order as received.')
      return false
    }
    if (!data?.length) {
      toast.error('This purchase order was already marked received — refresh the list.')
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

    resolveUserNames, mapToPR, mapTransactionItems, mapRPCRowToPR, mapRPCItemsToPR,

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

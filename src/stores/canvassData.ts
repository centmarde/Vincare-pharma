import { ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import { maxDocSeq } from '@/utils/helpers'
import type { CanvassSelection, CanvassPRResult } from '@/utils/canvassTypes'

// Shared by In-House and Ethical: raising one purchase requisition per winning
// supplier off a stock-shortfall canvass. Was the shared canvass_to_prs RPC
// (itself merged 2026-06-29 from two ~identical per-domain RPCs) — this store
// action now serves both order types the same way the RPC did, so
// inhouseData.ts/ethicalData.ts's canvassToPRs just delegate here.

export const useCanvassDataStore = defineStore('canvassData', () => {
  const loading = ref(false)
  const error: Ref<string> = ref('')

  const handleError = (err: unknown, msg: string) => { error.value = err instanceof Error ? err.message : msg }
  const clearError = () => { error.value = '' }

  // Best-effort, not atomic: a failure partway through raising multiple
  // supplier PRs can leave some PRs created and others not, and the PR-number
  // generation is a read-max-and-increment without a server-side lock
  // (accepted trade-off, JS-over-RPC convention).
  const commitToPRs = async (
    orderType: 'inhouse_order' | 'ethical_order',
    orderId: number,
    selections: CanvassSelection[],
    userId: string,
  ): Promise<{ success: boolean; prs?: CanvassPRResult[]; error?: string }> => {
    loading.value = true
    clearError()

    if (!selections.length) {
      loading.value = false
      return { success: false, error: 'No canvass selections provided' }
    }

    const logModule = orderType === 'inhouse_order' ? 'inhouse' : 'ethical'
    // Each order type stores its number in its own column (per-type ref-column scheme).
    const orderNoColumn = orderType === 'inhouse_order' ? 'inhouse_no' : 'ethical_no'
    // In-House's stock-shortfall status lives on transactions.status directly; Ethical's
    // fulfillment_status was moved into the ethical_details 1:1 extension table, so it
    // needs an embedded select, not a flat column read (was previously read as
    // transactions.fulfillment_status, which doesn't exist and 400'd every commit).
    const selectCols = orderType === 'inhouse_order'
      ? `status, ${orderNoColumn}`
      : `${orderNoColumn}, ethical_details(fulfillment_status)`

    const { data: order, error: fetchError } = await supabase
      .from('transactions')
      .select(selectCols)
      .eq('id', orderId)
      .eq('transaction_type', orderType)
      .maybeSingle()
    if (fetchError || !order) {
      loading.value = false
      handleError(fetchError, 'Order not found.')
      return { success: false, error: 'Order not found.' }
    }
    const row = order as unknown as Record<string, unknown>
    const orderStatus = orderType === 'inhouse_order'
      ? row.status
      : (row.ethical_details as { fulfillment_status: string | null } | null)?.fulfillment_status
    if (orderStatus !== 'awaiting_stock') {
      loading.value = false
      return { success: false, error: `Order is not awaiting stock (status ${orderStatus}).` }
    }
    const orderNo = row[orderNoColumn] as string | null

    const year = new Date().getFullYear().toString()
    const { data: existingPRs } = await supabase
      .from('transactions')
      .select('requisition_no')
      .like('requisition_no', `PR-${year}-%`)
    // One canvass commit raises several PRs; start from the numeric max and
    // increment per supplier (numeric, not lexical — see nextDocNumber).
    let seq = maxDocSeq((existingPRs ?? []).map(r => r.requisition_no))

    const supplierIds = Array.from(new Set(selections.map(s => s.supplier_id))).sort((a, b) => a - b)
    const results: CanvassPRResult[] = []

    for (const supplierId of supplierIds) {
      seq += 1
      const prNo = `PR-${year}-${String(seq).padStart(3, '0')}`
      const supplierSelections = selections.filter(s => s.supplier_id === supplierId)
      const total = supplierSelections.reduce((sum, s) => sum + s.qty * s.unit_price, 0)
      const count = supplierSelections.length

      const { data: pr, error: prError } = await supabase
        .from('transactions')
        .insert({
          requisition_no: prNo, po_no: null, transaction_type: 'purchase_requisition', status: 'pending_approval',
          supplier_id: supplierId, total_amount: total,
          remarks: `Auto-raised from ${logModule} ${orderNo ?? `#${orderId}`} supplier canvass (${count} item(s))`,
          created_by: userId,
        })
        .select('id')
        .single()
      if (prError || !pr) {
        loading.value = false
        handleError(prError, 'Failed to raise purchase requisition.')
        return { success: false, error: prError?.message || 'Failed to raise purchase requisition.', prs: results }
      }

      for (const sel of supplierSelections) {
        const decidedAt = new Date().toISOString()

        // The Purchasing module reads line qty from transaction_items.qty_stock_in
        // (its stock-in/out model — manual PR write, PR/PO list, receiving all use
        // it), so a canvass-raised PR must set it or it shows blank quantities in
        // the purchasing lists. Line values + the supplier_quotes audit trail now
        // live directly on transaction_items (transaction_item_details was merged in).
        const { error: prItemError } = await supabase
          .from('transaction_items')
          .insert({
            transaction_id: pr.id, product_id: sel.product_id,
            qty_stock_in: sel.qty, unit_price: sel.unit_price,
            line_total: sel.qty * sel.unit_price,
            supplier_quotes: {
              source: `${logModule}_canvass`, order_type: orderType, order_id: orderId, order_no: orderNo,
              winner_supplier_id: supplierId, unit_price: sel.unit_price, qty: sel.qty,
              quotes: sel.canvass ?? [], decided_at: decidedAt,
            },
          })
        if (prItemError) console.warn('commitToPRs: PR line insert failed:', prItemError.message)

        // Mirror the canvass decision back onto the originating order's own line.
        const { error: mirrorError } = await supabase
          .from('transaction_items')
          .update({
            supplier_quotes: {
              source: `${logModule}_canvass`, pr_id: pr.id, pr_no: prNo,
              winner_supplier_id: supplierId, unit_price: sel.unit_price, order_qty: sel.qty,
              quotes: sel.canvass ?? [], decided_at: decidedAt,
            },
          })
          .eq('id', sel.item_id)
        if (mirrorError) console.warn('commitToPRs: canvass mirror update failed:', mirrorError.message)
      }

      const { error: logError } = await supabase.from('logs').insert({
        created_by: userId, action: 'canvass_pr',
        description: `Raised ${prNo} (supplier ${supplierId}, ${count} item(s), total ${total})`,
        module: logModule, transaction_id: orderId,
      })
      if (logError) console.warn('commitToPRs: activity log insert failed:', logError.message)

      results.push({ supplier_id: supplierId, pr_id: pr.id, pr_no: prNo, item_count: count, total })
    }

    loading.value = false
    return { success: true, prs: results }
  }

  return { loading, error, clearError, commitToPRs }
})

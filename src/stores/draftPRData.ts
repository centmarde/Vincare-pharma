// stores/draftPRData.ts
import { ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import { useToast } from 'vue-toastification'
import { useAuthUserStore } from '@/stores/authUser'
import { qualifyOffers } from '@/utils/qualification'
import { useSupplierOffersDataStore } from '@/stores/supplierOffersData'
import type { SupplierOfferType } from '@/stores/supplierOffersData'
import { maxDocSeq, insertWithDocRetry } from '@/utils/helpers'

const toast = useToast()

export type DraftPRItemType = {
  id: number
  draft_pr_id: number
  product_id: number
  product_name?: string | null
  qty: number
  required_by_date: string | null
  selected_supplier_offer_id: number | null
  justification: string | null
  considered_offers: any[] | null
  supplier_id?: number | null // NEW — needed to group draft items by supplier exactly (not by display name)
  supplier_name?: string | null
  unit_price?: number | null
  expiry_date?: string | null
}

export type DraftPRType = {
  id: number
  status: 'draft' | 'converted'
  remarks: string | null
  created_by: string | null
  created_at: string
  updated_at: string | null
  source_order_id: number | null
  source_order_type: string | null
  converted_pr_id: number | null
  items: DraftPRItemType[]
}

export type ConvertWarning = { item_id: number; message: string }
export type ConvertResult = {
  success: boolean
  pr_id?: number
  pr_no?: string
  warnings?: ConvertWarning[]
  error?: string
}

// NEW — offer's own supplier_id pulled in alongside the existing joined fields.
const ITEM_SELECT =
  '*, product:product_id(product_name), offer:selected_supplier_offer_id(supplier_id, cost_price_per_unit, expiry_date, supplier:supplier_id(name))'

function requiredByOrToday(date: string | null | undefined): string {
  return date ?? new Date().toISOString().slice(0, 10)
}

export const useDraftPRDataStore = defineStore('draftPRData', () => {
  const authStore = useAuthUserStore()
  const offersStore = useSupplierOffersDataStore()

  const loading = ref(false)
  const error: Ref<string> = ref('')
  const drafts: Ref<DraftPRType[]> = ref([])
  const currentDraft: Ref<DraftPRType | null> = ref(null)
  const draftCountsByOrder: Ref<Record<number, number>> = ref({})

  const handleError = (err: unknown, msg: string) => {
    error.value = err instanceof Error ? err.message : msg
  }

  function mapItem(row: any): DraftPRItemType {
    return {
      id: row.id,
      draft_pr_id: row.draft_pr_id,
      product_id: row.product_id,
      product_name: row.product?.product_name ?? null,
      qty: row.qty,
      required_by_date: row.required_by_date,
      selected_supplier_offer_id: row.selected_supplier_offer_id,
      justification: row.justification,
      considered_offers: row.considered_offers ?? [],
      supplier_id: row.offer?.supplier_id ?? null, // NEW
      supplier_name: row.offer?.supplier?.name ?? null,
      unit_price: row.offer?.cost_price_per_unit ?? null,
      expiry_date: row.offer?.expiry_date ?? null,
    }
  }

  async function createDraft(payload: {
    remarks?: string
    sourceOrderId?: number | null
    sourceOrderType?: string | null
    lines: { product_id: number; qty: number; required_by_date?: string | null }[]
  }) {
    loading.value = true
    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) {
      toast.error('User not authenticated.')
      loading.value = false
      return { success: false }
    }

    const { data: draft, error: draftError } = await supabase
      .from('draft_purchase_requisitions')
      .insert({
        status: 'draft',
        remarks: payload.remarks ?? null,
        created_by: user.id,
        source_order_id: payload.sourceOrderId ?? null,
        source_order_type: payload.sourceOrderType ?? null,
      })
      .select('id')
      .single()
    if (draftError || !draft) {
      handleError(draftError, 'Failed to create draft.')
      toast.error('Failed to create draft.')
      loading.value = false
      return { success: false }
    }

    if (payload.lines.length) {
      const { error: itemsError } = await supabase.from('draft_pr_items').insert(
        payload.lines.map((l) => ({
          draft_pr_id: draft.id,
          product_id: l.product_id,
          qty: l.qty,
          required_by_date: l.required_by_date ?? null,
        })),
      )
      if (itemsError) {
        handleError(itemsError, 'Failed to add draft items.')
        toast.error('Failed to add draft items.')
        loading.value = false
        return { success: false }
      }
    }

    toast.success('Draft PR created.')
    loading.value = false
    return { success: true, draftId: draft.id }
  }

  async function fetchDrafts(status?: 'draft' | 'converted', sourceOrderId?: number) {
    loading.value = true
    let q = supabase
      .from('draft_purchase_requisitions')
      .select(`*, items:draft_pr_items(${ITEM_SELECT})`)
    if (status) q = q.eq('status', status)
    if (sourceOrderId != null) q = q.eq('source_order_id', sourceOrderId)
    const { data, error: fetchError } = await q.order('created_at', { ascending: false })
    loading.value = false
    if (fetchError) {
      handleError(fetchError, 'Failed to fetch drafts.')
      return []
    }
    drafts.value = (data ?? []).map((d: any) => ({ ...d, items: (d.items ?? []).map(mapItem) }))
    return drafts.value
  }

  async function fetchDraft(draftId: number): Promise<DraftPRType | null> {
    loading.value = true
    const { data, error: fetchError } = await supabase
      .from('draft_purchase_requisitions')
      .select(`*, items:draft_pr_items(${ITEM_SELECT})`)
      .eq('id', draftId)
      .single()
    loading.value = false
    if (fetchError || !data) {
      handleError(fetchError, 'Failed to load draft.')
      return null
    }
    currentDraft.value = { ...data, items: (data.items ?? []).map(mapItem) }
    return currentDraft.value
  }

  async function addItem(
    draftId: number,
    line: { product_id: number; qty: number; required_by_date?: string | null },
  ) {
    const { data, error: insertError } = await supabase
      .from('draft_pr_items')
      .insert({
        draft_pr_id: draftId,
        product_id: line.product_id,
        qty: line.qty,
        required_by_date: line.required_by_date ?? null,
      })
      .select(ITEM_SELECT)
      .single()
    if (insertError || !data) {
      toast.error('Failed to add item.')
      return null
    }
    const item = mapItem(data)
    if (currentDraft.value?.id === draftId) currentDraft.value.items.push(item)
    return item
  }

  async function removeItem(draftId: number, itemId: number) {
    const { error: deleteError } = await supabase.from('draft_pr_items').delete().eq('id', itemId)
    if (deleteError) {
      toast.error('Failed to remove item.')
      return false
    }
    if (currentDraft.value?.id === draftId) {
      currentDraft.value.items = currentDraft.value.items.filter((i) => i.id !== itemId)
    }
    return true
  }

  async function setRequiredByDate(itemId: number, date: string | null) {
    const { error: updateError } = await supabase
      .from('draft_pr_items')
      .update({ required_by_date: date })
      .eq('id', itemId)
    if (updateError) {
      toast.error('Failed to update required-by date.')
      return false
    }
    const item = currentDraft.value?.items.find((i) => i.id === itemId)
    if (item) item.required_by_date = date
    return true
  }

  // Persists a choice already validated as qualifying by the compare UI, plus
  // the full considered-offer snapshot for audit and an optional justification
  // when the user overrode the system's recommendation.
  async function selectOffer(payload: {
    itemId: number
    offer: SupplierOfferType
    consideredOffers: SupplierOfferType[]
    justification?: string | null
  }) {
    const { error: updateError } = await supabase
      .from('draft_pr_items')
      .update({
        selected_supplier_offer_id: payload.offer.id,
        justification: payload.justification ?? null,
        considered_offers: payload.consideredOffers,
      })
      .eq('id', payload.itemId)
    if (updateError) {
      toast.error('Failed to save supplier selection.')
      return false
    }
    const item = currentDraft.value?.items.find((i) => i.id === payload.itemId)
    if (item) {
      item.selected_supplier_offer_id = payload.offer.id
      item.justification = payload.justification ?? null
      item.considered_offers = payload.consideredOffers
      item.supplier_id = payload.offer.supplier_id ?? null // NEW
      item.supplier_name = payload.offer.supplier_name ?? null
      item.unit_price = payload.offer.cost_price_per_unit
      item.expiry_date = payload.offer.expiry_date
    }
    return true
  }

  async function updateRemarks(draftId: number, remarks: string) {
    const { error: updateError } = await supabase
      .from('draft_purchase_requisitions')
      .update({ remarks, updated_at: new Date().toISOString() })
      .eq('id', draftId)
    if (updateError) {
      toast.error('Failed to update remarks.')
      return false
    }
    if (currentDraft.value?.id === draftId) currentDraft.value.remarks = remarks
    return true
  }

  async function deleteDraft(draftId: number) {
    const { error: deleteError } = await supabase
      .from('draft_purchase_requisitions')
      .delete()
      .eq('id', draftId)
    if (deleteError) {
      toast.error('Failed to delete draft.')
      return false
    }
    drafts.value = drafts.value.filter((d) => d.id !== draftId)
    toast.success('Draft deleted.')
    return true
  }

  // Advisory client-side mirror of submitDraft's checks — lets the review screen
  // surface warnings before the user hits submit. submitDraft re-validates
  // everything again round-trip-by-round-trip and remains authoritative.
  async function precheckDraft(draft: DraftPRType) {
    const warnings: ConvertWarning[] = []
    for (const item of draft.items) {
      if (!item.selected_supplier_offer_id) {
        warnings.push({ item_id: item.id, message: 'No supplier selected.' })
        continue
      }
      const offers = await offersStore.fetchOffersForProduct(item.product_id, true)
      const { qualified, recommended } = qualifyOffers(
        offers,
        requiredByOrToday(item.required_by_date),
      )
      if (!qualified.some((o) => o.id === item.selected_supplier_offer_id)) {
        warnings.push({ item_id: item.id, message: 'Selected supplier no longer qualifies.' })
      } else if (recommended && recommended.id !== item.selected_supplier_offer_id) {
        warnings.push({
          item_id: item.id,
          message: `A cheaper qualifying offer is now available (${recommended.supplier_name}).`,
        })
      }
    }
    return warnings
  }

  // Converts a draft into one real PR PER WINNING SUPPLIER — items sharing a
  // supplier are grouped onto the same PR, a different supplier gets its own.
  // JS-over-RPC (matches canvassData.commitToPRs's own convention): re-queries
  // live supplier_offers per line before writing anything, then mints PR
  // numbers the same dual-scan way (reference_no + requisition_no), and rolls
  // back every PR created so far if a later one fails. Not atomic across the
  // whole batch — a crash mid-loop can leave some PRs created and others not,
  // same accepted trade-off as commitToPRs; see that store for precedent.
  async function submitDraft(draftId: number): Promise<ConvertResult> {
    loading.value = true
    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) {
      toast.error('User not authenticated.')
      loading.value = false
      return { success: false, error: 'User not authenticated.' }
    }

    const { data: draftRow, error: draftFetchError } = await supabase
      .from('draft_purchase_requisitions')
      .select('*, items:draft_pr_items(*)')
      .eq('id', draftId)
      .single()
    if (draftFetchError || !draftRow) {
      loading.value = false
      return { success: false, error: 'Draft not found.' }
    }
    if (draftRow.status === 'converted') {
      loading.value = false
      return { success: false, error: 'Draft already converted.' }
    }

    const warnings: ConvertWarning[] = []
    type ResolvedLine = {
      item_id: number; product_id: number; qty: number
      supplier_id: number; offer_id: number; unit_price: number; currency: string
      expiry_date: string | null; required_by_date: string; justification: string | null
      considered_offers: any
    }
    const resolvedLines: ResolvedLine[] = []

    // ── Phase A: re-validate every line against LIVE supplier_offers before
    // writing anything.
    for (const item of draftRow.items as any[]) {
      if (!item.qty || item.qty <= 0) {
        loading.value = false
        return { success: false, error: `Invalid quantity on item ${item.id}.` }
      }
      const { data: product } = await supabase
        .from('products').select('id').eq('id', item.product_id).maybeSingle()
      if (!product) {
        loading.value = false
        return { success: false, error: `Product no longer exists for item ${item.id}.` }
      }
      if (!item.selected_supplier_offer_id) {
        loading.value = false
        return { success: false, error: `No supplier selected for item ${item.id}.` }
      }

      const { data: offer } = await supabase
        .from('supplier_offers').select('*').eq('id', item.selected_supplier_offer_id).maybeSingle()
      if (!offer) {
        loading.value = false
        return { success: false, error: `Selected supplier offer no longer exists for item ${item.id}.` }
      }

      const requiredBy = item.required_by_date ?? new Date().toISOString().slice(0, 10)
      const { data: allOffers } = await supabase
        .from('supplier_offers').select('*').eq('product_id', item.product_id)
      const { qualified, recommended } = qualifyOffers(allOffers ?? [], requiredBy)

      if (!qualified.some((o) => o.id === offer.id)) {
        loading.value = false
        return { success: false, error: `Selected supplier no longer qualifies for item ${item.id}.` }
      }
      if (recommended && recommended.id !== offer.id) {
        warnings.push({
          item_id: item.id,
          message: `A cheaper qualifying offer is now available (${recommended.supplier_name}).`,
        })
      }

      resolvedLines.push({
        item_id: item.id, product_id: item.product_id, qty: item.qty,
        supplier_id: offer.supplier_id, offer_id: offer.id, unit_price: offer.cost_price_per_unit,
        currency: offer.currency, expiry_date: offer.expiry_date, required_by_date: requiredBy,
        justification: item.justification, considered_offers: item.considered_offers,
      })
    }

    // Warnings, if any, were already accepted by the caller — useDraftPRReview's
    // submit() only reaches this call after a second explicit confirm past
    // precheckDraft's warnings.

    // ── Phase B: group resolved lines by supplier — one PR per winning
    // supplier, same numbering convention as canvassData.commitToPRs.
    const year = new Date().getFullYear().toString()
    const [refPRs, reqPRs] = await Promise.all([
      supabase.from('transactions').select('reference_no').like('reference_no', `PR-${year}-%`),
      supabase.from('transactions').select('requisition_no').like('requisition_no', `PR-${year}-%`),
    ])
    let seq = maxDocSeq([
      ...(refPRs.data ?? []).map((r) => r.reference_no),
      ...(reqPRs.data ?? []).map((r) => r.requisition_no),
    ])

    const supplierIds = Array.from(new Set(resolvedLines.map((l) => l.supplier_id))).sort((a, b) => a - b)
    const createdPRs: { pr_id: number; pr_no: string; supplier_id: number }[] = []

    const rollback = async () => {
      for (const pr of createdPRs) {
        await supabase.from('transaction_items').delete().eq('transaction_id', pr.pr_id)
        await supabase.from('transactions').delete().eq('id', pr.pr_id).eq('transaction_type', 'purchase_requisition')
      }
    }

    for (const supplierId of supplierIds) {
      const lines = resolvedLines.filter((l) => l.supplier_id === supplierId)
      const total = lines.reduce((sum, l) => sum + l.qty * l.unit_price, 0)

      const { data: pr, docNo: prNo, error: prError } = await insertWithDocRetry<{ id: number }>(
        async () => { seq += 1; return `PR-${year}-${String(seq).padStart(3, '0')}` },
        async (docNo) => supabase
          .from('transactions')
          .insert({
            reference_no: docNo, po_no: null, transaction_type: 'purchase_requisition',
            status: 'pending_approval', supplier_id: supplierId, total_amount: total,
            remarks: `Converted from draft PR #${draftId}`, created_by: user.id,
          })
          .select('id')
          .single(),
      )
      if (prError || !pr || !prNo) {
        await rollback()
        loading.value = false
        return { success: false, error: prError?.message || 'Failed to raise purchase requisition.' }
      }
      createdPRs.push({ pr_id: pr.id, pr_no: prNo, supplier_id: supplierId })

      const { error: itemsError } = await supabase.from('transaction_items').insert(
        lines.map((l) => ({
          transaction_id: pr.id, product_id: l.product_id, qty_stock_in: l.qty,
          unit_price: l.unit_price, line_total: l.qty * l.unit_price,
          supplier_quotes: {
            source: 'draft_pr', draft_pr_id: draftId, draft_item_id: l.item_id,
            supplier_id: l.supplier_id, supplier_offer_id: l.offer_id, unit_price: l.unit_price,
            currency: l.currency, expiry_date: l.expiry_date, required_by_date: l.required_by_date,
            justification: l.justification, considered_offers: l.considered_offers,
            decided_at: new Date().toISOString(),
          },
        })),
      )
      if (itemsError) {
        await rollback()
        loading.value = false
        return { success: false, error: itemsError.message || 'Failed to save purchase requisition line items.' }
      }
    }

    // ── Phase C: every PR written — log + mark draft converted. Best-effort,
    // doesn't roll back the PRs on failure (matches commitToPRs's own convention).
    for (const pr of createdPRs) {
      const { error: logError } = await supabase.from('logs').insert({
        created_by: user.id, action: 'draft_pr_converted',
        description: `Converted draft #${draftId} to ${pr.pr_no}`, module: 'purchasing', transaction_id: pr.pr_id,
      })
      if (logError) console.warn('submitDraft: activity log insert failed:', logError.message)
    }

    await supabase
      .from('draft_purchase_requisitions')
      .update({ status: 'converted', converted_pr_id: createdPRs[0]?.pr_id ?? null, updated_at: new Date().toISOString() })
      .eq('id', draftId)

    toast[warnings.length ? 'warning' : 'success'](
      createdPRs.length === 1 ? `${createdPRs[0].pr_no} raised.` : `${createdPRs.length} purchase requisitions raised.`,
    )
    loading.value = false
    return {
      success: true,
      pr_id: createdPRs[0]?.pr_id,
      pr_no: createdPRs.map((p) => p.pr_no).join(', '),
      warnings,
    }
  }

  async function createDraftWithSelections(payload: {
    sourceOrderId: number
    sourceOrderType: string
    remarks?: string
    rows: {
      product_id: number
      qty: number
      required_by_date: string
      offer: SupplierOfferType | null
      consideredOffers: SupplierOfferType[]
      justification: string | null
    }[]
  }) {
    const created = await createDraft({
      sourceOrderId: payload.sourceOrderId,
      sourceOrderType: payload.sourceOrderType,
      remarks: payload.remarks,
      lines: payload.rows.map((r) => ({
        product_id: r.product_id,
        qty: r.qty,
        required_by_date: r.required_by_date,
      })),
    })
    if (!created.success) return created

    const draft = await fetchDraft((created as any).draftId)
    if (draft) {
      for (const item of draft.items) {
        const row = payload.rows.find((r) => r.product_id === item.product_id)
        if (row?.offer) {
          await selectOffer({
            itemId: item.id,
            offer: row.offer,
            consideredOffers: row.consideredOffers,
            justification: row.justification,
          })
        }
      }
    }
    return created
  }

  async function fetchDraftCountsByOrder(): Promise<Record<number, number>> {
    const { data, error: fetchError } = await supabase
      .from('draft_purchase_requisitions')
      .select('source_order_id')
      .eq('status', 'draft')
      .not('source_order_id', 'is', null)
    if (fetchError) {
      handleError(fetchError, 'Failed to fetch draft counts.')
      return {}
    }
    const counts: Record<number, number> = {}
    for (const row of data ?? []) {
      counts[row.source_order_id] = (counts[row.source_order_id] ?? 0) + 1
    }
    draftCountsByOrder.value = counts
    return counts
  }

  return {
    loading,
    error,
    drafts,
    currentDraft,
    draftCountsByOrder,
    createDraft,
    fetchDrafts,
    fetchDraft,
    addItem,
    removeItem,
    setRequiredByDate,
    selectOffer,
    updateRemarks,
    deleteDraft,
    precheckDraft,
    submitDraft,
    createDraftWithSelections,
    fetchDraftCountsByOrder,
  }
})
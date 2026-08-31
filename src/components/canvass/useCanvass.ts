import { ref, computed, watch } from 'vue'
import { useToast } from 'vue-toastification'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import { useDraftPRDataStore } from '@/stores/draftPRData'
import type { SupplierOfferType } from '@/stores/supplierOffersData'
import type { CanvassableOrder, Shortfall, CanvassSelection, CanvassCommitFn, CanvassQuote } from '@/utils/canvassTypes'
import { checkQtyAgainstShortfall, bufferOver, maxQtyMultiple } from '@/utils/shortfall'
import { qualifyOffers } from '@/utils/qualification'

const toast = useToast()
const { confirmDialog } = useConfirmDialog()

export type CanvassRow = {
  product_id: number
  item_id: number
  product_name: string
  shortfall_qty: number
  order_qty: number
  required_by_date: string
  selected_offer: SupplierOfferType | null
  considered_offers: SupplierOfferType[]
  justification: string | null
}

export function useCanvass(
  order: () => CanvassableOrder | null,
  shortfall: () => Shortfall[],
  commitFn: CanvassCommitFn,
  onCreated: () => void,
  orderType: () => 'inhouse_order' | 'ethical_order',
  initialQty?: () => Record<number, number> | undefined,
) {
  const draftStore = useDraftPRDataStore()
  const loading = ref(false)
  const rows = ref<CanvassRow[]>([])

  watch(shortfall, (sf) => {
    const o = order()
    const today = new Date().toISOString().slice(0, 10)
    rows.value = (sf ?? []).map((s) => {
      const item = o?.items?.find((i) => i.product_id === s.product_id)
      return {
        product_id: s.product_id, item_id: item?.id ?? 0,
        product_name: item?.product?.product_name ?? `#${s.product_id}`,
        shortfall_qty: s.needed,
        order_qty: initialQty?.()?.[item?.id ?? 0] ?? s.needed,
        required_by_date: today,
        selected_offer: null, considered_offers: [], justification: null,
      }
    })
  }, { immediate: true })

  function onOfferSelected(rowIdx: number, payload: { offer: SupplierOfferType; consideredOffers: SupplierOfferType[]; justification: string | null }) {
    const row = rows.value[rowIdx]
    if (!row) return
    row.selected_offer = payload.offer
    row.considered_offers = payload.consideredOffers
    row.justification = payload.justification
  }

  async function validateQty(rowIdx: number) {
    const row = rows.value[rowIdx]
    if (!row) return
    const check = checkQtyAgainstShortfall(row.order_qty, row.shortfall_qty)
    if (check.status === 'below') {
      toast.warning(`Quantity can't be below the shortfall (${check.floor}).`)
      row.order_qty = check.floor
    } else if (check.status === 'over') {
      const ok = await confirmDialog(
        `Order ${row.order_qty} (over ${maxQtyMultiple}x the shortfall of ${check.floor})?`,
        { title: 'Confirm large order quantity', confirmText: 'Order it', cancelText: 'Cancel' },
      )
      if (!ok) row.order_qty = check.floor
    }
  }

  function bufferQty(row: CanvassRow) { return bufferOver(row.order_qty, row.shortfall_qty) }
  function lineTotal(row: CanvassRow) { return row.selected_offer ? row.selected_offer.cost_price_per_unit * row.order_qty : 0 }

  const readyRows = computed(() => rows.value.filter((r) => r.selected_offer != null && r.item_id > 0 && r.order_qty >= r.shortfall_qty))
  const canCommit = computed(() => rows.value.length > 0 && readyRows.value.length === rows.value.length)
  const hasSelections = computed(() => rows.value.some((r) => r.selected_offer != null))

  const prPreview = computed(() => {
    const bySupplier = new Map<number, { name: string; items: number; total: number }>()
    for (const row of readyRows.value) {
      const sid = row.selected_offer!.supplier_id
      const entry = bySupplier.get(sid) ?? { name: row.selected_offer!.supplier_name ?? `Supplier ${sid}`, items: 0, total: 0 }
      entry.items += 1
      entry.total += row.selected_offer!.cost_price_per_unit * row.order_qty
      bySupplier.set(sid, entry)
    }
    return Array.from(bySupplier.entries()).map(([supplier_id, v]) => ({ supplier_id, ...v }))
  })

  function rowOfferQualifies(row: CanvassRow) {
    const { qualified } = qualifyOffers(row.considered_offers, row.required_by_date)
    return qualified.some((offer) => offer.id === row.selected_offer?.id)
  }

  async function commit() {
    const o = order()
    if (!o || !canCommit.value) { toast.warning('Select a supplier for every product before submitting.'); return }

    const disqualifiedRow = readyRows.value.find((row) => !rowOfferQualifies(row))
    if (disqualifiedRow) {
      const reason = disqualifiedRow.selected_offer?.expiry_date
        ? `that supplier's expiry is too soon for ${disqualifiedRow.required_by_date}`
        : 'that supplier has no batch expiry on file'
      toast.error(`${disqualifiedRow.product_name}: ${reason} — re-open Compare and fix it before submitting.`)
      return
    }

    const selections: CanvassSelection[] = readyRows.value.map((row) => {
      const { qualified, disqualified } = qualifyOffers(row.considered_offers, row.required_by_date)
      const qualifiedIds = new Set(qualified.map((o) => o.id))
      const monthsById = new Map([...qualified, ...disqualified].map((o) => [o.id, o.months_to_expiry]))

      return {
        item_id: row.item_id, product_id: row.product_id,
        supplier_id: row.selected_offer!.supplier_id, unit_price: row.selected_offer!.cost_price_per_unit,
        qty: row.order_qty,
        canvass: row.considered_offers.map((o): CanvassQuote => ({
          supplier_id: o.supplier_id, supplier_name: o.supplier_name ?? '', price: o.cost_price_per_unit,
          expiry_date: o.expiry_date ?? '',
          months_to_expiry: monthsById.get(o.id) ?? 0,
          is_valid: qualifiedIds.has(o.id),
        })),
      }
    })

    loading.value = true
    const result = await commitFn(o.id, selections)
    loading.value = false
    if (result.success) onCreated()
    else if (!result.error) toast.error('Failed to raise purchase requisitions. Please try again.')
  }

  async function saveAsDraft() {
    const o = order()
    if (!o) return { success: false }
    const withOffers = rows.value.filter((r) => r.selected_offer != null)
    if (!withOffers.length) { toast.warning('Select at least one supplier before saving as draft.'); return { success: false } }

    loading.value = true
    const result = await draftStore.createDraftWithSelections({
      sourceOrderId: o.id, sourceOrderType: orderType(),
      rows: rows.value.map((r) => ({
        product_id: r.product_id, qty: r.order_qty, shortfall_qty: r.shortfall_qty,
        required_by_date: r.required_by_date,
        offer: r.selected_offer, consideredOffers: r.considered_offers, justification: r.justification,
      })),
    })
    loading.value = false
    if (result.success) toast.success('Saved as draft PR.')
    return result // { success, draftId }
  }

  async function autoSaveDraft() {
    if (!hasSelections.value) return { success: false }
    return saveAsDraft()
  }

  async function init() {} // supplier_offers are fetched lazily per-compare-dialog now

  return {
    loading, rows, onOfferSelected, validateQty, bufferQty, lineTotal,
    readyRows, canCommit, hasSelections, prPreview, commit, saveAsDraft, autoSaveDraft, init,
  }
}
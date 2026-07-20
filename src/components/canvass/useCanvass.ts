import { ref, computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useToast } from 'vue-toastification'
import { useSuppliersDataStore } from '@/stores/suppliersData'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import { parseMonthYear, formatMonthYear, maskMonthYearInput } from '@/utils/helpers'
import type { CanvassableOrder, Shortfall, CanvassQuote, CanvassSelection, CanvassCommitFn } from '@/utils/canvassTypes'

const toast = useToast()
const { confirmDialog } = useConfirmDialog()

// Hard business rule: a quoted batch must have at least this many months left
// before expiry to be eligible (measured from today / the canvass date).
const MIN_MONTHS_TO_EXPIRY = 18
// Soft cap: ordering beyond this multiple of the shortfall asks for confirmation.
const MAX_QTY_MULTIPLE = 3
// Batch expiry only ever needs month/year (matches how pharma packaging is
// labeled, e.g. "EXP 06/2027") — entered as a masked "MM/YYYY" text field.
// Clamp absurd far-future years on blur.
const MAX_EXPIRY_YEARS_OUT = 15

type CanvassRow = {
  product_id: number
  item_id: number
  product_name: string
  shortfall_qty: number
  order_qty: number                  // editable (buffer / good-deal bulk)
  quotes: CanvassQuote[]
  selected_supplier_id: number | null  // winner (auto = cheapest valid, overridable)
}

// Whole-month difference from today to the quoted "MM/YYYY" expiry.
function monthsUntil(dateStr: string): number {
  const exp = parseMonthYear(dateStr)
  if (!exp) return 0
  const today = new Date()
  return (exp.getFullYear() - today.getFullYear()) * 12 + (exp.getMonth() - today.getMonth())
}

export function useCanvass(
  order: () => CanvassableOrder | null,
  shortfall: () => Shortfall[],
  commitFn: CanvassCommitFn,
  onCreated: () => void,
) {
  const suppliersStore = useSuppliersDataStore()
  const { suppliers } = storeToRefs(suppliersStore)

  const loading = ref(false)
  const rows = ref<CanvassRow[]>([])

  const supplierOptions = computed(() =>
    suppliers.value
      .filter((s) => s.is_active !== false)
      .map((s) => ({ title: s.name ?? `Supplier ${s.id}`, value: s.id })))

  // Rebuild the canvass rows from the current shortfall whenever it changes.
  watch(shortfall, (sf) => {
    const o = order()
    rows.value = (sf ?? []).map((s) => {
      const item = o?.items?.find((i) => i.product_id === s.product_id)
      return {
        product_id: s.product_id,
        item_id: item?.id ?? 0,
        product_name: item?.product?.product_name ?? `#${s.product_id}`,
        shortfall_qty: s.needed,
        order_qty: s.needed,
        quotes: [],
        selected_supplier_id: null,
      }
    })
  }, { immediate: true })

  function addQuote(rowIdx: number) {
    rows.value[rowIdx]?.quotes.push({
      supplier_id: null, supplier_name: '', price: 0,
      expiry_date: '', months_to_expiry: 0, is_valid: false,
    })
  }

  function removeQuote(rowIdx: number, qIdx: number) {
    const row = rows.value[rowIdx]
    if (!row) return
    const removed = row.quotes.splice(qIdx, 1)[0]
    if (removed && row.selected_supplier_id === removed.supplier_id) {
      row.selected_supplier_id = recommendedSupplierId(row)
    }
  }

  // Recompute a quote's derived fields, then refresh the auto-winner.
  function onQuoteChange(rowIdx: number, qIdx: number) {
    const row = rows.value[rowIdx]
    const q = row?.quotes[qIdx]
    if (!row || !q) return
    q.supplier_name = supplierOptions.value.find((o) => o.value === q.supplier_id)?.title ?? ''
    q.months_to_expiry = monthsUntil(q.expiry_date)
    q.is_valid = q.supplier_id != null && q.price > 0 && q.months_to_expiry >= MIN_MONTHS_TO_EXPIRY
    // Auto-pick cheapest valid unless the user already chose a still-valid one.
    const current = row.quotes.find((x) => x.supplier_id === row.selected_supplier_id)
    if (!current || !current.is_valid) row.selected_supplier_id = recommendedSupplierId(row)
  }

  // Live-mask the MM/YYYY field as the user types (auto-inserts the slash),
  // then refresh the quote's derived fields.
  function onExpiryInput(rowIdx: number, qIdx: number, raw: string) {
    const row = rows.value[rowIdx]
    const q = row?.quotes[qIdx]
    if (!row || !q) return
    q.expiry_date = maskMonthYearInput(raw)
    onQuoteChange(rowIdx, qIdx)
  }

  // On blur, clamp an absurd far-future year. Leave partial/invalid text alone
  // so the user can keep editing (it just won't pass the validity check).
  function onExpiryBlur(rowIdx: number, qIdx: number) {
    const row = rows.value[rowIdx]
    const q = row?.quotes[qIdx]
    if (!row || !q) return
    const exp = parseMonthYear(q.expiry_date)
    if (!exp) return
    const max = new Date()
    max.setFullYear(max.getFullYear() + MAX_EXPIRY_YEARS_OUT)
    if (exp > max) {
      toast.warning(`Batch expiry can't be more than ${MAX_EXPIRY_YEARS_OUT} years out.`)
      q.expiry_date = formatMonthYear(max)
      onQuoteChange(rowIdx, qIdx)
    }
  }

  // Cheapest valid quote's supplier (the system recommendation).
  function recommendedSupplierId(row: CanvassRow): number | null {
    const valid = row.quotes.filter((q) => q.is_valid)
    if (!valid.length) return null
    return valid.reduce((best, q) => (q.price < best.price ? q : best)).supplier_id ?? null
  }

  function isRecommended(row: CanvassRow, q: CanvassQuote): boolean {
    return q.supplier_id != null && q.supplier_id === recommendedSupplierId(row)
  }

  // Suppliers already picked by OTHER quotes in the same product row are hidden
  // from this quote's dropdown — a supplier can't be canvassed twice for one item.
  function availableSupplierOptions(rowIdx: number, qIdx: number) {
    const row = rows.value[rowIdx]
    if (!row) return supplierOptions.value
    const takenElsewhere = new Set(
      row.quotes
        .filter((_, i) => i !== qIdx)
        .map((q) => q.supplier_id)
        .filter((id): id is number => id != null),
    )
    return supplierOptions.value.filter((o) => !takenElsewhere.has(o.value))
  }

  function selectSupplier(rowIdx: number, supplierId: number | null) {
    const row = rows.value[rowIdx]
    if (row) row.selected_supplier_id = supplierId
  }

  // Must be called on @blur, not @update:model-value — the latter fires on every
  // keystroke, so clearing the field to type a new number briefly produces a
  // value below shortfall_qty mid-edit, which used to toast-spam and clamp the
  // field back before the user could finish typing.
  async function validateQty(rowIdx: number) {
    const row = rows.value[rowIdx]
    if (!row) return
    if (row.order_qty < row.shortfall_qty) {
      toast.warning(`Quantity can't be below the shortfall (${row.shortfall_qty}).`)
      row.order_qty = row.shortfall_qty
    } else if (row.order_qty > row.shortfall_qty * MAX_QTY_MULTIPLE) {
      const ok = await confirmDialog(
        `Order ${row.order_qty} (over ${MAX_QTY_MULTIPLE}x the shortfall of ${row.shortfall_qty})?`,
        { title: 'Confirm large order quantity', confirmText: 'Order it', cancelText: 'Cancel' },
      )
      if (!ok) {
        row.order_qty = row.shortfall_qty
      }
    }
  }

  function bufferQty(row: CanvassRow): number {
    return Math.max(0, row.order_qty - row.shortfall_qty)
  }

  function lineTotal(row: CanvassRow): number {
    const q = row.quotes.find((x) => x.supplier_id === row.selected_supplier_id)
    return q ? q.price * row.order_qty : 0
  }

  // Rows that are fully ready to commit (a valid winning quote is selected).
  const readyRows = computed(() =>
    rows.value.filter((row) => {
      const q = row.quotes.find((x) => x.supplier_id === row.selected_supplier_id)
      return q != null && q.is_valid && row.item_id > 0 && row.order_qty >= row.shortfall_qty
    }))

  const canCommit = computed(() => readyRows.value.length > 0)

  // Group-by-supplier preview so the user sees how many PRs will be raised.
  const prPreview = computed(() => {
    const bySupplier = new Map<number, { name: string; items: number; total: number }>()
    for (const row of readyRows.value) {
      const q = row.quotes.find((x) => x.supplier_id === row.selected_supplier_id)!
      const sid = q.supplier_id!
      const entry = bySupplier.get(sid) ?? { name: q.supplier_name, items: 0, total: 0 }
      entry.items += 1
      entry.total += q.price * row.order_qty
      bySupplier.set(sid, entry)
    }
    return Array.from(bySupplier.entries()).map(([supplier_id, v]) => ({ supplier_id, ...v }))
  })

  async function commit() {
    const o = order()
    if (!o) return
    if (!canCommit.value) { toast.warning('Add at least one valid supplier quote.'); return }

    const selections: CanvassSelection[] = readyRows.value.map((row) => {
      const q = row.quotes.find((x) => x.supplier_id === row.selected_supplier_id)!
      return {
        item_id: row.item_id,
        product_id: row.product_id,
        supplier_id: q.supplier_id!,
        unit_price: q.price,
        qty: row.order_qty,
        canvass: row.quotes,
      }
    })

    loading.value = true
    const result = await commitFn(o.id, selections)
    loading.value = false
    if (result.success) {
      onCreated()
    } else {
      toast.error('Failed to raise purchase requisitions. Please try again.')
    }
  }

  async function init() {
    if (!suppliers.value.length) await suppliersStore.fetchSuppliers({ activeOnly: true })
  }

  return {
    loading, rows, supplierOptions,
    addQuote, removeQuote, onQuoteChange, isRecommended, selectSupplier, availableSupplierOptions,
    validateQty, onExpiryInput, onExpiryBlur, bufferQty, lineTotal, recommendedSupplierId,
    readyRows, canCommit, prPreview, commit, init,
    MIN_MONTHS_TO_EXPIRY,
  }
}

import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'
import html2pdf from 'html2pdf.js'
import { useToast } from 'vue-toastification'
import { useProductsDataStore } from '@/stores/productsData'
import type { ProductType } from '@/stores/productsData'
import { companyFor, companyOptions, defaultCompanyFor } from '@/utils/companyProfiles'
import type { CompanyKey } from '@/utils/companyProfiles'

// A printable draft of an In-House or Ethical order, before it is a real
// document: what was asked for, from which batch, at what price.
//
// Shared by both modules so the two printouts cannot drift. Each module maps
// its own order into a DraftPrintDocument; this fills in each product's SKU,
// batch and expiry (every products row is ONE batch) and does the arithmetic.
//
// Customer-facing by default. `includeCost` adds company cost and margin for
// an internal copy — off unless someone turns it on, so a copy handed to a
// customer never carries our cost by accident.

export type DraftPrintLine = {
  product_id: number | null
  product_name: string
  unit: string | null
  qty: number
  unit_price: number
  /** Company cost per unit, when the order recorded one; else the product's. */
  cost_price: number | null
}

export type DraftPrintDocument = {
  /** e.g. 'IH-2026-018'; null for a draft that has no number yet. */
  docNo: string | null
  date: string | null
  customer: {
    name?: string | null
    address?: string | null
    contact_no?: string | null
    tin_number?: string | null
  } | null
  /** Extra header lines — Govt PO, sales rep, terms. Blank values are skipped. */
  meta: { label: string; value: string | null | undefined }[]
  lines: DraftPrintLine[]
  /** On-invoice discount, already in pesos (Ethical). */
  discount?: number
  remarks?: string | null
  /** Shown on the dialog, not the printout — e.g. unsaved counter-offer edits. */
  notice?: string | null
}

export type DraftPrintRow = DraftPrintLine & {
  sku: string | null
  batch_no: string | null
  expiry_date: string | null
  amount: number
  line_cost: number | null
}

export function useDraftOrderPrint(
  getDocument: () => DraftPrintDocument | null,
  open: Ref<boolean>,
  /** Whether cost may be shown at all — see DraftOrderPrintDialog's allowCost. */
  costAllowed: () => boolean = () => false,
) {
  const toast = useToast()
  const productsStore = useProductsDataStore()

  const companyKey = ref<CompanyKey>(defaultCompanyFor('draft_order'))
  const company = computed(() => companyFor(companyKey.value))
  const costSwitch = ref(false)
  // Never true where cost is not allowed, whatever the switch says.
  const includeCost = computed({
    get: () => costAllowed() && costSwitch.value,
    set: (value: boolean) => { costSwitch.value = value },
  })
  const loadingProducts = ref(false)
  const products = ref<Record<number, ProductType>>({})

  /** Look up batch, expiry and SKU for the lines each time the dialog opens. */
  async function loadProducts() {
    const ids = [...new Set((getDocument()?.lines ?? [])
      .map((l) => l.product_id)
      .filter((id): id is number => id != null))]
    if (!ids.length) { products.value = {}; return }
    loadingProducts.value = true
    const rows = await productsStore.fetchProductsByIds(ids)
    products.value = Object.fromEntries(rows.map((p) => [p.id, p]))
    loadingProducts.value = false
  }

  // Back to the customer copy on every open: the cost toggle must never be
  // left on from the last print.
  watch(open, (isOpen) => {
    if (!isOpen) return
    costSwitch.value = false
    void loadProducts()
  }, { immediate: true })

  const rows = computed<DraftPrintRow[]>(() =>
    (getDocument()?.lines ?? [])
      .filter((l) => l.product_id != null && l.qty > 0)
      .map((l) => {
        const product = l.product_id != null ? products.value[l.product_id] : undefined
        const cost = l.cost_price ?? product?.cost_price ?? null
        return {
          ...l,
          unit: l.unit || product?.unit || null,
          sku: product?.sku ?? null,
          batch_no: product?.batch_no ?? null,
          expiry_date: product?.expiry_date ?? null,
          amount: l.qty * l.unit_price,
          line_cost: cost == null ? null : l.qty * cost,
        }
      }))

  /** Lines whose product could not be looked up — printed without batch/expiry. */
  const missingDetails = computed(() =>
    rows.value.filter((r) => r.product_id != null && !products.value[r.product_id]).length,
  )

  const subtotal = computed(() => rows.value.reduce((s, r) => s + r.amount, 0))
  const discount = computed(() => getDocument()?.discount ?? 0)
  const total = computed(() => subtotal.value - discount.value)
  /** Lines with no recorded cost are left out of the margin, and flagged. */
  const missingCost = computed(() => rows.value.some((r) => r.line_cost == null))
  const totalCost = computed(() => rows.value.reduce((s, r) => s + (r.line_cost ?? 0), 0))
  const margin = computed(() => total.value - totalCost.value)
  const marginPct = computed(() => (total.value > 0 ? (margin.value / total.value) * 100 : 0))

  const meta = computed(() => (getDocument()?.meta ?? []).filter((m) => m.value != null && String(m.value).trim() !== ''))

  async function downloadPdf(el: HTMLElement | null) {
    const doc = getDocument()
    if (!el || !doc) return
    el.querySelectorAll('div, td, th, span, p').forEach((child) => {
      ;(child as HTMLElement).style.color = '#000000'
    })
    const name = `${doc.docNo ?? 'draft-order'}-draft${includeCost.value ? '-internal' : ''}`
    await html2pdf()
      .set({
        margin: 10,
        filename: `${name}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      })
      .from(el)
      .save()
    toast.success(`${name}.pdf generated.`)
  }

  return {
    companyKey, company, companyOptions, includeCost, loadingProducts,
    rows, subtotal, discount, total, missingCost, totalCost, margin, marginPct, meta, missingDetails,
    downloadPdf,
  }
}

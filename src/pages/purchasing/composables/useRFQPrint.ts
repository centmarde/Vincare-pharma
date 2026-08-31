import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import html2pdf from 'html2pdf.js'
import { useToast } from 'vue-toastification'
import { useProcurementDataStore, type ProcurementRequestType } from '@/stores/procurementData'
import { useSuppliersDataStore } from '@/stores/suppliersData'
import { useAuthUserStore } from '@/stores/authUser'
import { companyFor, companyOptions, defaultCompanyFor } from '@/utils/companyProfiles'
import type { CompanyKey } from '@/utils/companyProfiles'

/**
 * Request for Quotation — the shortfall as a costing sheet for suppliers.
 *
 * NOT a purchase order: prices are left blank for the supplier to fill in, and
 * nothing here commits to buying. It lives on Purchasing's Procurement Requests
 * queue rather than the In-House/Ethical order dialogs, so the July rule that
 * ordering staff never deal with suppliers still holds.
 *
 * The sheet carries a reference number but is NOT stored as a document — see
 * `rfqNo` below. Each print writes one `logs` row for audit.
 */
export function useRFQPrint(request: () => ProcurementRequestType | null) {
  const toast = useToast()
  const procurementStore = useProcurementDataStore()
  const suppliersStore = useSuppliersDataStore()
  const authStore = useAuthUserStore()
  const { suppliers } = storeToRefs(suppliersStore)

  const printArea = ref<HTMLElement | null>(null)
  const generating = ref(false)

  const companyKey = ref<CompanyKey>(defaultCompanyFor('rfq'))
  const company = computed(() => companyFor(companyKey.value))

  // Blank by default so one sheet can be photocopied and sent to several
  // suppliers. Optional because the purchaser sometimes targets just one.
  const supplierId = ref<number | null>(null)
  const supplierOptions = computed(() =>
    suppliers.value
      .filter((s) => s.is_active)
      .map((s) => ({ title: s.name ?? `Supplier ${s.id}`, value: s.id })))
  const supplierName = computed(() =>
    supplierId.value == null
      ? ''
      : suppliers.value.find((s) => s.id === supplierId.value)?.name ?? '')

  // Shown by default. Hiding it gets a list price rather than a volume price,
  // which is occasionally what the purchaser wants — but it is the exception.
  const showQuantity = ref(true)

  const remarks = ref('')

  /**
   * Quantity per line, prefilled from the shortfall and editable so the
   * purchaser can ask for buffer. Keyed by item_id.
   */
  const quantities = ref<Record<number, number>>({})

  watch(request, (req) => {
    quantities.value = {}
    supplierId.value = null
    remarks.value = ''
    showQuantity.value = true
    if (!req) return
    for (const line of req.lines) quantities.value[line.item_id] = line.needed
  }, { immediate: true })

  const lines = computed(() => (request()?.lines ?? []).map((line) => ({
    ...line,
    qty: quantities.value[line.item_id] ?? line.needed,
  })))

  /**
   * Derived from the order the same way `dr_no` is — swap the prefix, keep the
   * number (IH-2026-009 -> RFQ-2026-009). Reprints deliberately carry the SAME
   * number: it is one request for costing, however many copies are sent.
   * Nothing is stored, so there is no sheet to look up later — only the log.
   */
  const rfqNo = computed(() => {
    const orderNo = request()?.order_no
    if (!orderNo) return 'RFQ'
    const parts = orderNo.split('-')
    return parts.length >= 2 ? `RFQ-${parts.slice(1).join('-')}` : `RFQ-${orderNo}`
  })

  const totalUnits = computed(() => lines.value.reduce((sum, l) => sum + (Number(l.qty) || 0), 0))

  // Buffer above the shortfall is legitimate (bulk pricing), but a wild figure
  // is usually a typo. Mirrors the canvass's own 3x guardrail rather than
  // inventing a second rule.
  const overBufferLines = computed(() =>
    lines.value.filter((l) => l.needed > 0 && l.qty > l.needed * 3))

  const belowShortfallLines = computed(() =>
    lines.value.filter((l) => l.qty < l.needed))

  /**
   * Generates and downloads an RFQ PDF, then logs the action
   */
  async function printRFQ() {
    const req = request()
    if (!req || !printArea.value) return
    if (!lines.value.length) {
      toast.warning('Nothing short on this order to request costing for.')
      return
    }

    generating.value = true
    try {
      // html2canvas renders computed colours literally, so force black text
      // regardless of the app theme — same as the other print dialogs.
      printArea.value.querySelectorAll('div, td, th, span, p').forEach((child) => {
        ;(child as HTMLElement).style.color = '#000000'
      })

      await html2pdf()
        .set({
          margin: 10,
          filename: `${rfqNo.value}${supplierName.value ? `-${supplierName.value}` : ''}.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        })
        .from(printArea.value)
        .save()

      const { user } = await authStore.getCurrentUser()
      if (user) {
        await procurementStore.logRfqPrinted(
          req.order_type, req.order_id, rfqNo.value,
          `${lines.value.length} item(s), ${totalUnits.value} unit(s)${supplierName.value ? ` — addressed to ${supplierName.value}` : ' — blank vendor'}`,
          user.id,
        )
      }

      toast.success(`${rfqNo.value} generated.`)
    } finally {
      generating.value = false
    }
  }

  /**
   * Initializes the composable by fetching suppliers if not already loaded
   */
  async function init() {
    if (!suppliers.value.length) await suppliersStore.fetchSuppliers()
  }

  return {
    printArea, generating,
    companyKey, company, companyOptions,
    supplierId, supplierOptions, supplierName,
    showQuantity, remarks, quantities, lines, rfqNo, totalUnits,
    overBufferLines, belowShortfallLines,
    printRFQ, init,
  }
}

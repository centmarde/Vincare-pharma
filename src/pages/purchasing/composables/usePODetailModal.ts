import { computed, ref, nextTick } from 'vue'
import { useToast } from 'vue-toastification'
import { useSuppliersDataStore } from '@/stores/suppliersDataStore'
import html2pdf from 'html2pdf.js'
import type { PurchaseOrder } from '@/stores/purchaseOrderData'
import type { PR } from '@/stores/purchaseRequisition'

export const company = {
  name:    'VINCARE PHARMA',
  address: '2F N.B. BLDG., Ochua Avenue',
  city:    'Butuan City',
  email:   'vincare001@gmail.com',
  contact: '0968-879-5589',
} as const

export function usePODetailModal(
  props: { po: PurchaseOrder | null; pr: PR | null },
  emit: (e: 'update:modelValue', value: boolean) => void,
) {
  const toast       = useToast()
  const printArea   = ref<HTMLElement | null>(null)
  const supplierStore = useSuppliersDataStore()

  const poNumber = computed(
    () => props.po?.po_number ?? props.pr?.pr_number ?? 'PurchaseOrder',
  )

  const emptyRows = computed(() => Math.max(0, 7 - (props.pr?.items.length ?? 0)))

  const resolvedSupplier = computed(
    () => supplierStore.suppliers.find(s => s.id === props.po?.supplier_id) ?? null,
  )

  async function handlePrint() {
    await nextTick()
    const el = printArea.value
    if (!el) return

    // Swap to light theme
    el.classList.add('v-theme--light')
    el.classList.remove('v-theme--dark')
    el.querySelectorAll('.v-theme--dark').forEach(child => {
      child.classList.replace('v-theme--dark', 'v-theme--light')
    })

    // Force black text on all text elements
    el.querySelectorAll('div, td, th, span, p').forEach(child => {
      ;(child as HTMLElement).style.color = '#000000'
    })

    // Keep table header white text
    el.querySelectorAll('.po-table thead th').forEach(th => {
      ;(th as HTMLElement).style.color = '#ffffff'
    })

    // Keep PO number blue/primary
    el.querySelectorAll('.text-primary').forEach(el => {
      ;(el as HTMLElement).style.color = '#1565c0'
    })

    // Force img src to absolute URL for html2canvas
    el.querySelectorAll('img').forEach(img => {
      img.src = img.src
      img.crossOrigin = 'anonymous'
    })

    await html2pdf()
      .set({
        margin: 10,
        filename: `${poNumber.value}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff',
          logging: false,
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      })
      .from(el)
      .save()

    emit('update:modelValue', false)
    await nextTick()
    toast.success(`${poNumber.value} Purchase Order PDF generated successfully!`)
  }

  return {
    printArea,
    poNumber,
    emptyRows,
    resolvedSupplier,
    handlePrint,
  }
}
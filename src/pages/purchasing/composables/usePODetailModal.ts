import { useSuppliersDataStore, type SupplierType } from '@/stores/suppliersData'
import type { PR } from '@/stores/purchaseRequisitionData'
import { computed, ref, nextTick } from 'vue'
import { useToast } from 'vue-toastification'
import html2pdf from 'html2pdf.js'
import { storeToRefs } from 'pinia'

// ✅ Updated to match new transactions schema
export type PurchaseOrder = {
  id:           number
  reference_no: string
  po_no:        string
  requisition_no: string
  status:       string
  supplier_id:  string | null
  total_amount: number
  ship_via:     string | null
  ship_method:  string | null
  created_at:   string
  created_by:   string | null
  is_delivered: boolean
  requisition_id: number | null
  updated_at:   string | null
}

export const company = {
  name:    'VINCARE PHARMA',
  address: '2F N.B. BLDG., Ochua Avenue, Butuan City',
  email:   'vincare001@gmail.com',
  contact: '0968-879-5589',
} as const

export function usePODetailModal(
  props: { po: PurchaseOrder | null; pr: PR | null },
  emit: (e: 'update:modelValue', value: boolean) => void,
) {
  const toast         = useToast()
  const printArea     = ref<HTMLElement | null>(null)
  const supplierStore = useSuppliersDataStore()
  const { suppliers } = storeToRefs(supplierStore)

  const poNumber = computed(() =>
    props.po?.reference_no ?? props.pr?.po_no ?? 'PurchaseOrder'
  )

  const emptyRows = computed(() =>
    Math.max(0, 7 - (props.pr?.items.length ?? 0))
  )

    const uniqueSuppliers = computed(() => {
    if (!props.pr?.items?.length) return []
    const names = [...new Set(props.pr.items.map(i => i.supplier_name).filter(Boolean))]
    return names
      .map(name => suppliers.value.find(s => s.name === name))
      .filter(Boolean) as SupplierType[]
    })

  async function handlePrint() {
    await nextTick()
    const el = printArea.value
    if (!el) return

    el.classList.add('v-theme--light')
    el.classList.remove('v-theme--dark')
    el.querySelectorAll('.v-theme--dark').forEach(child => {
      child.classList.replace('v-theme--dark', 'v-theme--light')
    })

    el.querySelectorAll('div, td, th, span, p').forEach(child => {
      ;(child as HTMLElement).style.color = '#000000'
    })

    el.querySelectorAll('.po-table thead th').forEach(th => {
      ;(th as HTMLElement).style.color = '#ffffff'
    })

    el.querySelectorAll('.text-primary').forEach(el => {
      ;(el as HTMLElement).style.color = '#1565c0'
    })

    el.querySelectorAll('img').forEach(img => {
      img.src        = img.src
      img.crossOrigin = 'anonymous'
    })

    await html2pdf()
      .set({
        margin:      10,
        filename:    `${poNumber.value}.pdf`,
        image:       { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false },
        jsPDF:       { unit: 'mm', format: 'a4', orientation: 'portrait' },
      })
      .from(el)
      .save()

    emit('update:modelValue', false)
    await nextTick()
    toast.success(`${poNumber.value} PDF generated successfully!`)
  }

  return {
    printArea,
    poNumber,
    emptyRows,
    uniqueSuppliers,
    handlePrint,
    company,
  }
}
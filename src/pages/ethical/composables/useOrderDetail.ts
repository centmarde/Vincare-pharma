import { ref, computed, watch } from 'vue'
import { useToast } from 'vue-toastification'
import { useEthicalDataStore } from '@/stores/ethicalData'
import type { EthicalOrderType, CollectionType } from '@/stores/ethicalData'

const toast = useToast()

export function useOrderDetail(order: () => EthicalOrderType | undefined) {
  const ethical = useEthicalDataStore()

  const loading = ref(false)
  const collectionAmount = ref(0)
  const collectionMethod = ref('')
  const collectionReference = ref('')
  const collectionRemarks = ref('')

  const isInvoiced = computed(() => order()?.status === 'invoiced')
  const isPartial = computed(() => order()?.status === 'partial')
  const isPaid = computed(() => order()?.status === 'paid')
  const isCancellable = computed(() => isInvoiced.value)

  const isOverdue = computed(() => {
    const o = order()
    if (!o?.due_date || o.status === 'paid') return false
    return new Date(o.due_date) < new Date()
  })

  const balance = computed(() => {
    const o = order()
    return Math.max(0, (o?.total_amount ?? 0) - (o?.amount_paid ?? 0))
  })

  const collections = computed(() => ethical.collections)

  watch(
    () => order(),
    async (o) => {
      if (o?.id) {
        await ethical.fetchCollections(o.id)
      }
    },
    { immediate: true },
  )

  async function recordCollection() {
    const o = order()
    if (!o?.id) return
    if (collectionAmount.value <= 0) { toast.warning('Amount must be positive'); return }
    if (collectionAmount.value > balance.value) { toast.warning('Amount exceeds balance'); return }

    loading.value = true
    const result = await ethical.recordCollection({
      orderId: o.id,
      amount: collectionAmount.value,
      method: collectionMethod.value || undefined,
      reference: collectionReference.value || undefined,
      remarks: collectionRemarks.value || undefined,
    })
    loading.value = false
    if (result.success) {
      collectionAmount.value = 0
      collectionMethod.value = ''
      collectionReference.value = ''
      collectionRemarks.value = ''
    }
  }

  async function cancelOrder() {
    const o = order()
    if (!o?.id) return
    if (!confirm('Cancel this order and restore stock?')) return

    loading.value = true
    const result = await ethical.cancelOrder(o.id, 'Cancelled by user')
    loading.value = false
  }

  async function markCommissionPaid(collection: CollectionType) {
    if (!collection.id) return
    loading.value = true
    await ethical.markCommissionPaid(collection.id)
    loading.value = false
  }

  return {
    loading,
    collectionAmount,
    collectionMethod,
    collectionReference,
    collectionRemarks,
    isInvoiced,
    isPartial,
    isPaid,
    isCancellable,
    isOverdue,
    balance,
    collections,
    recordCollection,
    cancelOrder,
    markCommissionPaid,
  }
}

import { usePurchaseRequisitionStore } from '@/stores/purchaseRequisitionData'
import type { PurchaseBreakdown } from '@/utils/computationHelpers'
import { computed, ref, watch } from 'vue'

type TransactionRow = { id: number } | null | undefined

export function usePurchaseBreakdown(getTransaction: () => TransactionRow) {
  const prStore = usePurchaseRequisitionStore()

  const breakdown = ref<PurchaseBreakdown | null>(null)

  const hasCharges = computed(() => {
    if (!breakdown.value) return false
    return (
      breakdown.value.discountAmount > 0 ||
      breakdown.value.taxAmount > 0 ||
      breakdown.value.shippingAmount > 0
    )
  })

  // The id is checked again after the fetch so a slow reply for a previously opened PR can't replace the one on screen.
  async function loadBreakdown(transaction: TransactionRow) {
    breakdown.value = null
    if (!transaction) return

    const loaded = await prStore.fetchPurchaseBreakdown(transaction.id)
    if (getTransaction()?.id === transaction.id) breakdown.value = loaded
  }

  watch(getTransaction, loadBreakdown, { immediate: true })

  return { breakdown, hasCharges }
}

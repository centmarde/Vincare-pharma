import { ref } from 'vue'
import { supabase } from '@/lib/supabase'

export function useEligibleProducts() {
  const eligibleProductIds = ref<Set<number>>(new Set())
  const loading = ref(false)
  const error = ref('')

  const fetchEligibleProductIds = async () => {
    loading.value = true
    error.value = ''
    try {
      const { data, error: err } = await supabase
        .from('transactions')
        .select('transaction_items!inner(product_id)')
        .eq('transaction_type', 'stock_in')

      if (err) throw err

      const productIds = new Set<number>()
      if (data) {
        data.forEach((tx: any) => {
          if (tx.transaction_items && Array.isArray(tx.transaction_items)) {
            tx.transaction_items.forEach((item: any) => {
              if (item.product_id) productIds.add(item.product_id)
            })
          }
        })
      }

      eligibleProductIds.value = productIds
      console.log('[useEligibleProducts] Eligible product IDs from stock_in transactions:', [...productIds])
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch eligible products'
      error.value = msg
      console.error('[useEligibleProducts]', msg)
      eligibleProductIds.value = new Set()
    } finally {
      loading.value = false
    }
  }

  return {
    eligibleProductIds,
    loading,
    error,
    fetchEligibleProductIds,
  }
}

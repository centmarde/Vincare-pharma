import { supabase } from '@/lib/supabase'
import { ref } from 'vue'
import { defineStore } from 'pinia'

export interface BestSellingProduct {
  product_id: string
  product_name: string
  sku: string
  category: string
  transaction_count: number
  total_qty_sold: number
  total_revenue: number
  rank: number
}

export interface FetchParams {
  startDate?: string
  endDate?: string
  limit?: number
}

export const useBestSellingProducts = defineStore('bestSellingProducts', () => {
  const items = ref<BestSellingProduct[]>([])
  const loading = ref(false)
  const error = ref('')

  async function fetchBestSellingProducts({
    startDate,
    endDate,
    limit = 10,
  }: FetchParams = {}) {
    loading.value = true
    error.value = ''
    const { data, error: err } = await supabase.rpc('get_best_selling_products', {
      p_start_date: startDate ?? null,
      p_end_date: endDate ?? null,
      p_limit: limit,
    })

    if (err) {
      error.value = err.message
      items.value = []
    } else {
      items.value = data ?? []
    }
    loading.value = false
    return items.value
  }

  return {
    items,
    loading,
    error,
    fetchBestSellingProducts,
  }
})
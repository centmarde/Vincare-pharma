import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { usePurchaseRequisitionStore } from '@/stores/purchaseRequisition'
import { usePurchaseOrderStore } from '@/stores/purchaseOrderData'
import { supabase } from '@/lib/supabase'

// Debounce function to prevent rapid refetches
function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(() => func(...args), wait)
  }
}

export function useProductsRealtime() {
  const purchaseRequisitionStore = usePurchaseRequisitionStore()
  const purchaseOrderStore = usePurchaseOrderStore()
  
  const isRefreshing = ref(false)
  const lastRefreshTime = ref<number>(0)
  const MIN_REFRESH_INTERVAL = 1000 // Minimum 1 second between refetches

  // Channel references for cleanup
  let prChannel: ReturnType<typeof supabase.channel> | null = null
  let poChannel: ReturnType<typeof supabase.channel> | null = null
  let priChannel: ReturnType<typeof supabase.channel> | null = null

  // Refresh both stores with debouncing
  const refreshData = debounce(async () => {
    const now = Date.now()
    if (now - lastRefreshTime.value < MIN_REFRESH_INTERVAL) {
      console.log('[useProductsRealtime] Skipping refresh - too soon')
      return
    }
    
    lastRefreshTime.value = now
    isRefreshing.value = true
    console.log('[useProductsRealtime] Refreshing data...')
    
    try {
      await Promise.all([
        purchaseRequisitionStore.fetchPurchaseRequisition(),
        purchaseOrderStore.fetchPurchaseOrders()
      ])
      console.log('[useProductsRealtime] Data refresh complete')
    } catch (error) {
      console.error('[useProductsRealtime] Error refreshing data:', error)
    } finally {
      isRefreshing.value = false
    }
  }, 300) // 300ms debounce delay

  // Computed property for products - directly accesses store data
  const products = computed(() => {
    const prs = purchaseRequisitionStore.prs
    const pos = purchaseOrderStore.purchaseOrders
    
    // Get unique PR IDs from delivered POs
    const prIdsWithDeliveredPOs = pos
      .map(po => po.purchase_requisition?.id?.toString() || po.requisition_id)
      .filter(Boolean)

    // Find PRs that have delivered POs
    const filteredPRs = prs.filter((pr) => prIdsWithDeliveredPOs.includes(String(pr.id)))

    // Map to product-like format
    const allItems: any[] = []
    filteredPRs.forEach((pr) => {
      pr.items.forEach((item) => {
        allItems.push({
          SKU: item.SKU,
          name: item.item_description,
          quantity: item.qty,
          unit_cost: item.cost_per_unit,
          pr_number: pr.pr_number,
          id: item.id,
          requisition_id: pr.id,
          unit: item.unit,
          offer_per_unit: item.offer_per_unit,
          no: item.no,
          cost_price: item.cost_price,
          sell_price: item.sell_price,
          val_cost: item.val_cost,
          val_sell: item.val_sell,
          total_sold: item.total_sold,
          transfered: item.transfered,
          adjusted: item.adjusted,
          expiry_date: item.expiry_date,
          reorder_pt: item.reorder_pt,
          supplier_name: '',
        })
      })
    })

    return allItems
  })

  // Loading state - true when either store is loading or refresh is in progress
  const loading = computed(() => 
    purchaseRequisitionStore.loading || 
    purchaseOrderStore.loading || 
    isRefreshing.value
  )

  // Handle real-time changes
  const handleRealtimeChange = (tableName: string, payload: any) => {
    console.log(`[useProductsRealtime] Real-time change in ${tableName}:`, payload)
    // Trigger debounced refresh
    refreshData()
  }

  // Subscribe to real-time updates
  const subscribeToChanges = () => {
    // Subscribe to purchase_requisition changes
    prChannel = supabase
      .channel('products_pr_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'purchase_requisition'
        },
        (payload) => handleRealtimeChange('purchase_requisition', payload)
      )
      .subscribe()

    // Subscribe to purchase_orders changes
    poChannel = supabase
      .channel('products_po_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'purchase_orders'
        },
        (payload) => handleRealtimeChange('purchase_orders', payload)
      )
      .subscribe()

    // Subscribe to purchase_requisition_items changes (for PR item updates)
    priChannel = supabase
      .channel('products_pri_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'purchase_requisition_items'
        },
        (payload) => handleRealtimeChange('purchase_requisition_items', payload)
      )
      .subscribe()

    console.log('[useProductsRealtime] Subscribed to real-time changes for 3 tables')
  }

  // Unsubscribe from real-time updates
  const unsubscribeFromChanges = () => {
    if (prChannel) {
      supabase.removeChannel(prChannel)
      prChannel = null
    }
    if (poChannel) {
      supabase.removeChannel(poChannel)
      poChannel = null
    }
    if (priChannel) {
      supabase.removeChannel(priChannel)
      priChannel = null
    }
    console.log('[useProductsRealtime] Unsubscribed from real-time changes')
  }

  // Initialize - fetch data and subscribe to real-time updates
  const init = async () => {
    console.log('[useProductsRealtime] Initializing...')
    await refreshData()
    subscribeToChanges()
  }

  // Cleanup
  const cleanup = () => {
    unsubscribeFromChanges()
  }

  // Manual refresh method
  const refresh = () => {
    lastRefreshTime.value = 0 // Reset to allow immediate refresh
    refreshData()
  }

  return {
    // State
    products,
    loading,
    isRefreshing,
    
    // Methods
    init,
    cleanup,
    refresh,
    subscribeToChanges,
    unsubscribeFromChanges
  }
}
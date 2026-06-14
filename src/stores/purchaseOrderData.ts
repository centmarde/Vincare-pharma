import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '../lib/supabase'
import { useToast } from 'vue-toastification'

const toast = useToast()

export type PurchaseOrder = {
  id: number
  created_at: string
  po_number: string
  requisition_id: string | null
  supplier_id: string | null
  ship_via: string | null
  ship_method: string | null
  declared_value: number
  issued_by: string | null
  issued_at: string
  status: 'issued' | 'received'
  is_delivered: boolean
  purchase_requisition?: {
    id: number
    pr_number: string
    status: string
    created_at: string
  } | null
}

export type PR = {
  id: number
  pr_number: string
  status: string
  items: any[]
}

export type PurchaseRequisitionItems = {
  id: number
  requisition_id: string
  no: number
  unit: string
  item_description: string
  qty: number
  offer_per_unit: number
  cost_per_unit: number
  created_at: string
}

export type PurchaseOrderInput = {
  po_number: string
  requisition_id: string | null
  supplier_id: string | null
  ship_via: string | null
  ship_method: string | null
  declared_value: number
  issued_by: string | null
  status: 'issued' | 'received'
  is_delivered: boolean
}

export type PurchaseOrderUpdateInput = Partial<PurchaseOrderInput>

export type SupplierDetails = {
  id: number
  name: string
  address: string
  city: string
  phone: string
  email: string
  contact_person: string
  is_active: boolean
}

export const usePurchaseOrderStore = defineStore('purchaseOrder', () => {

  //State
  const loading = ref(false)
  const error: Ref<string> = ref('')
  const purchaseOrders: Ref<PurchaseOrder[]> = ref([])
  const currentPurchaseOrder: Ref<PurchaseOrder | null> = ref(null)
  const supplierDetails: Ref<SupplierDetails | null> = ref(null)
  const requisitionItems: Ref<PurchaseRequisitionItems[]> = ref([])
  const subscriptionChannel = ref<any>(null)
  
  //Computed
  const purchaseOrdersCount = computed(() => purchaseOrders.value.length)
  const isEmpty = computed(() => purchaseOrders.value.length === 0)

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  const handleError = (err: unknown, defaultMessage: string) => {
    error.value = err instanceof Error ? err.message : defaultMessage
  }

  const clearError = () => {
    error.value = ''
  }

  // ─── Actions ─────────────────────────────────────────────────────────────────

  async function fetchRequisitionItems(requisitionId: string) {
    loading.value = true
    clearError()

    try {

      const { data, error: fetchError } = await supabase
        .from('purchase_requisition_items')
        .select('*')
        .eq('requisition_id', requisitionId)
        .order('created_at', { ascending: true })

        if (fetchError) {
          throw fetchError
        }

        if(data){
          requisitionItems.value = data as PurchaseRequisitionItems[]
        }

    } catch (err) {
      handleError(err, 'Failed to fetch requisition items.')
    } finally {
      loading.value = false
    }
  }


  async function fetchPurchaseOrders() {
    loading.value = true
    clearError()

    try {
      // First fetch: Get all purchase orders with their related purchase_requisition data
      const { data, error: fetchError } = await supabase
        .from('purchase_orders')
        .select(`
          *,
          purchase_requisition (
            id,
            pr_number,
            status,
            created_at
          )
        `)
        .order('created_at', { ascending: false })

      if (fetchError) {
        toast.error('Failed to fetch purchase orders.')
        throw fetchError
      }

      if (data) {
        console.log('[PurchaseOrderStore] Fetched POs:', data.map(po => ({
          id: po.id,
          po_number: po.po_number,
          is_delivered: po.is_delivered,
          pr_id: po.purchase_requisition?.id,
          pr_status: po.purchase_requisition?.status,
          requisition_id: po.requisition_id
        })))

        // Second filter: Only keep purchase orders where is_delivered=true and related PR is approved
        const deliveredPOsWithApprovedPR = data.filter(po => {
          // Check if the related PR exists and is approved
          if (po.purchase_requisition) {
            // Use truthy check for is_delivered to handle different data types (boolean, string, number)
            return po.is_delivered && po.purchase_requisition.status === 'approved'
          }
          // If no relationship data, exclude this PO
          return false
        })

        console.log('[PurchaseOrderStore] Delivered POs with approved PR:', deliveredPOsWithApprovedPR.map(po => ({
          id: po.id,
          po_number: po.po_number,
          pr_number: po.purchase_requisition?.pr_number
        })))

        purchaseOrders.value = deliveredPOsWithApprovedPR as PurchaseOrder[]
      }

    } catch (err) {
      handleError(err, 'Failed to fetch purchase orders.')
      toast.error('Failed to fetch purchase orders.')
    } finally {
      loading.value = false
    }
  }

  // Get products from PRs that have delivered POs
  // This function accepts PR data and uses the already-filtered purchaseOrders
  const getProductsFromDeliveredPRs = (prs: PR[]) => {
    // Get unique PR IDs from delivered POs
    const prIdsWithDeliveredPOs = purchaseOrders.value
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
  }


  async function fetchPurchaseOrderById(id: number) {
    loading.value = true
    clearError()

    try {

      const { data, error: fetchError } = await supabase
        .from('purchase_orders')
        .select('*')
        .eq('id', id)
        .single()

      if (fetchError) {
        toast.error('Failed to fetch purchase order.')
        throw fetchError
      }

      if(data){
        currentPurchaseOrder.value = data
      }

    } catch (err) {
      handleError(err, 'Failed to fetch purchase order.')
      toast.error('Failed to fetch purchase order.')
    } finally {
      loading.value = false
    }
  }


  async function fetchSupplierDetails(supplierId: string) {
    loading.value = true
    clearError()

    try {

      const { data, error: fetchError } = await supabase
        .from('suppliers')
        .select('*')
        .eq('id', supplierId)
        .single()
        
        if (fetchError) {
            toast.error('Failed to fetch supplier details.')
            throw fetchError
        }

        if(data){
          supplierDetails.value = data as SupplierDetails
        }

    } catch (err) {
      handleError(err, 'Failed to fetch supplier details.')
      toast.error('Failed to fetch supplier details.')
    } finally {
      loading.value = false
    }
  }


  async function createPurchaseOrder(poData: PurchaseOrderInput) {
    loading.value = true
    clearError()

    try {

      const { data, error: createError } = await supabase
        .from('purchase_orders')
        .insert([poData])
        .select()

        if (createError) {
            toast.error('Failed to create purchase order.')
            throw createError
        }
        if(data){
          const createdOrder = data[0] as PurchaseOrder
          purchaseOrders.value.unshift(createdOrder)
          currentPurchaseOrder.value = createdOrder
        }
        toast.success('Purchase order created successfully.')
    
    } catch (err) {
      handleError(err, 'Failed to create purchase order.')
      toast.error('Failed to create purchase order.')
    } finally {
      loading.value = false
    }
    clearCurrentPurchaseOrder()
  }


  async function clearCurrentPurchaseOrder() {
    currentPurchaseOrder.value = null
    supplierDetails.value = null
    requisitionItems.value = []
  }


  async function fetchPurchaseOrderDependencies(requisitionId: string, supplierId: string) {
    await Promise.all([
      fetchRequisitionItems(requisitionId),
      fetchSupplierDetails(supplierId)
    ])
  }


  async function updatePurchaseOrder(id: number, updatedData: Partial<PurchaseOrderUpdateInput>) {
    loading.value = true
    clearError()
    
    try{

        const { data, error: updateError } = await supabase
        .from('purchase_orders')
        .update(updatedData)
        .eq('id', id)
        .select()
        .single()

        if (updateError) {
            toast.error('Failed to update purchase order.')
            throw updateError
        }
        if(data){
          const updatedOrder = data as PurchaseOrder
          const index = purchaseOrders.value.findIndex(po => po.id === updatedOrder.id)
          if (index !== -1) {
            purchaseOrders.value[index] = updatedOrder
          }
        }
        toast.success('Purchase order updated successfully.')

    } catch (err) {
      handleError(err, 'Failed to update purchase order.')
      toast.error('Failed to update purchase order.')
    }
      finally {
      loading.value = false
    }
  }


  async function deletePurchaseOrder(id: number) {
    loading.value = true
    clearError()

    try{

        const { error: deleteError } = await supabase
        .from('purchase_orders')
        .delete()
        .eq('id', id)

        if (deleteError) {
            toast.error('Failed to delete purchase order.')
            throw deleteError
        }
        purchaseOrders.value = purchaseOrders.value.filter(po => po.id !== Number(id))
        if (currentPurchaseOrder.value?.id === Number(id)) {
          clearCurrentPurchaseOrder()
        }

        toast.success('Purchase order deleted successfully.')

    } catch (err) {
      handleError(err, 'Failed to delete purchase order.')
      toast.error('Failed to delete purchase order.')
    } finally {
      loading.value = false
    }

  }

  async function receivePurchaseOrder() {
    loading.value = true
    clearError()

    try {

        const { data, error: receiveError } = await supabase
        .from('purchase_orders')
        .update({ status: 'Received' })
        .eq('id', currentPurchaseOrder.value?.id)
        .select()
        .single()

        if (receiveError) {
            toast.error('Failed to receive purchase order.')
            throw receiveError
        }
        if(data){
          const receivedOrder = data as PurchaseOrder
          const index = purchaseOrders.value.findIndex(po => po.id === receivedOrder.id)
          if (index !== -1) {
            purchaseOrders.value[index] = receivedOrder
            currentPurchaseOrder.value = receivedOrder
          }
        }
        toast.success('Purchase order received successfully.')


    } catch (err) {
      handleError(err, 'Failed to receive purchase order.')
      toast.error('Failed to receive purchase order.')
    } finally {
      loading.value = false
    }

  }
   

  // Real-time subscription for purchase_orders table
  function subscribeToPurchaseOrders() {
    subscriptionChannel.value = supabase
      .channel('purchase_orders_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'purchase_orders'
        },
        async (payload) => {
          console.log('Real-time change detected in purchase_orders:', payload)
          // Refetch data when changes occur - this updates the reactive purchaseOrders.value
          await fetchPurchaseOrders()
        }
      )
      .subscribe()
  }

  // Unsubscribe from real-time updates
  function unsubscribeFromPurchaseOrders() {
    if (subscriptionChannel.value) {
      supabase.removeChannel(subscriptionChannel.value)
      subscriptionChannel.value = null
    }
  }

  return {
    // State
    loading,
    error,
    purchaseOrders,
    currentPurchaseOrder,
    supplierDetails,
    requisitionItems,
    // Computed
    purchaseOrdersCount,
    isEmpty,
    // Actions
    fetchPurchaseOrders,
    fetchPurchaseOrderById,
    fetchSupplierDetails,
    fetchRequisitionItems,
    createPurchaseOrder,
    clearCurrentPurchaseOrder,
    fetchPurchaseOrderDependencies,
    updatePurchaseOrder,
    deletePurchaseOrder,
    receivePurchaseOrder,
    getProductsFromDeliveredPRs,
    subscribeToPurchaseOrders,
    unsubscribeFromPurchaseOrders,
    }
})

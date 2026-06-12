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
        console.log('Fetched requisition items:', requisitionItems.value)

    } catch (err) {
      handleError(err, 'Failed to fetch requisition items.')
      console.log('Error fetching requisition items:', err)
    } finally {
      loading.value = false
    }
  }


  async function fetchPurchaseOrders() {
    loading.value = true
    clearError()

    try {

      const { data, error: fetchError } = await supabase
        .from('purchase_orders')
        .select('*')
        .order('created_at', { ascending: false })

      if (fetchError) {
        toast.error('Failed to fetch purchase orders.')
        throw fetchError
      }

      if(data){
        purchaseOrders.value = data as PurchaseOrder[]
      }
      console.log('Fetched purchase orders:', purchaseOrders.value)


    }catch (err) {
      handleError(err, 'Failed to fetch purchase orders.')
      console.log('Error fetching purchase orders:', err)
      toast.error('Failed to fetch purchase orders.')
    } finally {
      loading.value = false
    }
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
      console.log('Fetched purchase order:', currentPurchaseOrder.value)

    } catch (err) {
      handleError(err, 'Failed to fetch purchase order.')
      console.log('Error fetching purchase order:', err)
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
        console.log('Fetched supplier details:', supplierDetails.value)

    } catch (err) {
      handleError(err, 'Failed to fetch supplier details.')
      console.log('Error fetching supplier details:', err)
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
        console.log('Created purchase order:', currentPurchaseOrder.value)
    
    } catch (err) {
      handleError(err, 'Failed to create purchase order.')
      console.log('Error creating purchase order:', err)
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
        console.log('Updated purchase order:', currentPurchaseOrder.value)

    } catch (err) {
      handleError(err, 'Failed to update purchase order.')
      console.log('Error updating purchase order:', err)
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
        console.log('Deleted purchase order with ID:', id)

    } catch (err) {
      handleError(err, 'Failed to delete purchase order.')
      console.log('Error deleting purchase order:', err)
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
        console.log('Received purchase order:', currentPurchaseOrder.value)


    } catch (err) {
      handleError(err, 'Failed to receive purchase order.')
      console.log('Error receiving purchase order:', err)
      toast.error('Failed to receive purchase order.')
    } finally {
      loading.value = false
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
    }
})
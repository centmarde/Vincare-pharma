import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import { useToast } from 'vue-toastification'

const toast = useToast()

// Matches `public.purchase_requisition` schema

export type PurchaseRequisitionType = {
  id?: number
  created_at?: string
  justification?: string | null
  status?: string
  requested_by: string | null
  reviewed_by?: string | null
  reviewed_at?: string | null
  updated_at?: string

}

export type RequisitionItemType ={
  id?: number
  requisition_id?: string
  no: number
  unit: string
  item_description: string
  qty: number
  offer_per_unit: number
  cost_per_unit: number
  created_at?: string
}

export const usePurchaseRequisitionStore = defineStore('purchaseRequisition', () => {
  
  const loading = ref(false)
  const error: Ref<string> = ref('')
  

const currentPR = ref<PurchaseRequisitionType>({
    justification: null,
    status: 'pending_approval',
    requested_by: null,
    reviewed_by: null,
    reviewed_at: null,
})

const items = ref<RequisitionItemType[]>([])

const customerOfferTotal = computed(() =>
    items.value.reduce((sum, i) => sum + (i.qty || 0) * (i.offer_per_unit || 0), 0)
  )

const companyCostTotal = computed(() =>
    items.value.reduce((sum, i) => sum + (i.qty || 0) * (i.cost_per_unit || 0), 0)
  )

const profit = computed(() => customerOfferTotal.value - companyCostTotal.value)

const isProfitable = computed(() => profit.value > 0)

const offerCostRatio = computed(() => {
    if (companyCostTotal.value === 0) return '0.00'
    return (customerOfferTotal.value / companyCostTotal.value).toFixed(2)
  })

const marginPercent = computed(() => {
    if (customerOfferTotal.value === 0) return '0'
    return Math.floor((profit.value / customerOfferTotal.value) * 100)
  })


  
async function savePurchaseRequisition() {
    loading.value = true
    error.value = ''

    try {

      const { data: { user }} = await supabase.auth.getUser()
      if (!user) throw new Error('User not authenticated.')

      // 1. Ensure a PR number exists before sending  
      const { data: prData, error: prError   } = await supabase
        .from('purchase_requisition')
        .insert({
            justification: currentPR.value.justification || '',
            status: currentPR.value.status,
            requested_by: user.id,
        })
        .select('id, pr_number')
        .single()

      if (prError) throw prError
      if (!prData) throw new Error('Failed to create purchase requisition.')
      console.log('PR Number:', prData.pr_number)

        // 2. Insert the purchase requisition and get the new ID
        if(items.value.length > 0) {
            const itemsToInsert = items.value.map(item => ({
                requisition_id: prData.id,
                no: item.no,
                unit: item.unit,
                item_description: item.item_description,
                qty: item.qty,
                offer_per_unit: item.offer_per_unit,
                cost_per_unit: item.cost_per_unit,
            }))

            const { error: itemsError } = await supabase
            .from('purchase_requisition_items')
            .insert(itemsToInsert)

            if(itemsError) throw itemsError
            toast.success('Purchase requisition saved successfully.')
        }
        // 3. Reset the store to initial state after successful save
        resetStore()
        return { success: true }


    } catch (err: any) {
        error.value = 'Failed to save purchase requisition. Please try again.'
        console.error('Error saving purchase requisition:', err.message)
        toast.error('Failed to save Purchase Requisition. Please try again.')
        return { success: false, error: error.value }
    } finally {
        loading.value = false
    }
}

    //reset store to initial state after successful save
    function resetStore() {
    currentPR.value = {
      justification: null,
      status: 'pending_approval',
      requested_by: null,
      reviewed_by: null,
      reviewed_at: null,
    }
    items.value = []
    error.value = ''
  }

return {
    currentPR,
    items,
    loading,
    error,
    customerOfferTotal,
    companyCostTotal,
    profit,
    isProfitable,
    offerCostRatio,
    marginPercent,
    savePurchaseRequisition,
    resetStore,
}

})
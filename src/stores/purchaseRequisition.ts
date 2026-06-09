import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'

// Matches `public.purchase_requisition` schema

export type PurchaseRequisitionType = {
  id?: number
  created_at?: string
  request_by: string | null
  request_date: string | null
  status: string | null
  pr_number: string | null
  approve_by: string | null
  approve_date: string | null
  justification: string | null
  customer_offer_total: number | null
  company_cost_total: number | null
  updated_at?: string
}

export type RequisitionItemType ={
    id: number
    created_at?: string
    requisition_id?: number
    product_id: number
    quantity: number | null
    offer_per_unit: number | null
    cost_per_unit: number | null
}

export const usePurchaseRequisitionStore = defineStore('purchaseRequisition', () => {
  
  const currentPR = ref<PurchaseRequisitionType>({
    request_by: '',
    request_date: new Date().toISOString().split('T')[0], 
    status: 'Pending Approval',
    pr_number: '',
    approve_by: null,
    approve_date: null,
    justification: '',
    customer_offer_total: 0,
    company_cost_total: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    

  })
  
  const loading = ref(false)
  const error: Ref<string> = ref('')
  const items = ref<RequisitionItemType[]>([])

const customerOfferTotal = computed(() => {
    let total = 0
    for (let i = 0; i < items.value.length; i++) {
      const qty = items.value[i].quantity || 0
      const offer = items.value[i].offer_per_unit || 0
      total += qty * offer
    }
    return total
  })

const companyCostTotal = computed(() => {
    let total = 0
    for (let i = 0; i < items.value.length; i++) {
        const qty = items.value[i].quantity || 0
        const cost = items.value[i].cost_per_unit || 0
        total += qty * cost
    }
    return total
})

const profit = computed(() => {
    return customerOfferTotal.value - companyCostTotal.value
})

const isProfitable = computed(() => profit.value > 0)

const offerCostRatio = computed(() => {
    if(companyCostTotal.value === 0) return '0.00'
    return (customerOfferTotal.value / companyCostTotal.value).toFixed(2)
})

const marginPercent = computed(() => {
    if(customerOfferTotal.value === 0) return '0'
    return Math.floor((profit.value /customerOfferTotal.value) * 100)
})

 // Generate a unique PR number in the format "PR-2026-XXX"
  function generatePRNumber() {
    const randomNumber = Math.floor(100 + Math.random() * 900)
    currentPR.value.pr_number = `PR-2026-${randomNumber}`
  }
  
async function savePurchaseRequisition() {
    loading.value = true
    error.value = ''

    try {
        // 1. Ensure a PR number exists before sending
      if (!currentPR.value.pr_number) {
        generatePRNumber()
      }

      currentPR.value.customer_offer_total = customerOfferTotal.value
      currentPR.value.company_cost_total = companyCostTotal.value

      // 2. Insert the purchase requisition and get the new ID
      const { data: parentData, error: parentError  } = await supabase
        .from('purchase_requisition')
        .insert(currentPR.value)
        .select('id')
        .single()

      if (parentError) throw parentError
      if(!parentData) throw new Error('Failed to create purchase requisition.')
        console.log('Purchase requisition saved successfully with ID:', parentData.id)

        const generatedId = parentData.id

        // 3. Insert associated items with the new requisition ID
        if(items.value.length > 0) {
            const itemsToInsert = items.value.map(item => ({
               product_id: item.product_id,
               quantity: item.quantity,
               offer_per_unit: item.offer_per_unit,
               cost_per_unit: item.cost_per_unit,
               requisition_id: generatedId
            }))

            const { error: itemsError } = await supabase
            .from('requisition_items')
            .insert(itemsToInsert)

            if(itemsError) throw itemsError
            console.log('Purchase requisition and items saved successfully.')
        }
        // 4. Reset the store to initial state after successful save
        resetStore()
        return { success: true }


    } catch (err: any) {
        error.value = 'Failed to save purchase requisition. Please try again.'
        console.log('Error saving purchase requisition:', err.message)
        return { success: false, error: error.value }
    } finally {
        loading.value = false
    }
}

    //reset store to initial state after successful save
    function resetStore() {
        currentPR.value = {
            request_by: '',
            request_date: new Date().toISOString().split('T')[0],
            status: 'Pending Approval',
            pr_number: '',
            approve_by: null,
            approve_date: null,
            justification: '',
            customer_offer_total: 0,
            company_cost_total: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
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
    resetStore
}

})
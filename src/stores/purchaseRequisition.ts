import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import { useToast } from 'vue-toastification'

const toast = useToast()

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

export type PRItem = {
  id: number
  no: number
  unit: string
  item_description: string
  qty: number
  offer_per_unit: number
  cost_per_unit: number
}

export type PR = {
  id: number
  pr_number: string
  status: string
  justification: string | null
  created_at: string
  requested_by: string
  reviewed_by: string 
  reviewed_at: string 
  requester_name?: string
  reviewer_name?: string
  items: PRItem[]
}

export const usePurchaseRequisitionStore = defineStore('purchaseRequisition', () => {
  
  const loading = ref(false)
  const error: Ref<string> = ref('')
  const prs = ref<PR[]>([])
  const selectedPR = ref<PR | null>(null)
  const filterStatus = ref<string | null>(null)
  const items = ref<RequisitionItemType[]>([])

const currentPR = ref<PurchaseRequisitionType>({
    justification: null,
    status: 'pending_approval',
    requested_by: null,
    reviewed_by: null,
    reviewed_at: null,
})

// Computed properties for totals and profitability
const customerOfferTotal = computed(() =>
    items.value.reduce((sum, i) => sum + (i.qty || 0) * (i.offer_per_unit || 0), 0))
const companyCostTotal = computed(() =>
    items.value.reduce((sum, i) => sum + (i.qty || 0) * (i.cost_per_unit || 0), 0))
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


//Fetching PR by ID
const statusOptions = [
  { title: 'All', value: null },
  { title: 'Pending Approval', value: 'pending_approval' },
  { title: 'Approved', value: 'approved' },
  { title: 'Rejected', value: 'rejected' },
]

const filteredPRs = computed(() => {
  if (!filterStatus.value) return prs.value
  return prs.value.filter(pr => pr.status === filterStatus.value)
})

// Utility functions for the PENDING LIST
const totalQty = (items: PRItem[]) =>
  items.reduce((sum, i) => sum + (i.qty || 0), 0)

const totalCost = (items: PRItem[]) =>
  items.reduce((sum, i) => sum + (i.qty || 0) * (i.cost_per_unit || 0), 0)

const itemSummary = (items: PRItem[]) => {
  if (!items?.length) return '—'
  const first = items[0].item_description
  const extra = items.length - 1
  return extra > 0 ? `${first} +${extra} more` : first
}

const statusConfig = (status: string) => {
  switch (status) {
    case 'pending_approval':
      return { label: 'Pending Approval', color: '#c2922e', bg: '#fff8ee', dot: '#c2922e' }
    case 'approved':
      return { label: 'Approved', color: '#2e7d32', bg: '#f0f9f0', dot: '#4caf50' }
    case 'rejected':
      return { label: 'Rejected', color: '#c62828', bg: '#fff0f0', dot: '#ef5350' }
    default:
      return { label: status, color: '#757575', bg: '#f5f5f5', dot: '#9e9e9e' }
  }
}

  
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

async function fetchPurchaseRequisition() {
    loading.value = true
    error.value = ''

    try {
        const { data, error } = await supabase
        .from('purchase_requisition')
        .select(`
            id,
            pr_number,
            status,
            justification,
            created_at,
            requested_by,
            reviewed_by,
            reviewed_at,
            purchase_requisition_items (
              id, no, unit, item_description, qty, offer_per_unit, cost_per_unit
            )
          `)
        .order('created_at', { ascending: false })

        if (error) { throw error }

        prs.value = await Promise.all(
          (data || []).map(async (pr: any) => {
            const [requesterRes, reviewerRes] = await Promise.all([
              pr.requested_by 
              ? supabase.rpc('get_user_full_name', { user_id: pr.requested_by })
              : Promise.resolve({ data: null }),
              pr.reviewed_by 
              ? supabase.rpc('get_user_full_name', { user_id: pr.reviewed_by })
              : Promise.resolve({ data: null }),
            ])
            return {
              ...pr,
              items: pr.purchase_requisition_items || [],
              requester_name: requesterRes.data?.toUpperCase() ?? '-',
              reviewer_name: reviewerRes.data?.toUpperCase() ?? '-',
            }
          })
        )
        
      } catch (err: any) {
        console.error('Error fetching purchase requisition:', err.message)
        toast.error('Failed to fetch Purchase Requisition. Please try again.')
      } finally {
        loading.value = false
      }
}

async function approvePR(prId: number) {
    loading.value = true
    error.value = ''

    try{

      const { data: { user }} = await supabase.auth.getUser()
      if (!user) throw new Error('User not authenticated.')
      const { error } = await supabase
        .from('purchase_requisition')
        .update({
          status: 'approved',
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', prId)
      if (error) throw error  
      toast.success('Purchase Requisition approved successfully.')
      await fetchPurchaseRequisition() // Refresh the list after approval
      
    } catch (err: any) {
        console.log('Error approving purchase requisition:', err.message)
        toast.error('Failed to approve Purchase Requisition. Please try again.')
    } finally {
        loading.value = false
    }
}
async function rejectPR(prId: number) {
    loading.value = true
    error.value = ''

    try{

      const { data: { user }} = await supabase.auth.getUser()
      if (!user) throw new Error('User not authenticated.')
      const { error } = await supabase
        .from('purchase_requisition')
        .update({
          status: 'rejected',
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', prId)
      if (error) throw error
      toast.success('Purchase Requisition rejected successfully.')
      await fetchPurchaseRequisition() // Refresh the list after rejection

    } catch (err: any) {
        console.error('Error rejecting purchase requisition:', err.message)
        toast.error('Failed to reject Purchase Requisition. Please try again.')
    } finally {
        loading.value = false
    }

}

return {
    // State
    currentPR,
    items,
    loading,
    error,
    selectedPR,
    filterStatus,
    prs,
    // Computed
    customerOfferTotal,
    companyCostTotal,
    profit,
    isProfitable,
    offerCostRatio,
    marginPercent,
    filteredPRs,
    // Constants
    statusOptions,
    // Utilities
    totalQty,
    totalCost,
    itemSummary,
    statusConfig,
    // Actions
    savePurchaseRequisition,
    resetStore,
    fetchPurchaseRequisition,
    approvePR,
    rejectPR,
}

})
import { ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import { useToast } from 'vue-toastification'
import { useAuthUserStore } from '@/stores/authUser'

const toast = useToast()

export type SupplierOfferType = {
  id: number
  supplier_id: number
  supplier_name?: string | null
  product_id: number
  cost_price_per_unit: number
  currency: string
  expiry_date: string | null
  source: string
  created_by: string | null
  created_at: string
}

export const useSupplierOffersDataStore = defineStore('supplierOffersData', () => {
  const authStore = useAuthUserStore()
  const loading = ref(false)
  const error: Ref<string> = ref('')
  const offersByProduct: Ref<Record<number, SupplierOfferType[]>> = ref({})

  const handleError = (err: unknown, msg: string) => { error.value = err instanceof Error ? err.message : msg }

  const mapOffer = (r: any): SupplierOfferType => ({
    id: r.id, supplier_id: r.supplier_id, supplier_name: r.supplier?.name ?? null,
    product_id: r.product_id, cost_price_per_unit: r.cost_price_per_unit,
    currency: r.currency ?? 'PHP', expiry_date: r.expiry_date, source: r.source,
    created_by: r.created_by, created_at: r.created_at,
  })

  const fetchOffersForProduct = async (productId: number, force = false): Promise<SupplierOfferType[]> => {
    if (!force && offersByProduct.value[productId]) return offersByProduct.value[productId]
    loading.value = true
    const { data, error: fetchError } = await supabase
      .from('supplier_offers')
      .select('*, supplier:supplier_id(name)')
      .eq('product_id', productId)
      .order('cost_price_per_unit', { ascending: true })
    loading.value = false
    if (fetchError) { handleError(fetchError, 'Failed to fetch supplier offers.'); return [] }
    const mapped = (data ?? []).map(mapOffer)
    offersByProduct.value[productId] = mapped
    return mapped
  }

  const createOffer = async (payload: {
    supplierId: number; productId: number; costPricePerUnit: number
    expiryDate: string | null; currency?: string; source?: string
  }): Promise<SupplierOfferType | null> => {
    const { user } = await authStore.getCurrentUser()
    const { data, error: insertError } = await supabase
      .from('supplier_offers')
      .insert({
        supplier_id: payload.supplierId, product_id: payload.productId,
        cost_price_per_unit: payload.costPricePerUnit, expiry_date: payload.expiryDate,
        currency: payload.currency ?? 'PHP', source: payload.source ?? 'manual',
        created_by: user?.id ?? null,
      })
      .select('*, supplier:supplier_id(name)')
      .single()
    if (insertError || !data) {
      handleError(insertError, 'Failed to save supplier offer.')
      toast.error('Failed to save supplier offer.')
      return null
    }
    const offer = mapOffer(data)
    offersByProduct.value[payload.productId] = [...(offersByProduct.value[payload.productId] ?? []), offer]
    return offer
  }

  return { loading, error, offersByProduct, fetchOffersForProduct, createOffer }
})
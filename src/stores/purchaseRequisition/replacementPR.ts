// Replacement-PR creation for confirmed supplier changes in PREditDialog.
// The original transactions row is left untouched (stays pending_approval).
// A NEW pending_approval PR is minted for the new supplier so executive sees
// both in ActionRequiredDialog and approves one / rejects the other.
import { supabase } from '@/lib/supabase'
import { generateDocNumber, getLatestReferenceNo, insertWithDocRetry } from '@/utils/helpers'
import { carriedProductFields } from '@/utils/productBatch'
import { computeSellingPrice, computePurchaseBreakdown, emptySupplierCharges } from '@/utils/computationHelpers'
import { useAuthUserStore } from '@/stores/authUser'
import { useProductsDataStore } from '@/stores/productsData'
import { useToast } from 'vue-toastification'
import type { PRItem } from './types'
import type { SupplierCharges } from '@/utils/computationHelpers'
import { loading, error, handleError } from './state'

const toast = useToast()

let authStore: ReturnType<typeof useAuthUserStore> | null = null
const getAuthStore = () => (authStore ??= useAuthUserStore())

interface RollbackResult {
  success: boolean
  error?: string
}

async function rollbackReplacementPR(
  id: number,
  createdProductIds: number[],
): Promise<RollbackResult> {
  const { error: itemsError } = await supabase
    .from('transaction_items')
    .delete()
    .eq('transaction_id', id)
  if (itemsError) return { success: false, error: itemsError.message }

  const { error: transactionError } = await supabase
    .from('transactions')
    .delete()
    .eq('id', id)
    .eq('transaction_type', 'purchase_requisition')
  if (transactionError) return { success: false, error: transactionError.message }

  if (createdProductIds.length) {
    const { error: productsError } = await supabase
      .from('products')
      .delete()
      .in('id', createdProductIds)
    if (productsError) return { success: false, error: productsError.message }
  }

  return { success: true }
}

export async function deleteReplacementPR(
  id: number,
  createdProductIds: number[] = [],
): Promise<RollbackResult> {
  return rollbackReplacementPR(id, createdProductIds)
}

export async function createReplacementPR(payload: {
  originalPrId: number
  items: PRItem[]
  charges: SupplierCharges | null
  newSupplierId: number
  purchase_requisition_date?: string | null
}): Promise<{ success: boolean; requisitionNo?: string; transactionId?: number; createdProductIds?: number[] }> {
  loading.value = true
  error.value = ''

  const { user, error: authError } = await getAuthStore().getCurrentUser()
  if (authError || !user) {
    toast.error('User not authenticated.')
    loading.value = false
    return { success: false }
  }

  const replacementItems = (payload.items || []).map((item) => ({
    ...item,
    supplier_id:
      item.supplier_id != null && item.supplier_id !== ''
        ? String(item.supplier_id)
        : String(payload.newSupplierId),
  }))

  if (!replacementItems.length || replacementItems.some((item) => !item.supplier_id)) {
    toast.error('Every item needs a supplier before creating a replacement.')
    loading.value = false
    return { success: false }
  }

  const distinctSuppliers = [...new Set(replacementItems.map((i) => i.supplier_id))]
  if (distinctSuppliers.length > 1) {
    toast.error('Unify all rows to one supplier before creating a replacement.')
    loading.value = false
    return { success: false }
  }

  const charges: SupplierCharges = payload.charges
    ? {
        supplier_id: payload.newSupplierId,
        discount_percent: Number(payload.charges.discount_percent) || 0,
        tax_amount: Number(payload.charges.tax_amount) || 0,
        shipping_amount: Number(payload.charges.shipping_amount) || 0,
      }
    : emptySupplierCharges(payload.newSupplierId)

  if (
    charges.discount_percent < 0 ||
    charges.discount_percent > 100 ||
    charges.tax_amount < 0 ||
    charges.shipping_amount < 0
  ) {
    toast.error('Discount must be 0–100% and tax/shipping cannot be negative.')
    loading.value = false
    return { success: false }
  }

  const companyCostTotal = replacementItems.reduce(
    (sum, i) => sum + (i.qty || 0) * (i.cost_per_unit || 0),
    0,
  )
  const breakdown = computePurchaseBreakdown(companyCostTotal, charges)

  // Same product resolution as savePurchaseRequisition: supplier is part of
  // batch identity, so Supplier B rows find-or-create Supplier B's own rows.
  const names = [...new Set(replacementItems.map((i) => i.product_name))]
  const { data: existingProducts, error: existingError } = await supabase
    .from('products')
    .select('id, product_name, supplier_id, unit, expiry_date, category, brand, reorder_level, sku')
    .in('product_name', names)

  if (existingError) {
    handleError(existingError, 'Failed to check existing products.')
    toast.error('Failed to check existing products. Please try again.')
    loading.value = false
    return { success: false }
  }

  const productIdByIndex: (number | null)[] = replacementItems.map((item) => {
    const supplierId = item.supplier_id ? Number(item.supplier_id) : null
    if (item.product_id != null) {
      const picked = (existingProducts || []).find((p) => p.id === item.product_id)
      if (
        picked &&
        picked.unit === item.unit &&
        picked.product_name === item.product_name &&
        (picked.supplier_id ?? null) === supplierId &&
        (picked.expiry_date ?? null) === (item.expiry_date ?? null)
      ) {
        return item.product_id
      }
    }
    const match = (existingProducts || []).find(
      (p) =>
        p.product_name === item.product_name &&
        (p.supplier_id ?? null) === (supplierId ?? null) &&
        p.unit === item.unit &&
        (p.expiry_date ?? null) === (item.expiry_date ?? null),
    )
    return match ? match.id : null
  })

  const newItemIndexes = productIdByIndex
    .map((id, idx) => (id === null ? idx : -1))
    .filter((idx) => idx !== -1)

  const createdProductIds: number[] = []

  if (newItemIndexes.length) {
    const productInserts = newItemIndexes.map((idx) => {
      const item = replacementItems[idx]
      const source =
        (existingProducts || []).find((p) => p.id === item.product_id) ??
        (existingProducts || []).find((p) => p.product_name === item.product_name)
      return {
        product_name: item.product_name,
        unit: item.unit,
        supplier_id: item.supplier_id ? Number(item.supplier_id) : null,
        status: 'active',
        expiry_date: item.expiry_date ?? null,
        current_stock: 0,
        cost_price: item.cost_per_unit,
        selling_price: computeSellingPrice(item.cost_per_unit),
        ...carriedProductFields(source),
      }
    })

    const { data: productData, error: productError } = await supabase
      .from('products')
      .insert(productInserts)
      .select('id')

    if (productError || !productData) {
      handleError(productError, 'Failed to save products.')
      toast.error('Failed to save products. Please try again.')
      loading.value = false
      return { success: false }
    }

    newItemIndexes.forEach((idx, i) => {
      productIdByIndex[idx] = productData[i].id
      createdProductIds.push(productData[i].id)
    })
  }
  const txResult = await insertWithDocRetry<{ id: number; reference_no: string | null }>(
    () => generateDocNumber('PR', getLatestReferenceNo),
    async (docNo) =>
      supabase
        .from('transactions')
        .insert({
          reference_no: docNo,
          recent_transaction_no: docNo,
          po_no: null,
          transaction_type: 'purchase_requisition',
          status: 'pending_approval',
          remarks: null,
          purchase_requisition_date: payload.purchase_requisition_date ?? null,
          subtotal: breakdown.netTotal,
          purchase_discount_percent: breakdown.discountPercent,
          purchase_discount_amount: breakdown.discountAmount,
          purchase_tax_amount: breakdown.taxAmount,
          purchase_shipping_amount: breakdown.shippingAmount,
          total_amount: breakdown.purchaseTotal,
          supplier_id: payload.newSupplierId,
          created_by: user.id,
        })
        .select('id, reference_no')
        .single(),
  )

  if (txResult.error || !txResult.data || !txResult.docNo) {
    handleError(txResult.error, 'Failed to create replacement purchase requisition.')
    toast.error('Failed to create replacement Purchase Requisition. Please try again.')
    if (createdProductIds.length) {
      await supabase.from('products').delete().in('id', createdProductIds)
    }
    loading.value = false
    return { success: false }
  }

  const txData = txResult.data
  const prNumber = txResult.docNo

  // Reorder linkage deliberately NOT carried: the original PR keeps its link
  // so two PRs can never resolve the same reorder row on approval.
  const { error: itemsError } = await supabase.from('transaction_items').insert(
    replacementItems.map((item, index) => ({
      transaction_id: txData.id,
      product_id: productIdByIndex[index]!,
      qty_stock_in: item.qty,
      unit_price: item.cost_per_unit,
      cost_price: item.cost_per_unit,
      line_total: item.qty * item.cost_per_unit,
      batch_no: item.batch_no?.trim() || null,
      reorder_request_id: null,
    })),
  )

  if (itemsError) {
    handleError(itemsError, 'Failed to save replacement transaction items.')
    toast.error('Failed to save replacement transaction items. Please try again.')
    await rollbackReplacementPR(txData.id, createdProductIds)
    loading.value = false
    return { success: false }
  }

  await useProductsDataStore().syncPRSellingPrices([txData.id])

  toast.success(`${prNumber} submitted for approval.`)
  loading.value = false
  return {
    success: true,
    requisitionNo: prNumber,
    transactionId: txData.id,
    createdProductIds,
  }
}
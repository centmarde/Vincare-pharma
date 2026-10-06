// Receiving stock: applying received counts/SKUs to products (updateProductSkuAndCount),
// duplicate-SKU conflict detection, and PR selling-price sync. Depends on crud
// (fetchProductById/updateProduct) and reorder (createReorderRequest).

import { supabase } from '@/lib/supabase'
import { computeSellingPrice } from '@/utils/computationHelpers'
import { useToast } from 'vue-toastification'
import type { ProductType, ReceiveStockUpdate, SkuConflict } from './types'
import { clearError, handleError } from './state'
import { fetchProductById, updateProduct } from './crud'
import { createReorderRequest } from './reorder'

const toast = useToast()

// A brand-new SKU typed on two items is not in the database yet, so the receipt is checked against itself too.
function findSkuConflictsWithinReceipt(
  items: { sku: string; productName: string }[],
): SkuConflict[] {
  const namesBySku = new Map<string, string[]>()

  for (const item of items) {
    const names = namesBySku.get(item.sku) ?? []
    const itemName = item.productName.trim().toLowerCase()
    const alreadyListed = names.some((name) => name.trim().toLowerCase() === itemName)
    if (!alreadyListed) names.push(item.productName)
    namesBySku.set(item.sku, names)
  }

  const conflicts: SkuConflict[] = []

  for (const [sku, names] of namesBySku) {
    for (let index = 1; index < names.length; index++) {
      conflicts.push({
        sku,
        receivingProduct: names[index],
        existingProduct: names[0],
        inThisReceipt: true,
      })
    }
  }

  return conflicts
}

// Batch rows of one product legitimately share a SKU, so only a different product_name counts as a clash.
export async function findSkuConflicts(
  items: { sku: string; productName: string }[],
): Promise<SkuConflict[] | null> {
  const skus = [...new Set(items.map((item) => item.sku))]
  if (!skus.length) return []

  const { data, error: fetchError } = await supabase
    .from('products')
    .select('product_name, sku')
    .in('sku', skus)

  if (fetchError) {
    console.warn('[productsData] Failed to check for duplicate SKUs', fetchError.message)
    return null
  }

  const conflicts: SkuConflict[] = findSkuConflictsWithinReceipt(items)

  for (const item of items) {
    const receivingName = item.productName.trim().toLowerCase()
    const existingNames = new Set<string>()

    for (const row of data ?? []) {
      const rowName = (row.product_name ?? '').trim() || 'an unnamed product'
      if (row.sku?.trim() === item.sku && rowName.toLowerCase() !== receivingName) {
        existingNames.add(rowName)
      }
    }

    for (const existingProduct of existingNames) {
      conflicts.push({
        sku: item.sku,
        receivingProduct: item.productName,
        existingProduct,
        inThisReceipt: false,
      })
    }
  }

  return conflicts
}

// A batch row back at zero stock can still be a spent batch, so any receipt or issue on it rules out re-dating.
const hasStockHistory = async (productId: number, exceptTransactionItemId: number) => {
  const readHistory = async () =>
    supabase
      .from('transaction_items')
      .select('id')
      .eq('product_id', productId)
      .neq('id', exceptTransactionItemId)
      .or('actual_count_stock_in.not.is.null,actual_count_stock_out.not.is.null')
      .limit(1)

  let result = await readHistory()
  if (result.error) result = await readHistory()
  if (result.error) throw result.error
  return (result.data ?? []).length > 0
}

const assertExpiryEditable = async (product: ProductType, transactionItemId: number) => {
  const priorStock = product.current_stock ?? 0
  if (priorStock > 0) {
    throw new Error(
      `Cannot change expiry on product ID ${product.id}: it already holds ${priorStock} in stock from an earlier batch.`,
    )
  }
  if (await hasStockHistory(product.id, transactionItemId)) {
    throw new Error(
      `Cannot change expiry on product ID ${product.id}: it has already been received or issued against an earlier batch.`,
    )
  }
}

export const updateProductSkuAndCount = async (updates: ReceiveStockUpdate[]): Promise<boolean> => {
  if (!updates.length) return true
  clearError()

  try {
    for (const {
      transaction_item_id,
      product_id,
      sku,
      actual_count_stock_in,
      expiry_date,
      batch_no,
      cost_price,
    } of updates) {
      const { data: existingItem, error: existingError } = await supabase
        .from('transaction_items')
        .select('actual_count_stock_in')
        .eq('id', transaction_item_id)
        .maybeSingle()
      if (existingError) throw existingError

      if (existingItem?.actual_count_stock_in != null) {
        // Already applied in a prior attempt — stock was already
        // incremented, so only the SKU and an expiry the row can still
        // take are corrected here.
        const applied = await fetchProductById(product_id)
        if (!applied) throw new Error(`Failed to fetch product ID ${product_id}`)

        const appliedExpiryChanged = expiry_date != null && expiry_date !== applied.expiry_date
        if (appliedExpiryChanged) await assertExpiryEditable(applied, transaction_item_id)

        const appliedSellingPrice = computeSellingPrice(cost_price ?? applied.cost_price)

        if (
          sku ||
          appliedExpiryChanged ||
          batch_no ||
          cost_price != null ||
          appliedSellingPrice != null
        ) {
          const result = await updateProduct(product_id, {
            ...(sku ? { sku } : {}),
            ...(appliedExpiryChanged ? { expiry_date } : {}),
            ...(batch_no ? { batch_no } : {}),
            ...(cost_price != null ? { cost_price } : {}),
            ...(appliedSellingPrice != null ? { selling_price: appliedSellingPrice } : {}),
          })
          if (!result) throw new Error(`Failed to update product ID ${product_id}`)
        }
        if (batch_no) {
          const { error: batchError } = await supabase
            .from('transaction_items')
            .update({ batch_no })
            .eq('id', transaction_item_id)
          if (batchError) throw batchError
        }
        continue
      }

      // 1. Fetch current product stock so we can increment it correctly
      const product = await fetchProductById(product_id)
      if (!product) throw new Error(`Failed to fetch product ID ${product_id}`)

      const priorStock = product.current_stock ?? 0
      const newStock = priorStock + actual_count_stock_in

      // Correcting expiry is only safe on an empty row — the batch row the PR
      // created. Re-dating a row that already holds stock would mis-date it.
      const expiryChanged = expiry_date != null && expiry_date !== product.expiry_date
      if (expiryChanged) await assertExpiryEditable(product, transaction_item_id)

      const sellingPrice = computeSellingPrice(cost_price ?? product.cost_price)

      // 2. Apply the stock increment first
      const result = await updateProduct(product_id, {
        current_stock: newStock,
        ...(sku ? { sku } : {}),
        ...(expiryChanged ? { expiry_date } : {}),
        ...(batch_no ? { batch_no } : {}),
        ...(cost_price != null ? { cost_price } : {}),
        ...(sellingPrice != null ? { selling_price: sellingPrice } : {}),
      })
      if (!result) throw new Error(`Failed to update product ID ${product_id}`)

      // NEW — check if the delivery cleared the shortage
      if (product.reorder_level != null && newStock < product.reorder_level) {
        const reason = newStock <= 0 ? 'reorder_outofstock' : 'reorder_lowstock'
        await createReorderRequest({ product_id, reason })
      }

      // 3. Only now stamp the "this was received" marker
      const { error: tiError } = await supabase
        .from('transaction_items')
        .update({ actual_count_stock_in, ...(batch_no ? { batch_no } : {}) })
        .eq('id', transaction_item_id)
      if (tiError) throw tiError
    }
    return true
  } catch (err) {
    handleError(err, 'Failed saving received stock information.')
    return false
  }
}

// A PR can reuse a product row that was never priced or was priced by hand, so every
// product on a newly raised PR is brought to the fixed markup over its own cost_price.
export const syncPRSellingPrices = async (prIds: number[]): Promise<boolean> => {
  if (!prIds.length) return true

  const { data: lines, error: linesError } = await supabase
    .from('transaction_items')
    .select('product_id, products ( id, cost_price, selling_price )')
    .in('transaction_id', prIds)

  if (linesError) {
    console.warn('syncPRSellingPrices: could not read PR products:', linesError.message)
    toast.warning('PR saved, but the selling prices could not be updated.')
    return false
  }

  const checkedProductIds = new Set<number>()

  for (const line of lines ?? []) {
    const product = Array.isArray(line.products) ? line.products[0] : line.products
    if (!product || checkedProductIds.has(product.id)) continue
    checkedProductIds.add(product.id)

    const sellingPrice = computeSellingPrice(product.cost_price)
    if (sellingPrice == null || sellingPrice === Number(product.selling_price)) continue

    const { error: updateError } = await supabase
      .from('products')
      .update({ selling_price: sellingPrice })
      .eq('id', product.id)

    if (updateError) {
      console.warn('syncPRSellingPrices: could not update product', product.id, updateError.message)
      toast.warning('PR saved, but some selling prices could not be updated.')
      return false
    }
  }

  return true
}
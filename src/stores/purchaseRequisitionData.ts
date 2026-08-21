import { generateDocNumber, getLatestReferenceNo, insertWithDocRetry } from '@/utils/helpers'
import type { TransactionRPCRow } from './transactionsData'
import { useProductsDataStore } from './productsData' // NEW
import { useAuthUserStore } from './authUser'
import { useToast } from 'vue-toastification'
import { supabase } from '@/lib/supabase'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Ref } from 'vue'

const toast = useToast()

export type PRItem = {
  id: number
  no: number
  unit: string
  item_description: string
  qty: number
  offer_per_unit: number
  cost_per_unit: number
  product_id?: number
  sku?: string | null
  supplier_name?: string | null
  supplier_id?: string | null
  expiry_date?: string | null
  actual_count_stock_in?: number | null
  warehouse_id?: number | null
}

export type RequisitionItemType = {
  no: number
  unit: string
  item_description: string
  qty: number
  offer_per_unit: number
  cost_per_unit: number
  supplier_id: string | null
  actual_count_stock_in?: number | null
  expiry_date?: string | null
  product_id?: number | null
  reorder_request_id?: number | null
}

export type PR = {
  id: number
  reference_no: string | null // NEW — the "live" doc number for this stage
  recent_transaction_no: string | null
  requisition_no: string
  po_no: string | null
  status: string
  remarks: string | null
  total_amount: number
  supplier_id: string | null
  supplier_name?: string | null
  created_at: string
  created_by: string
  approved_by: string | null
  updated_at: string | null
  requester_name?: string
  reviewer_name?: string
  actual_count_stock_in?: number | null
  items: PRItem[]
}

export type PurchaseRequisitionType = {
  remarks: string | null
  status: string
  requested_by: string | null
  supplier_id: string | null
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const usePurchaseRequisitionStore = defineStore('purchaseRequisitionData', () => {
  const authStore = useAuthUserStore()

  // ─── State ──────────────────────────────────────────────────────
  const loading: Ref<boolean> = ref(false)
  const error: Ref<string> = ref('')
  const prs: Ref<PR[]> = ref([])
  const selectedPR: Ref<PR | null> = ref(null)
  const filterStatus: Ref<string | null> = ref(null)
  const items: Ref<RequisitionItemType[]> = ref([])
  const subscriptionChannel: Ref<any> = ref(null)

  const currentPR: Ref<PurchaseRequisitionType> = ref({
    remarks: null,
    status: 'pending_approval',
    requested_by: null,
    supplier_id: null,
  })

  // ─── Computed ───────────────────────────────────────────────────
  const isLoading = computed(() => loading.value)
  const hasError = computed(() => error.value !== '')

  // ─── Helpers ────────────────────────────────────────────────────
  const handleError = (err: unknown, message: string) => {
    error.value = err instanceof Error ? err.message : message
  }

  function resetStore() {
    currentPR.value = {
      remarks: null,
      status: 'pending_approval',
      requested_by: null,
      supplier_id: null,
    }
    items.value = []
    error.value = ''
  }

  // ─── Mappers ────────────────────────────────────────────────────
  function mapTransactionItems(transactionItems: any[]): PRItem[] {
    return transactionItems.map((ti: any, index: number) => ({
      id: ti.id,
      no: index + 1,
      unit: ti.products?.unit ?? '—',
      item_description: ti.products?.product_name ?? '—',
      qty: ti.qty_stock_in ?? 0,
      offer_per_unit: ti.products?.selling_price ?? 0,
      cost_per_unit: ti.products?.cost_price ?? 0,
      product_id: ti.product_id,
      sku: ti.products?.sku ?? null,
      supplier_name: ti.products?.suppliers?.name ?? '—',
      supplier_id: ti.products?.supplier_id != null ? String(ti.products.supplier_id) : null,
      expiry_date: ti.products?.expiry_date ?? null,
      actual_count_stock_in: ti.actual_count_stock_in ?? null,
    }))
  }

  function resolveUserNames(createdBy: string | null, approvedBy: string | null) {
    const findName = (id: string | null) =>
      authStore.users.find((u) => u.id === id)?.full_name?.toUpperCase() ?? '—'
    return {
      requester_name: findName(createdBy),
      reviewer_name: findName(approvedBy),
    }
  }

  function mapToPR(
    tx: any,
    prItems: PRItem[],
    names: { requester_name: string; reviewer_name: string },
  ): PR {
    return {
      id: tx.id,
      requisition_no: tx.requisition_no,
      po_no: tx.po_no,
      status: tx.status,
      remarks: tx.remarks,
      total_amount: tx.total_amount,
      supplier_id: tx.supplier_id,
      created_at: tx.created_at,
      created_by: tx.created_by,
      approved_by: tx.approved_by,
      updated_at: tx.updated_at,
      requester_name: names.requester_name,
      reviewer_name: names.reviewer_name,
      reference_no: tx.reference_no,
      recent_transaction_no: tx.recent_transaction_no ?? null,
      actual_count_stock_in: tx.actual_count_stock_in,
      items: prItems,
    }
  }

  function mapRPCItemsToPR(items: TransactionRPCRow['items']): PRItem[] {
    return (items || []).map((it, index) => ({
      id: it.id,
      no: index + 1,
      unit: it.unit ?? '—',
      item_description: it.product_name ?? '—',
      qty: it.qty_stock_in ?? 0,
      offer_per_unit: it.selling_price ?? 0,
      cost_per_unit: it.cost_price ?? 0,
      product_id: it.product_id,
      sku: it.sku ?? null,
      supplier_name: it.supplier_name ?? '—',
      supplier_id: it.supplier_id != null ? String(it.supplier_id) : null,
      expiry_date: it.expiry_date ?? null,
      actual_count_stock_in: it.actual_count_stock_in ?? null,
    }))
  }

  function mapRPCRowToPR(
    row: TransactionRPCRow,
    names: { requester_name: string; reviewer_name: string },
  ): PR {
    return {
      id: row.id,
      requisition_no: row.requisition_no ?? '',
      po_no: row.po_no,
      status: row.status ?? '',
      remarks: row.remarks,
      total_amount: row.total_amount ?? 0,
      supplier_id: row.supplier_id ? String(row.supplier_id) : null,
      created_at: row.created_at,
      created_by: row.created_by ?? '',
      approved_by: row.approved_by,
      updated_at: row.updated_at,
      requester_name: names.requester_name,
      reviewer_name: names.reviewer_name,
      reference_no: row.reference_no,
      recent_transaction_no: row.recent_transaction_no,
      actual_count_stock_in: null,
      items: mapRPCItemsToPR(row.items),
    }
  }

  // ─── Update PR (from PREditDialog) ──────────────────────────────
  async function updatePR(payload: {
    prId: number
    items: PRItem[]
    remarks: string
  }): Promise<boolean> {
    loading.value = true
    error.value = ''

    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) {
      toast.error('User not authenticated.')
      loading.value = false
      return false
    }

    // 1. Update transaction remarks + recalculate total_amount from the
    //    edited line items — matches savePurchaseRequisition's convention
    //    (total_amount = Σ qty × cost_per_unit). Without this, editing a
    //    PR (cost/unit, qty, add/remove items) leaves the stored total
    //    stale, so approval dialogs show the wrong amount.
    const companyCostTotal = payload.items.reduce(
      (sum, i) => sum + (i.qty || 0) * (i.cost_per_unit || 0),
      0,
    )

    const { error: updateError } = await supabase
      .from('transactions')
      .update({
        remarks: payload.remarks,
        total_amount: companyCostTotal,
        updated_at: new Date().toISOString(),
      })
      .eq('id', payload.prId)

    if (updateError) {
      handleError(updateError, 'Failed to update purchase requisition.')
      toast.error('Failed to update purchase requisition.')
      loading.value = false
      return false
    }

    // 2. Fetch existing transaction_items — pulling product fields too, so
    // we can tell whether an "existing" line item's product identity
    // actually changed (renamed/re-supplied/etc.) vs. just its qty.
    const { data: existingItems, error: fetchItemsError } = await supabase
      .from('transaction_items')
      .select(
        'id, product_id, products ( product_name, unit, supplier_id, expiry_date, sku, cost_price, selling_price )',
      )
      .eq('transaction_id', payload.prId)

    if (fetchItemsError) {
      handleError(fetchItemsError, 'Failed to fetch existing items.')
      toast.error('Failed to fetch existing items.')
      loading.value = false
      return false
    }

    const existingItemIds = (existingItems || []).map((i) => i.id)
    const incomingItemIds = payload.items
      .filter((i) => typeof i.id === 'number' && i.id > 0 && existingItemIds.includes(i.id))
      .map((i) => i.id)

    // 3. Delete items that were removed
    const idsToDelete = existingItemIds.filter((id) => !incomingItemIds.includes(id))
    if (idsToDelete.length) {
      const { error: deleteError } = await supabase
        .from('transaction_items')
        .delete()
        .in('id', idsToDelete)

      if (deleteError) {
        handleError(deleteError, 'Failed to remove items.')
        toast.error('Failed to remove items.')
        loading.value = false
        return false
      }
    }

    // 4. Brand-new items (temp IDs like Date.now(), not in existingItemIds)
    const newItems = payload.items.filter(
      (i) => !(typeof i.id === 'number' && i.id > 0 && existingItemIds.includes(i.id)),
    )

    // 5. Existing items whose product identity OR pricing changed vs. what's
    //    on file. Price edits must be routed through the product-resolution
    //    path so they propagate back to the products table — otherwise a
    //    price-only edit is silently dropped (it's classified "unchanged"
    //    and only qty gets written).
    const existingToUpdate = payload.items.filter((i) => existingItemIds.includes(i.id))

    const changedExistingItems = existingToUpdate.filter((item) => {
      const onFile = existingItems!.find((e) => e.id === item.id)
      const product = Array.isArray(onFile?.products) ? onFile?.products[0] : onFile?.products
      if (!product) return true // no linked product on file — treat as changed
      const supplierId = item.supplier_id ? Number(item.supplier_id) : null
      const priceDiffers =
        Math.abs(Number(product.cost_price ?? 0) - Number(item.cost_per_unit ?? 0)) > 0.001 ||
        Math.abs(Number(product.selling_price ?? 0) - Number(item.offer_per_unit ?? 0)) > 0.001
      return (
        product.product_name !== item.item_description ||
        product.unit !== item.unit ||
        (product.supplier_id ?? null) !== supplierId ||
        (product.expiry_date ?? null) !== (item.expiry_date ?? null) ||
        priceDiffers
      )
    })

    // Unchanged existing items — qty-only update.
    const unchangedExistingItems = existingToUpdate.filter(
      (item) => !changedExistingItems.includes(item),
    )

    // ── Track price edits so they can be synced back to the underlying
    // product rows after items are persisted.
    const priceSyncByProduct = new Map<number, { cost: number; offer: number }>()
    const recordPrice = (productId: number | undefined | null, item: PRItem) => {
      if (productId == null || productId <= 0) return
      priceSyncByProduct.set(productId, {
        cost: Number(item.cost_per_unit ?? 0),
        offer: Number(item.offer_per_unit ?? 0),
      })
    }

    // ── Resolve products for BOTH brand-new items and changed-existing
    // items in one combined pass.
    const itemsNeedingProduct = [...newItems, ...changedExistingItems]

    if (itemsNeedingProduct.length) {
      const names = [
        ...new Set(itemsNeedingProduct.map((i) => i.item_description).filter(Boolean)),
      ]
      const { data: candidatesByName, error: productsFetchError } = await supabase
        .from('products')
        .select('id, product_name, supplier_id, unit, expiry_date, sku')
        .in('product_name', names)

      if (productsFetchError) {
        handleError(productsFetchError, 'Failed to check existing products.')
        toast.error('Failed to check existing products.')
        loading.value = false
        return false
      }

      const idsAlreadyCovered = new Set((candidatesByName || []).map((p) => p.id))
      const idsToFetch = [
        ...new Set(
          itemsNeedingProduct
            .map((i) => i.product_id)
            .filter((id): id is number => id != null && id > 0 && !idsAlreadyCovered.has(id)),
        ),
      ]
      let candidatesById: typeof candidatesByName = []
      if (idsToFetch.length) {
        const { data } = await supabase
          .from('products')
          .select('id, product_name, supplier_id, unit, expiry_date, sku')
          .in('id', idsToFetch)
        candidatesById = data || []
      }
      const allCandidates = [...(candidatesByName || []), ...candidatesById]

      // expiry_date is the BATCH identity — always compared as its own gate,
      // never bundled in with "cosmetic" fields like name/unit/supplier.
      const sameExpiry = (a: string | null | undefined, b: string | null | undefined) =>
        (a ?? null) === (b ?? null)

      const findExactMatch = (
        name: string,
        supplierId: number | null,
        unit: string,
        expiryDate: string | null,
        requireSku: boolean,
      ) =>
        allCandidates.find(
          (p) =>
            p.product_name === name &&
            (p.supplier_id ?? null) === (supplierId ?? null) &&
            p.unit === unit &&
            sameExpiry(p.expiry_date, expiryDate) &&
            (!requireSku || !!p.sku),
        )

      const skuMismatchWarnings: { itemDescription: string; sku: string }[] = []

      const productIdByIndex: (number | null)[] = itemsNeedingProduct.map((item) => {
        const supplierId = item.supplier_id ? Number(item.supplier_id) : null
        let resolvedId: number | null = null

        // ── Tier 1/2 — only apply if item.product_id points at a product
        // that is STILL THE SAME BATCH (expiry_date unchanged). If expiry
        // differs, the picked product_id is discarded outright — a changed
        // expiry always means "find or create the row for this batch," never
        // "keep reusing the old batch's row."
        if (item.product_id != null && item.product_id > 0) {
          const picked = allCandidates.find((p) => p.id === item.product_id)
          if (picked && sameExpiry(picked.expiry_date, item.expiry_date ?? null)) {
            const exactCosmetic =
              picked.unit === item.unit &&
              picked.product_name === item.item_description &&
              (picked.supplier_id ?? null) === supplierId

            if (exactCosmetic) {
              // Tier 1 — exact match on every field, including expiry.
              resolvedId = picked.id
            } else if (picked.sku) {
              // Tier 2 — same batch (expiry matches), only a cosmetic
              // field (name typo/unit/supplier) differs, and it's already
              // tracked stock. Reuse it, just warn.
              resolvedId = picked.id
              skuMismatchWarnings.push({
                itemDescription: item.item_description,
                sku: picked.sku,
              })
            }
            // else: same expiry, cosmetic mismatch, no SKU yet — falls
            // through to tier 3/4 below, same as a genuinely new item.
          }
          // else: no picked product, or expiry_date changed — falls through.
        }

        // ── Tier 3 — no usable product_id (or it was discarded above).
        // Look for an EXACT match (name + unit + supplier + expiry, i.e.
        // this exact batch) that's already SKU-tracked — reuse instead of
        // duplicating a real, received batch.
        if (resolvedId === null) {
          const skuMatch = findExactMatch(
            item.item_description,
            supplierId,
            item.unit,
            item.expiry_date ?? null,
            true, // requireSku
          )
          if (skuMatch) resolvedId = skuMatch.id
        }

        // ── Tier 4 — fallback exact match for not-yet-received batches
        // (no SKU requirement).
        if (resolvedId === null) {
          const match = findExactMatch(
            item.item_description,
            supplierId,
            item.unit,
            item.expiry_date ?? null,
            false,
          )
          if (match) resolvedId = match.id
        }

        // null here means: no existing row for this exact batch — create one.
        return resolvedId
      })

      if (skuMismatchWarnings.length) {
        console.warn(
          'updatePR: reused SKU-tracked product(s) despite cosmetic field differences (same batch/expiry):',
          skuMismatchWarnings,
        )
        toast.warning(
          `Note: "${skuMismatchWarnings[0].itemDescription}" is already tracked (SKU ${skuMismatchWarnings[0].sku}) for this batch — reused that product instead of creating a duplicate.`,
        )
      }

      // ── Tier 5 — create products that matched nothing above (genuinely
      // new batches, or genuinely new products).
      const toCreateIndexes = productIdByIndex
        .map((id, idx) => (id === null ? idx : -1))
        .filter((idx) => idx !== -1)

      if (toCreateIndexes.length) {
        const productInserts = toCreateIndexes.map((idx) => {
          const item = itemsNeedingProduct[idx]
          return {
            product_name: item.item_description,
            unit: item.unit,
            cost_price: item.cost_per_unit,
            selling_price: item.offer_per_unit,
            supplier_id: item.supplier_id ? Number(item.supplier_id) : null,
            status: 'active',
            expiry_date: item.expiry_date ?? null,
            current_stock: 0,
          }
        })

        const { data: productData, error: productError } = await supabase
          .from('products')
          .insert(productInserts)
          .select('id')

        if (productError || !productData) {
          handleError(productError, 'Failed to create products.')
          toast.error('Failed to create products for new/edited items.')
          loading.value = false
          return false
        }

        toCreateIndexes.forEach((idx, i) => {
          productIdByIndex[idx] = productData[i].id
        })
      }

      const newItemsProductIds = productIdByIndex.slice(0, newItems.length)
      const changedItemsProductIds = productIdByIndex.slice(newItems.length)

      // Record price edits for every item whose product was resolved this
      // pass (new items resolved to a reused batch, or existing items
      // re-linked/re-batched). Newly-created products already carry the
      // prices from their insert, but re-recording them is harmless.
      newItems.forEach((item, index) => recordPrice(newItemsProductIds[index], item))
      changedExistingItems.forEach((item, index) =>
        recordPrice(changedItemsProductIds[index], item),
      )

      if (newItems.length) {
        const { error: insertError } = await supabase.from('transaction_items').insert(
          newItems.map((item, index) => ({
            transaction_id: payload.prId,
            product_id: newItemsProductIds[index]!,
            qty_stock_in: item.qty,
          })),
        )
        if (insertError) {
          handleError(insertError, 'Failed to add new items.')
          toast.error('Failed to add new items.')
          loading.value = false
          return false
        }
      }

      for (let index = 0; index < changedExistingItems.length; index++) {
        const item = changedExistingItems[index]
        const { error: updateItemError } = await supabase
          .from('transaction_items')
          .update({ product_id: changedItemsProductIds[index]!, qty_stock_in: item.qty })
          .eq('id', item.id)

        if (updateItemError) {
          handleError(updateItemError, `Failed to update item ${item.id}.`)
          toast.error(`Failed to update item ${item.id}.`)
          loading.value = false
          return false
        }
      }
    }

    // 6. Unchanged existing items — qty-only.
    for (const item of unchangedExistingItems) {
      const { error: updateItemError } = await supabase
        .from('transaction_items')
        .update({ qty_stock_in: item.qty })
        .eq('id', item.id)

      if (updateItemError) {
        handleError(updateItemError, `Failed to update item ${item.id}.`)
        toast.error(`Failed to update item ${item.id}.`)
        loading.value = false
        return false
      }
    }

    // 7. Sync edited prices back to the underlying product rows. PR line
    //    items read qty from transaction_items but unit prices from
    //    products.cost_price / products.selling_price (join in
    //    mapTransactionItems), so edits must land on the products table or
    //    the PR would still display the old prices after saving.
    for (const [productId, { cost, offer }] of priceSyncByProduct) {
      const { error: priceError } = await supabase
        .from('products')
        .update({ cost_price: cost, selling_price: offer })
        .eq('id', productId)

      if (priceError) {
        console.warn(
          `updatePR: failed to sync product ${productId} prices (${cost}/${offer}):`,
          priceError.message,
        )
      }
    }

    toast.success('Purchase requisition updated successfully.')
    loading.value = false
    return true
  }

  // ─── PR Actions ─────────────────────────────────────────────────
  // A failure after the header insert used to leave a real, numbered PR
  // (status='pending_approval') sitting in the DB with zero line items —
  // approvable-looking but nothing to actually approve. Roll it back instead.
  async function rollbackPR(id: number) {
    await supabase.from('transaction_items').delete().eq('transaction_id', id)
    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', id)
      .eq('transaction_type', 'purchase_requisition')
    if (error)
      console.warn(
        'savePurchaseRequisition: rollback of partial PR failed — orphan header left behind, id:',
        id,
        error.message,
      )
  }

  async function savePurchaseRequisition() {
    loading.value = true
    error.value = ''

    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) {
      toast.error('User not authenticated.')
      loading.value = false
      return { success: false }
    }

    const companyCostTotal = items.value.reduce((sum, i) => sum + i.qty * i.cost_per_unit, 0)

    const {
      data: txData,
      docNo: prNumber,
      error: txError,
    } = await insertWithDocRetry<{ id: number; reference_no: string | null }>(
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
            remarks: currentPR.value.remarks ?? '',
            total_amount: companyCostTotal,
            supplier_id: null,
            created_by: user.id,
          })
          .select('id, reference_no')
          .single(),
    )

    //console.log('[savePurchaseRequisition] prNumber:', prNumber, 'txData:', txData)

    if (txError || !txData) {
      handleError(txError, 'Failed to save purchase requisition.')
      toast.error('Failed to save Purchase Requisition. Please try again.')
      loading.value = false
      return { success: false }
    }

    // ─── Check for existing products (matched by product_name + supplier_id) ──
    const names = [...new Set(items.value.map((i) => i.item_description))]
    const { data: existingProducts, error: existingError } = await supabase
      .from('products')
      .select('id, product_name, supplier_id, unit, expiry_date') // + expiry_date
      .in('product_name', names)

    if (existingError) {
      handleError(existingError, 'Failed to check existing products.')
      toast.error('Failed to check existing products. Please try again.')
      await rollbackPR(txData.id)
      loading.value = false
      return { success: false }
    }

    const findExisting = (
      name: string,
      supplierId: number | null,
      unit: string,
      expiryDate: string | null,
    ) =>
      (existingProducts || []).find(
        (p) =>
          p.product_name === name &&
          (p.supplier_id ?? null) === (supplierId ?? null) &&
          p.unit === unit &&
          (p.expiry_date ?? null) === (expiryDate ?? null),
      )

    // One slot per PR item: existing product id, or null if it needs to be created
    const productIdByIndex: (number | null)[] = items.value.map((item) => {
      const supplierId = item.supplier_id ? Number(item.supplier_id) : null

      if (item.product_id != null) {
        const pickedProduct = (existingProducts || []).find((p) => p.id === item.product_id)

        if (
          pickedProduct &&
          pickedProduct.unit === item.unit &&
          pickedProduct.product_name === item.item_description &&
          (pickedProduct.expiry_date ?? null) === (item.expiry_date ?? null)
        ) {
          return item.product_id
        }
      }

      const match = findExisting(
        item.item_description,
        supplierId,
        item.unit,
        item.expiry_date ?? null,
      )
      return match ? match.id : null
    })

    // ─── Only insert products that don't already exist ──
    const newItemIndexes = productIdByIndex
      .map((id, idx) => (id === null ? idx : -1))
      .filter((idx) => idx !== -1)

    if (newItemIndexes.length) {
      const productInserts = newItemIndexes.map((idx) => {
        const item = items.value[idx]
        return {
          product_name: item.item_description,
          unit: item.unit,
          cost_price: item.cost_per_unit,
          selling_price: item.offer_per_unit,
          supplier_id: item.supplier_id ? Number(item.supplier_id) : null,
          status: 'active',
          expiry_date: item.expiry_date ?? null,
          current_stock: 0,
        }
      })

      const { data: productData, error: productError } = await supabase
        .from('products')
        .insert(productInserts)
        .select('id')

      if (productError || !productData) {
        handleError(productError, 'Failed to save products.')
        toast.error('Failed to save products. Please try again.')
        await rollbackPR(txData.id)
        loading.value = false
        return { success: false }
      }

      newItemIndexes.forEach((idx, i) => {
        productIdByIndex[idx] = productData[i].id
      })
    }

    const { error: itemsError } = await supabase.from('transaction_items').insert(
      items.value.map((item, index) => ({
        transaction_id: txData.id,
        product_id: productIdByIndex[index]!,
        qty_stock_in: item.qty,
      })),
    )

    if (itemsError) {
      handleError(itemsError, 'Failed to save transaction items.')
      toast.error('Failed to save transaction items. Please try again.')
      await rollbackPR(txData.id)
      loading.value = false
      return { success: false }
    }

    toast.success('Purchase Requisition saved successfully.')
    resetStore()
    loading.value = false
    return { success: true, transactionId: txData.id, requisitionNo: prNumber }
  }

  async function fetchPurchaseRequisition() {
    loading.value = true
    error.value = ''

    if (!authStore.users.length) await authStore.getAllUsers()

    const { data, error: fetchError } = await supabase
      .from('transactions')
      .select(
        `
        *,
        transaction_items (
          id, product_id, qty_stock_in, actual_count_stock_in,
          products ( id, product_name, unit, cost_price, selling_price, sku, supplier_id, expiry_date, suppliers ( name ) )
        )
      `,
      )
      .not('requisition_no', 'is', null)
      .order('created_at', { ascending: false })

    if (fetchError) {
      toast.error('Failed to fetch Purchase Requisitions. Please try again.')
      loading.value = false
      return
    }

    //console.log('[fetchPurchaseRequisition] raw RPC result:', JSON.parse(JSON.stringify(data)))
    prs.value = (data || []).map((tx: any) => {
      const names = resolveUserNames(tx.created_by, tx.approved_by)
      return mapToPR(tx, mapTransactionItems(tx.transaction_items || []), names)
    })

    loading.value = false
  }

  async function fetchPRByRequisitionId(requisitionId: number): Promise<PR | null> {
    if (!authStore.users.length) await authStore.getAllUsers()

    const { data } = await supabase
      .from('transactions')
      .select(
        `
        *,
        transaction_items (
          id, product_id, qty_stock_in, actual_count_stock_in,
          products ( id, product_name, unit, cost_price, selling_price, sku, supplier_id, expiry_date, suppliers ( name ) )
        )
      `,
      )
      .eq('id', requisitionId)
      .single()

    if (!data) return null

    const names = resolveUserNames(data.created_by, data.approved_by)
    return mapToPR(data, mapTransactionItems(data.transaction_items || []), names)
  }

  async function approvePR(prId: number) {
    loading.value = true

    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) {
      toast.error('User not authenticated.')
      loading.value = false
      return { success: false }
    }

    const { error: updateError } = await supabase
      .from('transactions')
      .update({ status: 'approved', approved_by: user.id, updated_at: new Date().toISOString() })
      .eq('id', prId)

    if (updateError) {
      toast.error('Failed to approve Purchase Requisition. Please try again.')
      loading.value = false
      return
    }
    // NEW — approving a PR is what actually resolves any reorder requests
    // that fed into it (not PR submission, which was the old, incorrect
    // trigger). Look up this PR's line items to find matching products.
    const { data: prItems } = await supabase
      .from('transaction_items')
      .select('product_id')
      .eq('transaction_id', prId)

    const productIds = (prItems || [])
      .map((i) => i.product_id)
      .filter((id): id is number => id != null)

    if (productIds.length) {
      const productsStore = useProductsDataStore()
      await productsStore.approveReorderRequestsByProduct(productIds)
    }

    toast.success('Purchase Requisition approved successfully.')
    await fetchPurchaseRequisition()
    loading.value = false
  }

  async function rejectPR(prId: number) {
    loading.value = true

    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) {
      toast.error('User not authenticated.')
      loading.value = false
      return { success: false }
    }

    const { error: updateError } = await supabase
      .from('transactions')
      .update({ status: 'rejected', approved_by: user.id, updated_at: new Date().toISOString() })
      .eq('id', prId)

    if (updateError) {
      toast.error('Failed to reject Purchase Requisition. Please try again.')
      loading.value = false
      return
    }

    // NEW — mirrors approvePR: reject any reorder requests tied to this PR's
    // products. They stay visible as 'rejected' but remain re-flaggable,
    // since createReorderRequest's duplicate-guard only blocks on 'pending'.
    const { data: prItems } = await supabase
      .from('transaction_items')
      .select('product_id')
      .eq('transaction_id', prId)

    const productIds = (prItems || [])
      .map((i) => i.product_id)
      .filter((id): id is number => id != null)

    if (productIds.length) {
      const productsStore = useProductsDataStore()
      await productsStore.rejectReorderRequestsByProduct(productIds)
    }

    toast.success('Purchase Requisition rejected successfully.')
    await fetchPurchaseRequisition()
    loading.value = false
  }

  // ─── PO Actions ─────────────────────────────────────────────────
  async function issuePurchaseOrder(payload: { pr: PR; ship_via: string; ship_method: string }) {
    loading.value = true

    // Guarded on status='approved' + .select() so a stale/duplicate click
    // (e.g. the PR got rejected in another tab between load and confirm)
    // can't re-issue a PO and re-mint a number for it — a no-op update
    // (0 rows) is reported as a failure instead of silently "succeeding."
    // PO number lands in reference_no (unique-indexed) here — unlike In-House's
    // agreeOrder, which stamps its company PO into po_no (no unique index) —
    // so a same-instant collision is possible and worth retrying on.
    const {
      data,
      docNo: poNumber,
      error: updateError,
    } = await insertWithDocRetry<{ id: number }[]>(
      () => generateDocNumber('PO', getLatestReferenceNo),
      async (docNo) =>
        supabase
          .from('transactions')
          .update({
            transaction_type: 'purchase_order',
            status: 'ordered',
            reference_no: docNo,
            requisition_no: payload.pr.reference_no,
            ship_via: payload.ship_via,
            ship_method: payload.ship_method,
            updated_at: new Date().toISOString(),
          })
          .eq('id', payload.pr.id)
          .eq('status', 'approved')
          .eq('reference_no', payload.pr.reference_no)
          .select('id'),
    )

    //console.log('[issuePurchaseOrder] Supabase response:', { data, error: updateError, poNumber })

    loading.value = false

    if (updateError) {
      handleError(updateError, 'Failed to issue purchase order.')
      toast.error('Failed to issue purchase order.')
      return { success: false }
    }
    if (!data?.length) {
      toast.error('This purchase requisition is no longer approved — refresh and try again.')
      return { success: false }
    }

    // NEW — issuing a PO is what moves any reorder requests behind this PR
    // from approved -> awaiting_stock (they're now waiting on physical
    // delivery, not just PM sign-off).
    const productIds = payload.pr.items
      .map((i) => i.product_id)
      .filter((id): id is number => id != null)

    if (productIds.length) {
      const productsStore = useProductsDataStore()
      await productsStore.markReorderRequestsAwaitingStock(productIds)
    }

    toast.success('Purchase order issued successfully!')
    return { success: true }
  }

  async function markPOAsReceived(po: {
    id: number
    reference_no: string | null
  }): Promise<boolean> {
    loading.value = true

    // Guarded on status='issued' so a retry after a failed/partial receive
    // can't re-mint a second SI number for a PO already marked complete.
    const { data, error: updateError } = await insertWithDocRetry<{ id: number }[]>(
      () => generateDocNumber('SI', getLatestReferenceNo),
      async (docNo) =>
        supabase
          .from('transactions')
          .update({
            reference_no: docNo,
            po_no: po.reference_no,
            transaction_type: 'stock_in',
            status: 'complete',
            updated_at: new Date().toISOString(),
          })
          .eq('id', po.id)
          .eq('status', 'ordered')
          .select('id'),
    )

    loading.value = false

    if (updateError) {
      handleError(updateError, 'Failed to mark as received.')
      toast.error('Failed to mark purchase order as received.')
      return false
    }
    if (!data?.length) {
      toast.error('This purchase order was already marked received — refresh the list.')
      return false
    }

    toast.success('Purchase order marked as received.')
    return true
  }

  // ─── Realtime ───────────────────────────────────────────────────
  function subscribeToPurchaseRequisitions() {
    subscriptionChannel.value = supabase
      .channel('transactions_pr_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transactions',
          filter: 'transaction_type=eq.purchase_requisition',
        },
        async () => {
          await fetchPurchaseRequisition()
        },
      )
      .subscribe()
  }

  function unsubscribeFromPurchaseRequisitions() {
    if (subscriptionChannel.value) {
      supabase.removeChannel(subscriptionChannel.value)
      subscriptionChannel.value = null
    }
  }

  // ─── Expose ─────────────────────────────────────────────────────
  return {
    // Generate reference numbers

    getLatestReferenceNo,
    // State
    prs,
    selectedPR,
    filterStatus,
    items,
    currentPR,
    loading,
    error,

    // Computed
    isLoading,
    hasError,

    resolveUserNames,
    mapToPR,
    mapTransactionItems,
    mapRPCRowToPR,
    mapRPCItemsToPR,

    // PR actions
    updatePR,
    savePurchaseRequisition,
    resetStore,
    fetchPurchaseRequisition,
    fetchPRByRequisitionId,
    approvePR,
    rejectPR,

    // PO actions
    issuePurchaseOrder,
    markPOAsReceived,

    // Realtime
    subscribeToPurchaseRequisitions,
    unsubscribeFromPurchaseRequisitions,
  }
})

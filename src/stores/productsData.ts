import { supabase } from '@/lib/supabase'
import { useToast } from 'vue-toastification'

const toast = useToast()

// Type definition for purchase_requisition_items
export type PurchaseRequisitionItem = {
  id?: number
  created_at?: string
  requisition_id?: number | null
  no?: number | null
  unit?: string | null
  item_description?: string | null
  qty?: number | null
  offer_per_unit?: number | null
  cost_per_unit?: number | null
  category?: string | null
  cost_price?: number | null
  sell_price?: number | null
  val_cost?: number | null
  val_sell?: number | null
  total_sold?: number | null
  transfered?: number | null
  adjusted?: number | null
  expiry_date?: string | null
  reorder_pt?: number | null
  SKU?: number | null
}

// Create a new purchase requisition item
export async function createPurchaseRequisitionItem(
  item: Omit<PurchaseRequisitionItem, 'id' | 'created_at'>
) {
  try {
    const { data, error } = await supabase
      .from('purchase_requisition_items')
      .insert(item)
      .select()
      .single()

    if (error) throw error

    toast.success('Item created successfully.')
    return { success: true, data }
  } catch (err: any) {
    console.error('Error creating item:', err)
    toast.error(err.message || 'Failed to create item.')
    return { success: false, error: err.message }
  }
}

// Read all purchase requisition items
export async function fetchPurchaseRequisitionItems(requisitionId?: number) {
  try {
    let query = supabase.from('purchase_requisition_items').select('*')

    if (requisitionId) {
      query = query.eq('requisition_id', requisitionId)
    }

    const { data, error } = await query.order('no', { ascending: true })

    if (error) throw error

    return { success: true, data }
  } catch (err: any) {
    console.error('Error fetching items:', err)
    toast.error('Failed to fetch items.')
    return { success: false, error: err.message, data: [] }
  }
}

// Read a single purchase requisition item by ID
export async function fetchPurchaseRequisitionItemById(itemId: number) {
  try {
    const { data, error } = await supabase
      .from('purchase_requisition_items')
      .select('*')
      .eq('id', itemId)
      .single()

    if (error) throw error

    return { success: true, data }
  } catch (err: any) {
    console.error('Error fetching item:', err)
    toast.error('Failed to fetch item.')
    return { success: false, error: err.message, data: null }
  }
}

// Update a purchase requisition item
export async function updatePurchaseRequisitionItem(
  itemId: number,
  updates: Partial<PurchaseRequisitionItem>
) {
  try {
    const { data, error } = await supabase
      .from('purchase_requisition_items')
      .update(updates)
      .eq('id', itemId)
      .select()
      .single()

    if (error) throw error

    toast.success('Item updated successfully.')
    return { success: true, data }
  } catch (err: any) {
    console.error('Error updating item:', err)
    toast.error(err.message || 'Failed to update item.')
    return { success: false, error: err.message }
  }
}

// Update SKU for a purchase requisition item
export async function updateItemSku(itemId: number, sku: number | null) {
  try {
    const { data, error } = await supabase
      .from('purchase_requisition_items')
      .update({ SKU: sku })
      .eq('id', itemId)
      .select()
      .single()

    if (error) throw error

    toast.success('SKU updated successfully.')
    return { success: true, data }
  } catch (err: any) {
    console.error('Error updating SKU:', err)
    toast.error(err.message || 'Failed to update SKU.')
    return { success: false, error: err.message }
  }
}

// Delete a purchase requisition item
export async function deletePurchaseRequisitionItem(itemId: number) {
  try {
    const { error } = await supabase
      .from('purchase_requisition_items')
      .delete()
      .eq('id', itemId)

    if (error) throw error

    toast.success('Item deleted successfully.')
    return { success: true }
  } catch (err: any) {
    console.error('Error deleting item:', err)
    toast.error(err.message || 'Failed to delete item.')
    return { success: false, error: err.message }
  }
}

// Delete all items for a requisition
export async function deletePurchaseRequisitionItemsByRequisitionId(requisitionId: number) {
  try {
    const { error } = await supabase
      .from('purchase_requisition_items')
      .delete()
      .eq('requisition_id', requisitionId)

    if (error) throw error

    toast.success('Items deleted successfully.')
    return { success: true }
  } catch (err: any) {
    console.error('Error deleting items:', err)
    toast.error(err.message || 'Failed to delete items.')
    return { success: false, error: err.message }
  }
}

// Create multiple items at once
export async function createMultiplePurchaseRequisitionItems(
  items: Omit<PurchaseRequisitionItem, 'id' | 'created_at'>[]
) {
  try {
    const { data, error } = await supabase
      .from('purchase_requisition_items')
      .insert(items)
      .select()

    if (error) throw error

    toast.success(`${items.length} items created successfully.`)
    return { success: true, data }
  } catch (err: any) {
    console.error('Error creating items:', err)
    toast.error(err.message || 'Failed to create items.')
    return { success: false, error: err.message }
  }
}
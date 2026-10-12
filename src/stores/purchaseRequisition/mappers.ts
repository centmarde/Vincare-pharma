// Mappers: convert raw Supabase/RPC rows into the store's PR shapes. Gisplit
// kini sa ilahang file aron ang prActions/poActions maka-consume sa same
// mappers without duplicating them.

import { useAuthUserStore } from '@/stores/authUser'
import type { TransactionRPCRow } from '@/stores/transactionsData'
import type { PR, PRItem } from './types'

// authStore gi-hold as a lazy singleton para sa user-name resolution (para dili
// ma-trigger ang Pinia setup sa import time, same as reorder sa products).
let authStore: ReturnType<typeof useAuthUserStore> | null = null
const getAuthStore = () => (authStore ??= useAuthUserStore())

export function mapTransactionItems(transactionItems: any[]): PRItem[] {
  return transactionItems.map((ti: any, index: number) => ({
    id: ti.id,
    no: index + 1,
    unit: ti.products?.unit ?? '—',
    product_name: ti.products?.product_name ?? '—',
    qty: ti.qty_stock_in ?? 0,
    // Line snapshot wins over the product master, per gl_sum_cost's convention.
    cost_per_unit: ti.cost_price ?? ti.unit_price ?? ti.products?.cost_price ?? 0,
    product_id: ti.product_id,
    sku: ti.products?.sku ?? null,
    supplier_name: ti.products?.suppliers?.name ?? '—',
    supplier_id: ti.products?.supplier_id != null ? String(ti.products.supplier_id) : null,
    expiry_date: ti.products?.expiry_date ?? null,
    batch_no: ti.batch_no ?? null,
    actual_count_stock_in: ti.actual_count_stock_in ?? null,
  }))
}

export function resolveUserNames(createdBy: string | null, approvedBy: string | null) {
  const findName = (id: string | null) =>
    getAuthStore().users.find((u) => u.id === id)?.full_name?.toUpperCase() ?? '—'
  return {
    requester_name: findName(createdBy),
    reviewer_name: findName(approvedBy),
  }
}

export function mapToPR(
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

export function mapRPCItemsToPR(items: TransactionRPCRow['items']): PRItem[] {
  return (items || []).map((it, index) => ({
    id: it.id,
    no: index + 1,
    unit: it.unit ?? '—',
    product_name: it.product_name ?? '—',
    qty: it.qty_stock_in ?? 0,
    cost_per_unit: it.cost_price ?? 0,
    product_id: it.product_id,
    sku: it.sku ?? null,
    supplier_name: it.supplier_name ?? '—',
    supplier_id: it.supplier_id != null ? String(it.supplier_id) : null,
    expiry_date: it.expiry_date ?? null,
    batch_no: it.batch_no ?? null,
    actual_count_stock_in: it.actual_count_stock_in ?? null,
  }))
}

export function mapRPCRowToPR(
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
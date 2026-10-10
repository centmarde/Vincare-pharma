// Row mappers: a transactions row (plus its embedded extension tables) to the
// view-model types the Finance pages read.

import type { ExpenseType, PettyCashReplenishmentType, SupplierPaymentType } from './types'

// Scalar finance fields (category/paid_to/department/or_si_no) live in the
// finance_details extension table (20260702000004). The two ENTITY FKs
// (cash_account_id, funding_account_id) were moved back onto the transactions
// hub in 20260702000009 — read them off the row, join the account by name at
// top level. finance_details.cash_account_id is a dormant fallback for rows
// not yet backfilled.
export function mapExpenseRow(row: any): ExpenseType {
  const details = row.finance_details ?? {}
  return {
    id: row.id,
    created_at: row.created_at,
    reference_no: row.expense_no,
    category: details.category ?? row.category ?? null,
    department: details.department ?? row.department ?? null,
    or_si_no: details.or_si_no ?? row.or_si_no ?? null,
    paid_to: details.paid_to ?? row.paid_to ?? null,
    payment_method: row.payment_method,
    amount: row.total_amount,
    paid_at: row.paid_at,
    remarks: row.remarks,
    created_by: row.created_by,
    cash_account_id: row.cash_account_id ?? details.cash_account_id ?? null,
    cash_account_name: row.cash_account?.name ?? null,
    status: row.status,
  }
}

// Both account FKs are on the transactions hub now (20260702000009); a
// replenishment no longer writes a finance_details row at all.
export function mapReplenishmentRow(row: any): PettyCashReplenishmentType {
  return {
    id: row.id,
    created_at: row.created_at,
    reference_no: row.reference_no,
    cash_account_id: row.cash_account_id ?? null,
    cash_account_name: row.cash_account?.name ?? null,
    funding_account_id: row.funding_account_id ?? null,
    funding_account_name: row.funding_account?.name ?? null,
    amount: row.total_amount ?? 0,
    status: row.status,
    approved_at: row.approved_at,
    remarks: row.remarks,
    created_by: row.created_by,
    liquidation_report: row.liquidation_report ?? [],
  }
}

export function mapSupplierPaymentRow(row: any): SupplierPaymentType {
  return {
    id: row.id,
    created_at: row.created_at,
    reference_no: row.reference_no,
    supplier_id: row.supplier_id,
    supplier_name: row.supplier?.name ?? null,
    payment_method: row.payment_method,
    amount: row.total_amount,
    paid_at: row.paid_at,
    remarks: row.remarks,
    created_by: row.created_by,
    status: row.status,
  }
}

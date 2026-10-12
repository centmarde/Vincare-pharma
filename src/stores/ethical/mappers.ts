// The ethical order select string and the row mapper that turns a transactions
// row (plus ethical_details and its lines) into EthicalOrderType.

import type { EthicalOrderType } from './types'

// Line values live directly on transaction_items (transaction_item_details was
// merged back in). An ethical order is outbound, so the ordered quantity is
// qty_stock_out and the delivered/sourced count is actual_count_stock_out.
export const selectOrder =
  '*, transaction_items!transaction_items_transaction_id_fkey(id, product_id, qty_stock_out, unit_price, line_total, cost_price, actual_count_stock_out, stock_sources, product:product_id(*)), customer:customer_id(*), agent:agent_id(*), outlet:outlet_id(*), ethical_details(*)'

export function mapRow(row: any): EthicalOrderType {
  const details = row.ethical_details ?? {}
  const discountAmount = details.discount_amount ?? 0
  const rebateAmount = details.rebate_amount ?? 0
  const adsAmount = details.ads_amount ?? 0
  return {
    id:             row.id,
    created_at:     row.created_at,
    order_no:       row.ethical_no,
    outlet_id:      row.outlet_id,
    outlet:         row.outlet,
    warehouse_id:   row.warehouse_id ?? null,
    customer_id:    row.customer_id,
    agent_id:       row.agent_id,
    status:         row.status,
    fulfillment_status: details.fulfillment_status ?? null,
    // total_amount = subtotal − discount (rebate is a separate payout, never
    // part of the invoice), so subtotal reconstructs as total + discount only.
    subtotal:       (row.total_amount ?? 0) + discountAmount,
    total_amount:   row.total_amount,
    discount_amount: discountAmount,
    rebate_amount:  rebateAmount,
    ads_amount:     adsAmount,
    terms_days:     details.terms_days ?? null,
    due_date:       details.due_date ?? null,
    amount_paid:    details.amount_paid ?? 0,
    paid_at:        details.paid_at ?? null,
    created_by:     row.created_by,
    remarks:        row.remarks,
    rebate_status:  details.rebate_status ?? null,
    rebate_approved_by: details.rebate_approved_by ?? null,
    rebate_approved_at: details.rebate_approved_at ?? null,
    rebate_rejected_reason: details.rebate_rejected_reason ?? null,
    rebate_paid_at: details.rebate_paid_at ?? null,
    rebate_payment_method: details.rebate_payment_method ?? null,
    rebate_reference: details.rebate_reference ?? null,
    rebate_paid_to: details.rebate_paid_to ?? null,
    rebate_cash_account_id: details.rebate_cash_account_id ?? null,
    customer:       row.customer,
    agent:          row.agent,
    items: (row.transaction_items ?? []).map((li: any) => ({
      id:            li.id,
      product_id:    li.product_id,
      quantity:      li.qty_stock_out,
      unit_price:    li.unit_price,
      line_total:    li.line_total,
      cost_price:    li.cost_price ?? null,
      delivered_qty: li.actual_count_stock_out ?? 0,
      product:       li.product,
    })),
  }
}

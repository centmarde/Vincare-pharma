// Types for the ethicalData store, shared by its feature files. Re-exported from
// the barrel (../ethicalData.ts) so existing `@/stores/ethicalData` imports
// keep resolving.

import type { ProductType } from '@/stores/productsData'
import type { CustomerType } from '@/stores/customersData'
import type { AgentType } from '@/stores/agentsData'
import type { OutletType } from '@/stores/outletsData'
import type { StockLocationId } from '@/stores/stockSourcingData'
import type { Shortfall, CanvassSelection, CanvassPRResult } from '@/utils/canvassTypes'

export type { Shortfall, CanvassSelection, CanvassPRResult }

export type EthicalItemType = {
  id: number
  product_id: number | null
  quantity: number
  unit_price: number
  line_total: number
  /** Cost snapshot taken when the line was entered — what the GL relieves. */
  cost_price: number | null
  delivered_qty: number
  product?: ProductType | null
}

export type CollectionType = {
  id: number
  created_at: string
  transaction_id: number | null
  amount: number | null
  payment_method: string | null
  reference_no: string | null
  collected_by: string | null
  agent_id: number | null
  commission_rate: number | null
  commission_amount: number | null
  commission_status: string | null
  commission_paid_at: string | null
  remarks: string | null
  // Soft void (20260720000000). Every fetch here filters voided rows out, so
  // this is null in practice — present so a future "voided payments" view can
  // read it without a type change.
  voided_at?: string | null
  void_reason?: string | null
}

export type RebateStatus = 'pending_approval' | 'approved' | 'paid' | 'rejected'
export type RebatePaymentMethod = 'cash' | 'gcash' | 'cheque' | 'bank' | 'other'

export type EthicalOrderType = {
  id: number
  created_at: string
  order_no: string | null
  outlet_id: number | null
  outlet?: OutletType | null
  /** Where the stock comes from (null = main warehouse). */
  warehouse_id: number | null
  customer_id: number | null
  agent_id: number | null
  status: string | null
  fulfillment_status: string | null
  subtotal: number | null
  total_amount: number | null
  discount_amount: number | null
  rebate_amount: number | null
  /** In-kind marketing give applied to this order. Posts to 6010, not 6030. */
  ads_amount: number | null
  terms_days: number | null
  due_date: string | null
  amount_paid: number | null
  paid_at: string | null
  created_by: string | null
  remarks: string | null
  rebate_status: RebateStatus | null
  rebate_approved_by: string | null
  rebate_approved_at: string | null
  rebate_rejected_reason: string | null
  rebate_paid_at: string | null
  rebate_payment_method: RebatePaymentMethod | null
  rebate_reference: string | null
  rebate_paid_to: string | null
  rebate_cash_account_id: number | null
  customer?: CustomerType | null
  agent?: AgentType | null
  items?: EthicalItemType[]
  collections?: CollectionType[]
}

export type EthicalLineInput = {
  product_id: number
  quantity: number
  unit_price: number
  /** Cost at the moment of invoicing — what the GL relieves from inventory. */
  cost_price?: number | null
}

export type FetchOrdersOptions = {
  status?: string
  agentId?: number
  customerId?: number
  orderBy?: 'created_at' | 'due_date' | 'total_amount'
  ascending?: boolean
}

export type CommissionSummaryRow = {
  agent_id: number | null
  agent_name: string | null
  total_commission: number
  unpaid_commission: number
  paid_commission: number
}

export type OrderPayload = {
  customerId: number
  agentId?: number | null
  outletId: number
  sourceLocationId: StockLocationId
  discount?: number
  rebate?: number
  ads?: number        // in-kind marketing give — posts to 6010, not 6030
  termsDays?: number
  remarks?: string
  lines: EthicalLineInput[]
}

// Discrepancy reports: remittance cash variances, unpaid commission aging and
// the (experimental) stock reconciliation replay.

import { supabase } from '@/lib/supabase'
import { commissionLiabilityFlagDays, stockReconCacheMs } from './types'
import type { CommissionLiabilityRow, RemittanceDiscrepancyRow, StockReconRow } from './types'
import {
  remittanceDiscrepancies,
  commissionLiability,
  stockReconciliation,
  stockReconciliationComputedAt,
  loading,
  handleError,
  clearError,
} from './state'

export async function fetchRemittanceDiscrepancies(options: { threshold?: number } = {}) {
  loading.value = true
  clearError()
  try {
    const threshold = options.threshold ?? 0.01
    // actual_amount and the bare `outlet` text code were both DROPPED from
    // transactions. actual_amount now lives only on remittance_details, and
    // the outlet code is read through the outlet_id relationship.
    const { data, error: fetchError } = await supabase.from('transactions')
      .select('id, remittance_no, outlet_id, outlet:outlet_id(code), created_at, total_amount, remarks, remittance_details(actual_amount, resolution, receivable_status)')
      .eq('transaction_type', 'remittance')
      .order('created_at', { ascending: false })
    if (fetchError) throw fetchError

    const rows: RemittanceDiscrepancyRow[] = ((data || []) as any[])
      .map((r) => {
        const actualAmount = r.remittance_details?.actual_amount ?? 0
        return {
          id: r.id,
          reference_no: r.remittance_no,
          outlet: r.outlet?.code ?? null,
          created_at: r.created_at,
          expected_amount: r.total_amount ?? 0,
          actual_amount: actualAmount,
          discrepancy: actualAmount - (r.total_amount ?? 0),
          notes: r.remarks ?? null,
          resolution: r.remittance_details?.resolution ?? null,
          receivable_status: r.remittance_details?.receivable_status ?? null,
        }
      })
      .filter((r) => Math.abs(r.discrepancy) > threshold)
    remittanceDiscrepancies.value = rows
    return rows
  } catch (err) {
    handleError(err, 'Failed to fetch remittance discrepancies')
    return []
  } finally {
    loading.value = false
  }
}

// ─── Discrepancy: commission liability (no payout ledger yet, so the signal
//     is unpaid-commission aging per agent, mirroring ethicalData's reduce) ──

export async function fetchCommissionLiability() {
  loading.value = true
  clearError()
  try {
    const { data, error: fetchError } = await supabase.from('collections')
      .select('agent_id, agent:agent_id(name), created_at, commission_amount, commission_status, commission_paid_at')
      .is('voided_at', null)   // a voided collection earns no commission
    if (fetchError) throw fetchError

    const now = Date.now()
    const grouped = new Map<number | null, {
      agent_name: string | null
      unpaid: number
      oldestUnpaidDays: number | null
      paidMissingTimestamp: number
    }>()

    for (const row of (data || []) as any[]) {
      const agentId = row.agent_id as number | null
      if (!grouped.has(agentId)) {
        grouped.set(agentId, { agent_name: row.agent?.name ?? null, unpaid: 0, oldestUnpaidDays: null, paidMissingTimestamp: 0 })
      }
      const g = grouped.get(agentId)!
      const amount = (row.commission_amount ?? 0) as number
      const isPaid = row.commission_status === 'paid'

      if (!isPaid) {
        g.unpaid += amount
        const ageDays = Math.floor((now - new Date(row.created_at).getTime()) / 86400000)
        g.oldestUnpaidDays = g.oldestUnpaidDays == null ? ageDays : Math.max(g.oldestUnpaidDays, ageDays)
      } else if (!row.commission_paid_at) {
        g.paidMissingTimestamp += 1
      }
    }

    const rows: CommissionLiabilityRow[] = Array.from(grouped.entries()).map(([agentId, g]) => ({
      agent_id: agentId,
      agent_name: g.agent_name,
      unpaid_commission: g.unpaid,
      oldest_unpaid_days: g.oldestUnpaidDays,
      flagged: (g.oldestUnpaidDays ?? 0) >= commissionLiabilityFlagDays || g.paidMissingTimestamp > 0,
      paid_missing_timestamp: g.paidMissingTimestamp,
    })).filter((r) => r.unpaid_commission > 0.01 || r.paid_missing_timestamp > 0)

    rows.sort((a, b) => (b.oldest_unpaid_days ?? -1) - (a.oldest_unpaid_days ?? -1))
    commissionLiability.value = rows
    return rows
  } catch (err) {
    handleError(err, 'Failed to fetch commission liability')
    return []
  } finally {
    loading.value = false
  }
}

// ─── Discrepancy: stock reconciliation (read-only, flag-only, experimental).
//     Recomputes expected on-hand per product/location from transaction
//     deltas and compares against current outlet_stock / products.current_stock.
//     Cancelled orders are excluded entirely since their stock impact nets to
//     zero once restored — including them would double-count, not reconcile.

export async function fetchStockReconciliation(options: { forceRefresh?: boolean } = {}) {
  // Drift-detection, not a summable fact — a stale-but-cached read is fine
  // for a few minutes (this is a "flag-only, experimental" diagnostic, not
  // a money mutation), but unlike P&L we deliberately do NOT checkpoint the
  // replay itself: a checkpoint taken while data is already drifted would
  // freeze that drift in permanently instead of continuing to flag it.
  if (
    !options.forceRefresh &&
    stockReconciliationComputedAt.value != null &&
    Date.now() - stockReconciliationComputedAt.value < stockReconCacheMs
  ) {
    return stockReconciliation.value
  }

  loading.value = true
  clearError()
  try {
    // Fetch voided POS sale IDs from pos_sale_details (hub redesign) so we
    // can exclude them in the reconciliation loop without breaking the nested
    // transaction_items join (PostgREST can't express NOT EXISTS through !inner).
    // Line values now live directly on transaction_items: inbound qty is
    // qty_stock_in, outbound qty is qty_stock_out, and the actual moved-out
    // count (transfer received / inhouse delivered) is actual_count_stock_out.
    const [stockInRes, transferRes, saleRes, ethicalRes, inhouseRes, warehouseRes, outletRes, voidedPsdRes, outletsRes] = await Promise.all([
      supabase.from('transaction_items').select('product_id, qty_stock_in, transaction:transaction_id!inner(transaction_type)').eq('transaction.transaction_type', 'stock_in'),
      supabase.from('transaction_items').select('product_id, qty_stock_out, actual_count_stock_out, transaction:transaction_id!inner(transaction_type, status, outlet_id)').eq('transaction.transaction_type', 'stock_transfer'),
      supabase.from('transaction_items').select('product_id, transaction_id, qty_stock_out, transaction:transaction_id!inner(transaction_type, status, outlet_id)').eq('transaction.transaction_type', 'sale'),
      supabase.from('transaction_items').select('product_id, actual_count_stock_out, transaction:transaction_id!inner(transaction_type, status, warehouse_id)').eq('transaction.transaction_type', 'ethical_order'),
      supabase.from('transaction_items').select('product_id, actual_count_stock_out, transaction:transaction_id!inner(transaction_type)').eq('transaction.transaction_type', 'inhouse_order'),
      supabase.from('products').select('id, product_name, current_stock'),
      supabase.from('outlet_stock').select('product_id, outlet, quantity, product:product_id(product_name)'),
      supabase.from('pos_sale_details').select('transaction_id').not('voided_at', 'is', null),
      supabase.from('outlets').select('id, code'),
    ])
    for (const res of [stockInRes, transferRes, saleRes, ethicalRes, inhouseRes, warehouseRes, outletRes, voidedPsdRes, outletsRes]) {
      if (res.error) throw res.error
    }
    const voidedByPsd = new Set<number>(((voidedPsdRes.data || []) as any[]).map((v) => v.transaction_id))
    // transactions.outlet (the bare text code) was dropped from the schema —
    // only outlet_id remains there now. Resolve it back to a code via the
    // outlets table instead of hardcoding an id, matching the "no logic
    // matches a code string without going through outlet_id" rule as
    // closely as this pre-existing EXELMED/ETHICAL two-bucket shape allows.
    const outletCodeById = new Map<number, string>(
      ((outletsRes.data || []) as any[]).map((o) => [o.id, o.code]),
    )

    const expectedWarehouse = new Map<number, number>()
    const expectedOutlet = { EXELMED: new Map<number, number>(), ETHICAL: new Map<number, number>() }
    const bump = (map: Map<number, number>, pid: number, delta: number) => map.set(pid, (map.get(pid) ?? 0) + delta)

    for (const r of (stockInRes.data || []) as any[]) {
      if (r.product_id != null) bump(expectedWarehouse, r.product_id, r.qty_stock_in ?? 0)
    }
    for (const r of (transferRes.data || []) as any[]) {
      const t = r.transaction
      if (!t || !['approved', 'completed'].includes(t.status)) continue
      if (r.product_id != null) bump(expectedWarehouse, r.product_id, -(r.qty_stock_out ?? 0))
      const code = outletCodeById.get(t.outlet_id)
      if (t.status === 'completed' && r.product_id != null && (code === 'EXELMED' || code === 'ETHICAL')) {
        bump(expectedOutlet[code as 'EXELMED' | 'ETHICAL'], r.product_id, r.actual_count_stock_out ?? 0)
      }
    }
    for (const r of (saleRes.data || []) as any[]) {
      const t = r.transaction
      if (!t || t.status !== 'completed') continue
      if (voidedByPsd.has(r.transaction_id)) continue
      if (r.product_id != null && outletCodeById.get(t.outlet_id) === 'EXELMED') bump(expectedOutlet.EXELMED, r.product_id, -(r.qty_stock_out ?? 0))
    }
    // An ethical order draws from ONE recorded location — transactions.warehouse_id,
    // where null means the main warehouse — and the quantity that actually left
    // is actual_count_stock_out.
    //
    // This replaces a read of stock_sources.ethical / .exelmed, which NOTHING
    // ever wrote (the writer used the keys `branch` and `warehouse`), so this
    // arm silently contributed almost nothing to the reconciliation.
    //
    // Only main-warehouse draws are counted: branch stock lives in
    // warehouse_products, which this reconciliation does not model yet — it
    // still compares against outlet_stock. Counting a branch draw against the
    // main warehouse would manufacture drift that isn't there.
    for (const r of (ethicalRes.data || []) as any[]) {
      const t = r.transaction
      if (!t || t.status === 'cancelled') continue
      if (r.product_id == null) continue
      if (t.warehouse_id == null) {
        bump(expectedWarehouse, r.product_id, -(r.actual_count_stock_out ?? 0))
      }
    }
    for (const r of (inhouseRes.data || []) as any[]) {
      if (r.product_id != null) bump(expectedWarehouse, r.product_id, -(r.actual_count_stock_out ?? 0))
    }

    const rows: StockReconRow[] = []
    for (const p of (warehouseRes.data || []) as any[]) {
      const expected = expectedWarehouse.get(p.id)
      if (expected == null) continue
      const onHand = p.current_stock ?? 0
      const drift = onHand - expected
      if (Math.abs(drift) > 0.01) {
        rows.push({ product_id: p.id, product_name: p.product_name, location: 'WAREHOUSE', on_hand: onHand, expected, drift })
      }
    }
    for (const o of (outletRes.data || []) as any[]) {
      if (o.outlet !== 'EXELMED' && o.outlet !== 'ETHICAL') continue
      const expected = expectedOutlet[o.outlet as 'EXELMED' | 'ETHICAL'].get(o.product_id)
      if (expected == null) continue
      const drift = (o.quantity ?? 0) - expected
      if (Math.abs(drift) > 0.01) {
        rows.push({
          product_id: o.product_id, product_name: o.product?.product_name ?? null,
          location: o.outlet, on_hand: o.quantity ?? 0, expected, drift,
        })
      }
    }

    stockReconciliation.value = rows
    stockReconciliationComputedAt.value = Date.now()
    return rows
  } catch (err) {
    handleError(err, 'Failed to compute stock reconciliation')
    return []
  } finally {
    loading.value = false
  }
}

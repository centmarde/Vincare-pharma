import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import { fetchAllRowsForIds } from '@/stores/shared/paging'

// What a change request is ABOUT, for the executive approving it. The request
// row itself only carries a document id, a one-line summary and a reason —
// the approver could not tell what EXP-2026-579 was, who it paid, or which
// voucher it came from. Read-only: nothing here writes.

/** One document, enough to name it in the Action Required list. */
export type ApprovalDocSummary = {
  id: number
  transactionType: string
  docNo: string | null
  amount: number | null
  counterparty: string | null
  status: string | null
}

/** Everything the approval dialog shows about the document a request changes. */
export type ApprovalChangeContext = ApprovalDocSummary & {
  date: string | null
  counterpartyRole: 'Paid to' | 'Supplier' | 'Customer' | 'Branch' | null
  cashAccountName: string | null
  category: string | null
  department: string | null
  orSiNo: string | null
  paymentMethod: string | null
  remarks: string | null
  recordedBy: string | null
  /** The voucher an expense / supplier payment was recorded from. */
  voucher: { dvNo: string | null; payee: string | null; total: number; particular: string | null; status: string | null } | null
  /** PO numbers a supplier payment says it was for. */
  poNumbers: string | null
  /** The payment a payment-correction request is about. */
  collection: {
    amount: number; method: string | null; referenceNo: string | null; date: string | null
    chequeBank: string | null; chequeNo: string | null; chequeDate: string | null; voided: boolean
  } | null
  /** Remittance: the cash actually counted. */
  remittanceActual: number | null
  /** Names for ids/codes the request mentions, so changes read as names. */
  cashAccountNames: Record<number, string>
  accountNames: Record<string, string>
}

const docNoColumns = 'expense_no, sale_no, remittance_no, inhouse_no, ethical_no, dv_no, reference_no, requisition_no'

type DocRow = Record<string, any>

function docNoOf(row: DocRow): string | null {
  return row.expense_no ?? row.sale_no ?? row.remittance_no ?? row.inhouse_no ?? row.ethical_no
    ?? row.dv_no ?? row.reference_no ?? row.requisition_no ?? null
}

function one<T>(value: T | T[] | null | undefined): T | null {
  return (Array.isArray(value) ? value[0] : value) ?? null
}

/** Who the document is with, by its type. */
function counterpartyOf(row: DocRow): { name: string | null; role: ApprovalChangeContext['counterpartyRole'] } {
  const fd = one(row.finance_details)
  switch (row.transaction_type) {
    case 'expense': return { name: fd?.paid_to ?? null, role: 'Paid to' }
    case 'supplier_payment': return { name: row.supplier?.name ?? fd?.paid_to ?? null, role: 'Supplier' }
    case 'remittance': return { name: row.warehouse?.name ?? row.outlet?.name ?? null, role: 'Branch' }
    case 'sale':
    case 'inhouse_order':
    case 'ethical_order': return { name: row.customer?.name ?? null, role: 'Customer' }
    default: return { name: row.customer?.name ?? row.supplier?.name ?? fd?.paid_to ?? null, role: null }
  }
}

export const useApprovalContextStore = defineStore('approvalContext', () => {
  /**
   * Number, amount and counterparty for each document in the list — one
   * batched read for every pending change request, not one per row.
   * A failed read returns what it has; the list just shows less.
   */
  async function fetchDocSummaries(ids: number[]): Promise<Map<number, ApprovalDocSummary>> {
    const out = new Map<number, ApprovalDocSummary>()
    const unique = [...new Set(ids.filter((id) => Number.isFinite(id)))]
    if (!unique.length) return out
    try {
      const rows = await fetchAllRowsForIds<DocRow>(unique, (batch) => supabase
        .from('transactions')
        .select(`id, transaction_type, status, total_amount, ${docNoColumns}, finance_details(paid_to), customer:customer_id(name), supplier:supplier_id(name), warehouse:warehouse_id(name)`)
        .in('id', batch)
        .order('id', { ascending: true }))
      for (const row of rows) {
        out.set(row.id, {
          id: row.id,
          transactionType: row.transaction_type,
          docNo: docNoOf(row),
          amount: row.total_amount == null ? null : Number(row.total_amount),
          counterparty: counterpartyOf(row).name,
          status: row.status ?? null,
        })
      }
    } catch (err) {
      console.warn('fetchDocSummaries failed:', err)
    }
    return out
  }

  /** The full picture of one document, for the approval dialog. */
  async function fetchChangeContext(
    transactionId: number,
    proposedChanges: Record<string, { from?: unknown; to?: unknown }> | null | undefined,
  ): Promise<ApprovalChangeContext | null> {
    const { data: row, error } = await supabase
      .from('transactions')
      .select(`id, transaction_type, status, total_amount, paid_at, created_at, created_by, payment_method, remarks, cash_account_id, ${docNoColumns},
        finance_details(category, paid_to, department, or_si_no),
        customer:customer_id(name), supplier:supplier_id(name), warehouse:warehouse_id(name), outlet:outlet_id(name),
        cash_account:cash_account_id(name), remittance_details(actual_amount), pos_sale_details(payment_method)`)
      .eq('id', transactionId)
      .maybeSingle()
    if (error || !row) {
      if (error) console.warn('fetchChangeContext failed:', error.message)
      return null
    }
    const changes = proposedChanges ?? {}
    const fd = one(row.finance_details) as DocRow | null
    const { name: counterparty, role } = counterpartyOf(row)

    // The voucher it came from (expenses and supplier payments made by vouchers).
    let voucher: ApprovalChangeContext['voucher'] = null
    if (row.transaction_type === 'expense' || row.transaction_type === 'supplier_payment') {
      const { data: link } = await supabase
        .from('disbursement_voucher_items')
        .select('particular, voucher:voucher_id(dv_no, status, total_amount, finance_details(paid_to))')
        .eq('expense_transaction_id', transactionId)
        .limit(1)
        .maybeSingle()
      const v = one((link as DocRow | null)?.voucher) as DocRow | null
      if (v) {
        voucher = {
          dvNo: v.dv_no ?? null,
          payee: one(v.finance_details)?.paid_to ?? null,
          total: Number(v.total_amount ?? 0),
          particular: (link as DocRow).particular ?? null,
          status: v.status ?? null,
        }
      }
    }

    // A payment correction is about one collections row, carried on the request.
    let collection: ApprovalChangeContext['collection'] = null
    const collectionId = Number((changes.__collection_id as { to?: unknown } | undefined)?.to ?? (changes.__collection_id as { from?: unknown } | undefined)?.from)
    if (Number.isFinite(collectionId)) {
      const { data: c } = await supabase
        .from('collections')
        .select('amount, payment_method, reference_no, created_at, cheque_bank, cheque_no, cheque_date, voided_at')
        .eq('id', collectionId)
        .maybeSingle()
      if (c) {
        collection = {
          amount: Number(c.amount ?? 0), method: c.payment_method ?? null, referenceNo: c.reference_no ?? null,
          date: c.created_at ?? null, chequeBank: c.cheque_bank ?? null, chequeNo: c.cheque_no ?? null,
          chequeDate: c.cheque_date ?? null, voided: !!c.voided_at,
        }
      }
    }

    // Names for the cash accounts and chart accounts the request mentions.
    const cashIds = new Set<number>()
    const accountCodes = new Set<string>()
    if (row.cash_account_id != null) cashIds.add(Number(row.cash_account_id))
    if (fd?.category) accountCodes.add(String(fd.category))
    for (const value of [changes.cash_account_id?.from, changes.cash_account_id?.to]) {
      if (value != null && value !== '' && Number.isFinite(Number(value))) cashIds.add(Number(value))
    }
    for (const value of [changes.category?.from, changes.category?.to]) {
      if (value != null && value !== '') accountCodes.add(String(value))
    }
    const [cashRes, accountRes] = await Promise.all([
      cashIds.size ? supabase.from('cash_accounts').select('id, name').in('id', [...cashIds]) : Promise.resolve({ data: [] as DocRow[] }),
      accountCodes.size ? supabase.from('accounts').select('code, name').in('code', [...accountCodes]) : Promise.resolve({ data: [] as DocRow[] }),
    ])
    const cashAccountNames: Record<number, string> = {}
    for (const a of (cashRes.data ?? []) as DocRow[]) cashAccountNames[a.id] = a.name
    const accountNames: Record<string, string> = {}
    for (const a of (accountRes.data ?? []) as DocRow[]) accountNames[a.code] = a.name

    const poFound = String(row.remarks ?? '').match(/PO-\d{4}-\d+/g)
    const remittanceActual = (one(row.remittance_details) as DocRow | null)?.actual_amount ?? null

    return {
      id: row.id,
      transactionType: row.transaction_type,
      docNo: docNoOf(row),
      amount: row.total_amount == null ? null : Number(row.total_amount),
      counterparty,
      status: row.status ?? null,
      date: row.paid_at ?? row.created_at ?? null,
      counterpartyRole: role,
      cashAccountName: one(row.cash_account)?.name ?? null,
      category: fd?.category ?? null,
      department: fd?.department ?? null,
      orSiNo: fd?.or_si_no ?? null,
      paymentMethod: row.payment_method ?? one(row.pos_sale_details)?.payment_method ?? null,
      remarks: row.remarks ?? null,
      recordedBy: row.created_by ?? null,
      voucher,
      poNumbers: poFound ? [...new Set(poFound)].join(', ') : null,
      collection,
      remittanceActual: remittanceActual == null ? null : Number(remittanceActual),
      cashAccountNames,
      accountNames,
    }
  }

  return { fetchDocSummaries, fetchChangeContext }
})

import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import { useToast } from 'vue-toastification'
import { useAuthUserStore } from '@/stores/authUser'

const toast = useToast()

// Finance reads the transactions hub directly (own transaction_type filters) and
// never calls into salesData/ethicalData/inhouseData/suppliersData fetchers —
// those mutate shared module-scoped refs; Finance must not leak into that state.
// Only two new transaction_type rows are introduced here: 'expense' and
// 'supplier_payment'. Every other figure is derived from data that already
// exists in the hub (sale, ethical_order/collections, inhouse_order, stock_in,
// remittance) via plain select + JS reduce, mirroring ethicalData.fetchCommissionSummary.

export const EXPENSE_CATEGORIES = [
  { value: 'rent', title: 'Rent' },
  { value: 'utilities', title: 'Utilities' },
  { value: 'supplies', title: 'Supplies' },
  { value: 'maintenance', title: 'Maintenance' },
  { value: 'transportation', title: 'Transportation' },
  { value: 'taxes_fees', title: 'Taxes & Fees' },
  { value: 'other', title: 'Other' },
  { value: 'representation', title: 'Representation' },
  { value: 'fuel_lubricants', title: 'Fuel & Lubricants' },
  { value: 'labor_services', title: 'Labor & Other Services' },
  { value: 'freight_handling', title: 'Freight & Handling' },
  { value: 'taxes_licenses', title: 'Taxes & Licenses' },
] as const

export type ExpenseCategory = typeof EXPENSE_CATEGORIES[number]['value']

export const EXPENSE_DEPARTMENTS = [
  { value: 'VP-Admin', title: 'VP-Admin' },
  { value: 'VP-Selling', title: 'VP-Selling' },
] as const

export type ExpenseDepartment = typeof EXPENSE_DEPARTMENTS[number]['value']

export const EXPENSE_PAYMENT_METHODS = [
  { value: 'cash', title: 'Cash' },
  { value: 'petty_cash', title: 'Petty Cash' },
  { value: 'cheque', title: 'Cheque' },
  { value: 'bank_transfer', title: 'Bank Transfer' },
  { value: 'gcash', title: 'GCash' },
  { value: 'credit_card', title: 'Credit Card' },
  { value: 'debit_card', title: 'Debit Card' },
  { value: 'other', title: 'Other' },
] as const

export type ExpensePaymentMethod = typeof EXPENSE_PAYMENT_METHODS[number]['value']

export type CashAccountType = {
  id: number
  created_at: string
  name: string
  account_type: 'petty_cash' | 'bank'
  float_amount: number | null
  balance: number
  is_active: boolean
}

export type LiquidationReportItem = {
  reference_no: string | null
  category: ExpenseCategory | null
  paid_to: string | null
  or_si_no: string | null
  amount: number
  paid_at: string | null
}

export type PettyCashReplenishmentType = {
  id: number
  created_at: string
  reference_no: string | null
  cash_account_id: number | null
  cash_account_name: string | null
  funding_account_id: number | null
  funding_account_name: string | null
  amount: number
  status: string | null
  approved_at: string | null
  remarks: string | null
  created_by: string | null
  liquidation_report: LiquidationReportItem[]
}

export type ExpenseType = {
  id: number
  created_at: string
  reference_no: string | null
  category: ExpenseCategory | null
  department: ExpenseDepartment | null
  or_si_no: string | null
  paid_to: string | null
  payment_method: string | null
  amount: number | null
  paid_at: string | null
  remarks: string | null
  created_by: string | null
  cash_account_id: number | null
  cash_account_name: string | null
}

export type SupplierPaymentType = {
  id: number
  created_at: string
  reference_no: string | null
  supplier_id: number | null
  supplier_name: string | null
  payment_method: string | null
  amount: number | null
  paid_at: string | null
  remarks: string | null
  created_by: string | null
}

export type SupplierAPRow = {
  supplier_id: number
  supplier_name: string | null
  total_received: number
  total_paid: number
  outstanding: number
  cached_balance: number | null
  has_drift: boolean
}

export type PnLByOutletRow = {
  outlet: 'EXELMED' | 'ETHICAL' | 'INHOUSE'
  revenue: number
}

export type PnLSummary = {
  revenuePos: number
  revenueEthical: number
  revenueInhouse: number
  revenueTotal: number
  cogs: number
  opex: number
  net: number
  byOutlet: PnLByOutletRow[]
}

export type RemittanceDiscrepancyRow = {
  id: number
  reference_no: string | null
  outlet: string | null
  created_at: string
  expected_amount: number
  actual_amount: number
  discrepancy: number
}

export type ARAgingBucket = 'current' | '1-30' | '31-60' | '61-90' | '90+' | 'no-term'

export type ARAgingRow = {
  id: number
  source: 'ethical_order' | 'inhouse_order'
  reference_no: string | null
  customer_name: string | null
  total_amount: number
  amount_paid: number
  balance: number
  due_date: string | null
  days_overdue: number | null
  bucket: ARAgingBucket
}

export type CommissionLiabilityRow = {
  agent_id: number | null
  agent_name: string | null
  unpaid_commission: number
  oldest_unpaid_days: number | null
  flagged: boolean
  paid_missing_timestamp: number
}

export type StockReconRow = {
  product_id: number
  product_name: string | null
  location: 'WAREHOUSE' | 'EXELMED' | 'ETHICAL'
  on_hand: number
  expected: number
  drift: number
}

export type GLAccountLine = { code: string; name: string; amount: number }

export type GLISSection = {
  subsection: string
  accounts: GLAccountLine[]
  subtotal: number
}

export type GLIncomeStatement = {
  from: string
  to: string
  sections: GLISSection[]
  netSales: number
  cogs: number
  grossProfit: number
  sellingExpenses: number
  adminExpenses: number
  operatingIncome: number
  otherIncome: number
  financeCosts: number
  netIncome: number
}

export type GLBSSection = {
  class: string
  subsection: string
  accounts: GLAccountLine[]
  subtotal: number
}

export type GLBalanceSheet = {
  asOf: string
  sections: GLBSSection[]
  currentYearEarnings: number
  totalAssets: number
  totalLiabilities: number
  totalEquity: number
  tiesOut: boolean
}

export type TrialBalanceLine = {
  account_code: string
  account_name: string
  class: string
  debit_balance: number
  credit_balance: number
}

type DateRange = { dateFrom?: string; dateTo?: string }

const COMMISSION_LIABILITY_FLAG_DAYS = 30

function applyDateRange<T>(q: T, column: string, range?: DateRange): T {
  let query: any = q
  if (range?.dateFrom) query = query.gte(column, range.dateFrom)
  if (range?.dateTo) query = query.lte(column, range.dateTo)
  return query
}

export const useFinanceDataStore = defineStore('financeData', () => {
  const authStore = useAuthUserStore()

  const expenses: Ref<ExpenseType[]> = ref([])
  const cashAccounts: Ref<CashAccountType[]> = ref([])
  const replenishmentRequests: Ref<PettyCashReplenishmentType[]> = ref([])
  const supplierPayments: Ref<SupplierPaymentType[]> = ref([])
  const supplierAP: Ref<SupplierAPRow[]> = ref([])
  const pnl: Ref<PnLSummary | null> = ref(null)
  const remittanceDiscrepancies: Ref<RemittanceDiscrepancyRow[]> = ref([])
  const arAging: Ref<ARAgingRow[]> = ref([])
  const commissionLiability: Ref<CommissionLiabilityRow[]> = ref([])
  const stockReconciliation: Ref<StockReconRow[]> = ref([])
  const stockReconciliationComputedAt: Ref<number | null> = ref(null)
  const STOCK_RECON_CACHE_MS = 5 * 60 * 1000
  const incomeStatement: Ref<GLIncomeStatement | null> = ref(null)
  const balanceSheet: Ref<GLBalanceSheet | null> = ref(null)
  const trialBalance: Ref<TrialBalanceLine[]> = ref([])

  const loading = ref(false)
  const error: Ref<string> = ref('')

  const isLoading = computed(() => loading.value)
  const hasError = computed(() => error.value !== '')

  const handleError = (err: unknown, defaultMessage: string) => {
    error.value = err instanceof Error ? err.message : defaultMessage
  }
  const clearError = () => { error.value = '' }

  // ─── Expenses (transaction_type='expense') ──────────────────────────────────

  function mapExpenseRow(row: any): ExpenseType {
    return {
      id: row.id,
      created_at: row.created_at,
      reference_no: row.reference_no,
      category: row.category,
      department: row.department,
      or_si_no: row.or_si_no,
      paid_to: row.paid_to,
      payment_method: row.payment_method,
      amount: row.total_amount,
      paid_at: row.paid_at,
      remarks: row.remarks,
      created_by: row.created_by,
      cash_account_id: row.cash_account_id,
      cash_account_name: row.cash_account?.name ?? null,
    }
  }

  const fetchExpenses = async (options: DateRange & { category?: ExpenseCategory } = {}) => {
    loading.value = true
    clearError()
    try {
      let q = supabase.from('transactions')
        .select('*, cash_account:cash_account_id(name)')
        .eq('transaction_type', 'expense')
      if (options.category) q = q.eq('category', options.category)
      q = applyDateRange(q, 'paid_at', options)
      q = q.order('paid_at', { ascending: false })

      const { data, error: fetchError } = await q
      if (fetchError) throw fetchError
      expenses.value = (data || []).map(mapExpenseRow)
      return expenses.value
    } catch (err) {
      handleError(err, 'Failed to fetch expenses')
      return []
    } finally {
      loading.value = false
    }
  }

  const recordExpense = async (payload: {
    category: ExpenseCategory
    amount: number
    paidTo?: string
    paymentMethod?: string
    valueDate?: string
    remarks?: string
    department?: ExpenseDepartment
    orSiNo?: string
    cashAccountId: number
  }) => {
    loading.value = true
    clearError()
    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) { toast.error('User not authenticated.'); loading.value = false; return { success: false } }

    const { data: expenseId, error: rpcError } = await supabase.rpc('record_expense', {
      p_category: payload.category,
      p_amount: payload.amount,
      p_paid_to: payload.paidTo ?? null,
      p_payment_method: payload.paymentMethod ?? null,
      p_value_date: payload.valueDate ?? null,
      p_remarks: payload.remarks ?? null,
      p_user: user.id,
      p_department: payload.department ?? null,
      p_or_si_no: payload.orSiNo ?? null,
      p_cash_account_id: payload.cashAccountId,
    })

    if (rpcError || !expenseId) {
      handleError(rpcError, 'Failed to record expense.')
      toast.error(rpcError?.message || 'Failed to record expense.')
      loading.value = false
      return { success: false }
    }

    toast.success('Expense recorded.')
    await Promise.all([fetchExpenses(), fetchCashAccounts()])
    loading.value = false
    return { success: true, expenseId }
  }

  // ─── Cash accounts (Petty Cash + Bank) ───────────────────────────────────────

  const fetchCashAccounts = async () => {
    loading.value = true
    clearError()
    try {
      const { data, error: fetchError } = await supabase.from('cash_accounts')
        .select('*').eq('is_active', true).order('account_type', { ascending: true })
      if (fetchError) throw fetchError
      cashAccounts.value = (data || []) as CashAccountType[]
      return cashAccounts.value
    } catch (err) {
      handleError(err, 'Failed to fetch cash accounts')
      return []
    } finally {
      loading.value = false
    }
  }

  // Plain master-data insert, same shape as suppliersData.createSupplier — no
  // money moves here, so no RPC is needed (only balance-mutating actions go
  // through SECURITY DEFINER functions).
  const createCashAccount = async (payload: { name: string; openingBalance: number }) => {
    loading.value = true
    clearError()
    try {
      const { data, error: createError } = await supabase.from('cash_accounts')
        .insert([{ name: payload.name, account_type: 'bank', float_amount: null, balance: payload.openingBalance }])
        .select()
        .single()
      if (createError) throw createError
      cashAccounts.value.push(data as CashAccountType)
      toast.success('Bank account added.')
      return { success: true }
    } catch (err) {
      handleError(err, 'Failed to add bank account.')
      toast.error(error.value)
      return { success: false }
    } finally {
      loading.value = false
    }
  }

  function mapReplenishmentRow(row: any): PettyCashReplenishmentType {
    return {
      id: row.id,
      created_at: row.created_at,
      reference_no: row.reference_no,
      cash_account_id: row.cash_account_id,
      cash_account_name: row.cash_account?.name ?? null,
      funding_account_id: row.funding_account_id,
      funding_account_name: row.funding_account?.name ?? null,
      amount: row.total_amount ?? 0,
      status: row.status,
      approved_at: row.approved_at,
      remarks: row.remarks,
      created_by: row.created_by,
      liquidation_report: row.liquidation_report ?? [],
    }
  }

  const fetchReplenishmentRequests = async () => {
    loading.value = true
    clearError()
    try {
      const { data, error: fetchError } = await supabase.from('transactions')
        .select('*, cash_account:cash_account_id(name), funding_account:funding_account_id(name)')
        .eq('transaction_type', 'petty_cash_replenishment')
        .order('created_at', { ascending: false })
      if (fetchError) throw fetchError
      replenishmentRequests.value = ((data || []) as any[]).map(mapReplenishmentRow)
      return replenishmentRequests.value
    } catch (err) {
      handleError(err, 'Failed to fetch replenishment requests')
      return []
    } finally {
      loading.value = false
    }
  }

  // Same window the RPC itself uses (since last approved replenishment for
  // this account, or all-time if never replenished) — lets the requester
  // review what they're about to submit before committing.
  const previewPettyCashLiquidation = async (cashAccountId: number) => {
    try {
      const { data: lastApproved } = await supabase.from('transactions')
        .select('approved_at')
        .eq('transaction_type', 'petty_cash_replenishment')
        .eq('cash_account_id', cashAccountId)
        .eq('status', 'approved')
        .order('approved_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      let q = supabase.from('transactions')
        .select('reference_no, category, paid_to, or_si_no, total_amount, paid_at')
        .eq('transaction_type', 'expense')
        .eq('cash_account_id', cashAccountId)
      if (lastApproved?.approved_at) q = q.gt('created_at', lastApproved.approved_at)
      q = q.order('paid_at', { ascending: true })

      const { data, error: fetchError } = await q
      if (fetchError) throw fetchError
      const rows: LiquidationReportItem[] = ((data || []) as any[]).map((r) => ({
        reference_no: r.reference_no,
        category: r.category,
        paid_to: r.paid_to,
        or_si_no: r.or_si_no,
        amount: r.total_amount ?? 0,
        paid_at: r.paid_at,
      }))
      const total = rows.reduce((sum, r) => sum + r.amount, 0)
      return { rows, total }
    } catch (err) {
      handleError(err, 'Failed to load liquidation report')
      return { rows: [], total: 0 }
    }
  }

  const requestReplenishment = async (payload: {
    pettyCashAccountId: number
    fundingAccountId: number
    remarks?: string
  }) => {
    loading.value = true
    clearError()
    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) { toast.error('User not authenticated.'); loading.value = false; return { success: false } }

    const { data: requestId, error: rpcError } = await supabase.rpc('request_petty_cash_replenishment', {
      p_petty_cash_account_id: payload.pettyCashAccountId,
      p_funding_account_id: payload.fundingAccountId,
      p_user: user.id,
      p_remarks: payload.remarks ?? null,
    })

    if (rpcError || !requestId) {
      handleError(rpcError, 'Failed to request replenishment.')
      toast.error(rpcError?.message || 'Failed to request replenishment.')
      loading.value = false
      return { success: false }
    }

    toast.success('Replenishment request submitted for approval.')
    await fetchReplenishmentRequests()
    loading.value = false
    return { success: true, requestId }
  }

  const approveReplenishment = async (id: number) => {
    loading.value = true
    clearError()
    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) { toast.error('User not authenticated.'); loading.value = false; return { success: false } }

    const { error: rpcError } = await supabase.rpc('approve_petty_cash_replenishment', { p_id: id, p_user: user.id })
    if (rpcError) {
      handleError(rpcError, 'Failed to approve replenishment.')
      toast.error(rpcError.message || 'Failed to approve replenishment.')
      loading.value = false
      return { success: false }
    }

    toast.success('Replenishment approved.')
    await Promise.all([fetchReplenishmentRequests(), fetchCashAccounts()])
    loading.value = false
    return { success: true }
  }

  const rejectReplenishment = async (id: number, reason: string) => {
    loading.value = true
    clearError()
    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) { toast.error('User not authenticated.'); loading.value = false; return { success: false } }

    const { error: rpcError } = await supabase.rpc('reject_petty_cash_replenishment', {
      p_id: id, p_user: user.id, p_reason: reason,
    })
    if (rpcError) {
      handleError(rpcError, 'Failed to reject replenishment.')
      toast.error(rpcError.message || 'Failed to reject replenishment.')
      loading.value = false
      return { success: false }
    }

    toast.success('Replenishment request rejected.')
    await fetchReplenishmentRequests()
    loading.value = false
    return { success: true }
  }

  const deleteExpense = async (id: number) => {
    loading.value = true
    clearError()
    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) { toast.error('User not authenticated.'); loading.value = false; return { success: false } }

    const { error: rpcError } = await supabase.rpc('delete_expense', { p_id: id, p_user: user.id })
    if (rpcError) {
      handleError(rpcError, 'Failed to delete expense.')
      toast.error(rpcError.message || 'Failed to delete expense.')
      loading.value = false
      return { success: false }
    }

    toast.success('Expense deleted.')
    await fetchExpenses()
    loading.value = false
    return { success: true }
  }

  // ─── Supplier payments / AP (transaction_type='supplier_payment') ──────────

  function mapSupplierPaymentRow(row: any): SupplierPaymentType {
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
    }
  }

  const fetchSupplierPayments = async (options: DateRange & { supplierId?: number } = {}) => {
    loading.value = true
    clearError()
    try {
      let q = supabase.from('transactions')
        .select('*, supplier:supplier_id(name)')
        .eq('transaction_type', 'supplier_payment')
      if (options.supplierId) q = q.eq('supplier_id', options.supplierId)
      q = applyDateRange(q, 'paid_at', options)
      q = q.order('paid_at', { ascending: false })

      const { data, error: fetchError } = await q
      if (fetchError) throw fetchError
      supplierPayments.value = (data || []).map(mapSupplierPaymentRow)
      return supplierPayments.value
    } catch (err) {
      handleError(err, 'Failed to fetch supplier payments')
      return []
    } finally {
      loading.value = false
    }
  }

  const recordSupplierPayment = async (payload: {
    supplierId: number
    amount: number
    paymentMethod?: string
    referenceNo?: string
    valueDate?: string
    remarks?: string
  }) => {
    loading.value = true
    clearError()
    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) { toast.error('User not authenticated.'); loading.value = false; return { success: false } }

    const { data: paymentId, error: rpcError } = await supabase.rpc('record_supplier_payment', {
      p_supplier_id: payload.supplierId,
      p_amount: payload.amount,
      p_payment_method: payload.paymentMethod ?? null,
      p_reference_no: payload.referenceNo ?? null,
      p_value_date: payload.valueDate ?? null,
      p_remarks: payload.remarks ?? null,
      p_user: user.id,
    })

    if (rpcError || !paymentId) {
      handleError(rpcError, 'Failed to record supplier payment.')
      toast.error(rpcError?.message || 'Failed to record supplier payment.')
      loading.value = false
      return { success: false }
    }

    toast.success('Supplier payment recorded.')
    await Promise.all([fetchSupplierPayments(), fetchSupplierAP()])
    loading.value = false
    return { success: true, paymentId }
  }

  const fetchSupplierAP = async () => {
    loading.value = true
    clearError()
    try {
      const [receivedRes, paidRes, suppliersRes] = await Promise.all([
        supabase.from('transactions').select('supplier_id, total_amount').eq('transaction_type', 'stock_in'),
        supabase.from('transactions').select('supplier_id, total_amount').eq('transaction_type', 'supplier_payment'),
        supabase.from('suppliers').select('id, name, balance'),
      ])
      if (receivedRes.error) throw receivedRes.error
      if (paidRes.error) throw paidRes.error
      if (suppliersRes.error) throw suppliersRes.error

      const received = new Map<number, number>()
      for (const row of (receivedRes.data || []) as any[]) {
        if (row.supplier_id == null) continue
        received.set(row.supplier_id, (received.get(row.supplier_id) ?? 0) + (row.total_amount ?? 0))
      }
      const paid = new Map<number, number>()
      for (const row of (paidRes.data || []) as any[]) {
        if (row.supplier_id == null) continue
        paid.set(row.supplier_id, (paid.get(row.supplier_id) ?? 0) + (row.total_amount ?? 0))
      }

      const rows: SupplierAPRow[] = ((suppliersRes.data || []) as any[])
        .map((s) => {
          const totalReceived = received.get(s.id) ?? 0
          const totalPaid = paid.get(s.id) ?? 0
          const outstanding = totalReceived - totalPaid
          const cachedBalance = s.balance ?? null
          return {
            supplier_id: s.id,
            supplier_name: s.name,
            total_received: totalReceived,
            total_paid: totalPaid,
            outstanding,
            cached_balance: cachedBalance,
            has_drift: cachedBalance != null && Math.abs(outstanding - cachedBalance) > 0.01,
          }
        })
        .filter((r) => r.total_received > 0 || r.total_paid > 0 || (r.cached_balance ?? 0) !== 0)

      supplierAP.value = rows
      return rows
    } catch (err) {
      handleError(err, 'Failed to fetch supplier AP')
      return []
    } finally {
      loading.value = false
    }
  }

  // ─── P&L: revenue actually received, COGS from stock_in, opex from expenses ─
  // Past days are cached in finance_daily_summary (computed once, immutable
  // after the day ends); only "today" is ever recomputed live, against a
  // 24h-bounded query instead of the full transaction history.

  const todayStr = () => new Date().toISOString().slice(0, 10)

  const fetchTodayPnLSlice = async () => {
    const today = todayStr()
    const todayStart = today + 'T00:00:00'
    const todayEnd   = today + 'T23:59:59.999'

    const [saleRes, collectionRes, stockInRes, expenseRes] = await Promise.all([
      supabase.from('transactions')
        .select('total_amount, pos_sale_details(voided_at)')
        .eq('transaction_type', 'sale').eq('status', 'completed')
        .gte('created_at', todayStart).lte('created_at', todayEnd),
      // All today's collections — we'll split by transaction_type in JS
      supabase.from('collections')
        .select('amount, transaction:transaction_id!inner(transaction_type)')
        .gte('created_at', todayStart).lte('created_at', todayEnd),
      supabase.from('transactions').select('total_amount')
        .eq('transaction_type', 'stock_in')
        .gte('updated_at', todayStart).lte('updated_at', todayEnd),
      supabase.from('transactions').select('total_amount')
        .eq('transaction_type', 'expense')
        .gte('paid_at', todayStart).lte('paid_at', todayEnd),
    ])
    if (saleRes.error) throw saleRes.error
    if (collectionRes.error) throw collectionRes.error
    if (stockInRes.error) throw stockInRes.error
    if (expenseRes.error) throw expenseRes.error

    const revenuePos = ((saleRes.data || []) as any[]).reduce((sum, r) => {
      if (r.pos_sale_details?.voided_at) return sum
      return sum + (r.total_amount ?? 0)
    }, 0)

    const allCollections = (collectionRes.data || []) as any[]
    const revenueEthical = allCollections
      .filter(r => r.transaction?.transaction_type === 'ethical_order')
      .reduce((sum, r) => sum + (r.amount ?? 0), 0)
    const revenueInhouse = allCollections
      .filter(r => r.transaction?.transaction_type === 'inhouse_order')
      .reduce((sum, r) => sum + (r.amount ?? 0), 0)

    return {
      revenuePos,
      revenueEthical,
      revenueInhouse,
      cogs: ((stockInRes.data || []) as any[]).reduce((sum, r) => sum + (r.total_amount ?? 0), 0),
      opex: ((expenseRes.data || []) as any[]).reduce((sum, r) => sum + (r.total_amount ?? 0), 0),
    }
  }

  const fetchPnL = async (range: DateRange = {}) => {
    loading.value = true
    clearError()
    try {
      const today = todayStr()
      const includesToday = (!range.dateTo || range.dateTo >= today) && (!range.dateFrom || range.dateFrom <= today)

      // Backfill any past days in range that aren't cached yet, then sum the
      // cache directly — O(days with activity), not O(all-time transactions).
      const { error: backfillError } = await supabase.rpc('finance_backfill_daily_summary', {
        p_date_from: range.dateFrom ?? null,
        p_date_to: range.dateTo ?? null,
      })
      if (backfillError) throw backfillError

      let historicalQ = supabase.from('finance_daily_summary')
        .select('revenue_pos, revenue_ethical, revenue_inhouse, cogs, opex')
        .lt('summary_date', today)
      if (range.dateFrom) historicalQ = historicalQ.gte('summary_date', range.dateFrom)
      if (range.dateTo) historicalQ = historicalQ.lte('summary_date', range.dateTo)

      const [historicalRes, todaySlice] = await Promise.all([
        historicalQ,
        includesToday ? fetchTodayPnLSlice() : Promise.resolve(null),
      ])
      if (historicalRes.error) throw historicalRes.error

      const totals = ((historicalRes.data || []) as any[]).reduce(
        (acc, r) => ({
          revenuePos: acc.revenuePos + (r.revenue_pos ?? 0),
          revenueEthical: acc.revenueEthical + (r.revenue_ethical ?? 0),
          revenueInhouse: acc.revenueInhouse + (r.revenue_inhouse ?? 0),
          cogs: acc.cogs + (r.cogs ?? 0),
          opex: acc.opex + (r.opex ?? 0),
        }),
        { revenuePos: 0, revenueEthical: 0, revenueInhouse: 0, cogs: 0, opex: 0 },
      )

      if (todaySlice) {
        totals.revenuePos += todaySlice.revenuePos
        totals.revenueEthical += todaySlice.revenueEthical
        totals.revenueInhouse += todaySlice.revenueInhouse
        totals.cogs += todaySlice.cogs
        totals.opex += todaySlice.opex
      }

      const revenueTotal = totals.revenuePos + totals.revenueEthical + totals.revenueInhouse

      const summary: PnLSummary = {
        revenuePos: totals.revenuePos,
        revenueEthical: totals.revenueEthical,
        revenueInhouse: totals.revenueInhouse,
        revenueTotal,
        cogs: totals.cogs,
        opex: totals.opex,
        net: revenueTotal - totals.cogs - totals.opex,
        byOutlet: [
          { outlet: 'EXELMED', revenue: totals.revenuePos },
          { outlet: 'ETHICAL', revenue: totals.revenueEthical },
          { outlet: 'INHOUSE', revenue: totals.revenueInhouse },
        ],
      }
      pnl.value = summary
      return summary
    } catch (err) {
      handleError(err, 'Failed to compute P&L')
      return null
    } finally {
      loading.value = false
    }
  }

  // ─── Discrepancy: remittance cash float ─────────────────────────────────────

  const fetchRemittanceDiscrepancies = async (options: { threshold?: number } = {}) => {
    loading.value = true
    clearError()
    try {
      const threshold = options.threshold ?? 0.01
      // actual_amount moved to remittance_details in hub redesign; old rows
      // still have it on transactions — coalesce handles both.
      const { data, error: fetchError } = await supabase.from('transactions')
        .select('id, reference_no, outlet, outlet_id, created_at, total_amount, actual_amount, remittance_details(actual_amount)')
        .eq('transaction_type', 'remittance')
        .order('created_at', { ascending: false })
      if (fetchError) throw fetchError

      const rows: RemittanceDiscrepancyRow[] = ((data || []) as any[])
        .map((r) => {
          const actualAmount = r.remittance_details?.actual_amount ?? r.actual_amount ?? 0
          return {
            id: r.id,
            reference_no: r.reference_no,
            outlet: r.outlet,
            created_at: r.created_at,
            expected_amount: r.total_amount ?? 0,
            actual_amount: actualAmount,
            discrepancy: actualAmount - (r.total_amount ?? 0),
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

  // ─── Discrepancy: AR aging (ethical_order + inhouse_order) ──────────────────

  function bucketFor(daysOverdue: number | null): ARAgingBucket {
    if (daysOverdue == null) return 'no-term'
    if (daysOverdue <= 0) return 'current'
    if (daysOverdue <= 30) return '1-30'
    if (daysOverdue <= 60) return '31-60'
    if (daysOverdue <= 90) return '61-90'
    return '90+'
  }

  const fetchARAging = async () => {
    loading.value = true
    clearError()
    try {
      const [ethicalRes, inhouseRes] = await Promise.all([
        supabase.from('transactions')
          .select('id, reference_no, total_amount, ethical_details(amount_paid, due_date), customer:customer_id(name)')
          .eq('transaction_type', 'ethical_order').in('status', ['invoiced', 'partial']),
        supabase.from('transactions')
          .select('id, reference_no, total_amount, inhouse_details(amount_paid), status, customer:customer_id(name)')
          .eq('transaction_type', 'inhouse_order').not('status', 'in', '("paid","cancelled")'),
      ])
      if (ethicalRes.error) throw ethicalRes.error
      if (inhouseRes.error) throw inhouseRes.error

      const now = Date.now()
      const rows: ARAgingRow[] = []

      for (const r of (ethicalRes.data || []) as any[]) {
        const amountPaid = r.ethical_details?.amount_paid ?? 0
        const balance = (r.total_amount ?? 0) - amountPaid
        if (balance <= 0.01) continue
        const dueDate = r.ethical_details?.due_date ?? null
        const daysOverdue = dueDate ? Math.floor((now - new Date(dueDate).getTime()) / 86400000) : null
        rows.push({
          id: r.id, source: 'ethical_order', reference_no: r.reference_no,
          customer_name: r.customer?.name ?? null, total_amount: r.total_amount ?? 0,
          amount_paid: amountPaid, balance, due_date: dueDate,
          days_overdue: daysOverdue, bucket: bucketFor(daysOverdue),
        })
      }

      for (const r of (inhouseRes.data || []) as any[]) {
        const amountPaid = r.inhouse_details?.amount_paid ?? 0
        const balance = (r.total_amount ?? 0) - amountPaid
        if (balance <= 0.01) continue
        // No due_date convention exists yet for in-house orders.
        rows.push({
          id: r.id, source: 'inhouse_order', reference_no: r.reference_no,
          customer_name: r.customer?.name ?? null, total_amount: r.total_amount ?? 0,
          amount_paid: amountPaid, balance, due_date: null,
          days_overdue: null, bucket: 'no-term',
        })
      }

      rows.sort((a, b) => (b.days_overdue ?? -1) - (a.days_overdue ?? -1))
      arAging.value = rows
      return rows
    } catch (err) {
      handleError(err, 'Failed to fetch AR aging')
      return []
    } finally {
      loading.value = false
    }
  }

  // ─── Discrepancy: commission liability (no payout ledger yet, so the signal
  //     is unpaid-commission aging per agent, mirroring ethicalData's reduce) ──

  const fetchCommissionLiability = async () => {
    loading.value = true
    clearError()
    try {
      const { data, error: fetchError } = await supabase.from('collections')
        .select('agent_id, agent:agent_id(name), created_at, commission_amount, commission_status, commission_paid_at')
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
        flagged: (g.oldestUnpaidDays ?? 0) >= COMMISSION_LIABILITY_FLAG_DAYS || g.paidMissingTimestamp > 0,
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

  const fetchStockReconciliation = async (options: { forceRefresh?: boolean } = {}) => {
    // Drift-detection, not a summable fact — a stale-but-cached read is fine
    // for a few minutes (this is a "flag-only, experimental" diagnostic, not
    // a money mutation), but unlike P&L we deliberately do NOT checkpoint the
    // replay itself: a checkpoint taken while data is already drifted would
    // freeze that drift in permanently instead of continuing to flag it.
    if (
      !options.forceRefresh &&
      stockReconciliationComputedAt.value != null &&
      Date.now() - stockReconciliationComputedAt.value < STOCK_RECON_CACHE_MS
    ) {
      return stockReconciliation.value
    }

    loading.value = true
    clearError()
    try {
      // Fetch voided POS sale IDs from pos_sale_details (hub redesign) so we
      // can exclude them in the reconciliation loop without breaking the nested
      // transaction_items join (PostgREST can't express NOT EXISTS through !inner).
      const [stockInRes, transferRes, saleRes, ethicalRes, inhouseRes, warehouseRes, outletRes, voidedPsdRes] = await Promise.all([
        supabase.from('transaction_items').select('product_id, qty, transaction:transaction_id!inner(transaction_type)').eq('transaction.transaction_type', 'stock_in'),
        supabase.from('transaction_items').select('product_id, qty, received_qty, transaction:transaction_id!inner(transaction_type, status, outlet)').eq('transaction.transaction_type', 'stock_transfer'),
        supabase.from('transaction_items').select('product_id, qty, transaction_id, transaction:transaction_id!inner(transaction_type, status, outlet)').eq('transaction.transaction_type', 'sale'),
        supabase.from('transaction_items').select('product_id, stock_sources, transaction:transaction_id!inner(transaction_type, status)').eq('transaction.transaction_type', 'ethical_order'),
        supabase.from('transaction_items').select('product_id, delivered_qty, transaction:transaction_id!inner(transaction_type)').eq('transaction.transaction_type', 'inhouse_order'),
        supabase.from('products').select('id, product_name, current_stock'),
        supabase.from('outlet_stock').select('product_id, outlet, quantity, product:product_id(product_name)'),
        supabase.from('pos_sale_details').select('transaction_id').not('voided_at', 'is', null),
      ])
      for (const res of [stockInRes, transferRes, saleRes, ethicalRes, inhouseRes, warehouseRes, outletRes, voidedPsdRes]) {
        if (res.error) throw res.error
      }
      const voidedByPsd = new Set<number>(((voidedPsdRes.data || []) as any[]).map((v) => v.transaction_id))

      const expectedWarehouse = new Map<number, number>()
      const expectedOutlet = { EXELMED: new Map<number, number>(), ETHICAL: new Map<number, number>() }
      const bump = (map: Map<number, number>, pid: number, delta: number) => map.set(pid, (map.get(pid) ?? 0) + delta)

      for (const r of (stockInRes.data || []) as any[]) {
        if (r.product_id != null) bump(expectedWarehouse, r.product_id, r.qty ?? 0)
      }
      for (const r of (transferRes.data || []) as any[]) {
        const t = r.transaction
        if (!t || !['approved', 'completed'].includes(t.status)) continue
        if (r.product_id != null) bump(expectedWarehouse, r.product_id, -(r.qty ?? 0))
        if (t.status === 'completed' && r.product_id != null && (t.outlet === 'EXELMED' || t.outlet === 'ETHICAL')) {
          bump(expectedOutlet[t.outlet as 'EXELMED' | 'ETHICAL'], r.product_id, r.received_qty ?? 0)
        }
      }
      for (const r of (saleRes.data || []) as any[]) {
        const t = r.transaction
        if (!t || t.status !== 'completed') continue
        if (voidedByPsd.has(r.transaction_id)) continue
        if (r.product_id != null && t.outlet === 'EXELMED') bump(expectedOutlet.EXELMED, r.product_id, -(r.qty ?? 0))
      }
      for (const r of (ethicalRes.data || []) as any[]) {
        const t = r.transaction
        if (!t || t.status === 'cancelled') continue
        const sources = r.stock_sources || {}
        if (r.product_id != null) {
          if (sources.ethical) bump(expectedOutlet.ETHICAL, r.product_id, -sources.ethical)
          if (sources.exelmed) bump(expectedOutlet.EXELMED, r.product_id, -sources.exelmed)
          if (sources.warehouse) bump(expectedWarehouse, r.product_id, -sources.warehouse)
        }
      }
      for (const r of (inhouseRes.data || []) as any[]) {
        if (r.product_id != null) bump(expectedWarehouse, r.product_id, -(r.delivered_qty ?? 0))
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

  // ─── GL: projection + authoritative financial statements ────────────────────

  const runGLProjection = async (dateFrom?: string, dateTo?: string) => {
    const { error: err } = await supabase.rpc('gl_project_events', {
      p_date_from: dateFrom ?? null,
      p_date_to:   dateTo   ?? null,
    })
    if (err) console.warn('GL projection warning:', err.message)
  }

  const fetchIncomeStatement = async (range: DateRange = {}) => {
    loading.value = true
    clearError()
    try {
      await runGLProjection(range.dateFrom, range.dateTo)
      const { data, error: err } = await supabase.rpc('gl_income_statement', {
        p_from: range.dateFrom ?? null,
        p_to:   range.dateTo   ?? null,
      })
      if (err) throw err
      incomeStatement.value = data as GLIncomeStatement
      return incomeStatement.value
    } catch (err) {
      handleError(err, 'Failed to fetch income statement')
      return null
    } finally {
      loading.value = false
    }
  }

  const fetchBalanceSheet = async (asOf?: string) => {
    loading.value = true
    clearError()
    try {
      await runGLProjection(undefined, asOf)
      const { data, error: err } = await supabase.rpc('gl_balance_sheet', {
        p_as_of: asOf ?? null,
      })
      if (err) throw err
      balanceSheet.value = data as GLBalanceSheet
      return balanceSheet.value
    } catch (err) {
      handleError(err, 'Failed to fetch balance sheet')
      return null
    } finally {
      loading.value = false
    }
  }

  const fetchTrialBalance = async (asOf?: string) => {
    loading.value = true
    clearError()
    try {
      await runGLProjection(undefined, asOf)
      const { data, error: err } = await supabase.rpc('gl_trial_balance', {
        p_as_of: asOf ?? null,
      })
      if (err) throw err
      trialBalance.value = (data || []) as TrialBalanceLine[]
      return trialBalance.value
    } catch (err) {
      handleError(err, 'Failed to fetch trial balance')
      return []
    } finally {
      loading.value = false
    }
  }

  const resetStore = () => {
    expenses.value = []
    cashAccounts.value = []
    replenishmentRequests.value = []
    supplierPayments.value = []
    supplierAP.value = []
    pnl.value = null
    remittanceDiscrepancies.value = []
    arAging.value = []
    commissionLiability.value = []
    stockReconciliation.value = []
    incomeStatement.value = null
    balanceSheet.value = null
    trialBalance.value = []
    loading.value = false
    error.value = ''
  }

  return {
    expenses, cashAccounts, replenishmentRequests, supplierPayments, supplierAP, pnl,
    incomeStatement, balanceSheet, trialBalance,
    remittanceDiscrepancies, arAging, commissionLiability, stockReconciliation,
    loading, error, isLoading, hasError,
    fetchExpenses, recordExpense, deleteExpense,
    fetchCashAccounts, createCashAccount, fetchReplenishmentRequests, previewPettyCashLiquidation,
    requestReplenishment, approveReplenishment, rejectReplenishment,
    fetchSupplierPayments, recordSupplierPayment, fetchSupplierAP,
    fetchPnL,
    fetchRemittanceDiscrepancies, fetchARAging, fetchCommissionLiability, fetchStockReconciliation,
    runGLProjection, fetchIncomeStatement, fetchBalanceSheet, fetchTrialBalance,
    clearError, resetStore,
  }
})

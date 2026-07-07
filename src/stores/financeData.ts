import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import { useToast } from 'vue-toastification'
import { useAuthUserStore } from '@/stores/authUser'
import { useGLDataStore } from '@/stores/glData'
import { nextDocNumber, generateNextNumber } from '@/utils/helpers'

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

export type CashClassification = 'CASA' | 'TIME_INVESTMENT' | 'PETTY_CASH'

export type CashAccountType = {
  id: number
  created_at: string
  name: string
  // account_type is the legacy split kept for the replenishment RPCs/composables;
  // classification is the accountant-facing refinement (bank → CASA or TIME_INVESTMENT).
  // Both are written on insert and must agree: PETTY_CASH ↔ 'petty_cash'.
  account_type: 'petty_cash' | 'bank'
  classification: CashClassification
  opening_balance: number
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
  customer_id: number | null
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

// classification -> GL asset account code (was the gl_cash_code SQL helper).
function glCashCode(classification: CashClassification): string {
  if (classification === 'PETTY_CASH') return '1010'      // Cash on Hand
  if (classification === 'TIME_INVESTMENT') return '1100' // Other Investment
  return '1020'                                           // Cash in Bank (CASA / default)
}

export const useFinanceDataStore = defineStore('financeData', () => {
  const authStore = useAuthUserStore()
  const glStore = useGLDataStore()

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

  // Scalar finance fields (category/paid_to/department/or_si_no) live in the
  // finance_details extension table (20260702000004). The two ENTITY FKs
  // (cash_account_id, funding_account_id) were moved back onto the transactions
  // hub in 20260702000009 — read them off the row, join the account by name at
  // top level. finance_details.cash_account_id is a dormant fallback for rows
  // not yet backfilled.
  function mapExpenseRow(row: any): ExpenseType {
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
    }
  }

  const fetchExpenses = async (options: DateRange & { category?: ExpenseCategory } = {}) => {
    loading.value = true
    clearError()
    try {
      // Category filter lives on the extension table, so filtering needs the
      // inner-join embed variant to drop non-matching parents. cash_account_id
      // is on the hub now (20260702000009), so its name join is top-level.
      let q = supabase.from('transactions')
        .select(options.category
          ? '*, cash_account:cash_account_id(name), finance_details!inner(*)'
          : '*, cash_account:cash_account_id(name), finance_details(*)')
        .eq('transaction_type', 'expense')
      if (options.category) q = q.eq('finance_details.category', options.category)
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

  // Header + finance_details + cash account debit (was record_expense).
  // Best-effort, not atomic: a failure after the header insert can leave an
  // expense with no cash deduction or vice versa (accepted trade-off,
  // JS-over-RPC convention).
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

    if (payload.amount <= 0) {
      toast.error('Expense amount must be positive.'); loading.value = false; return { success: false }
    }
    if (!EXPENSE_CATEGORIES.some(c => c.value === payload.category)) {
      toast.error(`Invalid expense category: ${payload.category}`); loading.value = false; return { success: false }
    }
    if (!payload.cashAccountId) {
      toast.error('A cash account must be selected.'); loading.value = false; return { success: false }
    }

    const { data: account, error: accountError } = await supabase
      .from('cash_accounts').select('balance').eq('id', payload.cashAccountId).maybeSingle()
    if (accountError || !account) {
      toast.error(`Cash account ${payload.cashAccountId} not found.`); loading.value = false; return { success: false }
    }
    if (payload.amount > account.balance + 0.005) {
      toast.error(`Insufficient balance in the selected account (available: ${account.balance}).`)
      loading.value = false; return { success: false }
    }

    const year = new Date().getFullYear().toString()
    const expenseNo = await generateNextNumber('expense_no', `EXP-${year}-`, ['reference_no'])

    const { data: created, error: insertError } = await supabase
      .from('transactions')
      .insert({
        expense_no: expenseNo, transaction_type: 'expense', status: 'recorded',
        payment_method: payload.paymentMethod || null, subtotal: payload.amount, total_amount: payload.amount,
        paid_at: payload.valueDate || new Date().toISOString().slice(0, 10),
        remarks: payload.remarks || null, created_by: user.id, cash_account_id: payload.cashAccountId,
      })
      .select('id')
      .single()
    if (insertError || !created) {
      handleError(insertError, 'Failed to record expense.')
      toast.error(insertError?.message || 'Failed to record expense.')
      loading.value = false
      return { success: false }
    }

    const { error: detailsError } = await supabase.from('finance_details').insert({
      transaction_id: created.id, category: payload.category,
      paid_to: payload.paidTo || null, department: payload.department || null, or_si_no: payload.orSiNo || null,
    })
    if (detailsError) {
      handleError(detailsError, 'Failed to save expense details.')
      toast.error(detailsError.message || 'Failed to save expense details.')
      loading.value = false
      return { success: false }
    }

    const { error: balanceError } = await supabase
      .from('cash_accounts').update({ balance: account.balance - payload.amount }).eq('id', payload.cashAccountId)
    if (balanceError) console.warn('recordExpense: cash account balance update failed:', balanceError.message)

    const { error: logError } = await supabase.from('logs').insert({
      created_by: user.id, action: 'expense_record',
      description: `${expenseNo} | ${payload.category} | ${payload.amount}`, module: 'finance', transaction_id: created.id,
    })
    if (logError) console.warn('recordExpense: activity log insert failed:', logError.message)

    toast.success('Expense recorded.')
    await Promise.all([fetchExpenses(), fetchCashAccounts()])
    loading.value = false
    return { success: true, expenseId: created.id }
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

  // Booking an account posts its opening balance to the GL (DR cash / CR
  // Owner's Capital) — an opening balance is an accounting event (was
  // cash_account_open). Best-effort, not atomic: a failure after the account
  // insert can leave an account with no opening journal entry (accepted
  // trade-off, JS-over-RPC convention). See 20260702000006_cash_account_opening_gl.sql.
  const createCashAccount = async (payload: {
    name: string
    classification: CashClassification
    openingBalance: number
    isActive: boolean
  }) => {
    loading.value = true
    clearError()
    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) { toast.error('User not authenticated.'); loading.value = false; return { success: false } }

    const name = payload.name.trim()
    if (!name) { toast.error('Account name is required.'); loading.value = false; return { success: false } }
    if (!['CASA', 'TIME_INVESTMENT', 'PETTY_CASH'].includes(payload.classification)) {
      toast.error(`Invalid classification: ${payload.classification}`); loading.value = false; return { success: false }
    }
    const openingBalance = payload.openingBalance ?? 0
    if (openingBalance < 0) { toast.error('Opening balance cannot be negative.'); loading.value = false; return { success: false } }

    const accountType = payload.classification === 'PETTY_CASH' ? 'petty_cash' : 'bank'
    const floatAmount = payload.classification === 'PETTY_CASH' ? openingBalance : null

    const { data: created, error: insertError } = await supabase
      .from('cash_accounts')
      .insert({
        name, account_type: accountType, classification: payload.classification,
        float_amount: floatAmount, opening_balance: openingBalance, balance: openingBalance,
        is_active: payload.isActive ?? true,
      })
      .select('*')
      .single()
    if (insertError || !created) {
      handleError(insertError, 'Failed to add cash account.')
      toast.error(insertError?.message || 'Failed to add cash account.')
      loading.value = false
      return { success: false }
    }

    if (openingBalance !== 0) {
      const result = await glStore.postJournalEntry(
        new Date().toISOString().slice(0, 10), 'manual', created.id, `Opening balance: ${name}`,
        [
          { account_code: glCashCode(payload.classification), debit: openingBalance, credit: 0 },
          { account_code: '3010', debit: 0, credit: openingBalance },
        ],
        user.id,
      )
      if (!result.success) console.warn('createCashAccount: opening journal entry failed:', result.error)
    }

    const { error: logError } = await supabase.from('logs').insert({
      created_by: user.id, action: 'cash_account_open',
      description: `${name} | ${payload.classification} | opening ${openingBalance}`, module: 'finance', transaction_id: null,
    })
    if (logError) console.warn('createCashAccount: activity log insert failed:', logError.message)

    cashAccounts.value.push(created as CashAccountType)
    toast.success('Cash account added.')
    loading.value = false
    return { success: true }
  }

  // Both account FKs are on the transactions hub now (20260702000009); a
  // replenishment no longer writes a finance_details row at all.
  function mapReplenishmentRow(row: any): PettyCashReplenishmentType {
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
      // cash_account_id filters on the hub now (20260702000009); the scalar
      // fields (category/paid_to/or_si_no) still come from finance_details.
      const { data: lastApproved } = await supabase.from('transactions')
        .select('approved_at')
        .eq('transaction_type', 'petty_cash_replenishment')
        .eq('cash_account_id', cashAccountId)
        .eq('status', 'approved')
        .order('approved_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      let q = supabase.from('transactions')
        .select('expense_no, total_amount, paid_at, finance_details(category, paid_to, or_si_no)')
        .eq('transaction_type', 'expense')
        .eq('cash_account_id', cashAccountId)
      if (lastApproved?.approved_at) q = q.gt('created_at', lastApproved.approved_at)
      q = q.order('paid_at', { ascending: true })

      const { data, error: fetchError } = await q
      if (fetchError) throw fetchError
      const rows: LiquidationReportItem[] = ((data || []) as any[]).map((r) => ({
        reference_no: r.expense_no,
        category: r.finance_details?.category ?? null,
        paid_to: r.finance_details?.paid_to ?? null,
        or_si_no: r.finance_details?.or_si_no ?? null,
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

  // Was request_petty_cash_replenishment.
  const requestReplenishment = async (payload: {
    pettyCashAccountId: number
    fundingAccountId: number
    remarks?: string
  }) => {
    loading.value = true
    clearError()
    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) { toast.error('User not authenticated.'); loading.value = false; return { success: false } }

    const { data: pettyAccount, error: pettyError } = await supabase
      .from('cash_accounts').select('account_type, float_amount, balance')
      .eq('id', payload.pettyCashAccountId).maybeSingle()
    if (pettyError || !pettyAccount || !['petty_cash', 'revolving_fund'].includes(pettyAccount.account_type)) {
      toast.error(`Petty cash / revolving fund account ${payload.pettyCashAccountId} not found.`)
      loading.value = false; return { success: false }
    }
    const { data: fundingAccount } = await supabase
      .from('cash_accounts').select('id').eq('id', payload.fundingAccountId).eq('account_type', 'bank').maybeSingle()
    if (!fundingAccount) {
      toast.error(`Funding bank account ${payload.fundingAccountId} not found.`)
      loading.value = false; return { success: false }
    }

    const shortfall = (pettyAccount.float_amount ?? 0) - pettyAccount.balance
    if (shortfall <= 0) {
      toast.error(`Account is already at or above its float (balance: ${pettyAccount.balance}, float: ${pettyAccount.float_amount}).`)
      loading.value = false; return { success: false }
    }

    const prefix = pettyAccount.account_type === 'revolving_fund' ? 'RVF' : 'PCR'
    const year = new Date().getFullYear().toString()
    const { data: existingRequests } = await supabase
      .from('transactions')
      .select('reference_no')
      .like('reference_no', `${prefix}-${year}-%`)
    const requestNo = nextDocNumber((existingRequests ?? []).map(r => r.reference_no), `${prefix}-${year}-`)

    const { data: created, error: insertError } = await supabase
      .from('transactions')
      .insert({
        reference_no: requestNo, transaction_type: 'petty_cash_replenishment', status: 'pending_approval',
        total_amount: shortfall, subtotal: shortfall, remarks: payload.remarks || null, created_by: user.id,
        cash_account_id: payload.pettyCashAccountId, funding_account_id: payload.fundingAccountId,
      })
      .select('id')
      .single()
    if (insertError || !created) {
      handleError(insertError, 'Failed to request replenishment.')
      toast.error(insertError?.message || 'Failed to request replenishment.')
      loading.value = false
      return { success: false }
    }

    const { error: logError } = await supabase.from('logs').insert({
      created_by: user.id, action: 'petty_cash_replenish_request',
      description: `${requestNo} | requested ${shortfall}`, module: 'finance', transaction_id: created.id,
    })
    if (logError) console.warn('requestReplenishment: activity log insert failed:', logError.message)

    toast.success('Replenishment request submitted for approval.')
    await fetchReplenishmentRequests()
    loading.value = false
    return { success: true, requestId: created.id }
  }

  // Was approve_petty_cash_replenishment. Best-effort, not atomic: a failure
  // partway through the two balance updates can leave funds moved from the
  // funding account but not yet into petty cash (accepted trade-off,
  // JS-over-RPC convention).
  const approveReplenishment = async (id: number) => {
    loading.value = true
    clearError()
    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) { toast.error('User not authenticated.'); loading.value = false; return { success: false } }

    const { data: request, error: fetchError } = await supabase
      .from('transactions')
      .select('reference_no, total_amount, cash_account_id, funding_account_id')
      .eq('id', id).eq('transaction_type', 'petty_cash_replenishment').eq('status', 'pending_approval')
      .maybeSingle()
    if (fetchError || !request) {
      toast.error(`Pending replenishment request ${id} not found.`); loading.value = false; return { success: false }
    }
    if (!request.cash_account_id || !request.funding_account_id) {
      toast.error(`Replenishment request ${id} has no cash/funding account details.`)
      loading.value = false; return { success: false }
    }

    const { data: fundingAccount } = await supabase
      .from('cash_accounts').select('balance').eq('id', request.funding_account_id).maybeSingle()
    const amount = request.total_amount ?? 0
    if (!fundingAccount || amount > fundingAccount.balance + 0.005) {
      toast.error(`Insufficient balance in funding account (available: ${fundingAccount?.balance ?? 0}).`)
      loading.value = false; return { success: false }
    }

    const { error: fundingError } = await supabase
      .from('cash_accounts').update({ balance: fundingAccount.balance - amount }).eq('id', request.funding_account_id)
    if (fundingError) {
      handleError(fundingError, 'Failed to approve replenishment.')
      toast.error(fundingError.message || 'Failed to approve replenishment.')
      loading.value = false
      return { success: false }
    }

    const { data: pettyAccount } = await supabase
      .from('cash_accounts').select('balance').eq('id', request.cash_account_id).maybeSingle()
    const { error: pettyError } = await supabase
      .from('cash_accounts').update({ balance: (pettyAccount?.balance ?? 0) + amount }).eq('id', request.cash_account_id)
    if (pettyError) console.warn('approveReplenishment: petty account balance update failed:', pettyError.message)

    const nowIso = new Date().toISOString()
    const { error: statusError } = await supabase
      .from('transactions')
      .update({ status: 'approved', approved_by: user.id, approved_at: nowIso, updated_at: nowIso })
      .eq('id', id)
    if (statusError) console.warn('approveReplenishment: status flip failed:', statusError.message)

    const { error: logError } = await supabase.from('logs').insert({
      created_by: user.id, action: 'petty_cash_replenish_approve',
      description: `${request.reference_no} | ${amount}`, module: 'finance', transaction_id: id,
    })
    if (logError) console.warn('approveReplenishment: activity log insert failed:', logError.message)

    toast.success('Replenishment approved.')
    await Promise.all([fetchReplenishmentRequests(), fetchCashAccounts()])
    loading.value = false
    return { success: true }
  }

  // Was reject_petty_cash_replenishment.
  const rejectReplenishment = async (id: number, reason: string) => {
    loading.value = true
    clearError()
    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) { toast.error('User not authenticated.'); loading.value = false; return { success: false } }

    const { data: request, error: fetchError } = await supabase
      .from('transactions')
      .select('reference_no, remarks')
      .eq('id', id).eq('transaction_type', 'petty_cash_replenishment').eq('status', 'pending_approval')
      .maybeSingle()
    if (fetchError || !request) {
      toast.error(`Pending replenishment request ${id} not found.`); loading.value = false; return { success: false }
    }

    const nowIso = new Date().toISOString()
    const newRemarks = `${request.remarks ? request.remarks + ' | ' : ''}Rejected: ${reason ?? ''}`
    const { error: statusError } = await supabase
      .from('transactions')
      .update({ status: 'rejected', approved_by: user.id, approved_at: nowIso, updated_at: nowIso, remarks: newRemarks })
      .eq('id', id)
    if (statusError) {
      handleError(statusError, 'Failed to reject replenishment.')
      toast.error(statusError.message || 'Failed to reject replenishment.')
      loading.value = false
      return { success: false }
    }

    const { error: logError } = await supabase.from('logs').insert({
      created_by: user.id, action: 'petty_cash_replenish_reject',
      description: `${request.reference_no} | ${reason ?? ''}`, module: 'finance', transaction_id: id,
    })
    if (logError) console.warn('rejectReplenishment: activity log insert failed:', logError.message)

    toast.success('Replenishment request rejected.')
    await fetchReplenishmentRequests()
    loading.value = false
    return { success: true }
  }

  // Was delete_expense. Reverses the cash deduction record_expense made
  // (expenses recorded before cash accounts existed have no cash_account_id —
  // nothing to restore for those). finance_details row cascades on delete.
  const deleteExpense = async (id: number) => {
    loading.value = true
    clearError()
    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) { toast.error('User not authenticated.'); loading.value = false; return { success: false } }

    const { data: expense, error: fetchError } = await supabase
      .from('transactions')
      .select('expense_no, total_amount, cash_account_id')
      .eq('id', id).eq('transaction_type', 'expense')
      .maybeSingle()
    if (fetchError || !expense) {
      toast.error(`Expense ${id} not found.`); loading.value = false; return { success: false }
    }

    if (expense.cash_account_id && (expense.total_amount ?? 0) > 0) {
      const { data: account } = await supabase
        .from('cash_accounts').select('balance').eq('id', expense.cash_account_id).maybeSingle()
      if (account) {
        const { error: balanceError } = await supabase
          .from('cash_accounts').update({ balance: account.balance + (expense.total_amount ?? 0) }).eq('id', expense.cash_account_id)
        if (balanceError) console.warn('deleteExpense: cash account balance restore failed:', balanceError.message)
      }
    }

    const { error: logError } = await supabase.from('logs').insert({
      created_by: user.id, action: 'expense_delete', description: expense.expense_no ?? String(id),
      module: 'finance', transaction_id: id,
    })
    if (logError) console.warn('deleteExpense: activity log insert failed:', logError.message)

    const { error: deleteError } = await supabase.from('transactions').delete().eq('id', id).eq('transaction_type', 'expense')
    if (deleteError) {
      handleError(deleteError, 'Failed to delete expense.')
      toast.error(deleteError.message || 'Failed to delete expense.')
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

  // Was record_supplier_payment. Best-effort, not atomic: a failure after the
  // header insert can leave a payment recorded with no suppliers.balance
  // decrement (accepted trade-off, JS-over-RPC convention).
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

    if (payload.amount <= 0) {
      toast.error('Payment amount must be positive.'); loading.value = false; return { success: false }
    }
    const { data: supplier, error: supplierError } = await supabase
      .from('suppliers').select('id, balance').eq('id', payload.supplierId).maybeSingle()
    if (supplierError || !supplier) {
      toast.error(`Supplier ${payload.supplierId} not found.`); loading.value = false; return { success: false }
    }

    const [receivedRes, paidRes] = await Promise.all([
      supabase.from('transactions').select('total_amount').eq('transaction_type', 'stock_in').eq('supplier_id', payload.supplierId),
      supabase.from('transactions').select('total_amount').eq('transaction_type', 'supplier_payment').eq('supplier_id', payload.supplierId),
    ])
    const received = (receivedRes.data ?? []).reduce((sum, r) => sum + (r.total_amount ?? 0), 0)
    const paid = (paidRes.data ?? []).reduce((sum, r) => sum + (r.total_amount ?? 0), 0)
    const outstanding = received - paid
    if (payload.amount > outstanding + 0.005) {
      toast.error(`Payment (${payload.amount}) exceeds outstanding balance (${outstanding}).`)
      loading.value = false; return { success: false }
    }

    const year = new Date().getFullYear().toString()
    const { data: existingPayments } = await supabase
      .from('transactions')
      .select('reference_no')
      .like('reference_no', `SP-${year}-%`)
    const paymentNo = nextDocNumber((existingPayments ?? []).map(r => r.reference_no), `SP-${year}-`)

    let remarks = payload.remarks || ''
    if (payload.referenceNo) remarks = `${remarks} | Ref: ${payload.referenceNo}`.replace(/^\s*\|\s*/, '')

    const { data: created, error: insertError } = await supabase
      .from('transactions')
      .insert({
        reference_no: paymentNo, transaction_type: 'supplier_payment', status: 'recorded',
        supplier_id: payload.supplierId, payment_method: payload.paymentMethod || null,
        subtotal: payload.amount, total_amount: payload.amount,
        paid_at: payload.valueDate || new Date().toISOString().slice(0, 10),
        remarks: remarks || null, created_by: user.id,
      })
      .select('id')
      .single()
    if (insertError || !created) {
      handleError(insertError, 'Failed to record supplier payment.')
      toast.error(insertError?.message || 'Failed to record supplier payment.')
      loading.value = false
      return { success: false }
    }

    const { error: balanceError } = await supabase
      .from('suppliers').update({ balance: (supplier.balance ?? 0) - payload.amount }).eq('id', payload.supplierId)
    if (balanceError) console.warn('recordSupplierPayment: supplier balance update failed:', balanceError.message)

    const { error: logError } = await supabase.from('logs').insert({
      created_by: user.id, action: 'supplier_payment',
      description: `${paymentNo} | supplier ${payload.supplierId} | ${payload.amount}`, module: 'finance', transaction_id: created.id,
    })
    if (logError) console.warn('recordSupplierPayment: activity log insert failed:', logError.message)

    toast.success('Supplier payment recorded.')
    await Promise.all([fetchSupplierPayments(), fetchSupplierAP()])
    loading.value = false
    return { success: true, paymentId: created.id }
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
  const addDaysStr = (dateStr: string, days: number) => {
    const d = new Date(`${dateStr}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + days)
    return d.toISOString().slice(0, 10)
  }
  const minDateStr = (a: string, b: string) => (a < b ? a : b)

  // One day's revenue/cogs/opex slice — was finance_refresh_daily_summary's
  // SELECT logic. Shared by refreshDailySummary (persists to the cache) and
  // fetchTodayPnLSlice (today only, deliberately never cached — see below).
  const computeDaySlice = async (date: string) => {
    const dayStart = date + 'T00:00:00'
    const dayEnd   = date + 'T23:59:59.999'

    const [saleRes, collectionRes, stockInRes, expenseRes] = await Promise.all([
      supabase.from('transactions')
        .select('total_amount, pos_sale_details(voided_at)')
        .eq('transaction_type', 'sale').eq('status', 'completed')
        .gte('created_at', dayStart).lte('created_at', dayEnd),
      // All that day's collections — we'll split by transaction_type in JS
      supabase.from('collections')
        .select('amount, transaction:transaction_id!inner(transaction_type)')
        .gte('created_at', dayStart).lte('created_at', dayEnd),
      supabase.from('transactions').select('total_amount')
        .eq('transaction_type', 'stock_in')
        .gte('updated_at', dayStart).lte('updated_at', dayEnd),
      supabase.from('transactions').select('total_amount')
        .eq('transaction_type', 'expense')
        .gte('paid_at', dayStart).lte('paid_at', dayEnd),
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

  const fetchTodayPnLSlice = () => computeDaySlice(todayStr())

  // Persist one day's slice into the finance_daily_summary cache — was
  // finance_refresh_daily_summary.
  const refreshDailySummary = async (date: string) => {
    const slice = await computeDaySlice(date)
    await supabase.from('finance_daily_summary').upsert({
      summary_date: date,
      revenue_pos: slice.revenuePos,
      revenue_ethical: slice.revenueEthical,
      revenue_inhouse: slice.revenueInhouse,
      cogs: slice.cogs,
      opex: slice.opex,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'summary_date' })
  }

  // Cache every CLOSED day (strictly before today) with activity in
  // [dateFrom, dateTo] that isn't cached yet — was finance_backfill_daily_summary.
  // Never touches today; fetchPnL always recomputes today live via
  // fetchTodayPnLSlice instead.
  const backfillDailySummaries = async (dateFrom: string | null, dateTo: string | null) => {
    const yesterday = addDaysStr(todayStr(), -1)
    const from = dateFrom ?? '1970-01-01'
    const to = dateTo ? minDateStr(dateTo, yesterday) : yesterday
    if (to < from) return

    const fromTs = from + 'T00:00:00'
    const toTs = to + 'T23:59:59.999'

    const [saleRes, ethicalColRes, inhouseColRes, stockInRes, expenseRes, cachedRes] = await Promise.all([
      supabase.from('transactions').select('created_at')
        .eq('transaction_type', 'sale').eq('status', 'completed')
        .gte('created_at', fromTs).lte('created_at', toTs),
      supabase.from('collections').select('created_at, transaction:transaction_id!inner(transaction_type)')
        .eq('transaction.transaction_type', 'ethical_order')
        .gte('created_at', fromTs).lte('created_at', toTs),
      supabase.from('collections').select('created_at, transaction:transaction_id!inner(transaction_type)')
        .eq('transaction.transaction_type', 'inhouse_order')
        .gte('created_at', fromTs).lte('created_at', toTs),
      supabase.from('transactions').select('updated_at')
        .eq('transaction_type', 'stock_in')
        .gte('updated_at', fromTs).lte('updated_at', toTs),
      supabase.from('transactions').select('paid_at')
        .eq('transaction_type', 'expense')
        .gte('paid_at', fromTs).lte('paid_at', toTs),
      supabase.from('finance_daily_summary').select('summary_date'),
    ])
    for (const res of [saleRes, ethicalColRes, inhouseColRes, stockInRes, expenseRes, cachedRes]) {
      if (res.error) throw res.error
    }

    const activeDays = new Set<string>()
    for (const r of (saleRes.data ?? []) as any[]) activeDays.add(r.created_at.slice(0, 10))
    for (const r of (ethicalColRes.data ?? []) as any[]) activeDays.add(r.created_at.slice(0, 10))
    for (const r of (inhouseColRes.data ?? []) as any[]) activeDays.add(r.created_at.slice(0, 10))
    for (const r of (stockInRes.data ?? []) as any[]) activeDays.add(r.updated_at.slice(0, 10))
    for (const r of (expenseRes.data ?? []) as any[]) activeDays.add(r.paid_at.slice(0, 10))

    const cachedDays = new Set((cachedRes.data ?? []).map((r: any) => r.summary_date as string))

    for (const day of activeDays) {
      if (!cachedDays.has(day)) await refreshDailySummary(day)
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
      await backfillDailySummaries(range.dateFrom ?? null, range.dateTo ?? null)

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
        .select('id, remittance_no, outlet, outlet_id, created_at, total_amount, actual_amount, remittance_details(actual_amount)')
        .eq('transaction_type', 'remittance')
        .order('created_at', { ascending: false })
      if (fetchError) throw fetchError

      const rows: RemittanceDiscrepancyRow[] = ((data || []) as any[])
        .map((r) => {
          const actualAmount = r.remittance_details?.actual_amount ?? r.actual_amount ?? 0
          return {
            id: r.id,
            reference_no: r.remittance_no,
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
          .select('id, ethical_no, total_amount, customer_id, ethical_details(amount_paid, due_date), customer:customer_id(name)')
          .eq('transaction_type', 'ethical_order').in('status', ['invoiced', 'partial']),
        supabase.from('transactions')
          .select('id, inhouse_no, total_amount, customer_id, inhouse_details(amount_paid), status, customer:customer_id(name)')
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
          id: r.id, source: 'ethical_order', reference_no: r.ethical_no,
          customer_id: r.customer_id ?? null, customer_name: r.customer?.name ?? null, total_amount: r.total_amount ?? 0,
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
          id: r.id, source: 'inhouse_order', reference_no: r.inhouse_no,
          customer_id: r.customer_id ?? null, customer_name: r.customer?.name ?? null, total_amount: r.total_amount ?? 0,
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
      // Line values now live in the 1:1 transaction_item_details embed.
      const [stockInRes, transferRes, saleRes, ethicalRes, inhouseRes, warehouseRes, outletRes, voidedPsdRes] = await Promise.all([
        supabase.from('transaction_items').select('product_id, transaction_item_details(qty), transaction:transaction_id!inner(transaction_type)').eq('transaction.transaction_type', 'stock_in'),
        supabase.from('transaction_items').select('product_id, transaction_item_details(qty, received_qty), transaction:transaction_id!inner(transaction_type, status, outlet)').eq('transaction.transaction_type', 'stock_transfer'),
        supabase.from('transaction_items').select('product_id, transaction_id, transaction_item_details(qty), transaction:transaction_id!inner(transaction_type, status, outlet)').eq('transaction.transaction_type', 'sale'),
        supabase.from('transaction_items').select('product_id, transaction_item_details(stock_sources), transaction:transaction_id!inner(transaction_type, status)').eq('transaction.transaction_type', 'ethical_order'),
        supabase.from('transaction_items').select('product_id, transaction_item_details(delivered_qty), transaction:transaction_id!inner(transaction_type)').eq('transaction.transaction_type', 'inhouse_order'),
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
        if (r.product_id != null) bump(expectedWarehouse, r.product_id, r.transaction_item_details?.qty ?? 0)
      }
      for (const r of (transferRes.data || []) as any[]) {
        const t = r.transaction
        if (!t || !['approved', 'completed'].includes(t.status)) continue
        const d = r.transaction_item_details ?? {}
        if (r.product_id != null) bump(expectedWarehouse, r.product_id, -(d.qty ?? 0))
        if (t.status === 'completed' && r.product_id != null && (t.outlet === 'EXELMED' || t.outlet === 'ETHICAL')) {
          bump(expectedOutlet[t.outlet as 'EXELMED' | 'ETHICAL'], r.product_id, d.received_qty ?? 0)
        }
      }
      for (const r of (saleRes.data || []) as any[]) {
        const t = r.transaction
        if (!t || t.status !== 'completed') continue
        if (voidedByPsd.has(r.transaction_id)) continue
        if (r.product_id != null && t.outlet === 'EXELMED') bump(expectedOutlet.EXELMED, r.product_id, -(r.transaction_item_details?.qty ?? 0))
      }
      for (const r of (ethicalRes.data || []) as any[]) {
        const t = r.transaction
        if (!t || t.status === 'cancelled') continue
        const sources = r.transaction_item_details?.stock_sources || {}
        if (r.product_id != null) {
          if (sources.ethical) bump(expectedOutlet.ETHICAL, r.product_id, -sources.ethical)
          if (sources.exelmed) bump(expectedOutlet.EXELMED, r.product_id, -sources.exelmed)
          if (sources.warehouse) bump(expectedWarehouse, r.product_id, -sources.warehouse)
        }
      }
      for (const r of (inhouseRes.data || []) as any[]) {
        if (r.product_id != null) bump(expectedWarehouse, r.product_id, -(r.transaction_item_details?.delivered_qty ?? 0))
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

  // ─── GL: authoritative financial statements ──────────────────────────────
  // Delegates entirely to glData.ts (the store that owns GL logic) — this
  // store never calls Supabase for GL statements itself, matching the layer
  // rule that only one store owns each Supabase call. glStore's fetch*
  // actions already run the ledger projection before computing, so there's
  // no separate runGLProjection step here anymore.

  const fetchIncomeStatement = async (range: DateRange = {}) => {
    loading.value = true
    clearError()
    try {
      incomeStatement.value = (await glStore.fetchIncomeStatement(range.dateFrom, range.dateTo)) as GLIncomeStatement | null
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
      balanceSheet.value = (await glStore.fetchBalanceSheet(asOf)) as GLBalanceSheet | null
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
      trialBalance.value = (await glStore.fetchTrialBalance(asOf)) as TrialBalanceLine[]
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
    fetchIncomeStatement, fetchBalanceSheet, fetchTrialBalance,
    clearError, resetStore,
  }
})

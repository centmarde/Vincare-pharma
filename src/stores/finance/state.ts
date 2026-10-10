// Shared mutable state for the financeData store.
//
// Every ref lives here, at module scope, so all the feature files (expenses,
// cashAccounts, pettyCash, payables, receivables, discrepancies, statements)
// read and write ONE copy — the same arrangement as stores/products/state.ts.
// The barrel (../financeData.ts) returns these refs from its defineStore.

import { ref, computed } from 'vue'
import type { Ref } from 'vue'
import type {
  APAgingRow,
  ARAgingRow,
  CashAccountType,
  CommissionLiabilityRow,
  ExpenseType,
  GLBalanceSheet,
  GLIncomeStatement,
  PettyCashReplenishmentType,
  PnLSummary,
  RemittanceDiscrepancyRow,
  StockReconRow,
  SupplierAPRow,
  SupplierPaymentType,
  TrialBalanceLine,
} from './types'

// State
export const expenses: Ref<ExpenseType[]> = ref([])
export const cashAccounts: Ref<CashAccountType[]> = ref([])
export const replenishmentRequests: Ref<PettyCashReplenishmentType[]> = ref([])
export const supplierPayments: Ref<SupplierPaymentType[]> = ref([])
export const supplierAP: Ref<SupplierAPRow[]> = ref([])
export const apAging: Ref<APAgingRow[]> = ref([])
export const pnl: Ref<PnLSummary | null> = ref(null)
export const remittanceDiscrepancies: Ref<RemittanceDiscrepancyRow[]> = ref([])
export const arAging: Ref<ARAgingRow[]> = ref([])
export const commissionLiability: Ref<CommissionLiabilityRow[]> = ref([])
export const stockReconciliation: Ref<StockReconRow[]> = ref([])
export const stockReconciliationComputedAt: Ref<number | null> = ref(null)
export const incomeStatement: Ref<GLIncomeStatement | null> = ref(null)
export const balanceSheet: Ref<GLBalanceSheet | null> = ref(null)
export const trialBalance: Ref<TrialBalanceLine[]> = ref([])

export const loading = ref(false)
export const error: Ref<string> = ref('')

// Computed
export const isLoading = computed(() => loading.value)
export const hasError = computed(() => error.value !== '')

// Helpers
export function handleError(err: unknown, defaultMessage: string) {
  error.value = err instanceof Error ? err.message : defaultMessage
}

export function clearError() {
  error.value = ''
}

export function resetStore() {
  expenses.value = []
  cashAccounts.value = []
  replenishmentRequests.value = []
  supplierPayments.value = []
  supplierAP.value = []
  apAging.value = []
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

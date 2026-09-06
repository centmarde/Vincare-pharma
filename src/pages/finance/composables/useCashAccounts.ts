import { ref, computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useFinanceDataStore } from '@/stores/financeData'
import type { LiquidationReportItem } from '@/stores/financeData'
import type { CreateCashAccountPayload } from '@/utils/cashAccountTypes'
import { useAuthUserStore } from '@/stores/authUser'

export const requestHeaders = [
  { title: 'REFERENCE #', key: 'reference_no',         sortable: true,  align: 'center' as const },
  { title: 'DATE',        key: 'created_at',            sortable: true,  align: 'center' as const },
  { title: 'TO',          key: 'cash_account_name',      sortable: false, align: 'center' as const },
  { title: 'FROM',        key: 'funding_account_name',   sortable: false, align: 'center' as const },
  { title: 'AMOUNT',      key: 'amount',                 sortable: false, align: 'center' as const },
  { title: 'REMARKS',     key: 'remarks',                sortable: false, align: 'center' as const },
  { title: 'STATUS',      key: 'status',                 sortable: true,  align: 'center' as const },
  { title: 'ACTIONS',     key: 'actions',                sortable: false, align: 'center' as const },
] as const

export function useCashAccounts() {
  const store = useFinanceDataStore()
  const authStore = useAuthUserStore()
  const { cashAccounts, replenishmentRequests, loading } = storeToRefs(store)

  // Segregation of duties: whoever raised a replenishment request can't also
  // be the one who approves/rejects it, even though both actions live on this
  // one page (the app's role_pages access control only gates whole routes,
  // not actions within a page, so this is enforced here instead).
  const isOwnRequest = (request: { created_by: string | null }) =>
    !!authStore.userData?.id && request.created_by === authStore.userData.id

  const pettyCashAccount = computed(() => cashAccounts.value.find((a) => a.account_type === 'petty_cash') ?? null)
  const bankAccounts = computed(() => cashAccounts.value.filter((a) => a.account_type === 'bank'))
  // Petty Cash always leads (it's the one with actionable replenishment state);
  // banks follow alphabetically so the grid order doesn't jump around as accounts are added.
  const sortedCashAccounts = computed(() => [
    ...(pettyCashAccount.value ? [pettyCashAccount.value] : []),
    ...[...bankAccounts.value].sort((a, b) => a.name.localeCompare(b.name)),
  ])
  const totalBankBalance = computed(() => bankAccounts.value.reduce((sum, a) => sum + a.balance, 0))
  const isPettyCashLow = computed(() =>
    !!pettyCashAccount.value
    && pettyCashAccount.value.float_amount != null
    && pettyCashAccount.value.balance < pettyCashAccount.value.float_amount,
  )
  const pendingRequests = computed(() => replenishmentRequests.value.filter((r) => r.status === 'pending_approval'))

  // ─── Replenish request dialog ────────────────────────────────────
  // No "must be fully depleted" gate — a request can be raised the moment
  // any spending has occurred (the RPC itself rejects a zero shortfall).
  // Remarks is where the requester explains why they're topping up early.
  const showRequestDialog = ref(false)
  const fundingAccountId = ref<number | null>(null)
  const remarks = ref('')
  const canSubmitRequest = computed(() => !!fundingAccountId.value)
  const requestPreview = ref<LiquidationReportItem[]>([])
  const requestPreviewTotal = ref(0)
  const requestPreviewLoading = ref(false)

  // ─── View liquidation report dialog (for already-submitted requests) ──
  const showReportDialog = ref(false)
  const reportItems = ref<LiquidationReportItem[]>([])
  const reportTotal = ref(0)

  // ─── Reject dialog ────────────────────────────────────────────────
  const showRejectDialog = ref(false)
  const rejectTargetId = ref<number | null>(null)
  const rejectReason = ref('')

  // ─── Add cash account (dialog/form state lives in CashAccountsManager) ──
  async function createAccount(payload: CreateCashAccountPayload) {
    await store.createCashAccount({
      name: payload.name,
      classification: payload.classification,
      openingBalance: payload.opening_balance,
      isActive: payload.is_active,
      glAccountCode: payload.gl_account_code,
    })
  }

  async function init() {
    await Promise.all([store.fetchCashAccounts(), store.fetchReplenishmentRequests()])
  }

  async function openRequestDialog() {
    fundingAccountId.value = null
    remarks.value = ''
    requestPreview.value = []
    requestPreviewTotal.value = 0
    showRequestDialog.value = true
    if (!pettyCashAccount.value) return
    requestPreviewLoading.value = true
    const { rows, total } = await store.previewPettyCashLiquidation(pettyCashAccount.value.id)
    requestPreview.value = rows
    requestPreviewTotal.value = total
    requestPreviewLoading.value = false
  }

  async function submitRequest() {
    if (!canSubmitRequest.value || !pettyCashAccount.value) return
    const result = await store.requestReplenishment({
      pettyCashAccountId: pettyCashAccount.value.id,
      fundingAccountId: fundingAccountId.value as number,
      remarks: remarks.value || undefined,
    })
    if (result.success) showRequestDialog.value = false
  }

  async function approve(id: number) {
    await store.approveReplenishment(id)
  }

  function openReportDialog(id: number) {
    const request = replenishmentRequests.value.find((r) => r.id === id)
    reportItems.value = request?.liquidation_report ?? []
    reportTotal.value = reportItems.value.reduce((sum, r) => sum + r.amount, 0)
    showReportDialog.value = true
  }

  function openRejectDialog(id: number) {
    rejectTargetId.value = id
    rejectReason.value = ''
    showRejectDialog.value = true
  }

  async function confirmReject() {
    if (rejectTargetId.value == null) return
    const result = await store.rejectReplenishment(rejectTargetId.value, rejectReason.value)
    if (result.success) showRejectDialog.value = false
  }

  onMounted(init)

  return {
    cashAccounts, pettyCashAccount, bankAccounts, sortedCashAccounts, totalBankBalance, isPettyCashLow,
    replenishmentRequests, pendingRequests, loading,
    showRequestDialog, fundingAccountId, remarks, canSubmitRequest,
    requestPreview, requestPreviewTotal, requestPreviewLoading,
    showReportDialog, reportItems, reportTotal, openReportDialog,
    showRejectDialog, rejectReason,
    isOwnRequest,
    init, openRequestDialog, submitRequest, approve, openRejectDialog, confirmReject,
    createAccount,
  }
}

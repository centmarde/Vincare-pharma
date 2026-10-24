import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useCreditMemosStore, creditMemoReasons, creditMemoReasonLabel } from '@/stores/creditMemosData'
import type { CreditMemoReason, CreditMemoStatus, CreditMemoType } from '@/stores/creditMemosData'
import type { ARSource } from '@/stores/financeData'
import { formatCurrency } from '@/utils/helpers'

// Credit memos on the Accounts Receivable page: asking for one against a bill
// (an allowance — a credit memo for RETURNED goods is raised from the return,
// on the Returns page), and the register of them with printing.

export const creditMemoStatusMeta: Record<CreditMemoStatus, { label: string; color: string }> = {
  pending_approval: { label: 'Awaiting approval', color: 'warning' },
  // Explicit green: the theme's 'success' is a shade of the brand red.
  issued: { label: 'Issued', color: 'green-darken-1' },
  rejected: { label: 'Rejected', color: 'grey' },
}

/** Reasons offered for an allowance — returned goods come from the return. */
export const allowanceReasons = creditMemoReasons.filter((r) => r.value !== 'returned_goods')

export type CreditMemoTarget = {
  source: ARSource
  id: number
  reference_no: string | null
  customer_name: string | null
  balance: number
}

/** The "Issue Credit Memo" form on a bill. */
export function useCreditMemoRequest(onSent: () => void) {
  const store = useCreditMemosStore()
  const target = ref<CreditMemoTarget | null>(null)
  const reasonCode = ref<CreditMemoReason>('price_correction')
  const amount = ref(0)
  const reason = ref('')
  const saving = ref(false)

  const blockers = computed(() => {
    const missing: string[] = []
    if (!(amount.value > 0)) missing.push('an amount')
    if (target.value && amount.value > target.value.balance + 0.005) {
      missing.push(`an amount within the ${formatCurrency(target.value.balance)} still owed`)
    }
    if (!reason.value.trim()) missing.push('the reason, as it should read on the credit memo')
    return missing
  })
  const canSubmit = computed(() => !!target.value && blockers.value.length === 0 && !saving.value)

  function open(t: CreditMemoTarget) {
    target.value = t
    reasonCode.value = 'price_correction'
    amount.value = 0
    reason.value = ''
  }

  async function submit() {
    if (!canSubmit.value || !target.value) return { success: false }
    saving.value = true
    try {
      const result = await store.requestCreditMemo({
        target: { source: target.value.source, id: target.value.id },
        amount: amount.value,
        reasonCode: reasonCode.value,
        reason: reason.value,
      })
      if (result.success) onSent()
      return result
    } finally {
      saving.value = false
    }
  }

  return { target, reasonCode, amount, reason, saving, blockers, canSubmit, open, submit, allowanceReasons, formatCurrency }
}

/** The credit memo register: every request, its status, and printing. */
export function useCreditMemoRegister() {
  const store = useCreditMemosStore()
  const { memos, loading } = storeToRefs(store)

  const statusFilter = ref<CreditMemoStatus | null>(null)
  // null after the field's clear button.
  const search = ref<string | null>('')
  const printTarget = ref<CreditMemoType | null>(null)
  const showPrint = ref(false)

  const filtered = computed(() => {
    const q = (search.value ?? '').trim().toLowerCase()
    return memos.value.filter((m) => {
      if (statusFilter.value && m.status !== statusFilter.value) return false
      if (!q) return true
      return [m.cm_no, m.customer_name, m.applies_to_no, m.sales_return_no, m.reason, creditMemoReasonLabel(m.reason_code)]
        .some((v) => (v ?? '').toLowerCase().includes(q))
        || m.amount.toFixed(2).includes(q.replace(/[₱,\s]/g, ''))
    })
  })

  const headers = [
    { title: 'CREDIT MEMO', key: 'cm_no', sortable: true },
    { title: 'DATE', key: 'created_at', sortable: true },
    { title: 'CUSTOMER', key: 'customer_name', sortable: true },
    { title: 'APPLIES TO', key: 'applies_to_no', sortable: false },
    { title: 'REASON', key: 'reason', sortable: false },
    { title: 'AMOUNT', key: 'amount', sortable: true, align: 'end' as const },
    { title: '', key: 'actions', sortable: false, align: 'end' as const },
  ]

  async function load() {
    await store.fetchCreditMemos()
  }

  function openPrint(memo: CreditMemoType) {
    printTarget.value = memo
    showPrint.value = true
  }

  return { memos, loading, statusFilter, search, filtered, headers, printTarget, showPrint, load, openPrint }
}

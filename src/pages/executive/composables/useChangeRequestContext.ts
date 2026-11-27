import { computed, ref, watch } from 'vue'
import { useApprovalContextStore } from '@/stores/approvalContextData'
import type { ApprovalChangeContext } from '@/stores/approvalContextData'
import { useAuthUserStore } from '@/stores/authUser'
import { categoryTitle, expenseDepartments, expensePaymentMethods } from '@/stores/financeData'
import { correctionsBookInOriginalMonth } from '@/stores/changeRequests/finance'
import { chargeToAccount, collectionMethodLabel, isCreditSettlement, paymentDiscount, paymentMethods } from '@/utils/paymentMethods'
import { formatCurrency, formatDateOnly } from '@/utils/helpers'
import {
  changeActionLabel, changeFieldLabel, dateFields, documentSide, documentTypeLabel, moneyFields,
} from './approvalLabels'

// Everything the approver needs to decide a change request: what the document
// is (amount, who, voucher, account), exactly what changes (field — now —
// after, as names and pesos), and what approving will do. The request row on
// its own only carried a document number and a one-line summary, so the
// operations admins were approving things they could not identify.

const expenseLedgerKeys = ['amount', 'category', 'cash_account_id', 'paid_at']

type Diff = { from?: unknown; to?: unknown }

export function useChangeRequestContext(request: () => any) {
  const store = useApprovalContextStore()
  const authStore = useAuthUserStore()
  const context = ref<ApprovalChangeContext | null>(null)
  const loading = ref(false)
  let seq = 0

  watch(
    () => request()?.id,
    async () => {
      const r = request()
      // Bumped first, so a fetch still running for the previous request can
      // never land as this one's context.
      const mine = ++seq
      context.value = null
      if (!r?.transaction_id) { loading.value = false; return }
      loading.value = true
      try {
        if (!authStore.users.length) await authStore.getAllUsers()
        const found = await store.fetchChangeContext(r.transaction_id, r.proposed_changes)
        if (mine === seq) context.value = found
      } catch (err) {
        console.warn('useChangeRequestContext: could not load the request context:', err)
      } finally {
        if (mine === seq) loading.value = false
      }
    },
    { immediate: true },
  )

  const changes = computed<Record<string, Diff>>(() => {
    const out: Record<string, Diff> = {}
    for (const [key, diff] of Object.entries((request()?.proposed_changes ?? {}) as Record<string, Diff>)) {
      if (!key.startsWith('__')) out[key] = diff
    }
    return out
  })

  const transactionType = computed(() => context.value?.transactionType ?? request()?.transaction_type ?? null)
  const actionLabel = computed(() =>
    changeActionLabel(request()?.request_type, transactionType.value, request()?.proposed_changes))
  const side = computed(() => documentSide(transactionType.value))
  const docLabel = computed(() => {
    const type = transactionType.value
    return type ? documentTypeLabel[type] ?? type : 'document'
  })
  const docNo = computed(() => context.value?.docNo ?? request()?.from_transaction_no ?? `#${request()?.transaction_id ?? ''}`)

  function nameOf(userId: string | null | undefined): string | null {
    if (!userId) return null
    const user = authStore.users.find((u: any) => u.id === userId) as any
    return user?.full_name || user?.email || null
  }

  const requestedBy = computed(() =>
    request()?.requester_name?.trim() || nameOf(request()?.created_by) || request()?.created_by_email || '—')

  /** A stored value as staff know it: account names, pesos, readable dates. */
  function display(key: string, value: unknown): string {
    if (value == null || value === '') return '—'
    const c = context.value
    if (moneyFields.has(key)) return formatCurrency(Number(value))
    if (dateFields.has(key)) return formatDateOnly(String(value))
    if (key === 'cash_account_id') return c?.cashAccountNames[Number(value)] ?? `Cash account #${value}`
    if (key === 'category') return c?.accountNames[String(value)] ?? categoryTitle(String(value))
    if (key === 'department') return expenseDepartments.find((d) => d.value === value)?.title ?? String(value)
    if (key === 'payment_method') return paymentMethodTitle(String(value))
    return String(value)
  }

  function paymentMethodTitle(value: string | null | undefined): string {
    if (!value) return '—'
    if (value === chargeToAccount) return 'Charged to account'
    // Exact lookups only: paymentMethodMeta falls back to "Cash" for anything
    // it does not know, which would mislabel a method here.
    return expensePaymentMethods.find((m) => m.value === value)?.title
      ?? paymentMethods.find((m) => m.value === value)?.title
      ?? value
  }

  /** Field — now — after. */
  const changeRows = computed(() => Object.entries(changes.value).map(([key, diff]) => ({
    key,
    label: changeFieldLabel(key),
    now: display(key, diff.from),
    after: display(key, diff.to),
  })))

  /** What the document is, by type — the blanks left out. */
  const facts = computed(() => {
    const c = context.value
    if (!c) return []
    const rows: { label: string; value: string }[] = []
    const add = (label: string, value: string | null | undefined) => {
      if (value != null && value !== '') rows.push({ label, value })
    }
    add('Amount', c.amount == null ? null : formatCurrency(c.amount))
    add('Date', c.date ? formatDateOnly(c.date) : null)
    if (c.counterpartyRole) add(c.counterpartyRole, c.counterparty)
    if (c.transactionType === 'expense') add('Expense account', c.category ? display('category', c.category) : null)
    add('Paid from', c.cashAccountName)
    add('Payment method', c.paymentMethod ? paymentMethodTitle(c.paymentMethod) : null)
    add('Department', c.department)
    add('OR/SI no.', c.orSiNo)
    if (c.transactionType === 'supplier_payment') add('For POs', c.poNumbers)
    if (c.transactionType === 'remittance') {
      add('Cash counted', c.remittanceActual == null ? null : formatCurrency(c.remittanceActual))
      add('Short / over', c.remittanceActual == null || c.amount == null ? null : formatCurrency(c.remittanceActual - c.amount))
    }
    add('Description', c.remarks)
    add('Recorded by', nameOf(c.recordedBy))
    // 'change_request' is the hold a pending request puts on the document, not
    // a state anyone outside this screen would recognise.
    add('Status', c.status === 'change_request'
      ? 'On hold until this request is decided'
      : c.status ? c.status.replace(/_/g, ' ').replace(/^./, (ch) => ch.toUpperCase()) : null)
    return rows
  })

  /** One sentence: what pressing Approve actually does. */
  const effect = computed(() => {
    const r = request()
    const c = context.value
    const isVoid = r?.request_type === 'void'
    const amount = c?.amount == null ? null : formatCurrency(c.amount)
    const cash = c?.cashAccountName ?? 'its cash account'
    const doc = docNo.value
    const type = transactionType.value
    const keys = Object.keys(changes.value)
    const rawChanges = (r?.proposed_changes ?? {}) as Record<string, unknown>

    if (r?.request_type === 'undo_pr') return `Returns ${doc} to Pending Approval so it can be changed before it goes ahead.`

    if ('__collection_id' in rawChanges) {
      const pay = c?.collection
      const credit = !!pay && isCreditSettlement(pay.method)
      const noun = pay?.method === paymentDiscount ? 'discount' : credit ? collectionMethodLabel(pay?.method ?? null).toLowerCase() : 'payment'
      const what = pay ? `the ${formatCurrency(pay.amount)} ${noun}${pay.referenceNo ? ` (OR ${pay.referenceNo})` : ''}` : 'this payment'
      if (isVoid) {
        // A discount / return credit never went into a cash account.
        return credit
          ? `Voids ${what} on ${doc}: its ledger entry is reversed and the customer owes that amount again. No cash account is touched.`
          : `Voids ${what} on ${doc}: the customer owes that amount again and it comes off the cash account it was deposited to.`
      }
      if ('amount' in changes.value) {
        return `Voids ${what} on ${doc} and records ${display('amount', changes.value.amount.to)} in its place, to the same cash account.`
      }
      return `Updates the details of ${what} on ${doc}. No amounts change.`
    }
    if ('__opening_receivable' in rawChanges) {
      if (isVoid) return `Voids opening receivable ${doc}; its opening ledger entry is reversed.`
      return keys.some((k) => ['original_amount', 'paid_before_cutover', 'credit_memo_amount', 'credit_memo_no', 'credit_memo_date'].includes(k))
        ? `Corrects ${doc} itself — it keeps its number. Its opening ledger entry is reversed and the corrected one posted at the original cutover date.`
        : `Updates the details on ${doc}. No amounts change.`
    }

    if (type === 'expense') {
      if (isVoid) return `Voids ${doc}: its ledger entry is reversed and ${amount ?? 'its amount'} goes back to ${cash}.`
      if (!keys.some((k) => expenseLedgerKeys.includes(k))) return `Updates the details on ${doc}. No money moves and the ledger is unchanged.`
      const parts = [`Corrects ${doc} itself — no new document is made and it stays linked to its voucher.`]
      const oldAmount = Number(changes.value.amount?.from ?? c?.amount ?? 0)
      const newAmount = Number(changes.value.amount?.to ?? c?.amount ?? 0)
      if ('cash_account_id' in changes.value) {
        parts.push(`${formatCurrency(oldAmount)} goes back to ${display('cash_account_id', changes.value.cash_account_id.from)} and ${formatCurrency(newAmount)} is charged to ${display('cash_account_id', changes.value.cash_account_id.to)}.`)
      } else if ('amount' in changes.value) {
        parts.push(`${cash} is adjusted by the difference, ${formatCurrency(newAmount - oldAmount)}.`)
      }
      const date = String(changes.value.paid_at?.to ?? c?.date ?? '')
      parts.push(correctionsBookInOriginalMonth && date
        ? `The ledger entry is re-posted dated ${formatDateOnly(date)}, so the expense stays in its own month.`
        : 'The ledger correction is booked today.')
      return parts.join(' ')
    }

    if (type === 'supplier_payment') {
      if (isVoid) return `Voids ${doc}: its ledger entry is reversed, ${amount ?? 'the amount'} goes back to ${cash} and the supplier is owed it again.`
      if ('amount' in changes.value) return `Voids ${doc} and records a corrected payment of ${display('amount', changes.value.amount.to)} dated today.`
      return `Updates the details on ${doc}. No money moves.`
    }

    if (type === 'sale') return `Voids sale ${doc}${amount ? ` (${amount})` : ''}: the stock goes back and the sale comes off the day's takings and the ledger.`
    if (type === 'remittance') return `Corrects remittance ${doc} as shown.`

    return isVoid ? `Voids ${doc} and reverses its ledger entry.` : `Applies the changes shown to ${doc}.`
  })

  /** The payment's method in words ("Discount", "Cheque"), not its stored code. */
  const collectionMethodTitle = computed(() => {
    const method = context.value?.collection?.method
    return method ? collectionMethodLabel(method) : null
  })

  /**
   * The headline figure. A payment correction is about one payment, not the
   * whole order — showing the order total there read as the payment's amount.
   */
  const headline = computed(() => {
    const pay = context.value?.collection
    if (pay) return { amount: pay.amount, label: 'Payment' as string | null }
    return context.value?.amount == null ? null : { amount: context.value.amount, label: null as string | null }
  })

  return {
    context, loading, actionLabel, side, docLabel, docNo, requestedBy, changeRows, facts, effect,
    collectionMethodTitle, headline,
  }
}

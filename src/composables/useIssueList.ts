import { ref } from 'vue'
import { formatExpiryMonthYear } from '@/utils/helpers'

// One shared dialog for a LIST of problems: short stock, expired or unpriced
// products, lines that need fixing by hand. A toast is for a single error or
// notice; a message naming several products does not fit in one, so those
// come here and are laid out as a table, one product per row.
//
// Module-scope singleton state, like useConfirmDialog: one dialog for the
// whole app, mounted once in App.vue. Plain `ref()`s are safe at module scope.

export type IssueRow = {
  product: string
  sku: string | null
  /** The products row id, shown where names repeat (one row per batch). */
  productId: number | null
  batch: string | null
  /** Already formatted, MM/YYYY. */
  expiry: string | null
  /** What is wrong with this product, e.g. "Needs 41 · 2 on hand". */
  problem: string
}

export type IssueList = {
  title: string
  message: string
  rows: IssueRow[]
  /** 'warning' when the action went through but something needs attention. */
  tone?: 'error' | 'warning'
  footnote?: string | null
}

const isOpen = ref(false)
const current = ref<IssueList | null>(null)

export function useIssueList() {
  function showIssues(list: IssueList) {
    current.value = list
    isOpen.value = true
  }

  function closeIssues() {
    isOpen.value = false
  }

  return { isOpen, current, showIssues, closeIssues }
}

/**
 * A row for one product. `fallbackId` still identifies a product that could not
 * be looked up, so the row points somewhere rather than reading "unknown".
 */
export function issueRow(
  product: {
    product_name?: string | null
    sku?: string | null
    batch_no?: string | null
    expiry_date?: string | null
  } | null | undefined,
  fallbackId: number | null,
  problem: string,
): IssueRow {
  return {
    product: product?.product_name?.trim()
      || (fallbackId != null ? `Product #${fallbackId}` : 'Unknown product'),
    sku: product?.sku ?? null,
    productId: fallbackId,
    batch: product?.batch_no ?? null,
    expiry: product?.expiry_date ? formatExpiryMonthYear(product.expiry_date) : null,
    problem,
  }
}

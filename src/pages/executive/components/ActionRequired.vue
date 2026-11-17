<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useDisplay } from 'vuetify'
import ActionRequiredDialog from '../dialogs/ActionRequiredDialog.vue'
import RequestHistoryListDialog from '../dialogs/RequestHistoryListDialog.vue'
import { useChangeRequestsPR } from '@/pages/purchasing/stores/composables/useChangeRequestsPR'
import { useFinanceChangeRequests } from '@/pages/finance/stores/composables/useFinanceChangeRequests'
import { useSalesChangeRequests } from '@/pages/sales/stores/composables/useSalesChangeRequests'
import { useSharedChangeRequests } from '../composables/useSharedChangeRequests'
import { useExecutiveApprovePR } from '../composables/useExecutiveApprovePR'
import { useExecutiveApproveDisposal } from '../composables/useExecutiveApproveDisposal'
import { useExecutiveApproveShortDated } from '../composables/useExecutiveApproveShortDated'
import { useExecutiveApproveTerms } from '../composables/useExecutiveApproveTerms'
import { useExecutiveApproveCreditMemos } from '../composables/useExecutiveApproveCreditMemos'
import { formatCurrency, formatDatePR_ISO } from '@/utils/helpers'
import { useRequestHistory } from '../composables/useRequestHistory'
import { useApprovalContextStore } from '@/stores/approvalContextData'
import type { ApprovalDocSummary } from '@/stores/approvalContextData'
import { useAuthUserStore } from '@/stores/authUser'
import {
  changeActionLabel, directionFilters, directionMeta, directionOf, prSuppliers, prTotal,
} from '../composables/approvalLabels'
import type { ApprovalDirection } from '../composables/approvalLabels'

const {
  requests: undoRequests,
  loading: undoLoading,
  refresh: refreshPR,
} = useChangeRequestsPR()
const {
  requests: financeRequests,
  loading: financeLoading,
  refresh: refreshFinance,
} = useFinanceChangeRequests()
const {
  requests: salesRequests,
  loading: salesLoading,
  refresh: refreshSales,
} = useSalesChangeRequests()
const {
  requests: sharedRequests,
  loading: sharedLoading,
  refresh: refreshShared,
} = useSharedChangeRequests()
const {
  requests: pendingPRs,
  loading: prLoading,
  refresh: refreshPRApprovals,
} = useExecutiveApprovePR()
const {
  requests: pendingDisposals,
  loading: disposalLoading,
  refresh: refreshDisposals,
} = useExecutiveApproveDisposal()
const {
  requests: pendingShortDated,
  loading: shortDatedLoading,
  refresh: refreshShortDated,
} = useExecutiveApproveShortDated()
const {
  requests: pendingTerms,
  loading: termsLoading,
  refresh: refreshTerms,
} = useExecutiveApproveTerms()
const {
  requests: pendingCreditMemos,
  loading: creditMemosLoading,
  refresh: refreshCreditMemos,
} = useExecutiveApproveCreditMemos()
const { mobile } = useDisplay()

type MergedActionItem =
  | { kind: 'undo'; id: number; created_at: string; raw: any }
  | { kind: 'pr_approval'; id: number; created_at: string; raw: any }
  | { kind: 'disposal'; id: number; created_at: string; raw: any }
  | { kind: 'short_dated'; id: number; created_at: string; raw: any }
  | { kind: 'terms'; id: number; created_at: string; raw: any }
  | { kind: 'credit_memo'; id: number; created_at: string; raw: any }

type ChangeRequestSource = 'pr' | 'finance' | 'sales' | 'shared'

const toUndoItems = (list: any[] | undefined, source: ChangeRequestSource): MergedActionItem[] =>
  (list || []).map((r: any) => ({
    kind: 'undo',
    id: r.id,
    created_at: r.created_at,
    raw: { ...r, source },
  }))

const mergedItems = computed<MergedActionItem[]>(() => {
  const undoItems: MergedActionItem[] = [
    ...toUndoItems(undoRequests.value, 'pr'),
    ...toUndoItems(financeRequests.value, 'finance'),
    ...toUndoItems(salesRequests.value, 'sales'),
    ...toUndoItems(sharedRequests.value, 'shared'),
  ]
  const prItems: MergedActionItem[] = (pendingPRs.value || []).map((pr: any) => ({
    kind: 'pr_approval',
    id: pr.id,
    created_at: pr.created_at,
    raw: pr,
  }))
  const disposalItems: MergedActionItem[] = (pendingDisposals.value || []).map((d: any) => ({
    kind: 'disposal',
    id: d.id,
    created_at: d.created_at,
    raw: d,
  }))
  const shortDatedItems: MergedActionItem[] = (pendingShortDated.value || []).map((s: any) => ({
    kind: 'short_dated',
    id: s.id,
    created_at: s.created_at,
    raw: s,
  }))
  const termsItems: MergedActionItem[] = (pendingTerms.value || []).map((t: any) => ({
    kind: 'terms',
    id: t.id,
    created_at: t.created_at,
    raw: t,
  }))
  const creditMemoItems: MergedActionItem[] = (pendingCreditMemos.value || []).map((m: any) => ({
    kind: 'credit_memo',
    id: m.id,
    created_at: m.created_at,
    raw: m,
  }))
  return [...undoItems, ...prItems, ...disposalItems, ...shortDatedItems, ...termsItems, ...creditMemoItems].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )
})

const loading = computed(
  () =>
    undoLoading.value ||
    financeLoading.value ||
    salesLoading.value ||
    sharedLoading.value ||
    prLoading.value ||
    disposalLoading.value ||
    shortDatedLoading.value ||
    termsLoading.value ||
    creditMemosLoading.value,
)

const refreshing = ref(false)

async function refreshAll() {
  refreshing.value = true
  try {
    await Promise.allSettled([
      refreshPR(),
      refreshFinance(),
      refreshSales(),
      refreshShared(),
      refreshPRApprovals(),
      refreshDisposals(),
      refreshShortDated(),
      refreshTerms(),
      refreshCreditMemos(),
    ])
  } finally {
    refreshing.value = false
  }
}

const selected = ref(false)
const selectedReq = ref<MergedActionItem | null>(null)

// ── What each change request is about ────────────────────────────────
// A change request row only carries a document id; read each document's
// number, amount and counterparty once for the whole list, so a row reads
// "EXP-2026-146 · ELMER JAGMOC · ₱8,900.00" instead of just a number.
const approvalContext = useApprovalContextStore()
const authStore = useAuthUserStore()
const docSummaries = ref<Map<number, ApprovalDocSummary>>(new Map())
// Keyed on the joined ids: mergedItems recomputes whenever any of the nine
// sources reloads, and the same ids must not trigger another read. A slower
// older read never replaces a newer one.
const changeRequestIdKey = computed(() =>
  mergedItems.value.filter((item) => item.kind === 'undo').map((item) => Number(item.raw.transaction_id)).join(','))
let summariesRequest = 0
watch(changeRequestIdKey, async (key) => {
  const request = ++summariesRequest
  const ids = key ? key.split(',').map(Number) : []
  const found = await approvalContext.fetchDocSummaries(ids)
  if (request === summariesRequest) docSummaries.value = found
}, { immediate: true })

function summaryOf(item: MergedActionItem): ApprovalDocSummary | null {
  return docSummaries.value.get(Number(item.raw.transaction_id)) ?? null
}

function changeLabelOf(item: MergedActionItem): string {
  const summary = summaryOf(item)
  return changeActionLabel(item.raw.request_type, summary?.transactionType ?? item.raw.transaction_type, item.raw.proposed_changes)
}

function requesterOf(raw: any): string {
  if (raw.requester_name?.trim()) return raw.requester_name
  const user = authStore.users.find((u: any) => u.id === raw.created_by) as any
  return user?.full_name || user?.email || raw.created_by_email || '—'
}

// ── Buying / Selling / Corrections / Stock ───────────────────────────
const directionFilter = ref<ApprovalDirection | 'all'>('all')
const directionCounts = computed(() => {
  const counts: Record<string, number> = { all: mergedItems.value.length }
  for (const item of mergedItems.value) {
    const d = directionOf(item.kind)
    counts[d] = (counts[d] ?? 0) + 1
  }
  return counts
})
const visibleItems = computed(() =>
  directionFilter.value === 'all'
    ? mergedItems.value
    : mergedItems.value.filter((item) => directionOf(item.kind) === directionFilter.value))

const page = ref(1)
const perPage = 5

const count = computed(() => mergedItems.value.length)
const totalPages = computed(() => Math.max(1, Math.ceil(visibleItems.value.length / perPage)))
const paginatedRequests = computed(() => {
  const start = (page.value - 1) * perPage
  return visibleItems.value.slice(start, start + perPage)
})

// Element-by-element (multi-source), so a reload that leaves the list the
// same size keeps the approver on their page.
watch([() => visibleItems.value.length, directionFilter], () => {
  page.value = 1
})
// A filter whose group has emptied (everything in it decided) falls back to All.
watch(directionCounts, (counts) => {
  if (directionFilter.value !== 'all' && !counts[directionFilter.value]) directionFilter.value = 'all'
})

function openRequest(item: MergedActionItem) {
  selectedReq.value = item
  selected.value = true
}

function itemColor(kind: MergedActionItem['kind']): string {
  if (kind === 'undo') return 'blue-darken-1'
  if (kind === 'disposal') return 'error'
  if (kind === 'short_dated') return 'warning'
  if (kind === 'terms') return 'indigo'
  if (kind === 'credit_memo') return 'deep-purple'
  return 'green'
}

function itemIcon(kind: MergedActionItem['kind']): string {
  if (kind === 'undo') return 'mdi-file-edit-outline'
  if (kind === 'disposal') return 'mdi-delete-alert-outline'
  if (kind === 'short_dated') return 'mdi-clock-alert-outline'
  if (kind === 'terms') return 'mdi-handshake-outline'
  if (kind === 'credit_memo') return 'mdi-file-document-minus-outline'
  return 'mdi-file-document-check-outline'
}

const historyDialog = ref(false)
const {
  loading: historyLoading,
  paginatedRequests: historyPaginatedRequests,
  requests: historyRequests,
  page: historyPage,
  totalPages: historyTotalPages,
  totalItems: historyTotalItems,
  fetchHistory,
} = useRequestHistory()

watch(historyDialog, (val) => {
  if (val) fetchHistory()
})
</script>

<template>
  <v-card class="rounded-xl" elevation="0">
    <v-card-text class="pa-4 pa-md-6">
      <v-row align="center" class="mb-2" no-gutters>
        <v-col cols="auto" class="mr-2">
          <v-icon icon="mdi-bell-ring-outline" color="error" size="20" />
        </v-col>
        <v-col>
          <span :class="mobile ? 'text-subtitle-1' : 'text-h6'" class="font-weight-bold">
            Action Required
          </span>
        </v-col>
        <v-col v-if="count" cols="auto">
          <v-chip size="small" color="error" variant="flat">{{ count }}</v-chip>
        </v-col>
        <v-col cols="auto">
          <v-btn
            icon
            size="small"
            variant="text"
            class="refresh-btn"
            :disabled="refreshing"
            title="Refresh requests"
            @click="refreshAll"
          >
            <v-icon :icon="'mdi-refresh'" size="20" :class="{ spin: refreshing }" />
          </v-btn>
        </v-col>
      </v-row>

      <div v-if="count" class="d-flex flex-wrap ga-1 mb-3">
        <v-chip
          v-for="filter in directionFilters"
          :key="filter.value"
          size="small"
          label
          :variant="directionFilter === filter.value ? 'flat' : 'tonal'"
          :color="filter.value === 'all' ? 'primary' : directionMeta[filter.value].color"
          :disabled="filter.value !== 'all' && !directionCounts[filter.value]"
          :aria-pressed="directionFilter === filter.value"
          @click="directionFilter = filter.value"
        >
          {{ filter.title }} ({{ directionCounts[filter.value] ?? 0 }})
        </v-chip>
      </div>

      <div v-if="loading" class="pa-6 text-center text-caption text-medium-emphasis">
        <v-progress-circular indeterminate size="20" width="2" class="mb-2" />
        <div>Loading requests…</div>
      </div>

      <v-list v-else-if="visibleItems.length" class="pa-0" lines="two">
        <template v-for="(item, i) in paginatedRequests" :key="`${item.kind}-${item.id}`">
          <v-list-item class="px-2 py-3 rounded-lg action-item" @click="openRequest(item)">
            <template #prepend>
              <div class="d-flex flex-column align-center mr-3 direction-col">
                <v-avatar size="32" rounded="lg" :color="itemColor(item.kind)" variant="tonal">
                  <v-icon :color="itemColor(item.kind)" :icon="itemIcon(item.kind)" size="18" />
                </v-avatar>
                <span
                  class="direction-tag mt-1"
                  :class="`text-${directionMeta[directionOf(item.kind)].color}`"
                  :title="directionMeta[directionOf(item.kind)].hint"
                >
                  {{ directionMeta[directionOf(item.kind)].label }}
                </span>
              </div>
            </template>

            <!-- Undo request row -->
            <template v-if="item.kind === 'undo'">
              <v-list-item-title
                :class="
                  mobile
                    ? 'd-flex flex-column align-start ga-1 mb-1'
                    : 'd-flex align-center ga-2 mb-1'
                "
              >
                <div class="d-flex align-center ga-2 w-100">
                  <v-chip size="x-small" :color="item.raw.request_type === 'void' ? 'red' : 'blue'" variant="tonal" label>
                    {{ changeLabelOf(item) }}
                  </v-chip>
                  <span class="text-body-2 font-weight-medium action-item-number">
                    {{ summaryOf(item)?.docNo ?? item.raw.from_transaction_no ?? `#${item.raw.transaction_id}` }}
                    <template v-if="summaryOf(item)?.counterparty"> · {{ summaryOf(item)?.counterparty }}</template>
                  </span>
                  <!-- Its own span, so a long name is cut before the amount is. -->
                  <span v-if="summaryOf(item)?.amount != null" class="text-body-2 font-weight-medium text-no-wrap flex-shrink-0">
                    {{ formatCurrency(summaryOf(item)?.amount ?? 0) }}
                  </span>
                </div>
                <span class="text-caption text-medium-emphasis">
                  {{ formatDatePR_ISO(item.raw.created_at) }}
                </span>
              </v-list-item-title>

              <v-list-item-subtitle
                class="text-caption text-medium-emphasis"
                :class="mobile ? 'reason-clamp' : ''"
                style="white-space: normal; line-height: 1.4"
              >
                <v-icon icon="mdi-account-outline" size="12" class="mr-1" style="opacity: 0.7" />
                <span style="text-transform: uppercase">{{ requesterOf(item.raw) }}</span>
                <template v-if="item.raw.reason">
                  ·
                  <v-icon icon="mdi-comment-text-outline" size="12" class="mr-1" style="opacity: 0.7" />
                  {{ item.raw.reason }}
                </template>
              </v-list-item-subtitle>
            </template>

            <!-- Short-dated delivery approval row. What is being decided:
                 a government order carries stock with under 18 months of
                 shelf life, which the contract says the client will not
                 accept. Delivery stays blocked until this is approved. -->
            <template v-else-if="item.kind === 'short_dated'">
              <v-list-item-title
                :class="
                  mobile
                    ? 'd-flex flex-column align-start ga-1 mb-1'
                    : 'd-flex align-center ga-2 mb-1'
                "
              >
                <div class="d-flex align-center ga-2 w-100">
                  <v-chip size="x-small" color="warning" variant="tonal" label>Short-dated</v-chip>
                  <span class="text-body-2 font-weight-medium action-item-number">
                    {{ item.raw.order_no ?? `#${item.raw.transaction_id}` }}
                  </span>
                </div>
                <span class="text-caption text-medium-emphasis">
                  {{ formatDatePR_ISO(item.raw.created_at) }}
                </span>
              </v-list-item-title>

              <v-list-item-subtitle
                class="text-caption text-medium-emphasis"
                :class="mobile ? 'reason-clamp' : ''"
                style="white-space: normal; line-height: 1.4"
              >
                {{ item.raw.summary }}
                <span v-if="item.raw.customer_name"> — {{ item.raw.customer_name }}</span>
                <span v-if="item.raw.reason"> · {{ item.raw.reason }}</span>
              </v-list-item-subtitle>
            </template>

            <!-- Terms approval row: lock an order's terms (In-House Agree /
                 Ethical Invoice), or undo them before delivery or payment. -->
            <template v-else-if="item.kind === 'terms'">
              <v-list-item-title
                :class="
                  mobile
                    ? 'd-flex flex-column align-start ga-1 mb-1'
                    : 'd-flex align-center ga-2 mb-1'
                "
              >
                <div class="d-flex align-center ga-2 w-100">
                  <v-chip size="x-small" :color="item.raw.request_type === 'unlock_terms' ? 'red' : 'indigo'" variant="tonal" label>
                    {{ item.raw.request_type === 'unlock_terms' ? 'Unapprove' : 'Lock terms' }}
                  </v-chip>
                  <span class="text-body-2 font-weight-medium action-item-number">
                    {{ item.raw.order_no ?? (item.raw.order_type === 'ethical_order' ? `Draft #${item.raw.transaction_id}` : `#${item.raw.transaction_id}`) }}
                  </span>
                </div>
                <span class="text-caption text-medium-emphasis">
                  {{ formatDatePR_ISO(item.raw.created_at) }}
                </span>
              </v-list-item-title>

              <v-list-item-subtitle
                class="text-caption text-medium-emphasis"
                :class="mobile ? 'reason-clamp' : ''"
                style="white-space: normal; line-height: 1.4"
              >
                Selling to {{ item.raw.customer_name ?? 'a customer' }}
                ({{ item.raw.order_type === 'ethical_order' ? 'Ethical' : 'In-House' }})
                <span v-if="item.raw.total != null"> · {{ formatCurrency(item.raw.total) }}</span>
                <span v-if="item.raw.reason"> · {{ item.raw.reason }}</span>
              </v-list-item-subtitle>
            </template>

            <!-- Credit memo row: an amount off a customer's bill. -->
            <template v-else-if="item.kind === 'credit_memo'">
              <v-list-item-title
                :class="
                  mobile
                    ? 'd-flex flex-column align-start ga-1 mb-1'
                    : 'd-flex align-center ga-2 mb-1'
                "
              >
                <div class="d-flex align-center ga-2 w-100">
                  <v-chip size="x-small" color="deep-purple" variant="tonal" label>Credit memo</v-chip>
                  <span class="text-body-2 font-weight-medium action-item-number">
                    {{ item.raw.customer_name ?? `#${item.raw.id}` }}
                  </span>
                </div>
                <span class="text-caption text-medium-emphasis">
                  {{ formatDatePR_ISO(item.raw.created_at) }}
                </span>
              </v-list-item-title>

              <v-list-item-subtitle
                class="text-caption text-medium-emphasis"
                :class="mobile ? 'reason-clamp' : ''"
                style="white-space: normal; line-height: 1.4"
              >
                {{ formatCurrency(item.raw.amount) }} off {{ item.raw.applies_to_no ?? 'a bill' }}
                <span v-if="item.raw.reason"> · {{ item.raw.reason }}</span>
              </v-list-item-subtitle>
            </template>

            <!-- Disposal request row -->
            <template v-else-if="item.kind === 'disposal'">
              <v-list-item-title
                :class="
                  mobile
                    ? 'd-flex flex-column align-start ga-1 mb-1'
                    : 'd-flex align-center ga-2 mb-1'
                "
              >
                <div class="d-flex align-center ga-2 w-100">
                  <v-chip size="x-small" color="error" variant="tonal" label>Dispose</v-chip>
                  <span class="text-body-2 font-weight-medium action-item-number">
                    {{ item.raw.reference_no ?? `#${item.raw.id}` }}
                  </span>
                </div>
                <span class="text-caption text-medium-emphasis">
                  {{ formatDatePR_ISO(item.raw.created_at) }}
                </span>
              </v-list-item-title>

              <v-list-item-subtitle
                class="text-caption text-medium-emphasis"
                :class="mobile ? 'reason-clamp' : ''"
                style="white-space: normal; line-height: 1.4"
              >
                <v-icon icon="mdi-account-outline" size="12" class="mr-1" style="opacity: 0.7" />
                {{ item.raw.requester_name ?? '—' }} ·
                {{ item.raw.product?.product_name ?? 'Unknown product' }} ·
                {{ item.raw.qty }} unit(s)
              </v-list-item-subtitle>
            </template>

            <!-- PR approval row -->
            <template v-else>
              <v-list-item-title
                :class="
                  mobile
                    ? 'd-flex flex-column align-start ga-1 mb-1'
                    : 'd-flex align-center ga-2 mb-1'
                "
              >
                <div class="d-flex align-center ga-2 w-100">
                  <v-chip size="x-small" color="orange-darken-2" variant="tonal" label>Purchase requisition</v-chip>
                  <span class="text-body-2 font-weight-medium action-item-number">
                    {{ item.raw.reference_no ?? item.raw.requisition_no ?? `#${item.raw.id}` }}
                    · <span title="Items only. Discount, tax and shipping show when you open it.">{{ formatCurrency(prTotal(item.raw)) }} in items</span>
                  </span>
                </div>
                <span class="text-caption text-medium-emphasis">
                  {{ formatDatePR_ISO(item.raw.created_at) }}
                </span>
              </v-list-item-title>

              <v-list-item-subtitle
                class="text-caption text-medium-emphasis"
                :class="mobile ? 'reason-clamp' : ''"
                style="white-space: normal; line-height: 1.4"
              >
                Buying from {{ prSuppliers(item.raw) }} ·
                <v-icon icon="mdi-account-outline" size="12" class="mr-1" style="opacity: 0.7" />
                {{ item.raw.requester_name ?? '—' }} · {{ item.raw.items?.length ?? 0 }} item(s)
              </v-list-item-subtitle>
            </template>

            <template #append>
              <v-icon icon="mdi-chevron-right" size="20" color="medium-emphasis" />
            </template>
          </v-list-item>

          <v-divider v-if="i < paginatedRequests.length - 1" class="my-1" />
        </template>

        <v-pagination
          v-if="totalPages > 1"
          v-model="page"
          :length="totalPages"
          density="compact"
          :class="mobile ? 'mt-3' : 'mt-4'"
        />
      </v-list>

      <div v-else class="pa-6 text-center">
        <v-icon icon="mdi-check-circle-outline" size="32" color="success" class="mb-2" />
        <div class="text-caption text-medium-emphasis">
          {{ count ? 'Nothing pending in this group.' : 'No pending change requests.' }}
        </div>
      </div>

      <div class="text-center mt-4">
        <v-btn
          size="small"
          variant="text"
          class="text-none"
          color="primary"
          @click="historyDialog = true"
        >
          <v-icon start size="16">mdi-history</v-icon>
          View Request History
        </v-btn>
      </div>

      <ActionRequiredDialog v-model="selected" :request="selectedReq" />
      <RequestHistoryListDialog v-model="historyDialog" />
    </v-card-text>
  </v-card>
</template>

<style scoped>
.action-item {
  cursor: pointer;
  transition: background-color 0.15s ease;
}
.action-item:hover {
  background-color: rgba(var(--v-theme-error), 0.05);
}
/* BUYING / SELLING / CORRECTION / STOCK under each row's icon */
.direction-col {
  width: 64px;
}
.direction-tag {
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  line-height: 1;
}
/* Truncate long transaction/reference numbers with ellipsis */
.action-item-number {
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* Clamp long reason text to 2 lines on mobile */
.reason-clamp {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
/* Refresh button hover tint */
.refresh-btn {
  opacity: 0.75;
  transition: opacity 0.15s ease;
}
.refresh-btn:hover {
  opacity: 1;
}
/* Spin animation while refreshing */
.spin {
  animation: vincare-spin 0.8s linear infinite;
}
@keyframes vincare-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>

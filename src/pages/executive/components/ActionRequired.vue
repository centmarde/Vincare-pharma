<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import ActionRequiredDialog from '../dialogs/ActionRequiredDialog.vue'
import RequestHistoryListDialog from '../dialogs/RequestHistoryListDialog.vue'
import { useChangeRequestsPR } from '@/pages/purchasing/stores/composables/useChangeRequestsPR'
import { useFinanceChangeRequests } from '@/pages/finance/stores/composables/useFinanceChangeRequests'
import { useSalesChangeRequests } from '@/pages/sales/stores/composables/useSalesChangeRequests'
import { useSharedChangeRequests } from '../composables/useSharedChangeRequests'
import { useExecutiveApprovePR } from '../composables/useExecutiveApprovePR'
import { formatDatePR_ISO } from '@/utils/helpers'
import { useRequestHistory } from '../composables/useRequestHistory'

// Change requests come from FOUR module-scoped queues; each request is tagged
// with its `source` so ActionRequiredDialog knows which composable owns the
// approve/reject. Without all four, a module's requests are filed but never
// surface to an approver (in-house/ethical, finance and sales were invisible
// this way).
const { requests: undoRequests, loading: undoLoading } = useChangeRequestsPR()
const { requests: financeRequests, loading: financeLoading } = useFinanceChangeRequests()
const { requests: salesRequests, loading: salesLoading } = useSalesChangeRequests()
const { requests: sharedRequests, loading: sharedLoading } = useSharedChangeRequests()
const { requests: pendingPRs, loading: prLoading } = useExecutiveApprovePR()

type MergedActionItem =
  | { kind: 'undo'; id: number; created_at: string; raw: any }
  | { kind: 'pr_approval'; id: number; created_at: string; raw: any }

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
  return [...undoItems, ...prItems].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )
})

const loading = computed(
  () =>
    undoLoading.value ||
    financeLoading.value ||
    salesLoading.value ||
    sharedLoading.value ||
    prLoading.value,
)

const selected = ref(false)
const selectedReq = ref<MergedActionItem | null>(null)

const page = ref(1)
const perPage = 5

const count = computed(() => mergedItems.value.length)
const totalPages = computed(() => Math.max(1, Math.ceil(mergedItems.value.length / perPage)))
const paginatedRequests = computed(() => {
  const start = (page.value - 1) * perPage
  return mergedItems.value.slice(start, start + perPage)
})

watch(() => mergedItems.value.length, () => {
  page.value = 1
})

function openRequest(item: MergedActionItem) {
  selectedReq.value = item
  selected.value = true
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
          <span class="text-h6 font-weight-bold">Action Required</span>
        </v-col>
        <v-col v-if="count" cols="auto">
          <v-chip size="small" color="error" variant="flat">{{ count }}</v-chip>
        </v-col>
      </v-row>

      <div v-if="loading" class="pa-6 text-center text-caption text-medium-emphasis">
        <v-progress-circular indeterminate size="20" width="2" class="mb-2" />
        <div>Loading requests…</div>
      </div>

      <v-list v-else-if="mergedItems.length" class="pa-0" lines="two">
        <template v-for="(item, i) in paginatedRequests" :key="`${item.kind}-${item.id}`">
          <v-list-item class="px-2 py-3 rounded-lg action-item" @click="openRequest(item)">
            <template #prepend>
              <v-avatar
                size="32"
                rounded="lg"
                :color="item.kind === 'undo' ? 'red' : 'green'"
                variant="tonal"
              >
                <v-icon
                  :color="item.kind === 'undo' ? 'red' : 'green'"
                  :icon="item.kind === 'undo' ? 'mdi-cancel' : 'mdi-file-document-check-outline'"
                  size="18"
                />
              </v-avatar>
            </template>

            <!-- Undo request row -->
            <template v-if="item.kind === 'undo'">
              <v-list-item-title class="d-flex align-center ga-2 mb-1">
                <v-chip size="x-small" color="red" variant="tonal" label>Undo</v-chip>
                <span class="text-body-2 font-weight-medium">
                  {{ item.raw.from_transaction_no ?? `#${item.raw.transaction_id}` }}
                </span>
                <v-spacer />
                <span class="text-caption text-medium-emphasis flex-shrink-0">
                  {{ formatDatePR_ISO(item.raw.created_at) }}
                </span>
              </v-list-item-title>

              <v-list-item-subtitle
                v-if="item.raw.reason"
                class="text-caption text-medium-emphasis"
                style="white-space: normal; line-height: 1.4"
              >
                <v-icon icon="mdi-comment-text-outline" size="12" class="mr-1" style="opacity: 0.7" />
                {{ item.raw.reason }}
              </v-list-item-subtitle>
            </template>

            <!-- PR approval row -->
            <template v-else>
              <v-list-item-title class="d-flex align-center ga-2 mb-1">
                <v-chip size="x-small" color="green" variant="tonal" label>New</v-chip>
                <span class="text-body-2 font-weight-medium">
                  {{ item.raw.reference_no ?? item.raw.requisition_no ?? `#${item.raw.id}` }}
                </span>
                <v-spacer />
                <span class="text-caption text-medium-emphasis flex-shrink-0">
                  {{ formatDatePR_ISO(item.raw.created_at) }}
                </span>
              </v-list-item-title>

              <v-list-item-subtitle
                class="text-caption text-medium-emphasis"
                style="white-space: normal; line-height: 1.4"
              >
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
          class="mt-4"
        />
      </v-list>

      <div v-else class="pa-6 text-center">
        <v-icon icon="mdi-check-circle-outline" size="32" color="success" class="mb-2" />
        <div class="text-caption text-medium-emphasis">No pending change requests.</div>
      </div>

      <div class="text-center mt-4">
        <v-btn size="small" variant="text" class="text-none" color="primary" @click="historyDialog = true">
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
</style>
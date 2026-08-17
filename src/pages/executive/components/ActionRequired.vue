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
import { formatDatePR_ISO } from '@/utils/helpers'
import { useRequestHistory } from '../composables/useRequestHistory'

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
const { mobile } = useDisplay()

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
    ])
  } finally {
    refreshing.value = false
  }
}

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

watch(
  () => mergedItems.value.length,
  () => {
    page.value = 1
  },
)

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
              <v-list-item-title
                :class="
                  mobile
                    ? 'd-flex flex-column align-start ga-1 mb-1'
                    : 'd-flex align-center ga-2 mb-1'
                "
              >
                <div class="d-flex align-center ga-2 w-100">
                  <v-chip size="x-small" color="red" variant="tonal" label>Undo</v-chip>
                  <span class="text-body-2 font-weight-medium action-item-number">
                    {{ item.raw.from_transaction_no ?? `#${item.raw.transaction_id}` }}
                  </span>
                </div>
                <span class="text-caption text-medium-emphasis">
                  {{ formatDatePR_ISO(item.raw.created_at) }}
                </span>
              </v-list-item-title>

              <v-list-item-subtitle
                v-if="item.raw.reason"
                class="text-caption text-medium-emphasis"
                :class="mobile ? 'reason-clamp' : ''"
                style="white-space: normal; line-height: 1.4"
              >
                <v-icon icon="mdi-account-outline" size="12" class="mr-1" style="opacity: 0.7" />
                <span style="text-transform: uppercase">{{ item.raw.requester_name ?? '—' }}</span>
                ·
                <v-icon
                  icon="mdi-comment-text-outline"
                  size="12"
                  class="mr-1"
                  style="opacity: 0.7"
                />
                {{ item.raw.reason }}
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
                  <v-chip size="x-small" color="info" variant="tonal" label>New</v-chip>
                  <span class="text-body-2 font-weight-medium action-item-number">
                    {{ item.raw.reference_no ?? item.raw.requisition_no ?? `#${item.raw.id}` }}
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
        <div class="text-caption text-medium-emphasis">No pending change requests.</div>
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

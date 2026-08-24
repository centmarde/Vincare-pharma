<script setup lang="ts">
import { useChangeRequestsPR } from '@/pages/purchasing/stores/composables/useChangeRequestsPR'
import { useFinanceChangeRequests } from '@/pages/finance/stores/composables/useFinanceChangeRequests'
import { useSalesChangeRequests } from '@/pages/sales/stores/composables/useSalesChangeRequests'
import { useSharedChangeRequests } from '../composables/useSharedChangeRequests'
import { usePurchaseRequisitionStore } from '@/stores/purchaseRequisitionData'
import { useExecutiveApprovePR } from '../composables/useExecutiveApprovePR'
import type { PRItem } from '@/stores/purchaseRequisitionData'
import { formatDatePR_ISO } from '@/utils/helpers'
import { computed, ref, watch } from 'vue'

const prChangeRequests = useChangeRequestsPR()
const financeChangeRequests = useFinanceChangeRequests()
const salesChangeRequests = useSalesChangeRequests()
const sharedChangeRequests = useSharedChangeRequests()
const { approve: approvePR, reject: rejectPR } = useExecutiveApprovePR()
const prStore = usePurchaseRequisitionStore()

// A change request must be approved through the store that owns it — each one
// applies the change via its own module's reversal path. Dispatch on the
// `source` tag ActionRequired stamped onto the row.
function changeRequestOwner(source: string | undefined) {
  if (source === 'finance') return financeChangeRequests
  if (source === 'sales') return salesChangeRequests
  if (source === 'shared') return sharedChangeRequests
  return prChangeRequests
}

const selected = defineModel<boolean>('modelValue', { default: false })
const props = defineProps<{ request?: any }>()

const request = computed(() => props.request)
const kind = computed(() => request.value?.kind as 'undo' | 'pr_approval' | undefined)
const raw = computed(() => request.value?.raw)

// Compute the total live from line items (Σ qty × cost_per_unit) instead of
// trusting the stored transactions.total_amount column, which can be stale
// for PRs edited before updatePR() began recalculating it.
const totalAmount = computed(() =>
  (raw.value?.items ?? []).reduce(
    (sum: number, it: { qty?: number; cost_per_unit?: number }) =>
      sum + (it.qty ?? 0) * (it.cost_per_unit ?? 0),
    0,
  ),
)

const isApproving = ref(false)
const isRejecting = ref(false)
const showRejectInput = ref(false)
const rejectReason = ref('')

// A change request can come from four modules and be three different types, so
// the copy below must follow the request — describing a payment void as
// "revert this purchase requisition to Pending Approval" tells the approver
// they're doing something entirely different from what will actually happen.
const source = computed(() => raw.value?.source as string | undefined)
const isPRUndo = computed(() => source.value === 'pr')

const moduleLabel = computed(() => {
  if (source.value === 'finance') return 'Finance'
  if (source.value === 'sales') return 'Sales'
  if (source.value === 'shared') return 'In-House / Ethical'
  return 'Purchase Requisition'
})

const requestTypeLabel = computed(() => {
  const t = raw.value?.request_type
  if (t === 'void') return 'Void'
  if (t === 'edit') return 'Edit'
  return 'Undo'
})

const undoWarning = computed(() => {
  const t = raw.value?.request_type
  if (t === 'void')
    return 'Approving will void this document — its ledger entry is reversed and any affected balances are rolled back.'
  if (t === 'edit') return 'Approving will apply the proposed changes to this document.'
  return 'Approving will revert this purchase requisition back to Pending Approval.'
})

const undoFallbackSummary = computed(() =>
  isPRUndo.value
    ? 'Revert this purchase requisition to pending approval.'
    : 'Apply this change request.',
)

// Undo-request rows only carry transaction_id/reason — fetch the underlying
// PR (with items) on demand so the same items can render for both branches.
const undoItems = ref<PRItem[]>([])
const undoItemsLoading = ref(false)

watch(() => [selected.value, kind.value, raw.value?.transaction_id] as const,
async ([open, k, txId]) => {
  // Only PR undo requests have a purchase requisition behind them — a
  // finance/sales/in-house request's transaction_id is an expense, sale or
  // order, so looking it up as a PR would return nothing useful.
  if (!open || k !== 'undo' || !txId || raw.value?.source !== 'pr') {
    undoItems.value = []
    return
  }
    undoItemsLoading.value = true
    try {
      const pr = await prStore.fetchPRByRequisitionId(txId)
      undoItems.value = pr?.items ?? []
    } finally {
      undoItemsLoading.value = false
    
  }
})

async function onApprove() {
  if (!raw.value || isApproving.value) return
  isApproving.value = true
  try {
    const result =
      kind.value === 'undo'
        ? await changeRequestOwner(raw.value.source).approve(raw.value.id)
        : await approvePR(raw.value.id)
    if (result.success) selected.value = false
  } finally {
    isApproving.value = false
  }
}

function startReject() {
  showRejectInput.value = true
}

async function confirmReject() {
  if (!raw.value || isRejecting.value) return
  isRejecting.value = true
  try {
    const reason = rejectReason.value.trim() || 'Rejected by approver.'
    const result =
      kind.value === 'undo'
        ? await changeRequestOwner(raw.value.source).reject(raw.value.id, reason)
        : await rejectPR(raw.value.id, reason)
    if (result.success) selected.value = false
  } finally {
    isRejecting.value = false
  }
}

// Format currency for item display
function formatMoney(value: number | string | undefined) {
  if (value === undefined || value === null || value === '') return '—'
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return String(value)
  return num.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })
}
</script>

<template>
  <v-dialog v-model="selected" fullscreen persistent>
    <v-card class="rounded-0" elevation="0">
      <!-- Header -->
      <div class="d-flex align-center pa-4 pb-2">
        <v-icon icon="mdi-shield-alert-outline" color="error" size="22" class="mr-2" />
        <span class="text-subtitle-1 font-weight-bold">Approval Required</span>
        <v-spacer />
        <v-btn icon size="small" variant="text" @click="selected = false">
          <v-icon icon="mdi-close" />
        </v-btn>
      </div>

      <div v-if="!raw" class="pa-6 text-center text-caption text-medium-emphasis">
        No request selected.
      </div>

      <v-card-text v-else class="px-4 pb-4 pt-0">
        <!-- ═══ PR APPROVAL BRANCH ═══ -->
        <template v-if="kind === 'pr_approval'">
          <v-sheet rounded="lg" variant="tonal" color="surface-variant" class="pa-3 mb-4">
            <div class="d-flex align-center ga-3">
              <v-avatar size="36" rounded="lg" color="success" variant="tonal" class="flex-shrink-0">
                <v-icon color="success" icon="mdi-file-document-check-outline" size="18" />
              </v-avatar>
              <div class="flex-grow-1" style="min-width: 0">
                <div class="d-flex align-center ga-2 flex-wrap">
                  <span class="text-body-2 font-weight-bold">
                    {{ raw.reference_no ?? raw.requisition_no ?? `#${raw.id}` }}
                  </span>
                  <v-chip size="x-small" color="warning" variant="tonal" label>New</v-chip>
                  <v-chip size="x-small" variant="tonal" color="green" label>Purchase Requisition</v-chip>
                </div>
                <div class="text-caption text-medium-emphasis mt-1">
                  {{ raw.remarks || 'Awaiting approval to proceed.' }}
                </div>
              </div>
            </div>

            <v-divider class="my-3" />

            <!-- Stacked info on mobile -->
            <div class="d-flex flex-column" style="gap: 10px">
              <div>
                <div class="text-caption text-medium-emphasis">Requested by</div>
                <div class="text-body-2 text-high-emphasis">{{ raw.requester_name ?? '—' }}</div>
              </div>
              <div>
                <div class="text-caption text-medium-emphasis">Requested on</div>
                <div class="text-body-2 text-high-emphasis">{{ formatDatePR_ISO(raw.created_at) }}</div>
              </div>
              <div>
                <div class="text-caption text-medium-emphasis">Total Amount</div>
                <div class="text-body-2 text-high-emphasis">
                  {{ totalAmount.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' }) }}
                </div>
              </div>
            </div>
          </v-sheet>

          <!-- Items as cards (mobile-friendly) -->
          <div class="mb-4">
            <div class="text-caption font-weight-bold text-medium-emphasis mb-2">
              ITEMS ({{ raw.items?.length ?? 0 }})
            </div>
            <div v-if="raw.items?.length" class="d-flex flex-column" style="gap: 8px">
              <v-sheet
                v-for="it in raw.items"
                :key="it.id"
                rounded="lg"
                variant="tonal"
                color="surface-variant"
                class="pa-3"
              >
                <div class="d-flex align-start justify-space-between ga-2 mb-1">
                  <span class="text-body-2 font-weight-bold">#{{ it.no }}</span>
                  <span class="text-caption text-medium-emphasis text-right">{{ it.unit }}</span>
                </div>
                <div class="text-body-2 mb-2">{{ it.item_description }}</div>
                <div class="text-caption text-medium-emphasis mb-1">
                  Supplier: {{ it.supplier_name }}
                </div>
                <div class="d-flex flex-wrap" style="gap: 8px 16px">
                  <div class="text-caption">
                    <span class="text-medium-emphasis">Qty:</span>
                    <span class="font-weight-medium ms-1">{{ it.qty }}</span>
                  </div>
                  <div class="text-caption">
                    <span class="text-medium-emphasis">Cost/Unit:</span>
                    <span class="font-weight-medium ms-1">{{ formatMoney(it.cost_per_unit) }}</span>
                  </div>
                  <div class="text-caption">
                    <span class="text-medium-emphasis">PR Price:</span>
                    <span class="font-weight-medium ms-1">{{ formatMoney(it.offer_per_unit) }}</span>
                  </div>
                </div>
              </v-sheet>
            </div>
            <div v-else class="text-caption text-medium-emphasis pa-2">No items found.</div>
          </div>

          <v-alert
            type="warning"
            variant="tonal"
            density="compact"
            icon="mdi-information-outline"
            class="mb-4 text-caption"
          >
            Approving will move this purchase requisition to
            <strong>Approved</strong> status and resolve any linked reorder requests.
          </v-alert>
        </template>

        <!-- ═══ UNDO REQUEST BRANCH ═══ -->
        <template v-else>
          <v-sheet rounded="lg" variant="tonal" color="surface-variant" class="pa-3 mb-4">
            <div class="d-flex align-center ga-3">
              <v-avatar size="36" rounded="lg" color="error" variant="tonal" class="flex-shrink-0">
                <v-icon color="error" icon="mdi-cancel" size="18" />
              </v-avatar>
              <div class="flex-grow-1" style="min-width: 0">
                <div class="d-flex align-center ga-2 flex-wrap">
                  <span class="text-body-2 font-weight-bold">
                    {{ raw.from_transaction_no ?? `#${raw.transaction_id}` }}
                  </span>
                  <v-chip size="x-small" color="error" variant="tonal" label>{{ requestTypeLabel }}</v-chip>
                  <v-chip size="x-small" variant="tonal" color="green" label>{{ moduleLabel }}</v-chip>
                </div>
                <div class="text-caption text-medium-emphasis mt-1">
                  {{ raw.summary ?? undoFallbackSummary }}
                </div>
              </div>
            </div>

            <v-divider class="my-3" />

            <!-- Stacked info on mobile -->
            <div class="d-flex flex-column" style="gap: 10px">
              <div>
                <div class="text-caption text-medium-emphasis">Requested by</div>
                <div class="text-body-2 text-high-emphasis">{{ raw.created_by_email ?? '—' }}</div>
              </div>
              <div>
                <div class="text-caption text-medium-emphasis">Requested on</div>
                <div class="text-body-2 text-high-emphasis">{{ formatDatePR_ISO(raw.created_at) }}</div>
              </div>
            </div>
          </v-sheet>

          <div class="mb-4">
            <div class="text-caption font-weight-bold text-medium-emphasis mb-1">
              REASON FOR REQUEST
            </div>
            <v-sheet
              rounded="lg"
              variant="tonal"
              color="surface-variant"
              class="pa-3 text-body-2 border-s-lg border-error"
            >
              {{ raw.reason ?? '—' }}
            </v-sheet>
          </div>

          <div v-if="isPRUndo" class="mb-4">
            <div class="text-caption font-weight-bold text-medium-emphasis mb-2">
              ITEMS ON THIS REQUISITION ({{ undoItems.length }})
            </div>
            <div v-if="undoItemsLoading" class="text-center pa-4">
              <v-progress-circular indeterminate size="20" width="2" />
            </div>
            <div v-else-if="undoItems.length" class="d-flex flex-column" style="gap: 8px">
              <v-sheet
                v-for="it in undoItems"
                :key="it.id"
                rounded="lg"
                variant="tonal"
                color="surface-variant"
                class="pa-3"
              >
                <div class="d-flex align-start justify-space-between ga-2 mb-1">
                  <span class="text-body-2 font-weight-bold">#{{ it.no }}</span>
                  <span class="text-caption text-medium-emphasis text-right">{{ it.unit }}</span>
                </div>
                <div class="text-body-2 mb-2">{{ it.item_description }}</div>
                <div class="text-caption text-medium-emphasis mb-1">
                  Supplier: {{ it.supplier_name }}
                </div>
                <div class="d-flex flex-wrap" style="gap: 8px 16px">
                  <div class="text-caption">
                    <span class="text-medium-emphasis">Qty:</span>
                    <span class="font-weight-medium ms-1">{{ it.qty }}</span>
                  </div>
                  <div class="text-caption">
                    <span class="text-medium-emphasis">Cost/Unit:</span>
                    <span class="font-weight-medium ms-1">{{ formatMoney(it.cost_per_unit) }}</span>
                  </div>
                  <div class="text-caption">
                    <span class="text-medium-emphasis">PR Price:</span>
                    <span class="font-weight-medium ms-1">{{ formatMoney(it.offer_per_unit) }}</span>
                  </div>
                </div>
              </v-sheet>
            </div>
            <div v-else class="text-caption text-medium-emphasis pa-2">No items found.</div>
          </div>

          <v-alert
            type="warning"
            variant="tonal"
            density="compact"
            icon="mdi-information-outline"
            class="mb-4 text-caption"
          >
            {{ undoWarning }} This cannot be undone.
          </v-alert>
        </template>

        <!-- Inline reject reason (shared) -->
        <v-expand-transition>
          <div v-if="showRejectInput" class="mb-4">
            <div class="text-caption font-weight-bold text-medium-emphasis mb-1">
              REASON FOR REJECTION
            </div>
            <v-textarea
              v-model="rejectReason"
              rows="2"
              auto-grow
              density="compact"
              variant="outlined"
              placeholder="Explain why this request is being rejected…"
              hide-details
            />
          </div>
        </v-expand-transition>

        <!-- Actions (stacked full-width on mobile) -->
        <div class="d-flex flex-column" style="gap: 8px">
          <template v-if="!showRejectInput">
            <v-btn
              size="small"
              variant="outlined"
              class="text-none"
              block
              @click="selected = false"
            >
              Cancel
            </v-btn>
            <v-btn
              size="small"
              variant="outlined"
              color="error"
              class="text-none"
              block
              @click="startReject"
            >
              Reject
            </v-btn>
            <v-btn
              size="small"
              color="success"
              class="text-none font-weight-bold"
              elevation="0"
              block
              :loading="isApproving"
              @click="onApprove"
            >
              Approve & Apply
            </v-btn>
          </template>

          <template v-else>
            <v-btn
              size="small"
              variant="outlined"
              class="text-none"
              block
              @click="showRejectInput = false"
            >
              Back
            </v-btn>
            <v-btn
              size="small"
              color="error"
              class="text-none font-weight-bold"
              elevation="0"
              block
              :loading="isRejecting"
              @click="confirmReject"
            >
              Confirm Reject
            </v-btn>
          </template>
        </div>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>
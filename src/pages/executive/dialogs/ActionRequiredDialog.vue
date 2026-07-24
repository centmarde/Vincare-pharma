<script setup lang="ts">
import { useChangeRequestsPR } from '@/pages/purchasing/stores/composables/useChangeRequestsPR'
import { useFinanceChangeRequests } from '@/pages/finance/stores/composables/useFinanceChangeRequests'
import { useSalesChangeRequests } from '@/pages/sales/stores/composables/useSalesChangeRequests'
import { formatDatePR_ISO } from '@/utils/helpers'
import { computed, ref, watch } from 'vue'

// Generalized to approve/reject a request from ANY module's queue — the
// request passed in (from ActionRequired.vue's merged list) carries a
// `source` tag saying which composable actually owns it.
const pr = useChangeRequestsPR()
const finance = useFinanceChangeRequests()
const sales = useSalesChangeRequests()

const selected = defineModel<boolean>('modelValue', { default: false })
const props = defineProps<{ request?: any }>()

const request = computed(() => props.request)

const isApproving = ref(false)
const isRejecting = ref(false)
const showRejectInput = ref(false)
const rejectReason = ref('')

watch(selected, (open) => {
  if (!open) {
    showRejectInput.value = false
    rejectReason.value = ''
  }
})

function composableFor(source: string | undefined) {
  if (source === 'finance') return finance
  if (source === 'sales') return sales
  return pr
}

const moduleLabel = computed(() => {
  const source = request.value?.source
  if (source === 'finance') return 'Finance'
  if (source === 'sales') return 'Sales'
  return 'Purchase Requisition'
})

// 'undo_pr' → Undo (purchase requisition unapprove); 'void' → Void (undo a
// recorded document); 'edit' → Edit (proposed field changes).
function requestTypeLabel(requestType: string): string {
  if (requestType === 'undo_pr') return 'Undo'
  if (requestType === 'void') return 'Void'
  return 'Edit'
}

const warningText = computed(() => {
  const type = request.value?.request_type
  if (type === 'undo_pr') return 'Approving will revert this purchase requisition back to Pending Approval.'
  if (type === 'void') return 'Approving will void this document — its ledger entry is reversed and any affected balances are restored.'
  return 'Approving will apply the proposed edits to this document.'
})

async function onApprove() {
  if (!request.value || isApproving.value) return
  isApproving.value = true
  try {
    const result = await composableFor(request.value.source).approve(request.value.id)
    if (result.success) selected.value = false
  } finally {
    isApproving.value = false
  }
}

function startReject() {
  showRejectInput.value = true
}

async function confirmReject() {
  if (!request.value || isRejecting.value) return
  isRejecting.value = true
  try {
    const result = await composableFor(request.value.source).reject(
      request.value.id,
      rejectReason.value.trim() || 'Rejected by approver.'
    )
    if (result.success) selected.value = false
  } finally {
    isRejecting.value = false
  }
}
</script>

<template>
  <v-dialog v-model="selected" max-width="560" persistent>
    <v-card class="rounded-xl" elevation="0">
      <!-- Header -->
      <div class="d-flex align-center pa-4 pa-md-6 pb-2">
        <v-icon icon="mdi-shield-alert-outline" color="error" size="22" class="mr-2" />
        <span class="text-h6 font-weight-bold">Approval Required</span>
        <v-spacer />
        <v-btn icon size="small" variant="text" @click="selected = false">
          <v-icon icon="mdi-close" />
        </v-btn>
      </div>

      <div v-if="!request" class="pa-6 text-center text-caption text-medium-emphasis">
        No request selected.
      </div>

      <v-card-text v-else class="px-4 px-md-6 pb-4 pb-md-6 pt-0">
        <!-- Transaction summary card -->
        <v-sheet
          rounded="lg"
          variant="tonal"
          color="surface-variant"
          class="pa-3 mb-4"
        >
          <div class="d-flex align-center ga-3">
            <v-avatar size="36" rounded="lg" color="error" variant="tonal" class="flex-shrink-0">
              <v-icon color="error" icon="mdi-cancel" size="18" />
            </v-avatar>
            <div class="flex-grow-1" style="min-width: 0">
              <div class="d-flex align-center ga-2 flex-wrap">
                <span class="text-body-2 font-weight-bold">
                  {{ request.from_transaction_no ?? `#${request.transaction_id}` }}
                </span>
                <v-chip size="x-small" color="error" variant="tonal" label>{{ requestTypeLabel(request.request_type) }}</v-chip>
                <v-chip size="x-small" variant="tonal" color="green" label>{{ moduleLabel }}</v-chip>
              </div>
              <div class="text-caption text-medium-emphasis mt-1">
                {{ request.summary ?? warningText }}
              </div>
            </div>
          </div>

          <v-divider class="my-3" />

          <div class="d-flex ga-6">
            <div>
              <div class="text-caption text-medium-emphasis">Requested by</div>
              <div class="text-body-2 text-high-emphasis">{{ request.created_by_email ?? '—' }}</div>
            </div>
            <div>
              <div class="text-caption text-medium-emphasis">Requested on</div>
              <div class="text-body-2 text-high-emphasis">{{ formatDatePR_ISO(request.created_at) }}</div>
            </div>
          </div>
        </v-sheet>

        <!-- Reason callout -->
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
            {{ request.reason ?? '—' }}
          </v-sheet>
        </div>

        <!-- What happens if approved -->
        <v-alert
          type="warning"
          variant="tonal"
          density="compact"
          icon="mdi-information-outline"
          class="mb-4 text-caption"
        >
          {{ warningText }} This cannot be undone.
        </v-alert>

        <!-- Inline reject reason -->
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

        <!-- Actions -->
        <div class="d-flex justify-end ga-2">
          <template v-if="!showRejectInput">
            <v-btn
              size="small"
              variant="outlined"
              class="text-none"
              @click="selected = false"
            >
              Cancel
            </v-btn>
            <v-btn
              size="small"
              variant="outlined"
              color="error"
              class="text-none"
              @click="startReject"
            >
              Reject
            </v-btn>
            <v-btn
              size="small"
              color="success"
              class="text-none font-weight-bold"
              elevation="0"
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
              @click="showRejectInput = false"
            >
              Back
            </v-btn>
            <v-btn
              size="small"
              color="error"
              class="text-none font-weight-bold"
              elevation="0"
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
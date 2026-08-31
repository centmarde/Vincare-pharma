<script setup lang="ts">
import { onMounted } from 'vue'
import { useProcurementRequests, headers } from '../composables/useProcurementRequests'
import type { ProcurementRequestType } from '@/stores/procurementData'
import SupplierCanvass from '@/components/canvass/SupplierCanvass.vue'
import RFQPrintDialog from './dialogs/RFQPrintDialog.vue'
import DraftPREditPage from './DraftPREditPage.vue'
import { formatDatePR_ISO } from '@/utils/helpers'
import DraftPRReview from './DraftPRReview.vue'
import { useDisplay } from 'vuetify'

const { mobile } = useDisplay()

const {
  queue, loading, selected, showDetail,
  showRFQ, rfqQuantities, openRFQ, onRFQQuantities,
  canvassOrder, canvassShortfall, commitFn, canvassRef, dismissing,
  init, openDetail, dismissDetail, onCanvassCreated, moduleLabel,
  showDraftEdit, showDraftReview, activeDraftId, draftReadonly,
  startDraftPR, goToReview, backToEdit, onDraftSubmitted, onDraftSaved,
  draftByOrder, openDraft, convertedAtFor,
} = useProcurementRequests()

// "PR rejected" is actionable, not an error state to clear — it's why Canvass
// went back to being clickable.
function statusChip(item: ProcurementRequestType) {
  if (item.already_canvassed) return { color: 'success', text: 'PRs raised' }
  if (item.has_rejected_pr) return { color: 'error', text: 'PR rejected' }
  return { color: 'warning', text: 'New' }
}

function submittedToPRLabel(orderId: number): string {
  const convertedAt = convertedAtFor(orderId)
  return convertedAt ? formatDatePR_ISO(convertedAt) : 'Not yet set'
}

onMounted(init)
</script>

<template>
  <v-container fluid class="pa-2">
    <v-card rounded="lg" class="mx-auto w-100">
      <v-card-title class="pa-4 pa-sm-5 pb-2">
        <div class="text-h6 font-weight-bold">Procurement Requests</div>
        <div class="text-caption text-medium-emphasis text-wrap">
          Orders that In-House / Ethical staff have flagged for stock shortfall. Canvass suppliers here and raise Purchase Requisitions.
        </div>
      </v-card-title>
      <v-divider />
      <v-data-table
        v-if="!mobile"
        :headers="headers"
        :items="queue"
        :loading="loading"
        item-value="order_id"
        no-data-text="No open procurement requests."
      >
        <template #item.order_type="{ item }">
          <v-chip size="small" :color="item.order_type === 'inhouse_order' ? 'teal' : 'purple'" label>
            {{ moduleLabel(item.order_type) }}
          </v-chip>
        </template>
        <template #item.order_no="{ item }">{{ item.order_no ?? '—' }}</template>
        <template #item.customer_name="{ item }">{{ item.customer_name ?? '—' }}</template>
        <template #item.requested_at="{ item }">{{ formatDatePR_ISO(item.requested_at) }}</template>
        <template #item.converted_at="{ item }">{{ submittedToPRLabel(item.order_id) }}</template>
        <template #item.lines="{ item }">
          <span class="font-weight-bold">{{ item.lines.length }}</span> item(s)
        </template>
        <template #item.already_canvassed="{ item }">
          <v-chip size="small" :color="statusChip(item).color" label>
            {{ statusChip(item).text }}
          </v-chip>
        </template>
        <template #item.actions="{ item }">
          <div class="d-flex align-center ga-2">
            <v-btn
              size="small" color="primary" variant="tonal" class="text-none"
              :disabled="item.already_canvassed"
              @click="openDetail(item)">
              Canvass
            </v-btn>
            <v-btn
              size="small" variant="tonal" class="text-none"
              :color="draftByOrder[item.order_id] ? 'secondary' : undefined"
              :disabled="!draftByOrder[item.order_id]"
              @click="openDraft(item)">
              {{ item.already_canvassed ? 'View Draft' : 'Resume Draft' }}
            </v-btn>
          </div>
        </template>
      </v-data-table>

      <div v-else class="pa-3">
        <div v-if="loading" class="text-center py-4 text-medium-emphasis">Loading…</div>
        <div v-else-if="!queue.length" class="text-center py-4 text-medium-emphasis">No open procurement requests.</div>
        <v-card
          v-for="item in queue" :key="item.order_id"
          class="mb-3" variant="outlined" rounded="lg">
          <v-card-text class="pa-3">
            <div class="d-flex justify-space-between align-start mb-2" style="gap:8px">
              <div style="min-width:0">
                <div class="d-flex align-center ga-2 mb-1">
                  <v-chip size="small" :color="item.order_type === 'inhouse_order' ? 'teal' : 'purple'" label>
                    {{ moduleLabel(item.order_type) }}
                  </v-chip>
                  <span class="text-body-2 font-weight-medium">{{ item.order_no ?? '—' }}</span>
                </div>
                <div class="text-caption text-medium-emphasis">{{ item.customer_name ?? '—' }}</div>
              </div>
              <v-chip size="small" :color="statusChip(item).color" label>
                {{ statusChip(item).text }}
              </v-chip>
            </div>
            <v-divider class="mb-2" />
            <div class="d-flex flex-wrap ga-3 text-caption mb-3">
              <div><span class="text-medium-emphasis">Requested: </span>{{ formatDatePR_ISO(item.requested_at) }}</div>
              <div><span class="text-medium-emphasis">Items short: </span><span class="font-weight-bold">{{ item.lines.length }}</span></div>
              <div>
                <span class="text-medium-emphasis">Submitted to PR: </span>{{ submittedToPRLabel(item.order_id) }}
              </div>
            </div>
            <div class="d-flex flex-column ga-2">
              <v-btn
                size="small" color="primary" variant="tonal" class="text-none" block
                :disabled="item.already_canvassed"
                @click="openDetail(item)">
                Canvass
              </v-btn>
              <v-btn
                size="small" variant="tonal" class="text-none" block
                :color="draftByOrder[item.order_id] ? 'secondary' : undefined"
                :disabled="!draftByOrder[item.order_id]"
                @click="openDraft(item)">
                {{ item.already_canvassed ? 'View Draft' : 'Resume Draft' }}
              </v-btn>
            </div>
          </v-card-text>
        </v-card>
      </div>
    </v-card>

    <v-dialog
      :model-value="showDetail"
      :persistent="dismissing"
      :max-width="mobile ? undefined : 920"
      :fullscreen="mobile"
      scrollable
      @update:model-value="(v) => { if (!v) dismissDetail() }"
    >
      <v-card v-if="selected" rounded="lg">
        <v-card-title
          class="pa-4 pa-sm-5 pb-2 d-flex"
          :class="mobile ? 'flex-column align-start ga-2' : 'justify-space-between align-center'">
          <div style="min-width:0">
            <div class="text-h6 font-weight-bold">
              {{ moduleLabel(selected.order_type) }} · {{ selected.customer_name ?? '—' }}
            </div>
            <div class="text-caption text-medium-emphasis">
              {{ selected.order_no }}
              <span v-if="selected.note"> · "{{ selected.note }}"</span>
            </div>
          </div>
          <div class="d-flex align-center ga-2" :class="mobile ? 'w-100 justify-space-between' : ''">
            <v-btn
              variant="tonal"
              size="small"
              color="primary"
              class="text-none"
              prepend-icon="mdi-file-document-edit-outline"
              @click="openRFQ"
            >
              Print RFQ
            </v-btn>
            <v-btn icon="mdi-close" variant="text" size="small" :loading="dismissing" @click="dismissDetail" />
          </div>
        </v-card-title>
        <v-divider />
        <v-card-text class="pa-4 pa-sm-5">
          <SupplierCanvass
          ref="canvassRef"
          :order="canvassOrder" :shortfall="canvassShortfall" :commit-fn="commitFn"
          :order-type="selected?.order_type" :initial-qty="rfqQuantities"
          @created="onCanvassCreated" @draft-saved="onDraftSaved" />
        </v-card-text>
      </v-card>
    </v-dialog>

    <RFQPrintDialog
      v-model="showRFQ"
      :request="selected"
      @quantities="onRFQQuantities"
    />
  </v-container>

  <DraftPREditPage v-model="showDraftEdit" :draft-id="activeDraftId" :readonly="draftReadonly" @continue="goToReview" />
  <DraftPRReview v-model="showDraftReview" :draft-id="activeDraftId" :readonly="draftReadonly" @submitted="onDraftSubmitted" @edit="backToEdit" />
</template>

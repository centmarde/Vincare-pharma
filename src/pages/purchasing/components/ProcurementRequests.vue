<script setup lang="ts">
import { onMounted } from 'vue'
import { useProcurementRequests, headers } from '../composables/useProcurementRequests'
import SupplierCanvass from '@/components/canvass/SupplierCanvass.vue'
import RFQPrintDialog from './dialogs/RFQPrintDialog.vue'
import DraftPREditPage from './DraftPREditPage.vue'
import { formatDatePR_ISO } from '@/utils/helpers'
import DraftPRReview from './DraftPRReview.vue'

const {
  queue, loading, selected, showDetail,
  showRFQ, rfqQuantities, openRFQ, onRFQQuantities,
  canvassOrder, canvassShortfall, commitFn, canvassRef, dismissing,
  init, openDetail, dismissDetail, onCanvassCreated, moduleLabel,
  showDraftEdit, showDraftReview, activeDraftId,
  startDraftPR, goToReview, backToEdit, onDraftSubmitted, onDraftSaved,
  draftIdByOrder, openDraft,
} = useProcurementRequests()

onMounted(init)
</script>

<template>
  <v-container fluid class="pa-2">
    <v-card rounded="lg" class="mx-auto w-100">
      <v-card-title class="pa-4 pa-sm-5 pb-2">
        <div class="text-h6 font-weight-bold">Procurement Requests</div>
        <div class="text-caption text-medium-emphasis">
          Orders that In-House / Ethical staff have flagged for stock shortfall. Canvass suppliers here and raise Purchase Requisitions.
        </div>
      </v-card-title>
      <v-divider />
      <v-data-table
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
        <template #item.lines="{ item }">
          <span class="font-weight-bold">{{ item.lines.length }}</span> item(s)
        </template>
        <template #item.already_canvassed="{ item }">
          <v-chip size="small" :color="item.already_canvassed ? 'success' : 'warning'" label>
            {{ item.already_canvassed ? 'PRs raised' : 'New' }}
          </v-chip>
        </template>
        <template #item.actions="{ item }">
          <v-btn size="small" color="primary" variant="tonal" class="text-none mr-2" @click="openDetail(item)">
            Canvass
          </v-btn>
          <v-btn
            size="small" variant="tonal" class="text-none"
            :color="draftIdByOrder[item.order_id] ? 'secondary' : undefined"
            :disabled="!draftIdByOrder[item.order_id]"
            @click="openDraft(item)">
            Resume Draft
          </v-btn>
        </template>
      </v-data-table>
    </v-card>

    <v-dialog
      :model-value="showDetail"
      :persistent="dismissing"
      max-width="920"
      scrollable
      @update:model-value="(v) => { if (!v) dismissDetail() }"
    >
      <v-card v-if="selected" rounded="lg">
        <v-card-title class="pa-4 pa-sm-5 pb-2 d-flex justify-space-between align-center">
          <div>
            <div class="text-h6 font-weight-bold">
              {{ moduleLabel(selected.order_type) }} · {{ selected.customer_name ?? '—' }}
            </div>
            <div class="text-caption text-medium-emphasis">
              {{ selected.order_no }}
              <span v-if="selected.note"> · "{{ selected.note }}"</span>
            </div>
          </div>
          <div class="d-flex align-center ga-2">
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

  <DraftPREditPage v-model="showDraftEdit" :draft-id="activeDraftId" @continue="goToReview" />
  <DraftPRReview v-model="showDraftReview" :draft-id="activeDraftId" @submitted="onDraftSubmitted" @edit="backToEdit" />
</template>

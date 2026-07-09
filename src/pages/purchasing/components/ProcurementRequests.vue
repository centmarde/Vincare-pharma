<script setup lang="ts">
import { onMounted } from 'vue'
import { useProcurementRequests, headers } from '../composables/useProcurementRequests'
import SupplierCanvass from '@/components/canvass/SupplierCanvass.vue'
import { formatDatePR_ISO } from '@/utils/helpers'

const {
  queue, loading, selected, showDetail,
  canvassOrder, canvassShortfall, commitFn,
  init, openDetail, closeDetail, onCanvassCreated, moduleLabel,
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
          <v-btn size="small" color="primary" variant="tonal" class="text-none" @click="openDetail(item)">
            Canvass
          </v-btn>
        </template>
      </v-data-table>
    </v-card>

    <v-dialog v-model="showDetail" max-width="920" scrollable>
      <v-card v-if="selected" rounded="lg">
        <v-card-title class="pa-4 pa-sm-5 pb-2 d-flex justify-space-between align-center">
          <div>
            <div class="text-h6 font-weight-bold">{{ selected.order_no }}</div>
            <div class="text-caption text-medium-emphasis">
              {{ moduleLabel(selected.order_type) }} · {{ selected.customer_name ?? '—' }}
              <span v-if="selected.note"> · "{{ selected.note }}"</span>
            </div>
          </div>
          <v-btn icon="mdi-close" variant="text" size="small" @click="closeDetail" />
        </v-card-title>
        <v-divider />
        <v-card-text class="pa-4 pa-sm-5">
          <SupplierCanvass
            :order="canvassOrder"
            :shortfall="canvassShortfall"
            :commit-fn="commitFn"
            @created="onCanvassCreated"
          />
        </v-card-text>
      </v-card>
    </v-dialog>
  </v-container>
</template>

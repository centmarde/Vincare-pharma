<script setup lang="ts">
import { useStockTransferDetail } from '../composables/useStockTransferDetail'
import type { StockTransferType } from '@/stores/stockTransfersData'
import { formatDatePR_ISO } from '@/utils/helpers'

const props = defineProps<{
  modelValue: boolean
  transfer: StockTransferType | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'changed'): void
}>()

const {
  loading, receivedQtys, items,
  isPendingApproval, isApproved,
  handleApprove, handleReject, handleMarkReceived,
} = useStockTransferDetail(
  () => props.transfer,
  () => emit('changed'),
)

async function onApprove() {
  await handleApprove()
  emit('changed')
}

async function onReject() {
  await handleReject()
  emit('changed')
}

async function onMarkReceived() {
  await handleMarkReceived()
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="720"
    scrollable
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card rounded="lg" v-if="transfer">
      <v-card-title class="pa-5 pb-3 d-flex justify-space-between align-center">
        <span class="text-h6 font-weight-bold">{{ transfer.transfer_no }}</span>
        <v-btn icon="mdi-close" variant="text" size="small" @click="emit('update:modelValue', false)" />
      </v-card-title>

      <v-divider />

      <v-card-text class="pa-5">
        <v-row dense class="mb-2">
          <v-col cols="6">
            <div class="text-caption text-medium-emphasis">Outlet</div>
            <div class="text-body-2 font-weight-medium">{{ transfer.outlet?.name ?? '—' }}</div>
          </v-col>
          <v-col cols="6">
            <div class="text-caption text-medium-emphasis">Requested</div>
            <div class="text-body-2 font-weight-medium">{{ formatDatePR_ISO(transfer.created_at) }}</div>
          </v-col>
          <v-col cols="12" v-if="transfer.remarks">
            <div class="text-caption text-medium-emphasis">Remarks</div>
            <div class="text-body-2">{{ transfer.remarks }}</div>
          </v-col>
        </v-row>

        <v-divider class="my-3" />

        <v-table density="compact">
          <thead>
            <tr>
              <th>PRODUCT</th>
              <th class="text-right">REQUESTED</th>
              <th class="text-right" style="width: 140px">RECEIVED</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in items" :key="item.id">
              <td>{{ item.product?.product_name ?? '—' }}</td>
              <td class="text-right">{{ item.requested_qty }}</td>
              <td class="text-right">
                <v-text-field
                  v-if="isApproved"
                  v-model.number="receivedQtys[item.id]"
                  type="number"
                  min="0"
                  density="compact"
                  variant="outlined"
                  hide-details
                  style="width: 110px"
                />
                <span v-else>{{ item.received_qty ?? '—' }}</span>
              </td>
            </tr>
          </tbody>
        </v-table>
      </v-card-text>

      <v-divider />

      <v-card-actions class="pa-4 justify-end" style="gap: 8px">
        <template v-if="isPendingApproval">
          <v-btn variant="outlined" color="error" class="text-none" :loading="loading" @click="onReject">
            Reject
          </v-btn>
          <v-btn color="primary" class="text-none font-weight-bold" elevation="0" :loading="loading" @click="onApprove">
            Approve
          </v-btn>
        </template>
        <template v-else-if="isApproved">
          <v-btn
            color="success"
            class="text-none font-weight-bold"
            elevation="0"
            :loading="loading"
            @click="onMarkReceived"
          >
            Mark Received
          </v-btn>
        </template>
        <template v-else>
          <v-btn variant="outlined" class="text-none" @click="emit('update:modelValue', false)">
            Close
          </v-btn>
        </template>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

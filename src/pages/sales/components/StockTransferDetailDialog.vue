<script setup lang="ts">
import { computed } from 'vue'
import { useStockTransferDetail } from '../composables/useStockTransferDetail'
import type { StockTransferType } from '@/stores/stockTransfersData'
import { formatDatePR_ISO } from '@/utils/helpers'

const props = withDefaults(defineProps<{
  modelValue: boolean
  transfer: StockTransferType | null
  // 'warehouse' reviewers approve/reject; 'outlet' requesters confirm receipt.
  mode?: 'warehouse' | 'outlet'
}>(), {
  mode: 'outlet',
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'changed'): void
}>()

const {
  loading, receivedQtys, displayItems,
  isPendingApproval, isApproved,
  onHand, stockLoading, shortProductCount, shortBy, onHandFor, batchLabel,
  handleApprove, handleReject, handleMarkReceived, loadStock,
} = useStockTransferDetail(
  () => props.transfer,
  () => emit('changed'),
  () => props.modelValue && props.mode === 'warehouse',
)

// The approver sees warehouse on-hand in place of the (still empty) received column.
const showStock = computed(() => props.mode === 'warehouse' && isPendingApproval.value)

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
      <v-card-title class="pa-4 pa-sm-5 pb-3 d-flex justify-space-between align-center">
        <span class="text-h6 font-weight-bold">{{ transfer.transfer_no }}</span>
        <v-btn icon="mdi-close" variant="text" size="small" @click="emit('update:modelValue', false)" />
      </v-card-title>

      <v-divider />

      <v-card-text class="pa-4 pa-sm-5">
        <v-row dense class="mb-2">
          <v-col cols="6">
            <div class="text-caption text-medium-emphasis">Warehouse</div>
            <div class="text-body-2 font-weight-medium">{{ transfer.warehouse?.name ?? '—' }}</div>
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

        <template v-if="showStock">
          <v-progress-linear v-if="stockLoading" indeterminate color="primary" class="mb-3" />
          <v-alert
            v-else-if="shortProductCount"
            type="error"
            variant="tonal"
            density="compact"
            class="mb-3"
          >
            <div class="d-flex align-center flex-wrap ga-2">
              <span class="flex-grow-1">
                {{ shortProductCount }} {{ shortProductCount === 1 ? 'product is' : 'products are' }}
                short of warehouse stock, listed first. This transfer can't be approved until
                {{ shortProductCount === 1 ? 'it is' : 'they are' }} covered.
              </span>
              <v-btn size="small" variant="text" class="text-none" prepend-icon="mdi-refresh" @click="loadStock">
                Re-check stock
              </v-btn>
            </div>
          </v-alert>
          <v-alert
            v-else-if="onHand === null"
            type="warning"
            variant="tonal"
            density="compact"
            class="mb-3"
          >
            Could not read warehouse stock. Approve still checks it.
          </v-alert>
        </template>

        <v-table density="compact">
          <thead>
            <tr>
              <th>PRODUCT</th>
              <th class="text-right">REQUESTED</th>
              <th class="text-right" style="width: 140px">{{ showStock ? 'ON HAND' : 'RECEIVED' }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in displayItems" :key="item.id" :class="{ 'short-line': shortBy(item) > 0 }">
              <td>
                <div>{{ item.product?.product_name ?? '—' }}</div>
                <div v-if="batchLabel(item)" class="text-caption text-medium-emphasis">{{ batchLabel(item) }}</div>
              </td>
              <td class="text-right">{{ item.requested_qty }}</td>
              <td class="text-right">
                <template v-if="showStock">
                  <template v-if="onHandFor(item) !== null">
                    <div :class="{ 'text-error font-weight-bold': shortBy(item) > 0 }">{{ onHandFor(item) }}</div>
                    <div v-if="shortBy(item) > 0" class="text-caption text-error">short {{ shortBy(item) }}</div>
                  </template>
                  <span v-else>—</span>
                </template>
                <v-text-field
                  v-if="isApproved && mode === 'outlet'"
                  v-model.number="receivedQtys[item.id]"
                  type="number"
                  min="0"
                  density="compact"
                  variant="outlined"
                  hide-details
                  class="input-number"
                  style="width: 110px"
                />
                <span v-else-if="!showStock">{{ item.received_qty ?? '—' }}</span>
              </td>
            </tr>
          </tbody>
        </v-table>
      </v-card-text>

      <v-divider />

      <v-card-actions class="px-5 pb-5 pt-3 d-flex justify-end ga-2">
        <!-- Warehouse reviewers approve/reject a pending request. -->
        <template v-if="mode === 'warehouse' && isPendingApproval">
          <v-btn variant="outlined" color="error" class="text-none" :loading="loading" @click="onReject">
            Reject
          </v-btn>
          <v-btn
            color="primary"
            class="text-none font-weight-bold"
            elevation="0"
            :loading="loading"
            :disabled="shortProductCount > 0 || stockLoading"
            @click="onApprove"
          >
            Approve
          </v-btn>
        </template>
        <!-- The outlet confirms receipt once the warehouse has approved. -->
        <template v-else-if="mode === 'outlet' && isApproved">
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

<style scoped>
.short-line {
  background: rgba(var(--v-theme-error), 0.06);
}
.input-number :deep(input[type="number"]) {
  -moz-appearance: textfield;
  appearance: textfield;
}
.input-number :deep(input[type="number"]::-webkit-outer-spin-button),
.input-number :deep(input[type="number"]::-webkit-inner-spin-button) {
  -webkit-appearance: none;
  margin: 0;
}
</style>

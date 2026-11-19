<script setup lang="ts">
import { computed } from 'vue'
import { useStockTransferDetail } from '../composables/useStockTransferDetail'
import type { StockTransferType } from '@/stores/stockTransfersData'
import { formatCurrency, formatDatePR_ISO, formatExpiryMonthYear } from '@/utils/helpers'

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
  swapItem, swapOptions, swapLoading, swapFailed, swapSavingId, openSwap, closeSwap, chooseSwap,
  differentUnit, monthsLeft, shortShelfLifeMonths, substitutionNotes,
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

// Swapping a line re-reads the transfer; the new lines then re-read on-hand.
async function onChooseSwap(productId: number) {
  if (await chooseSwap(productId)) emit('changed')
}

function isShortShelfLife(expiry: string | null): boolean {
  const months = monthsLeft(expiry)
  return months !== null && months < shortShelfLifeMonths
}

function onSwapDialog(open: boolean) {
  if (!open) closeSwap()
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

        <!-- The branch sees which lines the warehouse switched to another batch. -->
        <v-alert
          v-if="substitutionNotes.length"
          type="info"
          variant="tonal"
          density="compact"
          class="mb-3"
          icon="mdi-swap-horizontal"
        >
          <div class="font-weight-medium mb-1">
            The warehouse changed {{ substitutionNotes.length === 1 ? 'a line' : `${substitutionNotes.length} lines` }} to another batch:
          </div>
          <div v-for="(note, i) in substitutionNotes" :key="i" class="text-caption">
            {{ note.description }} <span class="text-medium-emphasis">({{ formatDatePR_ISO(note.created_at) }})</span>
          </div>
        </v-alert>

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
                <div v-if="item.product?.brand || batchLabel(item)" class="text-caption text-medium-emphasis">
                  {{ [item.product?.brand, batchLabel(item)].filter(Boolean).join(' · ') }}
                </div>
                <!-- No requested batch/brand on hand? Send another batch of the same product. -->
                <v-btn
                  v-if="showStock"
                  size="x-small"
                  :variant="shortBy(item) > 0 ? 'tonal' : 'text'"
                  :color="shortBy(item) > 0 ? 'error' : 'primary'"
                  class="text-none mt-1 px-1"
                  prepend-icon="mdi-swap-horizontal"
                  :disabled="loading"
                  @click="openSwap(item)"
                >
                  Send another batch / brand
                </v-btn>
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

  <!-- Choose another batch / brand of the same product for one line. -->
  <v-dialog :model-value="!!swapItem" max-width="680" scrollable @update:model-value="onSwapDialog">
    <v-card v-if="swapItem" rounded="lg">
      <v-card-title class="pa-4 pa-sm-5 pb-3">
        <div class="text-h6 font-weight-bold">Send another batch or brand</div>
        <div class="text-caption text-medium-emphasis">
          {{ swapItem.product?.product_name ?? 'Product' }} · {{ swapItem.requested_qty }} requested
        </div>
      </v-card-title>
      <v-divider />
      <v-card-text class="pa-4 pa-sm-5">
        <div class="text-caption text-medium-emphasis mb-3">
          Requested:
          <strong>{{ [swapItem.product?.brand, batchLabel(swapItem)].filter(Boolean).join(' · ') || 'no batch recorded' }}</strong>.
          Pick what the warehouse will send instead. The branch receives the batch you choose and sees the change on this transfer.
          Listed: other batches recorded under the same product name — a brand saved under a different name won't show here.
        </div>

        <v-progress-linear v-if="swapLoading" indeterminate color="primary" class="mb-3" />
        <v-alert v-else-if="swapFailed" type="error" variant="tonal" density="compact">
          Could not read the warehouse's other batches. Try again.
        </v-alert>
        <v-alert v-else-if="!swapOptions.length" type="info" variant="tonal" density="compact">
          The main warehouse has no other batch of this product in stock under the same name (expired and disposed batches are left out).
        </v-alert>

        <div v-else class="swap-scroll">
          <v-table density="compact" class="border rounded">
            <thead>
              <tr>
                <th></th>
                <th class="text-caption">Brand</th>
                <th class="text-caption">Batch</th>
                <th class="text-caption">Expiry</th>
                <th class="text-caption text-right">On hand</th>
                <th class="text-caption">Unit</th>
                <th class="text-caption text-right" title="What the branch will sell it for">Selling price</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="option in swapOptions" :key="option.id">
                <!-- Action first, so it is on screen on a phone without scrolling sideways. -->
                <td class="swap-action">
                  <v-btn
                    v-if="!option.blocked"
                    size="small"
                    color="primary"
                    variant="tonal"
                    class="text-none"
                    :loading="swapSavingId === option.id"
                    :disabled="swapSavingId !== null && swapSavingId !== option.id"
                    @click="onChooseSwap(option.id)"
                  >
                    Send this
                  </v-btn>
                  <span v-else class="text-caption text-error">{{ option.blocked }}</span>
                </td>
                <td class="text-caption">{{ option.brand ?? '—' }}</td>
                <td class="text-caption">{{ option.batch_no ?? '—' }}</td>
                <td class="text-caption">
                  {{ option.expiry_date ? formatExpiryMonthYear(option.expiry_date) : '—' }}
                  <div v-if="isShortShelfLife(option.expiry_date)" class="text-warning">
                    {{ monthsLeft(option.expiry_date) === 0 ? 'expires this month' : `${monthsLeft(option.expiry_date)} mo left` }}
                  </div>
                </td>
                <td class="text-caption text-right">
                  {{ option.current_stock }}
                  <div v-if="option.already_on_transfer" class="text-medium-emphasis">{{ option.already_on_transfer }} on this transfer</div>
                </td>
                <td class="text-caption">
                  {{ option.unit ?? '—' }}
                  <v-chip
                    v-if="differentUnit(option)"
                    size="x-small" color="warning" variant="tonal" label class="ml-1"
                  >different unit</v-chip>
                </td>
                <td class="text-caption text-right">
                  {{ option.selling_price ? formatCurrency(option.selling_price) : '—' }}
                  <div
                    v-if="option.selling_price && swapItem.product?.selling_price && Number(option.selling_price) !== Number(swapItem.product.selling_price)"
                    class="text-warning"
                  >requested: {{ formatCurrency(Number(swapItem.product.selling_price)) }}</div>
                </td>
              </tr>
            </tbody>
          </v-table>
        </div>
      </v-card-text>
      <v-divider />
      <v-card-actions class="px-5 pb-5 pt-3 d-flex justify-end ga-2">
        <v-btn variant="outlined" class="text-none" @click="closeSwap">Cancel</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.swap-scroll {
  overflow-x: auto;
}
.swap-action {
  min-width: 110px;
}
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

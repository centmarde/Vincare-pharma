<script setup lang="ts">
import { onMounted } from 'vue'
import { useCanvass } from './useCanvass'
import type { CanvassableOrder, Shortfall, CanvassCommitFn } from '@/utils/canvassTypes'
import { formatCurrency } from '@/utils/helpers'

const props = defineProps<{
  order: CanvassableOrder | null
  shortfall: Shortfall[]
  commitFn: CanvassCommitFn
}>()
const emit = defineEmits<{ (e: 'created'): void }>()

const {
  loading, rows, supplierOptions,
  addQuote, removeQuote, onQuoteChange, isRecommended,
  validateQty, bufferQty, lineTotal,
  canCommit, prPreview, commit, init,
  MIN_MONTHS_TO_EXPIRY,
} = useCanvass(() => props.order, () => props.shortfall, props.commitFn, () => emit('created'))

onMounted(init)
</script>

<template>
  <div>
    <div class="text-caption text-medium-emphasis mb-3">
      Canvass suppliers for each short item. Enter each supplier's price and batch expiry —
      the cheapest quote with at least {{ MIN_MONTHS_TO_EXPIRY }} months to expiry is recommended.
      One Purchase Requisition is raised per winning supplier.
    </div>

    <v-card v-for="(row, rowIdx) in rows" :key="row.product_id" variant="outlined" rounded="lg" class="mb-3">
      <v-card-text class="pa-3">
        <div class="d-flex justify-space-between align-center mb-2">
          <div class="text-body-2 font-weight-bold">{{ row.product_name }}</div>
          <div class="text-caption text-medium-emphasis">Shortfall: {{ row.shortfall_qty }}</div>
        </div>

        <v-table density="compact">
          <thead>
            <tr>
              <th class="text-left" style="width:40px">Win</th>
              <th class="text-left">Supplier</th>
              <th class="text-right" style="width:120px">Price/Unit</th>
              <th class="text-left" style="width:160px">Batch Expiry</th>
              <th class="text-right" style="width:90px">Mos. left</th>
              <th style="width:40px"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(q, qIdx) in row.quotes" :key="qIdx">
              <td>
                <v-radio-group v-model="row.selected_supplier_id" hide-details density="compact" class="ma-0 pa-0">
                  <v-radio :value="q.supplier_id" :disabled="!q.is_valid" density="compact" hide-details />
                </v-radio-group>
              </td>
              <td>
                <div class="d-flex align-center" style="gap:4px">
                  <v-select
                    v-model="q.supplier_id" :items="supplierOptions"
                    density="compact" variant="outlined" hide-details
                    placeholder="Select supplier"
                    @update:model-value="onQuoteChange(rowIdx, qIdx)" />
                  <v-icon v-if="isRecommended(row, q)" color="success" size="small" title="Cheapest valid">mdi-star</v-icon>
                </div>
              </td>
              <td>
                <v-text-field
                  v-model.number="q.price" type="number" min="0" prefix="₱"
                  density="compact" variant="outlined" hide-details
                  @update:model-value="onQuoteChange(rowIdx, qIdx)" />
              </td>
              <td>
                <v-text-field
                  v-model="q.expiry_date" type="date"
                  density="compact" variant="outlined" hide-details
                  @update:model-value="onQuoteChange(rowIdx, qIdx)" />
              </td>
              <td class="text-right">
                <v-chip v-if="q.expiry_date" :color="q.is_valid ? 'success' : 'error'" size="x-small" label>
                  {{ q.months_to_expiry }}mo
                </v-chip>
                <span v-else class="text-medium-emphasis">—</span>
              </td>
              <td>
                <v-btn icon="mdi-close" variant="text" size="x-small" @click="removeQuote(rowIdx, qIdx)" />
              </td>
            </tr>
            <tr v-if="!row.quotes.length">
              <td colspan="6" class="text-center text-caption text-medium-emphasis py-2">
                No quotes yet — add the suppliers you canvassed.
              </td>
            </tr>
          </tbody>
        </v-table>

        <v-btn variant="text" size="small" color="info" class="text-none mt-1" prepend-icon="mdi-plus"
          @click="addQuote(rowIdx)">Add supplier quote</v-btn>

        <v-divider class="my-2" />

        <div class="d-flex align-center flex-wrap" style="gap:16px">
          <div class="d-flex align-center" style="gap:8px">
            <span class="text-caption">Order qty</span>
            <v-text-field
              v-model.number="row.order_qty" type="number" :min="row.shortfall_qty"
              density="compact" variant="outlined" hide-details style="max-width:120px"
              @update:model-value="validateQty(rowIdx)" />
            <v-chip v-if="bufferQty(row) > 0" color="info" size="x-small" label>+{{ bufferQty(row) }} buffer</v-chip>
          </div>
          <div class="text-caption">
            Line total: <b>{{ formatCurrency(lineTotal(row)) }}</b>
          </div>
        </div>
      </v-card-text>
    </v-card>

    <!-- PR grouping preview -->
    <v-card v-if="prPreview.length" variant="tonal" color="success" rounded="lg" class="mb-3">
      <v-card-text class="pa-3">
        <div class="text-caption font-weight-bold mb-1">Will raise {{ prPreview.length }} purchase requisition(s):</div>
        <div v-for="p in prPreview" :key="p.supplier_id" class="d-flex justify-space-between text-caption">
          <span>{{ p.name }} — {{ p.items }} item(s)</span>
          <span class="font-weight-bold">{{ formatCurrency(p.total) }}</span>
        </div>
      </v-card-text>
    </v-card>

    <div class="d-flex justify-end">
      <v-btn color="success" size="small" class="text-none font-weight-bold" elevation="0"
        :loading="loading" :disabled="!canCommit" @click="commit">
        Raise Purchase Requisition(s)
      </v-btn>
    </div>
  </div>
</template>

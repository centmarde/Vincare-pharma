<script setup lang="ts">
import { watch } from 'vue'
import { useDraftPRReview } from '../composables/useDraftPRReview'
import { formatCurrency } from '@/utils/helpers'

const props = defineProps<{ modelValue: boolean; draftId: number | null }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void; (e: 'submitted', prId: number): void }>()

const { draft, warnings, checking, submitting, confirmedOnce, totalEstimate, hasBlockingIssues, load, submit } =
  useDraftPRReview(() => props.draftId)

watch(() => props.modelValue, (open) => { if (open) load() })

async function onSubmit() {
  const result = await submit()
  if (result.success && (result as any).pr_id) {
    emit('submitted', (result as any).pr_id)
    emit('update:modelValue', false)
  }
}
</script>

<template>
  <v-dialog :model-value="modelValue" max-width="960" scrollable @update:model-value="emit('update:modelValue', $event)">
    <v-card v-if="draft" rounded="lg">
      <v-card-title class="pa-4 pb-2 d-flex justify-space-between align-center">
        <div>
          <div class="text-h6 font-weight-bold">Review Draft PR #{{ draft.id }}</div>
          <div class="text-caption text-medium-emphasis">{{ draft.remarks }}</div>
        </div>
        <v-btn icon="mdi-close" variant="text" size="small" @click="emit('update:modelValue', false)" />
      </v-card-title>
      <v-divider />
      <v-card-text class="pa-4">
        <v-progress-linear v-if="checking" indeterminate class="mb-3" />

        <v-alert v-if="hasBlockingIssues" type="error" variant="tonal" density="compact" class="mb-3">
          Every item needs a selected, qualifying supplier before this can be submitted.
        </v-alert>

        <v-alert v-if="warnings.length" type="warning" variant="tonal" density="compact" class="mb-3">
          <div v-for="w in warnings" :key="w.item_id">{{ w.message }}</div>
        </v-alert>

        <v-table density="compact">
          <thead>
            <tr>
              <th class="text-left">Product</th>
              <th class="text-right">Qty</th>
              <th class="text-left">Supplier</th>
              <th class="text-right">Unit Cost</th>
              <th class="text-left">Expiry</th>
              <th class="text-right">Line Total</th>
              <th class="text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in draft.items" :key="item.id">
              <td>{{ item.product_name }}</td>
              <td class="text-right">{{ item.qty }}</td>
              <td>{{ item.supplier_name ?? '—' }}</td>
              <td class="text-right">{{ item.unit_price ? formatCurrency(item.unit_price) : '—' }}</td>
              <td>{{ item.expiry_date ?? '—' }}</td>
              <td class="text-right">{{ item.unit_price ? formatCurrency(item.unit_price * item.qty) : '—' }}</td>
              <td>
                <v-chip :color="item.selected_supplier_offer_id ? 'success' : 'error'" size="small" label>
                  {{ item.selected_supplier_offer_id ? 'Qualified' : 'Missing supplier' }}
                </v-chip>
              </td>
            </tr>
          </tbody>
        </v-table>

        <div class="text-right mt-4 text-h6 font-weight-bold">
          Total Estimate: {{ formatCurrency(totalEstimate) }}
        </div>
      </v-card-text>
      <v-divider />
      <v-card-actions class="pa-4">
        <v-spacer />
        <v-btn
          color="success" variant="flat" class="text-none font-weight-bold"
          :loading="submitting" :disabled="hasBlockingIssues" @click="onSubmit">
          {{ warnings.length && !confirmedOnce ? 'Review Warnings & Continue' : 'Submit Purchase Requisition' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
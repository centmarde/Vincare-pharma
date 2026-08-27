<script setup lang="ts">
import { watch, computed } from 'vue'
import { useDraftPRReview } from '../composables/useDraftPRReview'
import { useTheme } from '@/stores/useTheme'
import type { DraftPRItemType } from '@/stores/draftPRData'
import { formatCurrency, formatExpiryMonthYear } from '@/utils/helpers'
import { useDisplay } from 'vuetify'

const { mobile } = useDisplay()
const props = defineProps<{ modelValue: boolean; draftId: number | null; readonly?: boolean }>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'submitted', prId: number): void
  (e: 'edit'): void
}>()

const { draft, warnings, checking, submitting, warningsExpanded, totalEstimate, hasBlockingIssues,
  disqualifiedItemIds, load, submit } = useDraftPRReview(() => props.draftId)

const { getCurrentTheme } = useTheme()
const isDark = computed<'light' | 'dark'>(() => getCurrentTheme())
// The toggle button sits inside an `info` alert, so it would otherwise inherit the
// alert's text color. Force it to black in light mode / white in dark mode.
const toggleButtonColor = computed(() => (isDark.value === 'dark' ? 'white' : 'black'))

watch(() => props.modelValue, (open) => { if (open) load() })


function rowStatus(item: DraftPRItemType) {
  if (!item.selected_supplier_offer_id) return { color: 'error', text: 'Missing supplier' }
  if (disqualifiedItemIds.value.includes(item.id)) return { color: 'error', text: 'No longer qualifies' }
  return { color: 'success', text: 'Qualified' }
}


async function onSubmit() {
  const result = await submit()
  if (result.success && (result as any).pr_id) {
    emit('submitted', (result as any).pr_id)
    emit('update:modelValue', false)
  }
}
</script>

<template>
  <v-dialog
    :model-value="modelValue" :max-width="mobile ? undefined : 960" :fullscreen="mobile"
    scrollable @update:model-value="emit('update:modelValue', $event)">
    <v-card v-if="draft" rounded="lg">
      <v-card-title class="pa-4 pb-2 d-flex justify-space-between align-start" style="gap:8px">
        <div style="min-width:0">
          <div class="text-h6 font-weight-bold text-truncate">Review Draft PR #{{ draft.id }}</div>
          <div class="text-caption text-medium-emphasis" :class="{ 'text-truncate': mobile }">{{ draft.remarks }}</div>
        </div>
        <v-btn icon="mdi-close" variant="text" size="small" @click="emit('update:modelValue', false)" />
      </v-card-title>
      <v-divider />
      <v-card-text class="pa-4">
        <v-progress-linear v-if="checking" indeterminate class="mb-3" />

        <v-alert v-if="hasBlockingIssues" type="error" variant="tonal" density="compact" class="mb-3">
          Every item needs a selected, qualifying supplier before this can be submitted.
        </v-alert>

        <!-- Foldable: these are advisory. The red alert above is not, because it
             explains why the submit button is disabled. -->
        <v-alert v-if="warnings.length" type="info" variant="tonal" density="compact" class="mb-3">
          <div class="d-flex align-center justify-space-between" style="gap:8px">
            <span class="font-weight-bold">
              {{ warnings.length }} suggestion(s){{ warnings.length > 1 ? 's' : '' }}
            </span>
            <v-btn
              variant="text" size="small" :color="toggleButtonColor"
              :append-icon="warningsExpanded ? 'mdi-chevron-up' : 'mdi-chevron-down'"
              @click="warningsExpanded = !warningsExpanded">
              {{ warningsExpanded ? 'Hide' : 'Show' }}
            </v-btn>
          </div>
          <div v-if="warningsExpanded" class="mt-1">
            <div v-for="w in warnings" :key="w.item_id">{{ w.message }}</div>
          </div>
        </v-alert>

        <div class="table-scroll">
        <v-table density="compact">
          <thead>
            <tr>
              <th class="text-left">Product</th>
              <th class="text-right">Shortfall</th>
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
              <td class="text-right text-medium-emphasis">{{ item.shortfall_qty ?? '—' }}</td>
              <td class="text-right">{{ item.qty }}</td>
              <td>{{ item.supplier_name ?? '—' }}</td>
              <td class="text-right">{{ item.unit_price ? formatCurrency(item.unit_price) : '—' }}</td>
              <td class="expiry-cell">{{ formatExpiryMonthYear(item.expiry_date) }}</td>
              <td class="text-right">{{ item.unit_price ? formatCurrency(item.unit_price * item.qty) : '—' }}</td>
              <td>
                <v-chip :color="rowStatus(item).color" size="small" label>
                  {{ rowStatus(item).text }}
                </v-chip>
              </td>
            </tr>
          </tbody>
        </v-table>
        </div>

        <div class="text-right mt-4 text-h6 font-weight-bold">
          Total Estimate: {{ formatCurrency(totalEstimate) }}
        </div>
      </v-card-text>
      <v-divider />
      <v-card-actions class="pa-4" :class="mobile ? 'flex-column-reverse ga-2' : ''">
        <!-- Compare lives on the edit page — this is how a warning gets acted on. -->
        <v-btn variant="text" class="text-none" :block="mobile" prepend-icon="mdi-arrow-left" @click="emit('edit')">
          Back to Edit
        </v-btn>
        <v-spacer v-if="!mobile" />
        <v-btn
          color="success" variant="flat" class="text-none font-weight-bold" :block="mobile"
          :loading="submitting" :disabled="hasBlockingIssues || checking || readonly" @click="onSubmit">
          Submit Purchase Requisition
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
<style scoped>
.expiry-cell {
  white-space: normal;
  min-width: 110px;
  line-height: 1.3;
}

.table-scroll {
  overflow-x: auto;
}
</style>
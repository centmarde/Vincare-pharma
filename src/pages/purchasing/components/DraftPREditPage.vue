<script setup lang="ts">
import { ref, watch } from 'vue'
import { useDraftPRDataStore, type DraftPRItemType } from '@/stores/draftPRData'
import SupplierCompareDialog from './dialogs/SupplierCompareDialog.vue'
import { formatCurrency } from '@/utils/helpers'

const props = defineProps<{ modelValue: boolean; draftId: number | null }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void; (e: 'continue'): void }>()

const draftStore = useDraftPRDataStore()

watch(() => props.draftId, (id) => { if (id != null) draftStore.fetchDraft(id) })

// ── Item-row Compare logic (was DraftPRItemsList.vue) ──────────────────────
const showCompare = ref(false)
const activeItem = ref<DraftPRItemType | null>(null)

function openCompare(item: DraftPRItemType) {
  activeItem.value = item
  showCompare.value = true
}

async function onConfirm(payload: any) {
  if (!activeItem.value) return
  await draftStore.selectOffer({
    itemId: activeItem.value.id, offer: payload.offer,
    consideredOffers: payload.consideredOffers, justification: payload.justification,
  })
}

async function onDateChange(item: DraftPRItemType, date: string) {
  await draftStore.setRequiredByDate(item.id, date || null)
}

const lineTotal = (item: DraftPRItemType) => (item.unit_price ?? 0) * item.qty
</script>

<template>
  <v-dialog :model-value="modelValue" max-width="960" scrollable @update:model-value="emit('update:modelValue', $event)">
    <v-card v-if="draftStore.currentDraft" rounded="lg">
      <v-card-title class="pa-4 pb-2 d-flex justify-space-between align-center">
        <div>
          <div class="text-h6 font-weight-bold">Draft PR #{{ draftStore.currentDraft.id }}</div>
          <div class="text-caption text-medium-emphasis">{{ draftStore.currentDraft.remarks }}</div>
        </div>
        <v-btn icon="mdi-close" variant="text" size="small" @click="emit('update:modelValue', false)" />
      </v-card-title>
      <v-divider />
      <v-card-text class="pa-4">
        <v-table density="comfortable">
          <thead>
            <tr>
              <th class="text-left">Product</th><th class="text-right" style="width:90px">Qty</th>
              <th style="width:160px">Required by</th><th class="text-left">Supplier</th>
              <th class="text-right">Unit Price</th><th class="text-right">Line Total</th><th style="width:110px"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in draftStore.currentDraft.items" :key="item.id">
              <td>{{ item.product_name }}</td>
              <td class="text-right">{{ item.qty }}</td>
              <td>
                <v-text-field :model-value="item.required_by_date" type="date" density="compact"
                  variant="outlined" hide-details @update:model-value="onDateChange(item, $event)" />
              </td>
              <td>
                <span v-if="item.supplier_name">{{ item.supplier_name }}</span>
                <span v-else class="text-medium-emphasis">Not selected</span>
              </td>
              <td class="text-right">{{ item.unit_price ? formatCurrency(item.unit_price) : '—' }}</td>
              <td class="text-right font-weight-bold">{{ item.unit_price ? formatCurrency(lineTotal(item)) : '—' }}</td>
              <td><v-btn size="small" variant="tonal" color="primary" class="text-none" @click="openCompare(item)">Compare</v-btn></td>
            </tr>
          </tbody>
        </v-table>
      </v-card-text>
      <v-divider />
      <v-card-actions class="pa-4">
        <v-spacer />
        <v-btn color="primary" variant="flat" class="text-none font-weight-bold" @click="emit('continue')">
          Continue to Review
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <SupplierCompareDialog
    v-model="showCompare"
    :product="activeItem ? { id: activeItem.product_id, name: activeItem.product_name } : null"
    :required-by-date="activeItem?.required_by_date ?? new Date().toISOString().slice(0,10)"
    @confirm="onConfirm" />
</template>
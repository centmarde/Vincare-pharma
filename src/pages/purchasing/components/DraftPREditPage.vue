<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useToast } from 'vue-toastification'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import { useDraftPRDataStore, type DraftPRItemType } from '@/stores/draftPRData'
import SupplierCompareDialog from './dialogs/SupplierCompareDialog.vue'
import { formatCurrency } from '@/utils/helpers'
import { checkQtyAgainstShortfall, bufferOver, MAX_QTY_MULTIPLE } from '@/utils/shortfall'

const toast = useToast()
const { confirmDialog } = useConfirmDialog()

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

const activeSelectedOffer = computed(() => {
  const item = activeItem.value
  if (!item?.selected_supplier_offer_id || item.supplier_id == null) return null
  return {
    id: item.selected_supplier_offer_id,
    supplier_id: item.supplier_id,
    supplier_name: item.supplier_name,
  }
})

async function onConfirm(payload: any) {
  if (!activeItem.value) return
  await draftStore.selectOffer({
    itemId: activeItem.value.id, offer: payload.offer,
    consideredOffers: payload.consideredOffers, justification: payload.justification,
  })
}

type ItemEdit = { qty: number; required_by_date: string | null }
const edits = ref<Record<number, ItemEdit>>({})
const saving = ref(false)

watch(() => draftStore.currentDraft?.items, (items) => {
  edits.value = Object.fromEntries((items ?? []).map((i) => [i.id, { qty: i.qty, required_by_date: i.required_by_date }]))
}, { immediate: true })

function onDateChange(item: DraftPRItemType, date: string) {
  const buf = edits.value[item.id]
  if (buf) buf.required_by_date = date || null
}

function onQtyChange(item: DraftPRItemType, value: number | string) {
  const qty = Number(value)
  if (!qty || qty <= 0) return
  const buf = edits.value[item.id]
  if (buf) buf.qty = qty
}

async function validateQty(item: DraftPRItemType) {
  const buf = edits.value[item.id]
  if (!buf) return
  const check = checkQtyAgainstShortfall(buf.qty, item.shortfall_qty)
  if (check.status === 'below') {
    toast.warning(`Quantity can't be below the shortfall (${check.floor}).`)
    buf.qty = check.floor
  } else if (check.status === 'over') {
    const ok = await confirmDialog(
      `Order ${buf.qty} (over ${MAX_QTY_MULTIPLE}x the shortfall of ${check.floor})?`,
      { title: 'Confirm large order quantity', confirmText: 'Order it', cancelText: 'Cancel' },
    )
    if (!ok) buf.qty = check.floor
  }
}

const bufferQty = (item: DraftPRItemType) =>
  bufferOver(edits.value[item.id]?.qty ?? item.qty, item.shortfall_qty)

async function flushEdits() {
  const items = draftStore.currentDraft?.items ?? []
  saving.value = true
  for (const item of items) {
    const buf = edits.value[item.id]
    if (!buf) continue
    const check = checkQtyAgainstShortfall(buf.qty, item.shortfall_qty)
    if (check.status === 'below') buf.qty = check.floor
    if (buf.qty !== item.qty) await draftStore.setQty(item.id, buf.qty)
    if (buf.required_by_date !== item.required_by_date) await draftStore.setRequiredByDate(item.id, buf.required_by_date)
  }
  saving.value = false
}

async function onDialogUpdate(open: boolean) {
  if (open) { emit('update:modelValue', true); return }
  await flushEdits()
  emit('update:modelValue', false)
}

async function continueToReview() {
  await flushEdits()
  emit('continue')
}

const lineTotal = (item: DraftPRItemType) => (item.unit_price ?? 0) * (edits.value[item.id]?.qty ?? item.qty)
</script>

<template>
  <v-dialog :model-value="modelValue" max-width="960" scrollable @update:model-value="onDialogUpdate">
    <v-card v-if="draftStore.currentDraft" rounded="lg">
      <v-card-title class="pa-4 pb-2 d-flex justify-space-between align-center">
        <div>
          <div class="text-h6 font-weight-bold">Edit Draft PR #{{ draftStore.currentDraft.id }}</div>
          <div class="text-caption text-medium-emphasis">{{ draftStore.currentDraft.remarks }}</div>
        </div>
        <v-btn icon="mdi-close" variant="text" size="small" :loading="saving" @click="onDialogUpdate(false)" />
      </v-card-title>
      <v-divider />
      <v-card-text class="pa-4">
        <v-table density="comfortable">
          <thead>
            <tr>
              <th class="text-left">Product</th>
              <th class="text-right" style="width:90px">Shortfall</th>
              <th class="text-right" style="width:140px">Qty</th>
              <th style="width:160px">Required by</th><th class="text-left">Supplier</th>
              <th class="text-right">Unit Price</th><th class="text-right">Line Total</th><th style="width:110px"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in draftStore.currentDraft.items" :key="item.id">
              <td>{{ item.product_name }}</td>
              <td class="text-right">{{ item.shortfall_qty ?? '—' }}</td>
              <td class="text-right">
                <div class="d-flex align-center justify-end" style="gap:6px">
                  <v-text-field :model-value="edits[item.id]?.qty ?? item.qty" type="number"
                    :min="item.shortfall_qty ?? 1" density="compact"
                    variant="outlined" hide-details style="width:100%; min-width:0"
                    @update:model-value="onQtyChange(item, $event)" @blur="validateQty(item)" />
                  <v-chip v-if="bufferQty(item) > 0" color="info" variant="tonal" size="x-small" label>
                    +{{ bufferQty(item) }}
                  </v-chip>
                </div>
              </td>
              <td>
                <v-text-field :model-value="edits[item.id]?.required_by_date ?? item.required_by_date" type="date" density="compact"
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
        <v-btn variant="tonal" class="text-none font-weight-bold" :loading="saving" @click="onDialogUpdate(false)">
          Save &amp; Close
        </v-btn>
        <v-btn color="primary" variant="flat" class="text-none font-weight-bold" :loading="saving" @click="continueToReview">
          Continue to Review
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <SupplierCompareDialog
    v-model="showCompare"
    :product="activeItem ? { id: activeItem.product_id, name: activeItem.product_name } : null"
    :required-by-date="activeItem?.required_by_date ?? new Date().toISOString().slice(0,10)"
    :qty="activeItem ? (edits[activeItem.id]?.qty ?? activeItem.qty) : 1"
    :min-qty="activeItem?.shortfall_qty ?? undefined"
    :selected-offer="activeSelectedOffer"
    :initial-justification="activeItem?.justification"
    @confirm="onConfirm"
    @update:qty="activeItem && onQtyChange(activeItem, $event)" />
</template>
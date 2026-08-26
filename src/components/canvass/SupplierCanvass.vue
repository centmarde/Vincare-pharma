<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useCanvass } from './useCanvass'
import SupplierCompareDialog from '@/pages/purchasing/components/dialogs/SupplierCompareDialog.vue'
import type { CanvassableOrder, Shortfall, CanvassCommitFn } from '@/utils/canvassTypes'
import { formatCurrency } from '@/utils/helpers'

const props = defineProps<{
  order: CanvassableOrder | null
  shortfall: Shortfall[]
  commitFn: CanvassCommitFn
  orderType: 'inhouse_order' | 'ethical_order'
  initialQty?: Record<number, number>
}>()
const emit = defineEmits<{ (e: 'created'): void; (e: 'draft-saved', draftId: number): void }>()


const { loading, rows, onOfferSelected, validateQty, bufferQty, lineTotal, canCommit, prPreview, commit, saveAsDraft, init } =
  useCanvass(() => props.order, () => props.shortfall, props.commitFn, () => emit('created'), () => props.orderType, () => props.initialQty)

onMounted(init)

const showCompare = ref(false)
const activeRowIdx = ref<number | null>(null)

function openCompare(idx: number) { activeRowIdx.value = idx; showCompare.value = true }
function onConfirm(payload: any) { if (activeRowIdx.value != null) onOfferSelected(activeRowIdx.value, payload) }
async function onSaveAsDraft() {
  const result = await saveAsDraft()
  if (result.success && (result as any).draftId) emit('draft-saved', (result as any).draftId)
}
</script>

<template>
  <div>
    <div class="text-caption text-medium-emphasis mb-3">
      Compare suppliers per item — the cheapest offer with at least 18 months past the required-by date qualifies.
      One Purchase Requisition is raised per winning supplier, or save this as a Draft PR to finish later.
    </div>

    <v-table density="comfortable" class="mb-3">
      <thead>
        <tr>
          <th class="text-left">Product</th><th class="text-right" style="width:90px">Shortfall</th>
          <th class="text-right" style="width:110px">Order Qty</th><th class="text-left">Supplier</th>
          <th class="text-right">Price/Unit</th><th class="text-left">Expiry</th>
          <th class="text-right">Line Total</th><th style="width:110px"></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, idx) in rows" :key="row.product_id">
          <td>{{ row.product_name }}</td>
          <td class="text-right">{{ row.shortfall_qty }}</td>
          <td>
            <v-text-field v-model.number="row.order_qty" type="number" :min="row.shortfall_qty"
              density="compact" variant="outlined" hide-details style="max-width:100px" @blur="validateQty(idx)" />
            <v-chip v-if="bufferQty(row) > 0" color="info" size="x-small" label class="mt-1">+{{ bufferQty(row) }}</v-chip>
          </td>
          <td><span v-if="row.selected_offer">{{ row.selected_offer.supplier_name }}</span><span v-else class="text-medium-emphasis">Not selected</span></td>
          <td class="text-right">{{ row.selected_offer ? formatCurrency(row.selected_offer.cost_price_per_unit) : '—' }}</td>
          <td>{{ row.selected_offer?.expiry_date ?? '—' }}</td>
          <td class="text-right font-weight-bold">{{ row.selected_offer ? formatCurrency(lineTotal(row)) : '—' }}</td>
          <td><v-btn size="small" variant="tonal" color="primary" class="text-none" @click="openCompare(idx)">Compare</v-btn></td>
        </tr>
      </tbody>
    </v-table>

    <v-card v-if="prPreview.length" variant="tonal" color="success" rounded="lg" class="mb-3">
      <v-card-text class="pa-3">
        <div class="text-caption font-weight-bold mb-1">Will raise {{ prPreview.length }} purchase requisition(s):</div>
        <div v-for="p in prPreview" :key="p.supplier_id" class="d-flex justify-space-between text-caption">
          <span>{{ p.name }} — {{ p.items }} item(s)</span><span class="font-weight-bold">{{ formatCurrency(p.total) }}</span>
        </div>
      </v-card-text>
    </v-card>

    <div class="d-flex justify-end" style="gap:8px">
      <v-btn variant="tonal" color="secondary" size="small" class="text-none font-weight-bold" :loading="loading" @click="onSaveAsDraft">
        Save as Draft PR
      </v-btn>
      <v-btn color="success" size="small" class="text-none font-weight-bold" elevation="0" :loading="loading" :disabled="!canCommit" @click="commit">
        Raise Purchase Requisition(s)
      </v-btn>
    </div>

    <SupplierCompareDialog
      v-model="showCompare"
      :product="activeRowIdx != null ? { id: rows[activeRowIdx].product_id, name: rows[activeRowIdx].product_name } : null"
      :required-by-date="activeRowIdx != null ? rows[activeRowIdx].required_by_date : new Date().toISOString().slice(0,10)"
      @confirm="onConfirm" />
  </div>
</template>
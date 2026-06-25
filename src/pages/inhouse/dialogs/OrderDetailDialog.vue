<script setup lang="ts">
import { useOrderDetail } from '../composables/useOrderDetail'
import SupplierCanvass from '../components/SupplierCanvass.vue'
import type { InhouseOrderType } from '@/stores/inhouseData'
import { formatCurrency, formatDatePR_ISO } from '@/utils/helpers'

const props = defineProps<{
  modelValue: boolean
  order: InhouseOrderType | null
}>()
const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'changed'): void
}>()

const {
  loading, rounds, shortfall, lineEdits, offerNote, deliverQtys, payAmount,
  items, isNegotiating, isAwaitingStock, isReady, isDelivered, isPaid,
  proposedTotal, deliveredPct, remaining,
  recordCounter, agree, recheck, deliver, markPaid,
} = useOrderDetail(() => props.order, () => emit('changed'))

const productName = (id: number | null) =>
  items.value.find((i) => i.product_id === id)?.product?.product_name ?? `#${id}`
</script>

<template>
  <v-dialog :model-value="modelValue" max-width="920" scrollable
    @update:model-value="emit('update:modelValue', $event)">
    <v-card rounded="lg" v-if="order">
      <v-card-title class="pa-5 pb-2 d-flex justify-space-between align-center">
        <div>
          <div class="text-h6 font-weight-bold">{{ order.order_no }}</div>
          <div class="text-caption text-medium-emphasis">
            {{ order.customer?.name ?? '—' }} · Govt PO: {{ order.govt_po_no ?? '—' }}
          </div>
        </div>
        <v-btn icon="mdi-close" variant="text" size="small" @click="emit('update:modelValue', false)" />
      </v-card-title>
      <v-divider />

      <v-card-text class="pa-5">
        <!-- delivery progress -->
        <div class="d-flex justify-space-between text-body-2 mb-1">
          <span class="font-weight-medium">Delivery progress</span><span>{{ deliveredPct }}%</span>
        </div>
        <v-progress-linear :model-value="deliveredPct" height="8" rounded color="teal" class="mb-4" />

        <!-- ── NEGOTIATION ─────────────────────────────── -->
        <v-card variant="outlined" rounded="lg" class="mb-4">
          <v-card-title class="text-subtitle-2 font-weight-bold pa-3">Negotiation</v-card-title>
          <v-divider />
          <v-card-text class="pa-3">
            <div v-if="rounds.length" class="mb-3">
              <div v-for="r in rounds" :key="r.id" class="d-flex justify-space-between text-caption py-1" style="border-bottom:1px solid #eee">
                <span><b class="text-uppercase">{{ r.action }}</b> — {{ r.description }}</span>
                <span class="text-medium-emphasis">{{ formatDatePR_ISO(r.created_at) }}</span>
              </div>
            </div>
            <div v-else class="text-caption text-medium-emphasis mb-2">No rounds yet — the customer's initial offer is the order total.</div>

            <template v-if="isNegotiating">
              <div class="text-caption font-weight-bold mb-1">Counter-offer (edit per-unit prices)</div>
              <v-table density="compact">
                <thead><tr><th class="text-left">Product</th><th class="text-right">Qty</th><th class="text-right" style="width:140px">Offer/Unit</th><th class="text-right">Cost/Unit</th></tr></thead>
                <tbody>
                  <tr v-for="it in items" :key="it.id">
                    <td>{{ productName(it.product_id) }}</td>
                    <td class="text-right">{{ it.qty }}</td>
                    <td><v-text-field v-model.number="lineEdits[it.id]" type="number" min="0" prefix="₱" variant="outlined" density="compact" hide-details /></td>
                    <td class="text-right text-medium-emphasis">{{ formatCurrency(it.cost_price ?? 0) }}</td>
                  </tr>
                </tbody>
              </v-table>
              <div class="d-flex justify-space-between text-body-2 font-weight-bold mt-2">
                <span>Proposed total</span><span>{{ formatCurrency(proposedTotal) }}</span>
              </div>
              <v-textarea v-model="offerNote" placeholder="Note (optional)" variant="outlined" density="compact" rows="2" hide-details class="mt-2" />
              <div class="d-flex justify-end mt-2" style="gap:8px">
                <v-btn variant="outlined" size="small" class="text-none" :loading="loading" @click="recordCounter">Record Counter-Offer</v-btn>
                <v-btn color="success" size="small" class="text-none font-weight-bold" elevation="0" :loading="loading" @click="agree">Agree (Lock Terms)</v-btn>
              </div>
            </template>
            <div v-else class="text-body-2">
              Agreed total: <b>{{ formatCurrency(order.total_amount ?? 0) }}</b>
            </div>
          </v-card-text>
        </v-card>

        <!-- ── STOCK / SHORTFALL ───────────────────────── -->
        <v-card v-if="isAwaitingStock" variant="outlined" rounded="lg" class="mb-4" color="orange-lighten-5">
          <v-card-title class="text-subtitle-2 font-weight-bold pa-3">Insufficient Stock</v-card-title>
          <v-divider />
          <v-card-text class="pa-3">
            <div class="text-caption text-medium-emphasis mb-2">The purchaser needs to procure the following before fulfillment:</div>
            <v-table density="compact">
              <thead><tr><th class="text-left">Product</th><th class="text-right">Ordered</th><th class="text-right">On hand</th><th class="text-right">Needed</th></tr></thead>
              <tbody>
                <tr v-for="s in shortfall" :key="s.product_id">
                  <td>{{ productName(s.product_id) }}</td><td class="text-right">{{ s.ordered }}</td>
                  <td class="text-right">{{ s.on_hand }}</td><td class="text-right text-error font-weight-bold">{{ s.needed }}</td>
                </tr>
              </tbody>
            </v-table>
            <div class="text-caption text-medium-emphasis mt-2">Canvass suppliers below to auto-raise Purchase Requisitions, then re-check once stock arrives.</div>
            <v-btn variant="text" size="small" color="info" class="text-none mt-1" @click="recheck">Re-check stock</v-btn>

            <v-divider class="my-3" />
            <div class="text-subtitle-2 font-weight-bold mb-2">Supplier Canvass</div>
            <SupplierCanvass :order="order" :shortfall="shortfall" @created="recheck" />
          </v-card-text>
        </v-card>

        <!-- ── FULFILLMENT ─────────────────────────────── -->
        <v-card v-if="isReady || isDelivered || isPaid" variant="outlined" rounded="lg">
          <v-card-title class="text-subtitle-2 font-weight-bold pa-3">Fulfillment</v-card-title>
          <v-divider />
          <v-card-text class="pa-3">
            <v-table density="compact">
              <thead><tr><th class="text-left">Product</th><th class="text-right">Ordered</th><th class="text-right">Delivered</th><th class="text-right">Remaining</th><th v-if="isReady" class="text-right" style="width:130px">Deliver now</th></tr></thead>
              <tbody>
                <tr v-for="it in items" :key="it.id">
                  <td>{{ productName(it.product_id) }}</td>
                  <td class="text-right">{{ it.qty }}</td>
                  <td class="text-right">{{ it.delivered_qty ?? 0 }}</td>
                  <td class="text-right">{{ remaining(it.id) }}</td>
                  <td v-if="isReady"><v-text-field v-model.number="deliverQtys[it.id]" type="number" min="0" :max="remaining(it.id)" variant="outlined" density="compact" hide-details /></td>
                </tr>
              </tbody>
            </v-table>

            <div v-if="isReady" class="d-flex justify-end mt-2">
              <v-btn color="teal" size="small" class="text-none font-weight-bold" elevation="0" :loading="loading" @click="deliver">Record Delivery</v-btn>
            </div>

            <template v-if="isDelivered">
              <v-divider class="my-3" />
              <div class="text-body-2 mb-1 text-success font-weight-medium">Fully delivered — government may now pay.</div>
              <div class="d-flex align-center justify-end" style="gap:8px">
                <v-text-field v-model.number="payAmount" type="number" prefix="₱" label="Amount paid" variant="outlined" density="compact" hide-details style="max-width:200px" />
                <v-btn color="success" size="small" class="text-none font-weight-bold" elevation="0" :loading="loading" @click="markPaid">Mark Paid</v-btn>
              </div>
            </template>

            <div v-if="isPaid" class="text-body-2 text-success font-weight-bold mt-2">
              PAID — {{ formatCurrency(order.amount_paid ?? 0) }} on {{ order.paid_at ? formatDatePR_ISO(order.paid_at) : '—' }}
            </div>
          </v-card-text>
        </v-card>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

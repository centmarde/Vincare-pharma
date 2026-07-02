<script setup lang="ts">
import { useOrderDetail } from '../composables/useOrderDetail'
import SupplierCanvass from '@/components/canvass/SupplierCanvass.vue'
import { useInhouseDataStore, type InhouseOrderType } from '@/stores/inhouseData'
import { formatCurrency, formatDatePR_ISO } from '@/utils/helpers'

const inhouse = useInhouseDataStore()

const props = defineProps<{
  modelValue: boolean
  order: InhouseOrderType | null
}>()
const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'changed'): void
}>()

const {
  loading, rounds, shortfall, payments, lineEdits, lineProductEdits, lineCostEdits, productOptions, offerNote, deliverQtys,
  payAmount, payReference, payRemarks,
  items, isNegotiating, isAwaitingStock, isReady, isDelivered, isPartiallyPaid, isPaid, canRecordPayment,
  proposedTotal, proposedCost, proposedProfit, proposedMarginPct, deliveredPct, remaining, balance, paidPct,
  onLineProductChange, recordCounter, agree, recheck, deliver, recordPayment,
} = useOrderDetail(() => props.order, () => emit('changed'))

const productName = (id: number | null) =>
  items.value.find((i) => i.product_id === id)?.product?.product_name ?? `#${id}`
</script>

<template>
  <v-dialog :model-value="modelValue" max-width="920" scrollable
    @update:model-value="emit('update:modelValue', $event)">
    <v-card rounded="lg" v-if="order">
      <v-card-title class="pa-4 pa-sm-5 pb-2 d-flex justify-space-between align-center">
        <div>
          <div class="text-h6 font-weight-bold">{{ order.order_no }}</div>
          <div class="text-caption text-medium-emphasis">
            {{ order.customer?.name ?? '—' }} · Govt PO: {{ order.govt_po_no ?? '—' }}
          </div>
        </div>
        <v-btn icon="mdi-close" variant="text" size="small" @click="emit('update:modelValue', false)" />
      </v-card-title>
      <v-divider />

      <v-card-text class="pa-4 pa-sm-5">
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
              <div class="text-caption font-weight-bold mb-1">Counter-offer (swap products, edit per-unit prices)</div>
              <v-table density="compact">
                <thead><tr><th class="text-left">Product</th><th class="text-right" style="width:90px">Qty</th><th class="text-right" style="width:140px">Offer/Unit</th><th class="text-right" style="width:110px">Cost/Unit</th></tr></thead>
                <tbody>
                  <tr v-for="it in items" :key="it.id">
                    <td>
                      <v-select
                        v-model="lineProductEdits[it.id]"
                        :items="productOptions"
                        item-title="title"
                        item-value="value"
                        variant="outlined"
                        density="compact"
                        hide-details
                        @update:model-value="onLineProductChange(it.id)"
                      />
                    </td>
                    <td class="text-right">{{ it.qty }}</td>
                    <td><v-text-field v-model.number="lineEdits[it.id]" type="number" min="0" prefix="₱" variant="outlined" density="compact" hide-details /></td>
                    <td class="text-right text-medium-emphasis">{{ formatCurrency(lineCostEdits[it.id] ?? it.cost_price ?? 0) }}</td>
                  </tr>
                </tbody>
              </v-table>
              <div class="text-caption text-medium-emphasis mt-1">
                Swapping a product re-snapshots its cost so the profit below stays accurate — the offer price is left for you to adjust.
              </div>

              <v-row class="mt-2" justify="end">
                <v-col cols="12" md="6">
                  <div class="d-flex justify-space-between text-body-2">
                    <span>Proposed total</span><span>{{ formatCurrency(proposedTotal) }}</span>
                  </div>
                  <div class="d-flex justify-space-between text-body-2 text-medium-emphasis">
                    <span>Company Cost Total</span><span>{{ formatCurrency(proposedCost) }}</span>
                  </div>
                  <v-divider class="my-1" />
                  <div class="d-flex justify-space-between text-body-1 font-weight-bold" :class="proposedProfit >= 0 ? 'text-success' : 'text-error'">
                    <span>Projected Profit ({{ proposedMarginPct }}%)</span><span>{{ formatCurrency(proposedProfit) }}</span>
                  </div>
                </v-col>
              </v-row>

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
        <v-card v-if="isAwaitingStock" variant="outlined" rounded="lg" class="mb-4 bg-orange-lighten-5">
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
            <SupplierCanvass :order="order" :shortfall="shortfall" :commit-fn="inhouse.canvassToPRs" @created="recheck" />
          </v-card-text>
        </v-card>

        <!-- ── FULFILLMENT ─────────────────────────────── -->
        <v-card v-if="isReady || isDelivered || isPartiallyPaid || isPaid" variant="outlined" rounded="lg" class="mb-4">
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
          </v-card-text>
        </v-card>

        <!-- ── PAYMENT (in terms — partial/installment, not just cash) ──── -->
        <v-card v-if="isDelivered || isPartiallyPaid || isPaid" variant="outlined" rounded="lg">
          <v-card-title class="text-subtitle-2 font-weight-bold pa-3">Payment</v-card-title>
          <v-divider />
          <v-card-text class="pa-3">
            <div class="d-flex justify-space-between text-body-2 mb-1">
              <span class="font-weight-medium">Payment progress</span>
              <span>{{ formatCurrency(order.amount_paid ?? 0) }} / {{ formatCurrency(order.total_amount ?? 0) }} ({{ paidPct }}%)</span>
            </div>
            <v-progress-linear :model-value="paidPct" height="8" rounded :color="isPaid ? 'success' : 'amber'" class="mb-3" />

            <div v-if="payments.length" class="mb-3">
              <div v-for="p in payments" :key="p.id" class="d-flex justify-space-between text-caption py-1" style="border-bottom:1px solid #eee">
                <span>
                  <b>{{ formatCurrency(p.amount ?? 0) }}</b>
                  <span v-if="p.reference_no" class="text-medium-emphasis"> — Ref: {{ p.reference_no }}</span>
                  <span v-if="p.remarks" class="text-medium-emphasis"> ({{ p.remarks }})</span>
                </span>
                <span class="text-medium-emphasis">{{ formatDatePR_ISO(p.created_at) }}</span>
              </div>
            </div>

            <template v-if="canRecordPayment">
              <v-divider v-if="payments.length" class="my-2" />
              <div class="text-caption font-weight-bold mb-1">
                {{ isPartiallyPaid ? 'Record next tranche' : 'Record payment (in full or in terms)' }}
                — outstanding: {{ formatCurrency(balance) }}
              </div>
              <v-row dense>
                <v-col cols="4">
                  <v-text-field v-model.number="payAmount" type="number" min="0" :max="balance" prefix="₱" label="Amount" variant="outlined" density="compact" hide-details />
                </v-col>
                <v-col cols="4">
                  <v-text-field v-model="payReference" label="Reference / OR #" variant="outlined" density="compact" hide-details />
                </v-col>
                <v-col cols="4">
                  <v-text-field v-model="payRemarks" label="Remarks (optional)" variant="outlined" density="compact" hide-details />
                </v-col>
              </v-row>
              <div class="d-flex justify-end mt-2">
                <v-btn color="success" size="small" class="text-none font-weight-bold" elevation="0" :loading="loading"
                  :disabled="!payAmount || payAmount <= 0 || payAmount > balance" @click="recordPayment">
                  Record Payment
                </v-btn>
              </div>
            </template>

            <div v-if="isPaid" class="text-body-2 text-success font-weight-bold mt-2">
              PAID IN FULL — last payment on {{ order.paid_at ? formatDatePR_ISO(order.paid_at) : '—' }}
            </div>
          </v-card-text>
        </v-card>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

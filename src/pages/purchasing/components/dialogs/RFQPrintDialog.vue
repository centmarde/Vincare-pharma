<script setup lang="ts">
import { onMounted, watch } from 'vue'
import type { ProcurementRequestType } from '@/stores/procurementData'
import { useRFQPrint } from '../../composables/useRFQPrint'

const props = defineProps<{
  modelValue: boolean
  request: ProcurementRequestType | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  /** Buffer quantities, so the canvass prices what was actually asked for. */
  (e: 'quantities', value: Record<number, number>): void
}>()

const {
  printArea, generating,
  companyKey, company, companyOptions,
  supplierId, supplierOptions, supplierName,
  showQuantity, remarks, quantities, lines, rfqNo, totalUnits,
  overBufferLines, belowShortfallLines,
  printRFQ, init,
} = useRFQPrint(() => props.request)

// Whatever the purchaser asked the supplier to cost is what the canvass should
// price — otherwise the paper says 300 and the quote gets entered against 100.
watch(quantities, (q) => emit('quantities', { ...q }), { deep: true })

const printedDate = new Date().toLocaleDateString('en-PH', {
  month: 'short', day: '2-digit', year: 'numeric',
})

onMounted(init)
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="980"
    scrollable
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card v-if="request" rounded="lg">
      <v-card-title class="pa-4 d-flex align-center ga-2">
        <v-icon icon="mdi-file-document-edit-outline" color="primary" />
        <span class="text-h6 font-weight-bold">Request for Quotation — {{ rfqNo }}</span>
      </v-card-title>

      <v-divider />

      <v-card-text class="pa-4">
        <v-alert type="info" variant="tonal" density="compact" class="mb-4">
          Prices are left blank for the supplier to fill in — this asks for costing,
          it does not order anything. The reference number is derived from
          {{ request.order_no }} and is not stored, so keep the sheet.
        </v-alert>

        <v-row dense class="mb-2">
          <v-col cols="12" sm="4">
            <v-select
              v-model="companyKey"
              :items="companyOptions"
              label="Issuing company"
              variant="outlined"
              density="compact"
              hide-details
            />
          </v-col>
          <v-col cols="12" sm="5">
            <v-select
              v-model="supplierId"
              :items="supplierOptions"
              label="Address to (optional)"
              placeholder="Leave blank to photocopy for several suppliers"
              variant="outlined"
              density="compact"
              clearable
              hide-details
            />
          </v-col>
          <v-col cols="12" sm="3" class="d-flex align-center">
            <v-switch
              v-model="showQuantity"
              label="Show quantity"
              color="primary"
              density="compact"
              hide-details
            />
          </v-col>
        </v-row>

        <v-alert
          v-if="!showQuantity"
          type="warning"
          variant="tonal"
          density="compact"
          class="mb-3"
        >
          Without quantities a supplier will usually quote list price rather than a
          volume price, and two quotes can't be compared on equal terms.
        </v-alert>

        <v-alert
          v-if="belowShortfallLines.length"
          type="warning"
          variant="tonal"
          density="compact"
          class="mb-3"
        >
          {{ belowShortfallLines.length }} line(s) are below the shortfall — the order
          will still be short even if this quantity is delivered in full.
        </v-alert>

        <v-alert
          v-if="overBufferLines.length"
          type="warning"
          variant="tonal"
          density="compact"
          class="mb-3"
        >
          {{ overBufferLines.length }} line(s) are over 3x the shortfall. Deliberate
          buffer is fine — just check it isn't a typo.
        </v-alert>

        <div class="text-caption text-medium-emphasis mb-1">
          Quantity starts at the shortfall. Raise it to ask for buffer or bulk pricing.
        </div>

        <v-table density="compact" class="mb-3">
          <thead>
            <tr>
              <th class="text-left">Product</th>
              <th class="text-right" style="width: 120px">Shortfall</th>
              <th class="text-right" style="width: 150px">Quantity to cost</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="line in lines" :key="line.item_id">
              <td>{{ line.product_name }}</td>
              <td class="text-right text-medium-emphasis">{{ line.needed }}</td>
              <td>
                <v-text-field
                  v-model.number="quantities[line.item_id]"
                  type="number"
                  min="0"
                  variant="outlined"
                  density="compact"
                  hide-details
                />
              </td>
            </tr>
          </tbody>
        </v-table>

        <v-textarea
          v-model="remarks"
          label="Notes to the supplier (optional)"
          placeholder="e.g. Please quote batch expiry. Delivery to Butuan City."
          rows="2"
          variant="outlined"
          density="compact"
          hide-details
          class="mb-4"
        />

        <v-divider class="mb-4" />

        <!-- The printed sheet -->
        <div ref="printArea" class="rfq">
          <div class="rfq-head">
            <div>
              <div class="rfq-co">{{ company.name }}</div>
              <div class="rfq-fine">{{ company.line1 }}</div>
              <div class="rfq-fine">{{ company.line2 }}</div>
              <div v-if="company.license" class="rfq-fine">{{ company.license }}</div>
              <div class="rfq-fine">{{ company.contact }}</div>
            </div>
            <div class="text-right">
              <div class="rfq-title">REQUEST FOR QUOTATION</div>
              <div class="rfq-fine"><strong>RFQ No.:</strong> {{ rfqNo }}</div>
              <div class="rfq-fine"><strong>Date:</strong> {{ printedDate }}</div>
            </div>
          </div>

          <div class="rfq-vendor">
            <div class="rfq-vendor-label">SUPPLIER</div>
            <div class="rfq-vendor-body">
              <div v-if="supplierName" class="rfq-value">{{ supplierName }}</div>
              <template v-else>
                <div class="rfq-blank"></div>
                <div class="rfq-blank"></div>
              </template>
            </div>
          </div>

          <div class="rfq-note">
            Please quote your best price and the batch expiry for each item below,
            then return this sheet. This is a request for costing only and is not a
            purchase order.
          </div>

          <table class="rfq-table">
            <thead>
              <tr>
                <th style="width: 34px">#</th>
                <th class="text-left">ITEM DESCRIPTION</th>
                <th v-if="showQuantity" style="width: 70px">QTY</th>
                <th style="width: 100px">UNIT PRICE</th>
                <th style="width: 100px">TOTAL</th>
                <th style="width: 92px">BATCH EXPIRY</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(line, i) in lines" :key="line.item_id">
                <td class="text-center">{{ i + 1 }}</td>
                <td>{{ line.product_name }}</td>
                <td v-if="showQuantity" class="text-center">{{ line.qty }}</td>
                <td></td>
                <td></td>
                <td></td>
              </tr>
              <!-- Ruled blanks so the sheet reads as a form, not a short list -->
              <tr v-for="n in Math.max(0, 10 - lines.length)" :key="`blank-${n}`">
                <td>&nbsp;</td>
                <td></td>
                <td v-if="showQuantity"></td>
                <td></td>
                <td></td>
                <td></td>
              </tr>
            </tbody>
          </table>

          <div v-if="remarks" class="rfq-remarks"><strong>Notes:</strong> {{ remarks }}</div>

          <div class="rfq-sign">
            <div class="rfq-sign-box">
              <div class="rfq-signline"></div>
              <div class="rfq-fine text-center">Quoted by (Signature Over Printed Name / Date)</div>
            </div>
            <div class="rfq-sign-box">
              <div class="rfq-signline"></div>
              <div class="rfq-fine text-center">Requested by (Signature Over Printed Name / Date)</div>
            </div>
          </div>
        </div>
      </v-card-text>

      <v-divider />

      <v-card-actions class="pa-4">
        <span class="text-caption text-medium-emphasis">
          {{ lines.length }} item(s)<span v-if="showQuantity"> · {{ totalUnits }} unit(s)</span>
        </span>
        <v-spacer />
        <v-btn variant="text" class="text-none" @click="emit('update:modelValue', false)">Close</v-btn>
        <v-btn
          color="primary"
          variant="flat"
          class="text-none font-weight-bold"
          prepend-icon="mdi-printer"
          :loading="generating"
          @click="printRFQ"
        >
          Print RFQ
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.rfq { background: #fff; color: #000; padding: 4px; font-size: 12px; }
.rfq-head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px; }
.rfq-co { font-size: 16px; font-weight: 700; letter-spacing: 1px; }
.rfq-title { font-size: 15px; font-weight: 700; letter-spacing: 1px; margin-bottom: 4px; }
.rfq-fine { font-size: 10px; line-height: 1.5; }
.rfq-value { font-size: 12px; font-weight: 600; }

.rfq-vendor { border: 1px solid #000; margin-bottom: 10px; }
.rfq-vendor-label { background: #e8e8e8; font-size: 10px; font-weight: 700; padding: 3px 6px; border-bottom: 1px solid #000; }
.rfq-vendor-body { padding: 6px; min-height: 42px; }
.rfq-blank { border-bottom: 1px solid #999; height: 15px; margin-bottom: 4px; }

.rfq-note { font-size: 10px; font-style: italic; margin-bottom: 8px; }

.rfq-table { width: 100%; border-collapse: collapse; }
.rfq-table th, .rfq-table td { border: 1px solid #000; padding: 4px 6px; font-size: 11px; }
.rfq-table th { background: #e8e8e8; font-size: 10px; font-weight: 700; }
.rfq-table td { height: 20px; }

.rfq-remarks { font-size: 10px; margin-top: 8px; }

.rfq-sign { display: flex; gap: 28px; margin-top: 26px; }
.rfq-sign-box { flex: 1 1 50%; }
.rfq-signline { border-bottom: 1px solid #000; height: 26px; }
</style>

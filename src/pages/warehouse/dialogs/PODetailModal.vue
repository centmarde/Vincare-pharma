<script setup lang="ts">
import { usePODetailModal, company } from '@/pages/purchasing/composables/usePODetailModal'
import type { PurchaseOrder } from '@/pages/purchasing/composables/usePODetailModal'
import { formatCurrency, formatDatePO_Written } from '@/utils/helpers'
import type { PR } from '@/stores/purchaseRequisitionData'
import { useDisplay } from 'vuetify'

const { mobile } = useDisplay()

const props = defineProps<{
  modelValue: boolean
  po: PurchaseOrder | null
  pr: PR | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

const { poNumber, emptyRows, uniqueSuppliers } = usePODetailModal(props, emit)
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    :max-width="mobile ? '95%' : '860'"
    scrollable
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card flat rounded="lg">
      <v-card-text :class="mobile ? 'pa-3 pb-0' : 'pa-8 pb-0'">
          <!-- Close button -->
          <div class="d-flex justify-end mb-2">
            <v-btn
              icon="mdi-close"
              variant="text"
              size="small"
              color="grey"
              @click="emit('update:modelValue', false)"
            />
          </div>

          <!-- Company + PO Title -->
          <v-row class="mb-4" align="start">
            <v-col :cols="mobile ? 12 : undefined">
              <div class="d-flex align-center ga-3 mb-2">
                <v-img src="/vincare.png" :max-width="mobile ? 36 : 48" :max-height="mobile ? 36 : 48" contain />
                <div :class="mobile ? 'text-subtitle-1 font-weight-bold' : 'text-h6 font-weight-bold'">{{ company.name }}</div>
              </div>
              <div :class="mobile ? 'text-caption text-medium-emphasis' : 'text-body-2 text-medium-emphasis'">{{ company.address }}</div>
              <div :class="mobile ? 'text-caption text-medium-emphasis' : 'text-body-2 text-medium-emphasis'">{{ company.contact }}</div>
              <div :class="mobile ? 'text-caption text-medium-emphasis' : 'text-body-2 text-medium-emphasis'">{{ company.email }}</div>
            </v-col>
            <v-col :cols="mobile ? 12 : undefined" :class="mobile ? 'text-left' : 'text-right'">
              <div :class="mobile ? 'text-subtitle-1 font-weight-bold mb-1' : 'text-h6 font-weight-bold mb-2'">PURCHASE ORDER</div>
              <div :class="mobile ? 'text-caption text-medium-emphasis' : 'text-body-2 text-medium-emphasis'">DATE: {{ po?.created_at ? formatDatePO_Written(po.created_at) : '—' }}</div>
              <div :class="mobile ? 'text-caption text-medium-emphasis' : 'text-body-2 text-medium-emphasis'">PR #: {{ pr?.requisition_no ?? '—' }}</div>
              <div :class="mobile ? 'text-caption text-medium-emphasis' : 'text-body-2 text-medium-emphasis'">
                PO #: <span class="font-weight-bold text-primary">{{ poNumber }}</span>
              </div>
              <div v-if="po?.is_delivered" :class="mobile ? 'text-caption text-green font-weight-bold mt-1' : 'text-body-2 text-green font-weight-bold mt-1'">
                <v-icon start size="14">mdi-check-circle</v-icon>
                Delivered
              </div>
            </v-col>
          </v-row>

          <v-divider :class="mobile ? 'mb-3' : 'mb-6'" />

          <!-- Supplier + Ship To -->
          <v-row class="mb-4" align="stretch">
            <v-col :cols="mobile ? 12 : 6" class="d-flex flex-column">
              <div :class="mobile
                  ? 'text-caption font-weight-bold text-medium-emphasis mb-1' : 'text-caption font-weight-bold text-medium-emphasis mb-2'">
                SUPPLIER
              </div>
              <v-card flat border rounded="lg" class="pa-3 flex-grow-1 d-flex align-center justify-center">
                <span class="text-body-2 text-medium-emphasis">—</span>
              </v-card>
            </v-col>

            <v-col :cols="mobile ? 12 : 6" class="d-flex flex-column">
              <div :class="mobile
                  ? 'text-caption font-weight-bold text-medium-emphasis mb-1' : 'text-caption font-weight-bold text-medium-emphasis mb-2'">
                SHIP TO
              </div>
              <v-card flat border rounded="lg" class="pa-3 flex-grow-1" >
                <div class="text-body-1 font-weight-medium mb-1">{{ company.name }}</div>
                <div class="text-body-2">{{ company.address }}</div>
                <div class="text-body-2">{{ company.contact }}</div>
                <div class="text-body-2">{{ company.email }}</div>
              </v-card>
            </v-col>
          </v-row>

          <!-- Ship Via / Method / Declared Value -->
          <v-row class="mb-4">
            <v-col :cols="mobile ? 4 : 4">
              <div :class="mobile ? 'text-caption font-weight-bold text-medium-emphasis mb-1' : 'text-caption font-weight-bold text-medium-emphasis mb-2'">SHIP VIA</div>
              <v-card flat border rounded="lg" class="pa-2">
                <div :class="mobile ? 'text-caption font-weight-medium' : 'text-body-2 font-weight-medium'">{{ po?.ship_via ?? '—' }}</div>
              </v-card>
            </v-col>
            <v-col :cols="mobile ? 4 : 4">
              <div :class="mobile ? 'text-caption font-weight-bold text-medium-emphasis mb-1' : 'text-caption font-weight-bold text-medium-emphasis mb-2'">SHIP METHOD</div>
              <v-card flat border rounded="lg" class="pa-2">
                <div :class="mobile ? 'text-caption font-weight-medium' : 'text-body-2 font-weight-medium'">{{ po?.ship_method ?? '—' }}</div>
              </v-card>
            </v-col>
            <v-col :cols="mobile ? 4 : 4">
              <div :class="mobile ? 'text-caption font-weight-bold text-medium-emphasis mb-1' : 'text-caption font-weight-bold text-medium-emphasis mb-2'">DECLARED VALUE</div>
              <v-card flat border rounded="lg" class="pa-2">
                <div :class="mobile ? 'text-body-1 font-weight-bold' : 'text-body-1 font-weight-bold'">
                  {{ formatCurrency(po?.total_amount ?? 0) }}
                </div>
              </v-card>
            </v-col>
          </v-row>

          <!-- ── Desktop: Items Table ─────────────────────────────── -->
          <v-table v-if="!mobile" density="compact" class="po-table mb-6 border rounded-lg">
            <thead>
              <tr style="background-color: #1565c0;">
                <th style="color:#fff; font-weight:600; padding: 10px 12px;">ITEM #</th>
                <th style="color:#fff; font-weight:600; padding: 10px 12px;">DESCRIPTION</th>
                <th style="color:#fff; font-weight:600; padding: 10px 12px; text-align:right;">QTY</th>
                <th style="color:#fff; font-weight:600; padding: 10px 12px; text-align:right;">UNIT PRICE</th>
                <th style="color:#fff; font-weight:600; padding: 10px 12px; text-align:right;">TOTAL</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in pr?.items" :key="item.id">
                <td>{{ item.no }}</td>
                <td>{{ item.item_description }}</td>
                <td class="text-right">{{ item.actual_count_stock_in ?? '—' }}</td>
                <td class="text-right">{{ formatCurrency(item.cost_per_unit) }}</td>
                <td class="text-right">{{ formatCurrency(item.qty * item.cost_per_unit) }}</td>
              </tr>
              <tr v-for="n in emptyRows" :key="`empty-${n}`" class="empty-row">
                <td colspan="4">&nbsp;</td>
              </tr>
            </tbody>
            <tfoot>
              <tr class="bg-grey-lighten-3">
                <td colspan="4" class="text-black font-weight-bold" style="text-align:right;">TOTAL</td>
                <td style="text-align:right; font-weight:700; padding: 10px 12px; color: #000;">
                  {{ formatCurrency(po?.total_amount ?? 0) }}
                </td>
              </tr>
            </tfoot>
          </v-table>

          <!-- ── Mobile: Items as Cards ──────────────────────────── -->
          <div v-else class="mb-4">
            <div :class="mobile ? 'text-caption font-weight-bold text-medium-emphasis mb-2' : ''">ITEMS</div>
            <v-card
              v-for="item in pr?.items"
              :key="item.id"
              class="mb-2"
              variant="outlined"
              rounded="lg"
            >
              <v-card-text class="pa-3">
                <div class="d-flex justify-space-between align-start mb-1">
                  <div class="d-flex ga-2 align-center">
                    <span class="text-caption font-weight-bold text-primary">#{{ item.no }}</span>
                    <span class="text-caption font-weight-medium">{{ item.item_description }}</span>
                  </div>
                </div>
                <v-divider class="my-1" />
                <div class="d-flex flex-wrap ga-3 text-caption">
                  <div><span class="text-medium-emphasis">Supplier: </span>{{ item.supplier_name ?? '—' }}</div>
                  <div><span class="text-medium-emphasis">Qty: </span>{{ item.actual_count_stock_in ?? '—' }}</div>
                  <div><span class="text-medium-emphasis">Price: </span>{{ formatCurrency(item.cost_per_unit) }}</div>
                  <div><span class="text-medium-emphasis">Total: </span><span class="font-weight-medium">{{ formatCurrency(item.qty * item.cost_per_unit) }}</span></div>
                </div>
              </v-card-text>
            </v-card>
            <v-card variant="outlined" rounded="lg" class="bg-grey-lighten-3">
              <v-card-text class="pa-3 d-flex justify-space-between text-caption font-weight-bold">
                <span>TOTAL</span>
                <span>{{ formatCurrency(po?.total_amount ?? 0) }}</span>
              </v-card-text>
            </v-card>
          </div>

          <!-- Signatures -->
          <v-row class="mb-6">
            <v-col :cols="mobile ? 6 : 6" class="d-flex flex-column align-center text-center">
              <div :class="mobile ? 'text-caption font-weight-bold text-medium-emphasis mb-3' : 'text-caption font-weight-bold text-medium-emphasis mb-6'">REQUESTED BY:</div>
              <div :class="mobile ? 'text-caption font-weight-medium' : 'text-body-2 font-weight-medium'">{{ pr?.requester_name }}</div>
              <v-divider :style="mobile ? 'width: 120px' : 'width: 200px'" class="mb-1" />
              <div class="text-caption text-medium-emphasis">REQUESTER</div>
            </v-col>
            <v-col :cols="mobile ? 6 : 6" class="d-flex flex-column align-center text-center">
              <div :class="mobile ? 'text-caption font-weight-bold text-medium-emphasis mb-3' : 'text-caption font-weight-bold text-medium-emphasis mb-6'">APPROVED BY:</div>
              <div :class="mobile ? 'text-caption font-weight-medium' : 'text-body-2 font-weight-medium'">{{ pr?.reviewer_name }}</div>
              <v-divider :style="mobile ? 'width: 120px' : 'width: 200px'" class="mb-1" />
              <div class="text-caption text-medium-emphasis">APPROVER</div>
            </v-col>
          </v-row>
      </v-card-text>

      <v-divider />

      <v-card-actions :class="mobile ? 'pa-3 ga-2 justify-end' : 'pa-4 ga-2 justify-end'">
        <v-btn variant="outlined" class="text-none" size="small" @click="emit('update:modelValue', false)">
          Close
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.empty-row td {
  height: 32px !important;
  border-bottom: 1px solid rgba(0,0,0,0.05) !important;
}
</style>
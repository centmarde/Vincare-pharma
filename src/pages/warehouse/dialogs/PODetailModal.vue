<script setup lang="ts">
import { usePODetailModal, company } from '@/pages/purchasing/composables/usePODetailModal'
import type { PurchaseOrder } from '@/pages/purchasing/composables/usePODetailModal'
import { formatCurrency, formatDatePO_Written } from '@/utils/helpers'
import type { PR } from '@/stores/transactionsData'

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
    max-width="860"
    scrollable
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card flat rounded="lg">
      <v-card-text class="pa-8 pb-0">
          <!-- Company + PO Title -->
          <v-row class="mb-4" align="start">
            <v-col>
              <div class="d-flex align-center ga-3 mb-2">
                <v-img src="/vincare.png" max-width="48" max-height="48" contain />
                <div class="text-h6 font-weight-bold">{{ company.name }}</div>
              </div>
              <div class="text-body-2 text-medium-emphasis">{{ company.address }}</div>
              <div class="text-body-2 text-medium-emphasis">{{ company.contact }}</div>
              <div class="text-body-2 text-medium-emphasis">{{ company.email }}</div>
            </v-col>
            <v-col class="text-right">
              <div class="text-h6 font-weight-bold mb-2">PURCHASE ORDER</div>
              <div class="text-body-2 text-medium-emphasis">DATE: {{ po?.created_at ? formatDatePO_Written(po.created_at) : '—' }}</div>
              <div class="text-body-2 text-medium-emphasis">PR #: {{ pr?.requisition_no ?? '—' }}</div>
              <div class="text-body-2 text-medium-emphasis">
                PO #: <span class="font-weight-bold text-primary">{{ poNumber }}</span>
              </div>
              <div v-if="po?.is_delivered" class="text-body-2 text-green font-weight-bold mt-1">
                <v-icon start size="14">mdi-check-circle</v-icon>
                Delivered
              </div>
            </v-col>
          </v-row>

          <v-divider class="mb-6" />

          <!-- Supplier + Ship To -->
          <v-row class="mb-4">
            <v-col cols="6">
              <div class="text-caption font-weight-bold text-medium-emphasis mb-2">SUPPLIER</div>
                <v-card flat border rounded="lg" class="pa-4" v-if="uniqueSuppliers.length">
                  <div v-for="supplier in uniqueSuppliers" :key="supplier.id" class="mb-2">
                    <div class="text-body-1 font-weight-medium">{{ supplier.name }}</div>
                    <div class="text-body-2 text-medium-emphasis">{{ supplier.address ?? '—' }}</div>
                    <div class="text-body-2 text-medium-emphasis">{{ supplier.contact_no ?? '—' }}</div>
                  </div>
                </v-card>
              <div v-else class="text-body-2 text-medium-emphasis">—</div>
            </v-col>
            <v-col cols="6">
              <div class="text-caption font-weight-bold text-medium-emphasis mb-2">SHIP TO</div>
              <v-card flat border rounded="lg" class="pa-4">
                <div class="text-body-1 font-weight-medium mb-1">{{ company.name }}</div>
                <div class="text-body-2">{{ company.address }}</div>
                <div class="text-body-2">{{ company.contact }}</div>
                <div class="text-body-2">{{ company.email }}</div>
              </v-card>
            </v-col>
          </v-row>

          <!-- Ship Via / Method / Declared Value -->
          <v-row class="mb-4">
            <v-col cols="4">
              <div class="text-caption font-weight-bold text-medium-emphasis mb-2">SHIP VIA</div>
              <v-card flat border rounded="lg" class="pa-3">
                <div class="text-body-2 font-weight-medium">{{ po?.ship_via ?? '—' }}</div>
              </v-card>
            </v-col>
            <v-col cols="4">
              <div class="text-caption font-weight-bold text-medium-emphasis mb-2">SHIP METHOD</div>
              <v-card flat border rounded="lg" class="pa-3">
                <div class="text-body-2 font-weight-medium">{{ po?.ship_method ?? '—' }}</div>
              </v-card>
            </v-col>
            <v-col cols="4">
              <div class="text-caption font-weight-bold text-medium-emphasis mb-2">DECLARED VALUE</div>
              <v-card flat border rounded="lg" class="pa-3">
                <div class="text-body-1 font-weight-bold">
                  {{ formatCurrency(po?.total_amount ?? 0) }}
                </div>
              </v-card>
            </v-col>
          </v-row>

          <!-- Items Table -->
          <v-table density="compact" class="po-table mb-6 border rounded-lg">
            <thead>
              <tr style="background-color: #1565c0;">
                <th style="color:#fff; font-weight:600; padding: 10px 12px;">ITEM #</th>
                <th style="color:#fff; font-weight:600; padding: 10px 12px;">DESCRIPTION</th>
                <th style="color:#fff; font-weight:600; padding: 10px 12px; text-align:right;">SUPPLIER</th>
                <th style="color:#fff; font-weight:600; padding: 10px 12px; text-align:right;">QTY</th>
                <th style="color:#fff; font-weight:600; padding: 10px 12px; text-align:right;">UNIT PRICE</th>
                <th style="color:#fff; font-weight:600; padding: 10px 12px; text-align:right;">TOTAL</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in pr?.items" :key="item.id">
                <td>{{ item.no }}</td>
                <td>{{ item.item_description }}</td>
                <td class="text-right">{{ item.supplier_name ?? '—' }}</td>
                <td class="text-right">{{ item.actual_count ?? '—' }}</td>
                <td class="text-right">{{ formatCurrency(item.cost_per_unit) }}</td>
                <td class="text-right">{{ formatCurrency(item.qty * item.cost_per_unit) }}</td>
              </tr>
              <tr v-for="n in emptyRows" :key="`empty-${n}`" class="empty-row">
                <td colspan="5">&nbsp;</td>
              </tr>
            </tbody>
            <tfoot>
              <tr style="background-color: #f5f5f5;">
                <td colspan="4" style="text-align:right; font-weight:700; padding: 10px 12px;">TOTAL</td>
                <td style="text-align:right; font-weight:700; padding: 10px 12px;">
                  {{ formatCurrency(po?.total_amount ?? 0) }}
                </td>
              </tr>
            </tfoot>
          </v-table>

          <!-- Signatures -->
          <v-row class="mb-6">
            <v-col cols="6">
              <div class="text-caption font-weight-bold text-medium-emphasis mb-6">REQUESTED BY:</div>
              <div class="text-body-2 font-weight-medium">{{ pr?.requester_name ?? '—' }}</div>
              <v-divider style="width: 200px" class="mb-1" />
              <div class="text-caption text-medium-emphasis">REQUESTER</div>
            </v-col>
            <v-col cols="6">
              <div class="text-caption font-weight-bold text-medium-emphasis mb-6">APPROVED BY:</div>
              <div class="text-body-2 font-weight-medium">{{ pr?.reviewer_name ?? '—' }}</div>
              <v-divider style="width: 200px" class="mb-1" />
              <div class="text-caption text-medium-emphasis">APPROVER</div>
            </v-col>
          </v-row>
      </v-card-text>

      <v-divider />

      <v-card-actions class="pa-4 ga-2 justify-end">
        <v-btn variant="outlined" class="text-none" @click="emit('update:modelValue', false)">
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
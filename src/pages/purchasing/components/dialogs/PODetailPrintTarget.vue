<script setup lang="ts">
import { usePODetailModal, company } from '../../composables/usePODetailModal'
import { formatCurrency, formatDatePO_Written } from '@/utils/helpers'
import type { PurchaseOrder } from '../../composables/usePODetailModal'
import type { PR } from '@/stores/purchaseRequisitionData'

const props = defineProps<{
  po: PurchaseOrder | null
  pr: PR | null
}>()

// This component never emits update:modelValue (no dialog to close),
// but usePODetailModal expects the emit signature, so we pass a no-op.
const noopEmit = (_e: 'update:modelValue', _value: boolean) => {}

const { printArea, poNumber, emptyRows, uniqueSuppliers, handlePrint } = usePODetailModal(props, noopEmit)

defineExpose({ handlePrint })
</script>

<template>
  <!-- Positioned off-screen at a fixed desktop width so html2canvas always
       captures a full desktop layout, regardless of the actual viewport. -->
  <div class="print-target-wrapper">
    <div ref="printArea" class="print-area">

      <!-- Company + PO Title -->
      <v-row class="mb-4" align="start">
        <v-col>
          <div class="d-flex align-center ga-3 mb-2">
            <v-img src="/vincare.png" :max-width="48" :max-height="48" contain eager/>
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
          <div v-if="po?.status === 'complete'" class="text-body-2 text-green font-weight-bold mt-1">
            <v-icon start size="14">mdi-check-circle</v-icon>
            Delivered
          </div>
          <div v-if="po?.status === 'complete'" class="text-body-2 text-medium-emphasis mt-1">
            DELIVERED DATE: {{ po?.updated_at ? formatDatePO_Written(po.updated_at) : '—' }}
          </div>
        </v-col>
      </v-row>

      <v-divider class="mb-6" />

      <!-- Supplier + Ship To -->
      <v-row class="mb-4">
        <v-col :cols="6">
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
        <v-col :cols="6">
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
        <v-col :cols="4">
          <div class="text-caption font-weight-bold text-medium-emphasis mb-2">SHIP VIA</div>
          <v-card flat border rounded="lg" class="pa-3">
            <div class="text-body-2 font-weight-medium">{{ po?.ship_via ?? '—' }}</div>
          </v-card>
        </v-col>
        <v-col :cols="4">
          <div class="text-caption font-weight-bold text-medium-emphasis mb-2">SHIP METHOD</div>
          <v-card flat border rounded="lg" class="pa-3">
            <div class="text-body-2 font-weight-medium">{{ po?.ship_method ?? '—' }}</div>
          </v-card>
        </v-col>
        <v-col :cols="4">
          <div class="text-caption font-weight-bold text-medium-emphasis mb-2">DECLARED VALUE</div>
          <v-card flat border rounded="lg" class="pa-3">
            <div class="text-body-1 font-weight-bold">
              {{ formatCurrency(po?.total_amount ?? 0) }}
            </div>
          </v-card>
        </v-col>
      </v-row>

      <!-- Items Table (desktop layout only, always) -->
      <v-table density="compact" class="po-table mb-6 border rounded-lg">
        <thead>
          <tr style="background-color: #1565c0;">
            <th style="color:#fff; font-weight:600; padding: 10px 12px;">ITEM #</th>
            <th style="color:#fff; font-weight:600; padding: 10px 12px;">DESCRIPTION</th>
            <th style="color:#fff; font-weight:600; padding: 10px 12px; text-align:right;">QTY</th>
            <th style="color:#fff; font-weight:600; padding: 10px 12px; text-align:right;">ACTUAL QTY</th>
            <th style="color:#fff; font-weight:600; padding: 10px 12px; text-align:right;">SUPPLIER</th>
            <th style="color:#fff; font-weight:600; padding: 10px 12px; text-align:right;">UNIT PRICE</th>
            <th style="color:#fff; font-weight:600; padding: 10px 12px; text-align:right;">TOTAL</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in pr?.items" :key="item.id">
            <td>{{ item.no }}</td>
            <td>{{ item.item_description }}</td>
            <td class="text-right">{{ item.qty }}</td>
            <td class="text-right">{{ item.actual_count_stock_in ?? '—' }}</td>
            <td class="text-right">{{ item.supplier_name }}</td>
            <td class="text-right">{{ formatCurrency(item.cost_per_unit) }}</td>
            <td class="text-right">{{ formatCurrency(item.qty * item.cost_per_unit) }}</td>
          </tr>
          <tr v-for="n in emptyRows" :key="`empty-${n}`" class="empty-row">
            <td colspan="6">&nbsp;</td>
          </tr>
        </tbody>
        <tfoot>
          <tr class="bg-grey-lighten-3">
            <td colspan="6" class="text-black font-weight-bold" style="text-align:right;">TOTAL</td>
            <td style="text-align:right; font-weight:700; padding: 10px 12px; color: #000;">
              {{ formatCurrency(po?.total_amount ?? 0) }}
            </td>
          </tr>
        </tfoot>
      </v-table>

      <!-- Signatures -->
      <v-row class="mb-6">
        <v-col :cols="6" class="d-flex flex-column align-center text-center">
          <div class="text-caption font-weight-bold text-medium-emphasis mb-6">REQUESTED BY:</div>
          <div class="text-body-2 font-weight-medium">{{ pr?.requester_name }}</div>
          <v-divider style="width: 200px" class="mb-1" />
          <div class="text-caption text-medium-emphasis">REQUESTER</div>
        </v-col>
        <v-col :cols="6" class="d-flex flex-column align-center text-center">
          <div class="text-caption font-weight-bold text-medium-emphasis mb-6">APPROVED BY:</div>
          <div class="text-body-2 font-weight-medium">{{ pr?.reviewer_name }}</div>
          <v-divider style="width: 200px" class="mb-1" />
          <div class="text-caption text-medium-emphasis">APPROVER</div>
        </v-col>
      </v-row>

    </div>
  </div>
</template>

<style scoped>
.print-target-wrapper {
  position: fixed;
  top: 0;
  left: -9999px;
  width: 860px;
  pointer-events: none;
}
.print-area {
  background: #fff;
  padding: 32px;
}
.empty-row td {
  height: 32px !important;
  border-bottom: 1px solid rgba(0,0,0,0.05) !important;
}
</style>
<script setup lang="ts">
import { useIssuePOModal } from '../../composables/useIssuePOModal'
import type { PR } from '@/stores/purchaseRequisitionData'
import { formatCurrency } from '@/utils/helpers'
import { useDisplay } from 'vuetify'

const { mobile } = useDisplay()

const props = defineProps<{
  modelValue: boolean
  pr: PR | null
}>()
 
const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()
 
const {
  company,
  shipViaOptions,
  shipMethodOptions,
  today,
  form,
  showConfirm,
  loading,
  declaredValue,
  emptyRows,
  uniqueSuppliers,
  updateCompany,
  promptIssuePO,
  closeConfirm,
  handleConfirmIssue,
} = useIssuePOModal(props, emit)
</script>
<template>
  <v-dialog
    :model-value="modelValue"
    :max-width="mobile ? '95%' : '860'"
    scrollable
    @update:model-value="$emit('update:modelValue', $event)"
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
            @click="$emit('update:modelValue', false)"
          />
        </div>

        <!-- ── Company + PO Title ──────────────────────────────── -->
        <v-row class="mb-4" align="start">
          <v-col :cols="mobile ? 12 : undefined">
            <div class="d-flex align-center ga-3 mb-2">
            <v-img
              src="/vincare.png"
              :max-width="mobile ? 36 : 48"
              :max-height="mobile ? 36 : 48"
              contain
            />
            <!-- Editable company fields -->
            <div
              contenteditable="true"
              class="editable-name mb-1"
              @input="updateCompany('name', $event)"
            >{{ company.name }}</div>
            </div>
            <div
              contenteditable="true"
              class="editable-meta"
              @input="updateCompany('address', $event)"
            >{{ company.address }}</div>
            <div
              contenteditable="true"
              class="editable-meta"
              @input="updateCompany('city', $event)"
            >{{ company.city }}</div>
            <div
              contenteditable="true"
              class="editable-meta"
              @input="updateCompany('contact', $event)"
            >{{ company.contact }}</div>
          </v-col>
          <v-col :cols="mobile ? 12 : undefined" :class="mobile ? 'text-left' : 'text-right'">
            <div :class="mobile ? 'text-subtitle-1 font-weight-bold mb-1' : 'text-h6 font-weight-bold mb-2'">PURCHASE ORDER</div>
            <div :class="mobile ? 'text-caption text-medium-emphasis' : 'text-body-2 text-medium-emphasis'">DATE: {{ today }}</div>
            <div :class="mobile ? 'text-caption text-medium-emphasis' : 'text-body-2 text-medium-emphasis'">PR #: {{ pr?.requisition_no }}</div>
            <div :class="mobile ? 'text-caption text-medium-emphasis' : 'text-body-2 text-medium-emphasis'">
              PO #: <span class="font-weight-medium">Auto-generated</span>
            </div>
          </v-col>
        </v-row>

        <v-divider :class="mobile ? 'mb-3' : 'mb-6'" />

        <!-- ── Supplier + Ship To ───────────────────────────────── -->
        <v-row class="mb-4">
          <v-col :cols="mobile ? 12 : 6" :class="mobile ? 'mb-3' : ''">
            <div :class="mobile ? 'text-caption font-weight-bold text-medium-emphasis mb-1' : 'text-caption font-weight-bold text-medium-emphasis mb-2'">SUPPLIER</div>
            <v-card flat border rounded="lg" :class="mobile ? 'pa-3' : 'pa-4'" v-if="uniqueSuppliers.length">
              <div v-for="supplier in uniqueSuppliers" :key="supplier.id" class="mb-2">
                <div :class="mobile ? 'text-body-2 font-weight-medium' : 'text-body-1 font-weight-medium'">{{ supplier.name }}</div>
                <div :class="mobile ? 'text-caption text-medium-emphasis' : 'text-body-2 text-medium-emphasis'">{{ supplier.address ?? '—' }}</div>
                <div :class="mobile ? 'text-caption text-medium-emphasis' : 'text-body-2 text-medium-emphasis'">{{ supplier.contact_no ?? '—' }}</div>
              </div>
            </v-card>
            <div v-else :class="mobile ? 'text-caption text-medium-emphasis' : 'text-body-2 text-medium-emphasis'">—</div>
          </v-col>
          <v-col :cols="mobile ? 12 : 6">
            <div :class="mobile ? 'text-caption font-weight-bold text-medium-emphasis mb-1' : 'text-caption font-weight-bold text-medium-emphasis mb-2'">SHIP TO</div>
            <v-card flat border rounded="lg" :class="mobile ? 'pa-3' : 'pa-4'">
              <div :class="mobile ? 'text-body-2 font-weight-medium mb-1' : 'text-body-1 font-weight-medium mb-1'">{{ company.name }}</div>
              <div :class="mobile ? 'text-caption text-medium-emphasis' : 'text-body-2 text-medium-emphasis'">{{ company.address }}</div>
              <div :class="mobile ? 'text-caption text-medium-emphasis' : 'text-body-2 text-medium-emphasis'">{{ company.contact }}</div>
            </v-card>
          </v-col>
        </v-row>

        <!-- ── Ship Via / Method / Declared Value ────────────── -->
        <v-row class="mb-4">
          <v-col :cols="mobile ? 12 : 4" :class="mobile ? 'mb-3' : ''">
            <div :class="mobile ? 'text-caption font-weight-bold text-medium-emphasis mb-1' : 'text-caption font-weight-bold text-medium-emphasis mb-2'">SHIP VIA</div>
            <v-select
              v-model="form.ship_via"
              :items="shipViaOptions"
              variant="outlined"
              density="compact"
              hide-details
              placeholder="Select..."
            />
          </v-col>
          <v-col :cols="mobile ? 12 : 4" :class="mobile ? 'mb-3' : ''">
            <div :class="mobile ? 'text-caption font-weight-bold text-medium-emphasis mb-1' : 'text-caption font-weight-bold text-medium-emphasis mb-2'">SHIP METHOD</div>
            <v-select
              v-model="form.ship_method"
              :items="shipMethodOptions"
              variant="outlined"
              density="compact"
              hide-details
              placeholder="Select..."
            />
          </v-col>
          <v-col :cols="mobile ? 12 : 4">
            <div :class="mobile ? 'text-caption font-weight-bold text-medium-emphasis mb-1' : 'text-caption font-weight-bold text-medium-emphasis mb-2'">DECLARED VALUE</div>
            <v-card flat border rounded="lg" :class="mobile ? 'pa-2' : 'pa-3'">
              <div :class="mobile ? 'text-body-1 font-weight-medium' : 'text-body-1 font-weight-medium'">{{ formatCurrency(declaredValue) }}</div>
            </v-card>
          </v-col>
        </v-row>

        <!-- ── Desktop: Items Table ──────────────────────────── -->
        <v-table v-if="!mobile" density="compact" class="po-table mb-6">
          <thead>
            <tr class="po-table-header bg-blue-darken-3">
              <th class="text-left">ITEM #</th>
              <th class="text-left">DESCRIPTION</th>
              <th class="text-right">QTY</th>
              <th class="text-right">SUPPLIER</th>
              <th class="text-right">UNIT PRICE</th>
              <th class="text-right">TOTAL</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in pr?.items" :key="item.id">
              <td>{{ item.no }}</td>
              <td>{{ item.item_description }}</td>
              <td class="text-right">{{ item.qty }}</td>
              <td class="text-right">{{ item.supplier_name }}</td>
              <td class="text-right">{{ formatCurrency(item.cost_per_unit) }}</td>
              <td class="text-right">{{ formatCurrency(item.qty * item.cost_per_unit) }}</td>
            </tr>
            <tr v-for="n in emptyRows" :key="`empty-${n}`" class="empty-row">
              <td colspan="5">&nbsp;</td>
            </tr>
          </tbody>
          <tfoot>
            <tr class="po-table-total bg-grey-lighten-3">
              <td colspan="6" class="text-right font-weight-bold">TOTAL</td>
              <td class="text-right font-weight-bold text-subtitle-1">{{ formatCurrency(declaredValue) }}</td>
            </tr>
          </tfoot>
        </v-table>

        <!-- ── Mobile: Items as Cards ────────────────────────── -->
        <div v-else class="mb-4">
          <div class="text-caption font-weight-bold text-medium-emphasis mb-2">ITEMS</div>
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
                <div><span class="text-medium-emphasis">Qty: </span>{{ item.qty }}</div>
                <div><span class="text-medium-emphasis">Supplier: </span>{{ item.supplier_name }}</div>
                <div><span class="text-medium-emphasis">Price: </span>{{ formatCurrency(item.cost_per_unit) }}</div>
                <div><span class="text-medium-emphasis">Total: </span><span class="font-weight-medium">{{ formatCurrency(item.qty * item.cost_per_unit) }}</span></div>
              </div>
            </v-card-text>
          </v-card>
          <v-card variant="outlined" rounded="lg" class="bg-grey-lighten-3">
            <v-card-text class="pa-3 d-flex justify-space-between text-caption font-weight-bold">
              <span>TOTAL</span>
              <span>{{ formatCurrency(declaredValue) }}</span>
            </v-card-text>
          </v-card>
        </div>

        <!-- ── Signatures ─────────────────────────────────────── -->
        <v-row class="mb-6">
          <v-col :cols="mobile ? 6 : 6">
            <div :class="mobile ? 'text-caption font-weight-bold text-medium-emphasis mb-3' : 'text-caption font-weight-bold text-medium-emphasis mb-6'">REQUESTED BY:</div>
            <div :class="mobile ? 'text-caption font-weight-medium' : 'text-body-2 font-weight-medium'">{{ pr?.requester_name }}</div>
            <v-divider :style="mobile ? 'width: 120px' : 'width: 200px'" class="mb-1" />
            <div class="text-caption text-medium-emphasis">REQUESTER</div>
          </v-col>
          <v-col :cols="mobile ? 6 : 6">
            <div :class="mobile ? 'text-caption font-weight-bold text-medium-emphasis mb-3' : 'text-caption font-weight-bold text-medium-emphasis mb-6'">APPROVED BY:</div>
            <div :class="mobile ? 'text-caption font-weight-medium' : 'text-body-2 font-weight-medium'">{{ pr?.reviewer_name }}</div>
            <v-divider :style="mobile ? 'width: 120px' : 'width: 200px'" class="mb-1" />
            <div class="text-caption text-medium-emphasis">APPROVER</div>
          </v-col>
        </v-row>

      </v-card-text>

      <v-divider />

      <!-- ── Actions ───────────────────────────────────────────── -->
      <v-card-actions :class="mobile ? 'pa-3 ga-2 justify-end' : 'pa-4 ga-2 justify-end'">
        <v-btn variant="text" size="small" class="text-none" @click="$emit('update:modelValue', false)">
          Close
        </v-btn>
        <v-btn
          variant="flat"
          color="primary"
          size="small"
          class="text-none font-weight-bold"
          :loading="loading"
          :disabled="loading || !form.ship_via || !form.ship_method"
          @click="promptIssuePO"
        >
          Issue PO
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

    <!-- ── Confirmation Overlay Dialog ────────────────────────── -->
    <v-dialog v-model="showConfirm" max-width="420" persistent>
      <v-card rounded="lg">
        <v-card-title class="d-flex align-center ga-2 pt-5 px-5">
          <v-icon color="primary" size="22">
            mdi-file-document-edit-outline
          </v-icon>
          <span class="text-body-1 font-weight-bold">
            Issue Purchase Order
          </span>
        </v-card-title>

        <v-card-text class="px-5 pb-2 text-body-2 text-medium-emphasis">
          Are you sure you want to issue a Purchase Order for Requisition 
          <strong>({{ pr?.requisition_no ?? '—' }})</strong>?
          This action cannot be undone.
        </v-card-text>

        <v-card-actions class="px-5 pb-5 pt-3 d-flex justify-end ga-2">
          <v-btn variant="outlined" class="text-none" :disabled="loading" @click="closeConfirm">
            Cancel
          </v-btn>
          <v-btn
            color="primary"
            variant="flat"
            class="text-none font-weight-bold"
            :loading="loading"
            @click="handleConfirmIssue"
          >
            Yes, Issue PO
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
</template>

<style scoped>
.editable-name {
  font-size: 1.2rem;
  font-weight: 700;
  color: rgb(var(--v-theme-primary));
  outline: none;
  border-bottom: 1px dashed transparent;
  transition: border-color 0.2s;
}
.editable-name:focus { border-bottom-color: rgb(var(--v-theme-primary)); }

.editable-meta {
  font-size: 0.8rem;
  outline: none;
  border-bottom: 1px dashed transparent;
  transition: border-color 0.2s;
  line-height: 1.6;
}
.editable-meta:focus { border-bottom-color: rgba(0, 0, 0, 0.3); }

.po-table-header th {
  color: #ffffff !important;
  font-weight: 600;
  font-size: 0.75rem;
  letter-spacing: 0.05em;
  padding: 10px 12px !important;
}
.po-table tbody tr td {
  padding: 8px 12px !important;
  font-size: 0.875rem;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}
.empty-row td { height: 36px; }
.po-table-total td {
  padding: 10px 12px !important;
  background: rgba(0, 0, 0, 0.03);
  font-size: 0.875rem;
  border-top: 2px solid rgba(0, 0, 0, 0.08);
}
</style>
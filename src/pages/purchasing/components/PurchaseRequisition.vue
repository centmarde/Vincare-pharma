<script setup lang="ts">
import { usePurchaseRequisition, unitOptions } from '../composables/usePurchaseRequisition'
import { useSuppliersDataStore } from '@/stores/suppliersData'
import { formatCurrency } from '@/utils/helpers'
import { useDisplay } from 'vuetify'
import { storeToRefs } from 'pinia'
import { onMounted } from 'vue'

const supplierStore = useSuppliersDataStore()
const { activeSuppliers } = storeToRefs(supplierStore)
const { mobile } = useDisplay()
const {
  currentPR,
  items,
  loading,
  customerOfferTotal,
  companyCostTotal,
  profit,
  isProfitable,
  offerCostRatio,
  marginPercent,
  addItem,
  removeItem,
  handleSubmit,
} = usePurchaseRequisition()

onMounted(() => {
  supplierStore.fetchSuppliers({ activeOnly: true })
})
</script>

<template>
  <v-container fluid class="pa-2 bg-surface-variant fill-height align-start">
    <v-card class="mx-auto w-100" rounded="lg" elevation="1">
      <!-- Header -->
      <v-card-title class="d-flex justify-space-between align-center pa-4 pa-sm-5">
        <div class="d-flex align-center">
          <v-icon icon="mdi-file-document-edit-outline" size="30" class="mr-2 text-primary" />
          <span class="text-subtitle-1 text-sm-h6 font-weight-bold"
            >Raise Purchase Requisition</span
          >
        </div>
        <span v-if="!mobile" class="text-caption text-medium-emphasis">
          Customer offer vs. company cost
        </span>
      </v-card-title>

      <v-divider />

      <v-card-text class="pa-3 pa-sm-5">
        <!-- ── DESKTOP TABLE VIEW ── -->
        <template v-if="!mobile">
          <!-- Table Header -->
          <v-row class="text-caption font-weight-bold mb-1 px-1" no-gutters>
            <v-col cols="auto" style="width: 40px" class="text-center">NO.</v-col>
            <v-col cols="2" class="pl-2">UNIT</v-col>
            <v-col cols="2" class="pl-2">PRODUCT</v-col>
            <v-col cols="2" class="pl-2">SUPPLIER</v-col>
            <v-col cols="1" class="pl-2">QTY</v-col>
            <v-col cols="1" class="pl-2">OFFER/UNIT</v-col>
            <v-col cols="1" class="text-right pr-4">OFFER TOTAL</v-col>
            <v-col cols="1" class="pl-2">COST/UNIT</v-col>
            <v-col cols="1" class="text-right pr-2">COST TOTAL</v-col>
            <v-col cols="1" />
          </v-row>

          <!-- Desktop Line Items -->
          <v-row
            v-for="(item, index) in items"
            :key="index"
            class="align-center mb-2 px-1"
            no-gutters
          >
            <v-col cols="auto" style="width: 40px" class="text-center text-body-2">
              {{ index + 1 }}
            </v-col>

            <v-col cols="2" class="pl-2">
              <v-select
                v-model="item.unit"
                :items="unitOptions"
                variant="outlined"
                density="compact"
                hide-details
              />
            </v-col>

            <v-col cols="2" class="pl-2">
              <v-text-field
                v-model="item.item_description"
                placeholder="Item description"
                variant="outlined"
                density="compact"
                hide-details
              />
            </v-col>

            <v-col cols="2" class="pl-2">
              <v-select
                v-model="item.supplier_id"
                :items="activeSuppliers"
                item-title="name"
                item-value="id"
                placeholder="Select supplier..."
                variant="outlined"
                density="compact"
                hide-details
                clearable
              />
            </v-col>

            <v-col cols="1" class="pl-2">
              <v-text-field
                v-model.number="item.qty"
                type="number"
                placeholder="Qty"
                variant="outlined"
                density="compact"
                hide-details
              />
            </v-col>

            <v-col cols="1" class="pl-2">
              <v-text-field
                v-model.number="item.offer_per_unit"
                type="number"
                placeholder="0.00"
                variant="outlined"
                density="compact"
                hide-details
              />
            </v-col>

            <v-col cols="1" class="text-right pr-4">
              <span class="text-body-2">
                {{ formatCurrency((item.qty || 0) * (item.offer_per_unit || 0)) }}
              </span>
            </v-col>

            <v-col cols="1" class="pl-2">
              <v-text-field
                v-model.number="item.cost_per_unit"
                type="number"
                placeholder="0.00"
                variant="outlined"
                density="compact"
                hide-details
              />
            </v-col>

            <v-col cols="1" class="text-right pr-2">
              <span class="text-body-2 font-weight-bold text-blue-darken-2">
                {{ formatCurrency((item.qty || 0) * (item.cost_per_unit || 0)) }}
              </span>
            </v-col>

            <v-col cols="1" class="pl-2">
              <v-btn
                icon="mdi-close"
                variant="tonal"
                color="red-lighten-1"
                size="small"
                @click="removeItem(index)"
              />
            </v-col>
          </v-row>
        </template>

        <!-- ── MOBILE CARD VIEW ── -->
        <template v-else>
          <div
            v-for="(item, index) in items"
            :key="index"
            class="mobile-item-card mb-3 pa-3 rounded-lg border"
          >
            <!-- Card header: item number + remove -->
            <div class="d-flex justify-space-between align-center mb-3">
              <span class="text-caption font-weight-bold text-medium-emphasis">
                ITEM {{ index + 1 }}
              </span>
              <v-btn
                icon="mdi-close"
                variant="tonal"
                color="red-lighten-1"
                size="x-small"
                @click="removeItem(index)"
              />
            </div>

            <!-- Description -->
            <div class="mb-2">
              <div class="field-label">Product Description</div>
              <v-text-field
                v-model="item.item_description"
                placeholder="Item description"
                variant="outlined"
                density="compact"
                hide-details
              />
            </div>

            <!-- Unit + Qty side by side -->
            <v-row no-gutters class="mb-2" style="gap: 8px">
              <v-col>
                <div class="field-label">Unit</div>
                <v-select
                  v-model="item.unit"
                  :items="unitOptions"
                  variant="outlined"
                  density="compact"
                  hide-details
                />
              </v-col>
              <v-col>
                <div class="field-label">Quantity</div>
                <v-text-field
                  v-model.number="item.qty"
                  type="number"
                  placeholder="0"
                  variant="outlined"
                  density="compact"
                  hide-details
                />
              </v-col>
            </v-row>

            <!-- Supplier -->
            <div class="mb-2">
              <div class="field-label">Supplier</div>
              <v-select
                v-model="item.supplier_id"
                :items="activeSuppliers"
                item-title="name"
                item-value="id"
                placeholder="Select supplier..."
                variant="outlined"
                density="compact"
                hide-details
                clearable
              />
            </div>

            <!-- Offer/unit + Cost/unit side by side -->
            <v-row no-gutters class="mb-3" style="gap: 8px">
              <v-col>
                <div class="field-label">Offer / Unit</div>
                <v-text-field
                  v-model.number="item.offer_per_unit"
                  type="number"
                  placeholder="0.00"
                  variant="outlined"
                  density="compact"
                  hide-details
                />
              </v-col>
              <v-col>
                <div class="field-label">Cost / Unit</div>
                <v-text-field
                  v-model.number="item.cost_per_unit"
                  type="number"
                  placeholder="0.00"
                  variant="outlined"
                  density="compact"
                  hide-details
                />
              </v-col>
            </v-row>

            <!-- Computed totals row -->
            <v-divider class="mb-2" />
            <div class="d-flex justify-space-between align-center">
              <div class="text-caption">
                <span class="text-medium-emphasis">Offer Total </span>
                <span class="font-weight-bold">
                  {{ formatCurrency((item.qty || 0) * (item.offer_per_unit || 0)) }}
                </span>
              </div>
              <div class="text-caption">
                <span class="text-medium-emphasis">Cost Total </span>
                <span class="font-weight-bold text-blue-darken-2">
                  {{ formatCurrency((item.qty || 0) * (item.cost_per_unit || 0)) }}
                </span>
              </div>
            </div>
          </div>
        </template>

        <!-- Add Item -->
        <v-btn
          prepend-icon="mdi-plus"
          variant="outlined"
          density="compact"
          :block="mobile"
          class="mt-3 text-none"
          @click="addItem"
        >
          Add Item
        </v-btn>

        <div class="text-caption mt-3 font-italic text-medium-emphasis">
          "Offer" = what the customer offered · "Cost" = the item's actual cost in inventory
        </div>

        <v-divider class="my-6" />

        <!-- Justification -->
        <label class="text-subtitle-2 font-weight-bold d-block mb-2">Justification / Notes</label>
        <v-textarea
          v-model="currentPR.remarks"
          placeholder="Reason for requisition..."
          variant="outlined"
          rows="3"
          hide-details
          class="mb-6"
        />

        <!-- Footer: Submit + Summary -->
        <v-row align="end">
          <!-- Summary Card (shown first on mobile for quick reference) -->
          <v-col cols="12" md="6" :order="mobile ? 1 : 2">
            <v-card variant="flat" rounded="lg" class="pa-4 border mb-4 mb-md-0">
              <div class="d-flex justify-space-between align-center mb-2">
                <span class="text-body-2">Customer Offer Total</span>
                <span class="text-h6 font-weight-bold">{{
                  formatCurrency(customerOfferTotal)
                }}</span>
              </div>

              <div class="d-flex justify-space-between align-center mb-4">
                <span class="text-body-2">Company Cost Total</span>
                <span class="text-h6 font-weight-bold">{{ formatCurrency(companyCostTotal) }}</span>
              </div>

              <v-divider class="mb-4" />

              <div class="d-flex justify-space-between align-center mb-2">
                <span class="text-body-2">Profit / (Loss)</span>
                <div class="d-flex align-center" style="gap: 8px">
                  <span
                    class="text-h6 font-weight-bold"
                    :class="isProfitable ? 'text-green-darken-2' : 'text-red-darken-2'"
                  >
                    {{ formatCurrency(profit) }}
                  </span>
                  <v-chip
                    :color="isProfitable ? 'green-lighten-4' : 'red-lighten-4'"
                    size="small"
                    class="font-weight-bold"
                    :class="isProfitable ? 'text-green-darken-3' : 'text-red-darken-3'"
                  >
                    {{ isProfitable ? '● Profitable' : '● Loss' }}
                  </v-chip>
                </div>
              </div>

              <div class="d-flex justify-space-between align-center">
                <span class="text-body-2">Offer : Cost Ratio</span>
                <span class="text-body-2 font-weight-bold">
                  {{ offerCostRatio }}x · {{ marginPercent }}% margin
                </span>
              </div>
            </v-card>
          </v-col>

          <!-- Submit -->
          <v-col cols="12" md="6" :order="mobile ? 2 : 1" class="d-flex flex-column justify-end">
            <v-btn
              color="primary"
              size="large"
              class="text-none text-white font-weight-bold mb-2"
              rounded="lg"
              elevation="0"
              block
              :loading="loading"
              @click="handleSubmit"
            >
              Submit for Approval
            </v-btn>
            <div class="text-caption text-medium-emphasis">
              Saved as one record <strong>(Pending Approval)</strong> even if not profitable — the
              admin decides. → Manager approves → Issue PO.
            </div>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>
  </v-container>
</template>

<style scoped>
:deep(.v-field__outline) {
  --v-field-border-opacity: 0.15;
}
:deep(.v-field--focused .v-field__outline) {
  --v-field-border-opacity: 0.5;
}

.mobile-item-card {
  background-color: rgb(var(--v-theme-surface));
}

.field-label {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: rgba(var(--v-theme-on-surface), 0.5);
  margin-bottom: 4px;
}
</style>

<script setup lang="ts">
import { usePurchaseRequisitionStore } from '@/stores/purchaseRequisition'
import { storeToRefs } from 'pinia'
import { useToast } from 'vue-toastification'

const toast = useToast()

const store = usePurchaseRequisitionStore()
const {
  currentPR,
  items,
  loading,
  error,
  customerOfferTotal,
  companyCostTotal,
  profit,
  isProfitable,
  offerCostRatio,
  marginPercent,
} = storeToRefs(store)

const unitOptions = ['box', 'pcs', 'set', 'unit', 'kg', 'm']

const addItem = () => {
  items.value.push({
    no: items.value.length + 1,
    unit: 'box',
    item_description: '',
    qty: 0,
    offer_per_unit: 0,
    cost_per_unit: 0,
  })
}

const removeItem = (index: number) => {
  items.value.splice(index, 1)
  items.value.forEach((item, i) => (item.no = i + 1))
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value).replace('PHP', '₱')
}

const handleSubmit = async () => {
  const result = await store.savePurchaseRequisition()
}

if (items.value.length === 0) addItem()
</script>

<template>
  <v-container fluid class="pa-6 bg-grey-lighten-4 fill-height align-start">
    <v-card class="mx-auto w-100" max-width="1200" rounded="lg" elevation="1">

      <!-- Header -->
      <v-card-title class="d-flex justify-space-between align-center pa-5">
        <span class="text-h6 font-weight-bold">Raise Purchase Requisition</span>
        <span class="text-caption text-grey-darken-1">Customer offer vs. company cost</span>
      </v-card-title>

      <v-divider />

      <v-card-text class="pa-5">

        <!-- Table Header -->
        <v-row class="text-caption font-weight-bold text-grey-darken-2 mb-1 px-1" no-gutters>
          <v-col cols="auto" style="width: 40px" class="text-center">NO.</v-col>
          <v-col cols="1" class="pl-2">UNIT</v-col>
          <v-col cols="3" class="pl-2">ITEM DESCRIPTION</v-col>
          <v-col cols="1" class="pl-2">QTY</v-col>
          <v-col cols="1" class="pl-2">OFFER/UNIT</v-col>
          <v-col cols="1" class="text-right pr-4">OFFER TOTAL</v-col>
          <v-col cols="1" class="pl-2">COST/UNIT</v-col>
          <v-col cols="1" class="text-right pr-2">COST TOTAL</v-col>
          <v-col cols="1" />
        </v-row>

        <!-- Line Items -->
        <v-row
          v-for="(item, index) in items"
          :key="index"
          class="align-center mb-2 px-1"
          no-gutters
        >
          <!-- NO. -->
          <v-col cols="auto" style="width: 40px" class="text-center text-body-2 text-grey-darken-2">
            {{ index + 1 }}
          </v-col>

          <!-- UNIT -->
          <v-col cols="1" class="pl-2">
            <v-select
              v-model="item.unit"
              :items="unitOptions"
              variant="outlined"
              density="compact"
              hide-details
            />
          </v-col>

          <!-- ITEM DESCRIPTION -->
          <v-col cols="3" class="pl-2">
            <v-text-field
              v-model="item.item_description"
              placeholder="Item description"
              variant="outlined"
              density="compact"
              hide-details
            />
          </v-col>

          <!-- QTY -->
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

          <!-- OFFER/UNIT -->
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

          <!-- OFFER TOTAL -->
          <v-col cols="1" class="text-right pr-4">
            <span class="text-body-2 text-grey-darken-2">
              {{ formatCurrency((item.qty || 0) * (item.offer_per_unit || 0)) }}
            </span>
          </v-col>

          <!-- COST/UNIT -->
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

          <!-- COST TOTAL -->
          <v-col cols="1" class="text-right pr-2">
            <span class="text-body-2 font-weight-bold text-blue-darken-2">
              {{ formatCurrency((item.qty || 0) * (item.cost_per_unit || 0)) }}
            </span>
          </v-col>

          <!-- REMOVE -->
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

        <!-- Add Item -->
        <v-btn
          prepend-icon="mdi-plus"
          variant="outlined"
          density="compact"
          class="mt-3 text-none"
          @click="addItem"
        >
          Add Item
        </v-btn>

        <div class="text-caption text-grey-darken-1 mt-3 font-italic">
          "Offer" = what the customer offered · "Cost" = the item's actual cost in inventory
        </div>

        <v-divider class="my-6" />

        <!-- Justification -->
        <label class="text-subtitle-2 font-weight-bold d-block mb-2">Justification / Notes</label>
        <v-textarea
          v-model="currentPR.justification"
          placeholder="Reason for requisition..."
          variant="outlined"
          rows="3"
          hide-details
          class="mb-6"
        />

        <!-- Footer: Submit + Summary -->
        <v-row align="end">

          <!-- Submit -->
          <v-col cols="12" md="6" class="d-flex flex-column justify-end">
            <v-btn
              color="#c2922e"
              size="large"
              class="text-none text-white font-weight-bold mb-2"
              rounded="lg"
              elevation="0"
              :loading="loading"
              @click="handleSubmit"
            >
              Submit for Approval
            </v-btn>
            <div class="text-caption text-grey-darken-1">
              Saved as one record <strong>(Pending Approval)</strong> even if not profitable —
              the admin decides. → Manager approves → Issue PO.
            </div>
          </v-col>

          <!-- Summary Card -->
          <v-col cols="12" md="6">
            <v-card variant="flat" color="#f9f9f7" rounded="lg" class="pa-4 border">

              <div class="d-flex justify-space-between align-center mb-2">
                <span class="text-body-2 text-grey-darken-1">Customer Offer Total</span>
                <span class="text-h6 font-weight-bold">{{ formatCurrency(customerOfferTotal) }}</span>
              </div>

              <div class="d-flex justify-space-between align-center mb-4">
                <span class="text-body-2 text-grey-darken-1">Company Cost Total</span>
                <span class="text-h6 font-weight-bold">{{ formatCurrency(companyCostTotal) }}</span>
              </div>

              <v-divider class="mb-4" />

              <div class="d-flex justify-space-between align-center mb-2">
                <span class="text-body-2 text-grey-darken-1">Profit / (Loss)</span>
                <div class="d-flex align-center gap-2">
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
                <span class="text-body-2 text-grey-darken-1">Offer : Cost Ratio</span>
                <span class="text-body-2 font-weight-bold">
                  {{ offerCostRatio }}x · {{ marginPercent }}% margin
                </span>
              </div>

            </v-card>
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
</style>
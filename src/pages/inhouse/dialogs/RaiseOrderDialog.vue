<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRaiseOrder } from '../composables/useRaiseOrder'
import { formatCurrency } from '@/utils/helpers'
import type { ProductPickerResult } from '@/stores/productsData'
import CustomerTermsCard from '@/components/customers/CustomerTermsCard.vue'
import ProductPickerDialog from '@/components/products/ProductPicker.vue'

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'created'): void
}>()
defineProps<{ modelValue: boolean }>()

const {
  loading, customerId, govtPoNo, poAmount, remarks, lines,
  customerSearch, customerOptions, selectedCustomer, discountProfile, isGovtCustomer,
  offerTotal, costTotal, ratioLabel, ratioClass, profitLabel, marginLabel,
  addLine, removeLine, applyPickedProduct, submit, init,
} = useRaiseOrder(() => emit('created'))

// Products are chosen through the shared search dialog (the same one Purchasing
// uses), not a dropdown: it searches all 2,401 products server-side, where the
// products store only ever held the first 1,000 rows.
const showProductPicker = ref(false)
const pickerTargetIndex = ref<number | null>(null)

function openProductPicker(index: number) {
  pickerTargetIndex.value = index
  showProductPicker.value = true
}

function onProductSelected(product: ProductPickerResult) {
  if (pickerTargetIndex.value === null) return
  applyPickedProduct(pickerTargetIndex.value, product)
  pickerTargetIndex.value = null
}

onMounted(init)
</script>

<template>
  <v-dialog :model-value="modelValue" max-width="960" persistent scrollable
    @update:model-value="emit('update:modelValue', $event)">
    <v-card rounded="lg">
      <v-card-title class="pa-4 pa-sm-5 pb-3 text-h6 font-weight-bold">Place Order (Government / LGU)</v-card-title>
      <v-divider />
      <v-card-text class="pa-4 pa-sm-5">
        <v-row dense class="mb-2">
          <v-col cols="12" md="6">
            <label class="lbl">Customer (Government / LGU) *</label>
            <!-- Server-side search: ~5.3k customers, no longer filtered by
                 department (a customer may trade through more than one
                 channel). Subtitle shows category · area · department. -->
            <v-autocomplete
              v-model="customerId"
              v-model:search="customerSearch"
              :items="customerOptions"
              placeholder="Search customer by name or contact"
              item-props
              no-filter
              variant="outlined" density="compact" hide-details
              no-data-text="No customer matches that search"
            />
          </v-col>
          <v-col v-if="selectedCustomer" cols="12">
            <!-- What was agreed with this account. 54 of 81 government
                 customers carry a pricing basis ('AS PER PR', 'PLUS 15%') that
                 the negotiator could not see here before. -->
            <CustomerTermsCard :customer="selectedCustomer" :profile="discountProfile" />
          </v-col>
          <v-col v-if="isGovtCustomer" cols="12" md="6">
            <label class="lbl">Government PO # (documentation)</label>
            <v-text-field v-model="govtPoNo" placeholder="Their PO number, for the record" variant="outlined" density="compact" hide-details />
          </v-col>
          <v-col v-if="isGovtCustomer" cols="12" md="6">
            <label class="lbl">PO Amount (documentation)</label>
            <v-text-field
              v-model.number="poAmount" type="number" min="0"
              placeholder="Value printed on their PO"
              variant="outlined" density="compact" hide-details
            />
          </v-col>
        </v-row>
        <!-- The company's own PO number is NOT typed — it's derived from the order
             number (IH-… → PO-…) and stamped automatically when terms are agreed. -->
        <div class="text-caption text-medium-emphasis mb-1">
          The company PO number (PO-YYYY-###) is assigned automatically once terms are agreed.
        </div>

        <div class="d-flex justify-space-between align-center mb-2 mt-3">
          <span class="text-subtitle-2 font-weight-bold">Line items</span>
          <v-btn variant="text" size="small" color="primary" class="text-none" prepend-icon="mdi-plus" @click="addLine">Add Item</v-btn>
        </div>

        <v-table density="compact">
          <thead>
            <tr>
              <th class="text-left">Product</th>
              <th class="text-left" style="width:80px">Unit</th>
              <th class="text-right" style="width:100px">Qty</th>
              <th class="text-right" style="width:130px">PR Price</th>
              <th class="text-right" style="width:130px">Cost/Unit</th>
              <th class="text-right" style="width:120px">Offer Total</th>
              <th style="width:40px"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(line, i) in lines" :key="i">
              <td>
                <v-text-field
                  :model-value="line.product_name"
                  placeholder="Search product"
                  readonly
                  variant="outlined" density="compact" hide-details
                  append-inner-icon="mdi-database-search-outline"
                  @click="openProductPicker(i)"
                  @click:append-inner="openProductPicker(i)"
                />
              </td>
              <td class="text-medium-emphasis">{{ line.unit || '—' }}</td>
              <td><v-text-field v-model.number="line.qty" type="number" min="1" variant="outlined" density="compact" hide-details class="input-number" /></td>
              <td><v-text-field v-model.number="line.offer_unit" type="number" min="0" prefix="₱" variant="outlined" density="compact" hide-details /></td>
              <td><v-text-field v-model.number="line.cost_unit" type="number" min="0" prefix="₱" variant="outlined" density="compact" hide-details /></td>
              <td class="text-right">{{ formatCurrency(line.qty * line.offer_unit) }}</td>
              <td class="text-center">
                <v-btn variant="text" size="small" icon="mdi-close" color="error" :disabled="lines.length === 1" @click="removeLine(i)" />
              </td>
            </tr>
          </tbody>
        </v-table>

        <v-textarea v-model="remarks" label="Notes" variant="outlined" density="compact" rows="2" hide-details class="mt-3" />

        <v-row class="mt-2" justify="end">
          <v-col cols="12" md="5">
            <div class="d-flex justify-space-between text-body-2"><span>Customer Offer Total</span><span>{{ formatCurrency(offerTotal) }}</span></div>
            <div class="d-flex justify-space-between text-body-2 text-medium-emphasis"><span>Company Cost Total</span><span>{{ formatCurrency(costTotal) }}</span></div>
            <v-divider class="my-1" />
            <div class="d-flex justify-space-between text-body-1 font-weight-bold" :class="ratioClass">
              <span>Ratio (Cost / Offer)</span><span>{{ ratioLabel }}</span>
            </div>
            <div class="d-flex justify-space-between text-body-2 font-weight-bold" :class="ratioClass">
              <span>Projected Profit ({{ marginLabel }})</span><span>{{ profitLabel }}</span>
            </div>
          </v-col>
        </v-row>
      </v-card-text>
      <v-divider />
      <v-card-actions class="pa-4 justify-end" style="gap:8px">
        <v-btn variant="outlined" class="text-none" @click="emit('update:modelValue', false)">Cancel</v-btn>
        <v-btn color="primary" class="text-none font-weight-bold" elevation="0" :loading="loading" @click="submit">Place Order</v-btn>
      </v-card-actions>
    </v-card>

    <ProductPickerDialog v-model="showProductPicker" @select="onProductSelected" />
  </v-dialog>
</template>

<style scoped>
.lbl { display:block; font-size:.8rem; font-weight:600; color:#424242; margin-bottom:4px; }
.input-number :deep(input[type="number"]) {
  -moz-appearance: textfield;
  appearance: textfield;
}
.input-number :deep(input[type="number"]::-webkit-outer-spin-button),
.input-number :deep(input[type="number"]::-webkit-inner-spin-button) {
  -webkit-appearance: none;
  margin: 0;
}
</style>

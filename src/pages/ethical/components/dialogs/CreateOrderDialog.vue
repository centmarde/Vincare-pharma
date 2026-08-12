<script setup lang="ts">
import { computed, watch } from 'vue'
import { useDisplay } from 'vuetify'

import CustomerTermsCard from '@/components/customers/CustomerTermsCard.vue'
import { useCreateOrder } from '../../composables/useCreateOrder'
import { formatCurrency } from '@/utils/helpers'

const { mobile } = useDisplay()

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [boolean]
  created: []
}>()

const internalValue = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})

const {
  loading,
  customerId,
  customerSearch,
  customerOptions,
  selectedCustomer,
  agentId,
  agentOptions,
  outletId,
  outletOptions,
  remarks,
  lines,
  productOptions,
  subtotal,
  discountRate,
  discountAmount,
  rebateRate,
  rebateAmount,
  adsRate,
  adsAmount,
  termsDays,
  total,
  dueDatePreview,
  discountProfile,
  termsNeedReview,
  markupDivisorLabel,
  giveawayRate,
  netRevenue,
  belowCostLines,
  hasBelowCostLine,
  lineBelowCost,
  erodesSystemPrice,
  addLine,
  removeLine,
  onProductChange,
  onCustomerChange,
  unitFor,
  submit,
  reset,
  init,
} = useCreateOrder(() => {
  emit('created')
  internalValue.value = false
})

watch(
  () => internalValue.value,
  (value) => {
    if (value) {
      void init()
    }
  },
)
</script>

<template>
  <v-dialog
    v-model="internalValue"
    :fullscreen="mobile"
    :max-width="mobile ? undefined : 900"
    :transition="mobile ? 'dialog-bottom-transition' : undefined"
    persistent
  >
    <v-card :rounded="mobile ? '0' : 'lg'">
      <v-toolbar v-if="mobile" color="surface" density="comfortable">
        <v-btn
          icon="mdi-close"
          @click="
            reset();
            internalValue = false
          "
        />
        <v-toolbar-title class="text-body-1 font-weight-bold">
          Create Ethical Order
        </v-toolbar-title>

        <v-btn
          variant="flat"
          color="primary"
          class="text-none mr-2"
          :loading="loading"
          :disabled="hasBelowCostLine"
          @click="submit"
        >
          Create
        </v-btn>
      </v-toolbar>

      <v-card-title v-else class="pa-4 pa-sm-5 d-flex align-center ga-2">
        <v-icon icon="mdi-clipboard-text-plus-outline" color="primary" />

        <span class="text-h6 font-weight-bold"> Create Ethical Order </span>
      </v-card-title>

      <v-divider />

      <v-card-text class="pa-4 pa-sm-5">
        <div class="mb-4 d-flex ga-2" :class="mobile ? 'flex-column' : 'flex-wrap'">
          <v-autocomplete
            v-model="customerId"
            v-model:search="customerSearch"
            :items="customerOptions"
            label="Customer"
            item-title="title"
            item-value="value"
            item-props
            no-filter
            class="flex-grow-1"
            :hint="markupDivisorLabel ?? undefined"
            persistent-hint
            no-data-text="No customer matches that search"
            @update:model-value="onCustomerChange"
          />

          <v-select
            v-model="outletId"
            :items="outletOptions"
            label="Branch"
            item-title="title"
            item-value="value"
            class="flex-grow-1"
          />
        </div>

        <CustomerTermsCard
          v-if="selectedCustomer"
          :customer="selectedCustomer"
          :profile="discountProfile"
          class="mb-4"
        />

        <div class="mb-4">
          <v-select
            v-model="agentId"
            :items="agentOptions"
            label="Medical Sales Representative"
            item-title="title"
            item-value="value"
            class="w-100"
          />
        </div>

        <v-alert
          v-if="customerId && termsNeedReview"
          type="warning"
          variant="tonal"
          density="compact"
          class="mb-4"
        >
          This customer's agreed terms don't reconcile, so nothing is applied automatically —
          discount and rebate are 0%. Check the recorded terms above and adjust the line prices
          yourself.
        </v-alert>

        <v-alert v-else-if="customerId" type="info" variant="tonal" density="compact" class="mb-4">
          Discount, rebate and ads come from the customer's agreed terms — edit them on the
          customer, not per order.
        </v-alert>

        <v-alert
          v-if="hasBelowCostLine"
          type="error"
          variant="tonal"
          density="compact"
          class="mb-4"
        >
          <div class="font-weight-bold mb-1">Selling below cost — cannot create this order</div>

          <div class="text-caption">
            After {{ giveawayRate }}% discount + rebate, these lines realize less than the goods
            cost:
          </div>

          <ul class="text-caption mt-1">
            <li v-for="belowCost in belowCostLines" :key="belowCost.index">
              {{ belowCost.name }} — nets {{ formatCurrency(belowCost.net) }}/unit vs cost
              {{ formatCurrency(belowCost.cost) }}
            </li>
          </ul>
        </v-alert>

        <v-alert
          v-else-if="erodesSystemPrice && customerId && subtotal > 0"
          type="warning"
          variant="tonal"
          density="compact"
          class="mb-4"
        >
          Discount + rebate ({{ giveawayRate }}%) exceed this customer's markup — you'll actually
          realize
          <strong>
            {{ formatCurrency(netRevenue) }}
          </strong>
          of the {{ formatCurrency(subtotal) }} subtotal, which is below system price. Still above
          cost, but the markup no longer funds the giveaway.
        </v-alert>

        <v-text-field
          v-model="remarks"
          label="Remarks"
          variant="outlined"
          density="compact"
          class="mb-4"
        />

        <div class="mb-4">
          <div class="d-flex justify-space-between align-center mb-2">
            <h4 class="text-subtitle-1">Line Items</h4>

            <v-btn size="small" icon="mdi-plus" color="primary" variant="tonal" @click="addLine" />
          </div>

          <template v-if="mobile">
            <v-card
              v-for="(line, i) in lines"
              :key="i"
              variant="outlined"
              rounded="lg"
              class="mb-2 pa-3"
              :class="{
                'bg-red-lighten-5': lineBelowCost(i),
              }"
            >
              <div class="d-flex align-center justify-space-between ga-2 mb-2">
                <span class="font-weight-medium text-body-2"> Item {{ i + 1 }} </span>

                <div class="d-flex align-center" style="gap: 4px">
                  <v-icon v-if="lineBelowCost(i)" icon="mdi-alert" color="error" size="16" />

                  <v-btn
                    size="x-small"
                    icon="mdi-delete"
                    color="error"
                    variant="text"
                    @click="removeLine(i)"
                  />
                </div>
              </div>

              <v-select
                v-model="line.product_id"
                :items="productOptions"
                item-title="title"
                item-value="value"
                density="compact"
                variant="outlined"
                label="Product"
                class="mb-2"
                @update:model-value="onProductChange(i)"
              />

              <div class="text-caption text-medium-emphasis mb-2">
                {{ unitFor(line.product_id) }}
              </div>

              <v-row dense>
                <v-col cols="6">
                  <v-text-field
                    v-model.number="line.quantity"
                    type="number"
                    density="compact"
                    variant="outlined"
                    label="Qty"
                  />
                </v-col>

                <v-col cols="6">
                  <v-text-field
                    v-model.number="line.unit_price"
                    type="number"
                    density="compact"
                    variant="outlined"
                    label="Unit Price"
                  />
                </v-col>
              </v-row>

              <div class="text-body-2 font-weight-medium text-right">
                {{ formatCurrency(line.quantity * line.unit_price) }}
              </div>
            </v-card>
          </template>

          <v-table v-else density="compact">
            <thead>
              <tr>
                <th>Product</th>
                <th>Unit</th>
                <th class="text-right">Qty</th>
                <th class="text-right">Unit Price</th>
                <th class="text-right">Total</th>
                <th />
              </tr>
            </thead>

            <tbody>
              <tr
                v-for="(line, i) in lines"
                :key="i"
                :class="{
                  'bg-red-lighten-5': lineBelowCost(i),
                }"
              >
                <td>
                  <v-select
                    v-model="line.product_id"
                    :items="productOptions"
                    item-title="title"
                    item-value="value"
                    density="compact"
                    @update:model-value="onProductChange(i)"
                  />
                </td>

                <td class="text-medium-emphasis">
                  {{ unitFor(line.product_id) }}
                </td>

                <td>
                  <v-text-field
                    v-model.number="line.quantity"
                    type="number"
                    density="compact"
                    class="text-right"
                  />
                </td>

                <td>
                  <v-text-field
                    v-model.number="line.unit_price"
                    type="number"
                    density="compact"
                    class="text-right"
                  />
                </td>

                <td class="text-right">
                  {{ formatCurrency(line.quantity * line.unit_price) }}

                  <v-icon
                    v-if="lineBelowCost(i)"
                    icon="mdi-alert"
                    color="error"
                    size="16"
                    class="ml-1"
                  />
                </td>

                <td>
                  <v-btn
                    size="x-small"
                    icon="mdi-delete"
                    color="error"
                    variant="text"
                    @click="removeLine(i)"
                  />
                </td>
              </tr>
            </tbody>
          </v-table>
        </div>

        <div class="text-right space-y-2">
          <div>Subtotal: {{ formatCurrency(subtotal) }}</div>

          <div>
            Discount
            <span v-if="discountRate"> ({{ discountRate }}%) </span>: −{{
              formatCurrency(discountAmount)
            }}
          </div>

          <div class="text-lg font-weight-bold">Total: {{ formatCurrency(total) }}</div>

          <div class="text-caption text-medium-emphasis mt-1">
            Rebate
            <span v-if="rebateRate"> ({{ rebateRate }}%) </span>:
            {{ formatCurrency(rebateAmount) }} — paid separately, not deducted
          </div>

          <div v-if="adsRate" class="text-caption text-medium-emphasis">
            Ads &amp; promo ({{ adsRate }}%): {{ formatCurrency(adsAmount) }}
            — given in kind, not deducted
          </div>

          <div class="text-caption text-medium-emphasis">
            Terms: Net {{ termsDays }} days

            <span v-if="termsDays"> (Due {{ dueDatePreview }}) </span>
          </div>
        </div>
      </v-card-text>

      <template v-if="!mobile">
        <v-divider />

        <v-card-actions>
          <v-spacer />

          <v-btn
            @click="
              reset();
              internalValue = false
            "
          >
            Cancel
          </v-btn>

          <v-btn color="primary" :loading="loading" :disabled="hasBelowCostLine" @click="submit">
            Create Order
          </v-btn>
        </v-card-actions>
      </template>
    </v-card>
  </v-dialog>
</template>

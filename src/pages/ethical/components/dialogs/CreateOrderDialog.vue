<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useCreateOrder } from '../../composables/useCreateOrder'
import { formatCurrency } from '@/utils/helpers'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [boolean]; created: [] }>()

const internalValue = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const {
  loading, customerId, agentId, outletId, remarks, lines,
  customerSearch, customerOptions, agentOptions, outletOptions, productOptions,
  subtotal, discountRate, discountAmount, rebateRate, rebateAmount, termsDays, total, dueDatePreview,
  markupDivisorLabel,
  giveawayRate, netRevenue, belowCostLines, hasBelowCostLine, lineBelowCost, erodesSystemPrice,
  addLine, removeLine, onProductChange, onCustomerChange, unitFor, submit, reset, init,
} = useCreateOrder(() => {
  emit('created')
  internalValue.value = false
})

watch(() => internalValue.value, (v) => {
  if (v) init()
})
</script>

<template>
  <v-dialog v-model="internalValue" persistent max-width="900px">
    <v-card>
      <v-card-title>Create Ethical Order</v-card-title>
      <v-card-text>
        <div class="mb-4 d-flex gap-2">
          <!-- Server-side search: there are ~5.3k customers, and the list is no
               longer filtered by department (a customer may trade through more
               than one channel). The subtitle shows category · area · department
               so staff can tell apart the many same-named pharmacies. -->
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

        <div class="mb-4 d-flex gap-2">
          <v-select v-model="agentId" :items="agentOptions" label="Medical Sales Representative" item-title="title" item-value="value" class="flex-grow-1" />
        </div>

        <v-alert
          v-if="customerId"
          type="info"
          variant="tonal"
          density="compact"
          class="mb-4"
        >
          Discount, rebate and terms are set from the customer's trade profile —
          edit them on the customer, not per order.
        </v-alert>

        <!-- 🔴 Below cost: a real loss. Blocks creation. -->
        <v-alert v-if="hasBelowCostLine" type="error" variant="tonal" density="compact" class="mb-4">
          <div class="font-weight-bold mb-1">Selling below cost — cannot create this order</div>
          <div class="text-caption">
            After {{ giveawayRate }}% discount + rebate, these lines realize less than the goods cost:
          </div>
          <ul class="text-caption mt-1">
            <li v-for="b in belowCostLines" :key="b.index">
              {{ b.name }} — nets {{ formatCurrency(b.net) }}/unit vs cost {{ formatCurrency(b.cost) }}
            </li>
          </ul>
        </v-alert>

        <!-- 🟡 Above cost but below system price: markup no longer covers the giveaway. -->
        <v-alert
          v-else-if="erodesSystemPrice && customerId && subtotal > 0"
          type="warning"
          variant="tonal"
          density="compact"
          class="mb-4"
        >
          Discount + rebate ({{ giveawayRate }}%) exceed this customer's markup — you'll actually
          realize <strong>{{ formatCurrency(netRevenue) }}</strong> of the
          {{ formatCurrency(subtotal) }} subtotal, which is below system price. Still above cost,
          but the markup no longer funds the giveaway.
        </v-alert>

        <v-text-field v-model="remarks" label="Remarks" />

        <div class="mb-4">
          <div class="d-flex justify-between align-center mb-2">
            <h4>Line Items</h4>
            <v-btn size="small" icon="mdi-plus" @click="addLine" />
          </div>
          <v-table density="compact">
            <thead>
              <tr>
                <th>Product</th>
                <th>Unit</th>
                <th class="text-right">Qty</th>
                <th class="text-right">Unit Price</th>
                <th class="text-right">Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(line, i) in lines" :key="i" :class="{ 'bg-red-lighten-5': lineBelowCost(i) }">
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
                <td class="text-medium-emphasis">{{ unitFor(line.product_id) }}</td>
                <td><v-text-field v-model.number="line.quantity" type="number" density="compact" class="text-right" /></td>
                <td><v-text-field v-model.number="line.unit_price" type="number" density="compact" class="text-right" /></td>
                <td class="text-right">
                  {{ formatCurrency(line.quantity * line.unit_price) }}
                  <v-icon v-if="lineBelowCost(i)" icon="mdi-alert" color="error" size="16" class="ml-1" />
                </td>
                <td><v-btn size="x-small" icon="mdi-delete" @click="removeLine(i)" /></td>
              </tr>
            </tbody>
          </v-table>
        </div>

        <div class="text-right space-y-2">
          <div>Subtotal: {{ formatCurrency(subtotal) }}</div>
          <div>Discount<span v-if="discountRate"> ({{ discountRate }}%)</span>: −{{ formatCurrency(discountAmount) }}</div>
          <div class="text-lg font-weight-bold">Total: {{ formatCurrency(total) }}</div>
          <div class="text-caption text-medium-emphasis mt-1">
            Rebate<span v-if="rebateRate"> ({{ rebateRate }}%)</span>: {{ formatCurrency(rebateAmount) }} — paid separately, not deducted
          </div>
          <div class="text-caption text-medium-emphasis">
            Terms: Net {{ termsDays }} days<span v-if="termsDays"> (Due {{ dueDatePreview }})</span>
          </div>
        </div>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn @click="reset(); internalValue = false">Cancel</v-btn>
        <v-btn color="primary" :loading="loading" :disabled="hasBelowCostLine" @click="submit">Create Order</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

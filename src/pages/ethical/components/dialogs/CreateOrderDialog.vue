<template>
  <v-dialog v-model="internalValue" persistent max-width="900px">
    <v-card>
      <v-card-title>Create Ethical Order</v-card-title>
      <v-card-text>
        <div class="mb-4">
          <v-select
            v-model="customerId"
            :items="customerOptions"
            label="Customer"
            item-title="title"
            item-value="value"
            @update:model-value="onCustomerChange"
          />
        </div>

        <div class="mb-4 d-flex gap-2">
          <v-select v-model="agentId" :items="agentOptions" label="Agent" item-title="title" item-value="value" class="flex-grow-1" />
          <v-text-field v-model.number="discount" label="Discount Amt" type="number" class="flex-grow-1" />
          <v-text-field v-model.number="rebate" label="Rebate Amt" type="number" class="flex-grow-1" />
          <v-text-field v-model.number="termsDays" label="Terms (Days)" type="number" class="flex-grow-1" />
        </div>

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
                <th class="text-right">Qty</th>
                <th class="text-right">Unit Price</th>
                <th class="text-right">Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(line, i) in lines" :key="i">
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
                <td><v-text-field v-model.number="line.quantity" type="number" density="compact" class="text-right" /></td>
                <td><v-text-field v-model.number="line.unit_price" type="number" density="compact" class="text-right" /></td>
                <td class="text-right">{{ (line.quantity * line.unit_price).toFixed(2) }}</td>
                <td><v-btn size="x-small" icon="mdi-delete" @click="removeLine(i)" /></td>
              </tr>
            </tbody>
          </v-table>
        </div>

        <div class="text-right space-y-2">
          <div>Subtotal: {{ subtotal.toFixed(2) }}</div>
          <div>Discount: {{ discount.toFixed(2) }}</div>
          <div>Rebate: {{ rebate.toFixed(2) }}</div>
          <div class="text-lg font-weight-bold">Total: {{ totalWithDiscount.toFixed(2) }}</div>
        </div>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn @click="reset; internalValue = false">Cancel</v-btn>
        <v-btn color="primary" :loading="loading" @click="submit">Create Order</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useCreateOrder } from '../../composables/useCreateOrder'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [boolean]; created: [] }>()

const internalValue = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const {
  loading, customerId, agentId, discount, rebate, termsDays, remarks, lines,
  customerOptions, agentOptions, productOptions, subtotal, totalWithDiscount,
  addLine, removeLine, onProductChange, onCustomerChange, submit, reset, init,
} = useCreateOrder(() => {
  emit('created')
  internalValue.value = false
})

watch(() => internalValue.value, (v) => {
  if (v) init()
})
</script>

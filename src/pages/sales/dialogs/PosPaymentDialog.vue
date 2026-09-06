<script setup lang="ts">
import { formatCurrency } from '@/utils/helpers'
import { useDisplay } from 'vuetify'
import { paymentMethods, paymentMethodMeta } from '@/utils/paymentMethods'
import type { PaymentMethod } from '@/utils/paymentMethods'
import { computed } from 'vue'

const { mobile } = useDisplay()

const props = defineProps<{
  modelValue: boolean
  total: number
  tendered: number | null
  changeDue: number
  canComplete: boolean
  loading: boolean
  customerName: string
  customerAddress: string
  customerMobile: string
  paymentMethod: PaymentMethod
  paymentReference: string
  customerSuggestions: { id: number; name: string | null; address: string | null; contact_no: string | null }[]
  customerSearching: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'update:tendered', value: number | null): void
  (e: 'update:customerName', value: string): void
  (e: 'update:customerAddress', value: string): void
  (e: 'update:customerMobile', value: string): void
  (e: 'update:paymentMethod', value: PaymentMethod): void
  (e: 'update:paymentReference', value: string): void
  (e: 'searchCustomer', term: string): void
  (e: 'pickCustomer', customer: { id: number; name: string | null; address: string | null; contact_no: string | null }): void
  (e: 'confirm'): void
}>()

const quickAmounts = [20, 50, 100, 200, 500, 1000]

// Cash takes an amount and returns change; everything else settles at the
// exact total and is identified by its own reference instead.
const meta = computed(() => paymentMethodMeta(props.paymentMethod))

// v-combobox hands back a string when the cashier types a new name, or the
// bound item when they pick a suggestion. Unpacked here because template
// expressions are parsed as plain JS -- a type annotation there is a parse
// error, not a type error.
function onCustomerInput(value: unknown) {
  if (typeof value === 'string') { emit('update:customerName', value); return }
  const picked = value as { name?: string | null } | null
  emit('update:customerName', picked?.name ?? '')
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="460"
    persistent
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card rounded="lg">
      <v-card-title class="pa-4 pa-sm-5 pb-3 text-h6 font-weight-bold">Payment</v-card-title>
      <v-divider />

      <v-card-text class="pa-4 pa-sm-5">
        <div class="d-flex justify-space-between align-center mb-4">
          <span class="text-body-1 text-medium-emphasis">Total Due</span>
          <span class="text-h5 font-weight-bold">{{ formatCurrency(total) }}</span>
        </div>

        <label class="field-label">Customer <span class="text-medium-emphasis">(optional)</span></label>
        <!-- Typeable, not a picker: an unrecognised name is a NEW walk-in and
             is created on save, so free text has to stay valid. Suggestions
             are a shortcut for someone who has been here before, never a
             restriction on who can be served. -->
        <v-combobox
          :model-value="customerName"
          :items="customerSuggestions"
          :loading="customerSearching"
          item-title="name"
          item-value="id"
          placeholder="Customer / business name"
          variant="outlined"
          density="compact"
          hide-details
          class="mb-2"
          :return-object="false"
          no-filter
          :menu-props="{ maxHeight: 260 }"
          @update:search="emit('searchCustomer', $event)"
          @update:model-value="onCustomerInput"
        >
          <template #item="{ props: itemProps, item }">
            <v-list-item
              v-bind="itemProps"
              :title="item.raw.name ?? '—'"
              :subtitle="[item.raw.contact_no, item.raw.address].filter(Boolean).join(' · ') || 'No contact on file'"
              @click="emit('pickCustomer', item.raw)"
            />
          </template>
          <template #no-data>
            <v-list-item
              title="New customer"
              subtitle="Saved automatically when the sale completes"
            />
          </template>
        </v-combobox>
        <v-text-field
          :model-value="customerAddress"
          placeholder="Address"
          variant="outlined"
          density="compact"
          hide-details
          class="mb-2"
          @update:model-value="emit('update:customerAddress', $event)"
        />
        <v-text-field
          :model-value="customerMobile"
          placeholder="Mobile"
          variant="outlined"
          density="compact"
          hide-details
          @update:model-value="emit('update:customerMobile', $event)"
        />

        <v-divider class="my-4" />

        <label class="field-label">Payment Method <span class="text-error">*</span></label>
        <v-btn-toggle
          :model-value="paymentMethod"
          mandatory
          density="compact"
          color="primary"
          variant="outlined"
          class="mb-3 d-flex flex-wrap"
          @update:model-value="emit('update:paymentMethod', $event)"
        >
          <v-btn
            v-for="m in paymentMethods"
            :key="m.value"
            :value="m.value"
            size="small"
            class="text-none"
            :prepend-icon="m.icon"
          >
            {{ m.title }}
          </v-btn>
        </v-btn-toggle>

        <template v-if="meta.takesTendered">
        <label class="field-label">Cash Tendered <span class="text-error">*</span></label>
        <v-text-field
          :model-value="tendered"
          type="number"
          min="0"
          prefix="₱"
          variant="outlined"
          density="compact"
          autofocus
          hide-details
          @update:model-value="emit('update:tendered', $event === '' ? null : Number($event))"
        />

        <div class="d-flex flex-wrap ga-2 mt-3">
          <v-btn
            v-for="amt in quickAmounts"
            :key="amt"
            :size="mobile ? 'default' : 'small'"
            variant="outlined"
            class="text-none"
            @click="emit('update:tendered', amt)"
          >
            ₱{{ amt }}
          </v-btn>
        </div>

        <v-divider class="my-4" />

        <div class="d-flex justify-space-between align-center">
          <span class="text-body-1 font-weight-medium">Change</span>
          <span class="text-h6 font-weight-bold" :class="changeDue > 0 ? 'text-success' : ''">
            {{ formatCurrency(changeDue) }}
          </span>
        </div>
        </template>

        <!-- Non-cash: the reference IS the proof the money moved, so it is
             required rather than optional. There is no change to show. -->
        <template v-else>
          <label class="field-label">{{ meta.referenceLabel }} <span class="text-error">*</span></label>
          <v-text-field
            :model-value="paymentReference"
            :placeholder="meta.referenceLabel ?? ''"
            variant="outlined"
            density="compact"
            autofocus
            hide-details
            @update:model-value="emit('update:paymentReference', $event)"
          />
          <div class="text-caption text-medium-emphasis mt-2">
            Paid in full via {{ meta.title }} &mdash; {{ formatCurrency(total) }}.
          </div>
        </template>
      </v-card-text>

      <v-divider />

      <v-card-actions class="px-4 px-sm-5 pb-4 pb-sm-5 pt-3 d-flex ga-2" :class="mobile ? 'flex-column-reverse' : 'justify-end'">
        <v-btn variant="outlined" class="text-none" :block="mobile" @click="emit('update:modelValue', false)">
          Cancel
        </v-btn>
        <v-btn
          color="success"
          class="text-none font-weight-bold"
          elevation="0"
          :block="mobile"
          :loading="loading"
          :disabled="!canComplete"
          @click="emit('confirm')"
        >
          Complete Sale
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.field-label {
  display: block;
  font-size: 0.8rem;
  font-weight: 600;
  color: #424242;
  margin-bottom: 4px;
}
</style>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ProductType } from '@/stores/productsData'
import { formatMonthYear } from '@/utils/helpers'

const props = defineProps<{
  product: ProductType | null
}>()

const emit = defineEmits<{
  confirm: [payload: { product: ProductType; qty: number; reason: string }]
}>()

const open = defineModel<boolean>({ default: false })

const qty = ref<number | null>(null)
const reason = ref('')
const formRef = ref()
const submitting = ref(false)

const onHand = computed(() => props.product?.current_stock ?? 0)

const remainingAfterDisposal = computed(() => {
  if (!qty.value || qty.value < 1) return onHand.value
  return Math.max(0, onHand.value - qty.value)
})

function requiredQty(value: number | null): true | string {
  if (value === null || value === undefined || String(value).trim() === '') {
    return 'Quantity is required'
  }
  return true
}

function wholeNumber(value: number | null): true | string {
  if (value === null) return true
  return Number.isInteger(Number(value)) || 'Quantity must be a whole number'
}

function withinStock(value: number | null): true | string {
  if (value === null) return true
  const amount = Number(value)
  if (amount < 1) return 'Quantity must be at least 1'
  if (amount > onHand.value) return `Only ${onHand.value} unit(s) on hand`
  return true
}

function requiredReason(value: string): true | string {
  return value.trim().length > 0 || 'A reason for disposal is required'
}

const qtyRules = [requiredQty, wholeNumber, withinStock]
const reasonRules = [requiredReason]

function resetForm() {
  qty.value = null
  reason.value = ''
  submitting.value = false
  formRef.value?.resetValidation()
}

async function onConfirm() {
  if (!props.product || submitting.value) return

  submitting.value = true
  const { valid } = await formRef.value.validate()
  if (!valid) {
    submitting.value = false
    return
  }

  emit('confirm', {
    product: props.product,
    qty: Number(qty.value),
    reason: reason.value.trim(),
  })
}

watch(open, (isOpen) => {
  if (!isOpen) resetForm()
})
</script>

<template>
  <v-dialog v-model="open" max-width="520" persistent>
    <v-card rounded="lg">
      <v-card-title class="d-flex align-center pa-4">
        <v-icon icon="mdi-delete-alert-outline" color="error" class="mr-2" size="28"></v-icon>
        <span class="text-h6 font-weight-bold">Dispose Product</span>
      </v-card-title>
      <v-divider></v-divider>

      <v-card-text class="pa-4">
        <v-sheet rounded="lg" color="surface-variant" class="pa-3 mb-4">
          <div class="text-body-1 font-weight-bold mb-2">
            {{ product?.product_name || 'this product' }}
          </div>
          <v-row dense>
            <v-col cols="6">
              <div class="text-caption text-medium-emphasis">Batch No.</div>
              <div class="text-body-2">{{ product?.batch_no || '—' }}</div>
            </v-col>
            <v-col cols="6">
              <div class="text-caption text-medium-emphasis">Expiry</div>
              <div class="text-body-2">
                {{ product?.expiry_date ? formatMonthYear(product.expiry_date) : 'N/A' }}
              </div>
            </v-col>
            <v-col cols="6">
              <div class="text-caption text-medium-emphasis">SKU</div>
              <div class="text-body-2">{{ product?.sku || 'No SKU' }}</div>
            </v-col>
            <v-col cols="6">
              <div class="text-caption text-medium-emphasis">On hand</div>
              <div class="text-body-2 font-weight-medium">{{ onHand }} unit(s)</div>
            </v-col>
          </v-row>
        </v-sheet>

        <v-form ref="formRef" @submit.prevent="onConfirm">
          <v-text-field
            v-model.number="qty"
            :rules="qtyRules"
            type="number"
            min="1"
            :max="onHand"
            label="Quantity to dispose"
            variant="outlined"
            density="comfortable"
            suffix="unit(s)"
            class="mb-2"
          ></v-text-field>

          <v-textarea
            v-model="reason"
            :rules="reasonRules"
            label="Reason for disposal"
            placeholder="e.g. Expired 08/2026, water damage during storage"
            variant="outlined"
            density="comfortable"
            rows="3"
            auto-grow
          ></v-textarea>
        </v-form>

        <v-alert
          type="warning"
          variant="tonal"
          density="comfortable"
          icon="mdi-account-lock-outline"
          class="mt-2"
        >
          Disposal requires executive approval. Stock stays at
          <strong>{{ onHand }}</strong> until approved, then drops to
          <strong>{{ remainingAfterDisposal }}</strong
          >.
        </v-alert>
      </v-card-text>

      <v-divider></v-divider>
      <v-card-actions class="px-4 py-3">
        <v-spacer></v-spacer>
        <v-btn variant="text" color="grey" :disabled="submitting" @click="open = false">
          Cancel
        </v-btn>
        <v-btn
          variant="flat"
          color="error"
          prepend-icon="mdi-send-outline"
          :loading="submitting"
          @click="onConfirm"
        >
          Request Disposal
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

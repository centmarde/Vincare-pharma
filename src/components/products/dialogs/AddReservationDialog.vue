<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useCustomersDataStore } from '@/stores/customersData'
import { useReservedProductsDataStore } from '@/stores/reservedProductsData'
import { useWarehouseProductsDataStore } from '@/stores/warehouseProductsData'
import { useToast } from 'vue-toastification'
import type { ProductType } from '@/stores/productsData'

const props = defineProps<{
  modelValue: boolean
  selectedProduct: ProductType | null
  selectedWarehouseId: number | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'reservation-added'): void
}>()

const toast = useToast()
const customersStore = useCustomersDataStore()
const reservedProductsStore = useReservedProductsDataStore()
const warehouseProductsStore = useWarehouseProductsDataStore()

// Fetch customers on mount
customersStore.fetchCustomers()

const showDialog = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
})

const reservationCustomerId = ref<number | null>(null)
const reservationQuantity = ref<number>(0)

const dialogTitle = computed(() => {
  return `Add Reservation - ${props.selectedProduct?.product_name || ''}`
})

// Reset form when dialog opens
watch(() => props.modelValue, (open) => {
  if (open) {
    reservationCustomerId.value = null
    reservationQuantity.value = 0
  }
})

async function addReservation() {
  if (!props.selectedProduct || !reservationCustomerId.value || reservationQuantity.value <= 0) {
    toast.error('Please fill in all reservation details')
    return
  }

  if (!props.selectedWarehouseId) {
    toast.error('Please select a warehouse first')
    return
  }

  // Find the warehouse_product_id for this product in the selected warehouse
  const warehouseProduct = warehouseProductsStore.warehouseProducts.find(
    wp => wp.product_id === props.selectedProduct?.id && wp.warehouse_id === props.selectedWarehouseId
  )

  if (!warehouseProduct || warehouseProduct.id == null) {
    toast.error('Product not found in selected warehouse')
    return
  }

  const result = await reservedProductsStore.createReservedProduct({
    warehouse_products_id: warehouseProduct.id,
    customer_id: reservationCustomerId.value,
    reserved_qty: reservationQuantity.value,
  })

  if (result) {
    toast.success('Reservation added successfully')
    showDialog.value = false
    emit('reservation-added')
  } else {
    toast.error('Failed to add reservation')
  }
}
</script>

<template>
  <v-dialog v-model="showDialog" max-width="500" persistent>
    <v-card rounded="lg">
      <v-card-title class="d-flex align-center pa-4">
        <v-icon icon="mdi-bookmark-plus" class="mr-2" color="primary" />
        <span class="text-h6 font-weight-bold">{{ dialogTitle }}</span>
      </v-card-title>
      <v-divider />
      <v-card-text class="pa-4">
        <v-select
          v-model="reservationCustomerId"
          :items="customersStore.customers"
          item-title="name"
          item-value="id"
          label="Select Customer"
          prepend-inner-icon="mdi-account"
          variant="outlined"
          density="comfortable"
          class="mb-3"
          hide-details
        ></v-select>
        <v-text-field
          v-model.number="reservationQuantity"
          label="Reservation Quantity"
          type="number"
          prepend-inner-icon="mdi-package-variant"
          variant="outlined"
          density="comfortable"
          min="1"
          hide-details
        ></v-text-field>
      </v-card-text>
      <v-divider />
      <v-card-actions class="px-4 py-3">
        <v-spacer />
        <v-btn variant="text" color="grey" @click="showDialog = false">Cancel</v-btn>
        <v-btn
          variant="flat"
          color="primary"
          @click="addReservation"
          :disabled="!reservationCustomerId || !reservationQuantity || reservationQuantity <= 0"
        >
          Add Reservation
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

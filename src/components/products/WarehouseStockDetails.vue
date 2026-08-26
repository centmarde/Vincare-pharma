<script setup lang="ts">
import { computed } from 'vue'

interface Reservation {
  id: number
  customer_name: string
  reserved_qty: number
}

interface WarehouseProductDetail {
  total_qty: number
}

const props = defineProps<{
  product: any
  selectedWarehouseId?: number | null
  getWarehouseStock?: (productId: number) => number | null
  getWarehouseProductDetail?: (productId: number) => WarehouseProductDetail | null
  getProductReservations?: (productId: number) => Reservation[]
  openAddReservationDialog?: (product: any) => void
  removeReservation?: (reservationId: number) => void
}>()

const detail = computed(() => {
  if (!props.selectedWarehouseId || !props.getWarehouseProductDetail) return null
  return props.getWarehouseProductDetail(props.product.id) ?? null
})

const reservations = computed<Reservation[]>(() => {
  return props.getProductReservations?.(props.product.id) ?? []
})

// Main warehouse (no filter) available stock = current stock minus reserved quantities.
const mainAvailableStock = computed(() => {
  const reserved = reservations.value.reduce((sum, r) => sum + (r.reserved_qty ?? 0), 0)
  return Math.max(0, (props.product.current_stock ?? 0) - reserved)
})
</script>

<template>
  <!-- Warehouse-specific stock + reservations (when a specific warehouse is selected) -->
  <template v-if="detail">
    <v-col cols="12" class="py-2">
      <v-divider class="mb-2"></v-divider>
      <div class="text-subtitle-2 font-weight-bold text-grey-darken-1 mb-2">
        <v-icon icon="mdi-warehouse" size="18" class="mr-1"></v-icon>
        Warehouse Stock Details
      </div>
    </v-col>

    <v-col cols="12" md="4" class="d-flex align-center py-2">
      <v-icon icon="mdi-package-variant-closed" color="primary" class="mr-3"></v-icon>
      <div>
        <div class="text-caption text-grey-darken-1">Total Qty</div>
        <div class="text-body-1 font-weight-medium">
          {{ Math.max(0, detail.total_qty ?? 0) }}
        </div>
      </div>
    </v-col>

    <v-col cols="12" md="4" class="d-flex align-center py-2">
      <v-icon icon="mdi-check-circle-outline" color="success" class="mr-3"></v-icon>
      <div>
        <div class="text-caption text-grey-darken-1">Available Stock</div>
        <div class="text-body-1 font-weight-medium">
          {{ Math.max(0, getWarehouseStock?.(product.id) ?? 0) }}
        </div>
      </div>
    </v-col>

    <v-col cols="12" md="4" class="d-flex align-center py-2">
      <v-btn
        v-if="(getWarehouseStock?.(product.id) ?? 0) > 0"
        icon="mdi-plus"
        size="small"
        variant="outlined"
        color="primary"
        @click="openAddReservationDialog?.(product)"
      >
        <v-icon size="16">mdi-bookmark-plus</v-icon>
        <v-tooltip activator="parent" location="top">Add Reservation</v-tooltip>
      </v-btn>
    </v-col>

    <!-- Reserved to Customers (warehouse-specific) -->
    <v-col cols="12" class="py-2">
      <v-divider class="mb-2"></v-divider>
      <div class="text-subtitle-2 font-weight-bold text-grey-darken-1 mb-2">
        <v-icon icon="mdi-bookmark-multiple" size="18" class="mr-1"></v-icon>
        Reserved to Customers
      </div>
      <template v-if="reservations.length > 0">
        <v-list density="compact" class="pa-0" lines="one">
          <v-list-item
            v-for="reservation in reservations"
            :key="reservation.id"
            class="px-0"
          >
            <template #prepend>
              <v-icon icon="mdi-account" color="warning" size="20"></v-icon>
            </template>
            <v-list-item-title class="text-body-2">
              {{ reservation.customer_name }}
            </v-list-item-title>
            <template #append>
              <v-chip size="x-small" color="warning" variant="outlined" class="mr-2">
                {{ reservation.reserved_qty }}
              </v-chip>
              <v-btn
                v-if="removeReservation"
                icon="mdi-delete"
                size="x-small"
                variant="text"
                color="error"
                @click.stop="removeReservation(reservation.id)"
              ></v-btn>
            </template>
          </v-list-item>
        </v-list>
      </template>
      <div v-else class="text-body-2 text-grey">
        No reservations for this product
      </div>
    </v-col>
  </template>

  <!-- Main warehouse (no specific warehouse selected): reservation module only -->
  <template v-else-if="!selectedWarehouseId">
    <v-col cols="12" class="py-2">
      <v-divider class="mb-2"></v-divider>
      <div class="d-flex align-center justify-space-between mb-2">
        <div class="text-subtitle-2 font-weight-bold text-grey-darken-1">
          <v-icon icon="mdi-bookmark-multiple" size="18" class="mr-1"></v-icon>
          Reserved to Customers
        </div>
        <v-btn
          v-if="mainAvailableStock > 0"
          size="small"
          variant="text"
          color="primary"
          class="text-none"
          prepend-icon="mdi-bookmark-plus"
          @click="openAddReservationDialog?.(product)"
        >
          Add Reservation
        </v-btn>
      </div>
      <template v-if="reservations.length > 0">
        <v-list density="compact" class="pa-0" lines="one">
          <v-list-item
            v-for="reservation in reservations"
            :key="reservation.id"
            class="px-0"
          >
            <template #prepend>
              <v-icon icon="mdi-account" color="warning" size="20"></v-icon>
            </template>
            <v-list-item-title class="text-body-2">
              {{ reservation.customer_name }}
            </v-list-item-title>
            <template #append>
              <v-chip size="x-small" color="warning" variant="outlined" class="mr-2">
                {{ reservation.reserved_qty }}
              </v-chip>
              <v-btn
                v-if="removeReservation"
                icon="mdi-delete"
                size="x-small"
                variant="text"
                color="error"
                @click.stop="removeReservation(reservation.id)"
              ></v-btn>
            </template>
          </v-list-item>
        </v-list>
      </template>
      <div v-else class="text-body-2 text-grey">
        No reservations for this product
      </div>
    </v-col>
  </template>
</template>
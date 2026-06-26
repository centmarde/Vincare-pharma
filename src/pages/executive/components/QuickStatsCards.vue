<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useSuppliersDataStore } from '@/stores/suppliersData'
import SuppliersDialog from '../dialogs/SuppliersDialog.vue'

defineProps<{
  totalOrders: number
  pendingOrders: number
  revenueGrowth: string
}>()

const suppliersStore = useSuppliersDataStore()
const showSuppliersDialog = ref(false)

const activeSuppliersCount = computed(() => suppliersStore.activeSuppliers.length)

onMounted(() => {
  if (suppliersStore.suppliers.length === 0) {
    suppliersStore.fetchSuppliers({ activeOnly: true })
  }
})

function openSuppliers() {
  showSuppliersDialog.value = true
}
</script>

<template>
  <v-row class="ma-0 mb-4">
    <v-col cols="6" sm="3" class="pa-2">
      <v-card class="rounded-xl quick-stat-card" elevation="0">
        <v-card-text class="pa-4 text-center">
          <v-icon icon="mdi-file-document-outline" color="primary" size="28" class="mb-1" />
          <div class="text-h5 font-weight-bold">{{ totalOrders }}</div>
          <div class="text-caption text-medium-emphasis">Total Orders</div>
        </v-card-text>
      </v-card>
    </v-col>
    <v-col cols="6" sm="3" class="pa-2">
      <v-card class="rounded-xl quick-stat-card" elevation="0">
        <v-card-text class="pa-4 text-center">
          <v-icon icon="mdi-clock-alert-outline" color="warning" size="28" class="mb-1" />
          <div class="text-h5 font-weight-bold">{{ pendingOrders }}</div>
          <div class="text-caption text-medium-emphasis">Pending Orders</div>
        </v-card-text>
      </v-card>
    </v-col>
    <v-col cols="6" sm="3" class="pa-2">
      <v-card
        class="rounded-xl quick-stat-card"
        elevation="0"
        style="cursor: pointer;"
        @click="openSuppliers"
      >
        <v-card-text class="pa-4 text-center">
          <v-icon icon="mdi-truck-delivery" color="info" size="28" class="mb-1" />
          <div class="text-h5 font-weight-bold">{{ activeSuppliersCount }}</div>
          <div class="text-caption text-medium-emphasis">Active Suppliers</div>
        </v-card-text>
      </v-card>
    </v-col>
    <v-col cols="6" sm="3" class="pa-2">
      <v-card class="rounded-xl quick-stat-card" elevation="0">
        <v-card-text class="pa-4 text-center">
          <v-icon icon="mdi-trending-up" color="success" size="28" class="mb-1" />
          <div class="text-h5 font-weight-bold">{{ revenueGrowth }}</div>
          <div class="text-caption text-medium-emphasis">Revenue Growth</div>
        </v-card-text>
      </v-card>
    </v-col>
  </v-row>

  <SuppliersDialog v-model="showSuppliersDialog" />
</template>
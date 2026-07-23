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
  <v-row class="ma-0 mx-2 my-2" justify="start">
    <v-col cols="auto" class="pa-1">
      <v-tooltip location="top">
        <template #activator="{ props }">
          <v-icon
            v-bind="props"
            icon="mdi-file-document-outline"
            color="primary"
            size="22"
            class="quick-stat-icon"
          />
        </template>
        <div class="text-center pa-2">
          <div class="text-h6 font-weight-bold">{{ totalOrders }}</div>
          <div class="text-caption text-medium-emphasis">Total Orders</div>
        </div>
      </v-tooltip>
    </v-col>

    <v-col cols="auto" class="pa-1">
      <v-tooltip location="top">
        <template #activator="{ props }">
          <v-icon
            v-bind="props"
            icon="mdi-clock-alert-outline"
            color="warning"
            size="22"
            class="quick-stat-icon"
          />
        </template>
        <div class="text-center pa-2">
          <div class="text-h6 font-weight-bold">{{ pendingOrders }}</div>
          <div class="text-caption text-medium-emphasis">Pending Orders</div>
        </div>
      </v-tooltip>
    </v-col>

    <v-col cols="auto" class="pa-1">
      <v-tooltip location="top">
        <template #activator="{ props }">
          <v-icon
            v-bind="props"
            icon="mdi-truck-delivery"
            color="info"
            size="22"
            class="quick-stat-icon"
            style="cursor: pointer"
            @click="openSuppliers"
          />
        </template>
        <div class="text-center pa-2">
          <div class="text-h6 font-weight-bold">{{ activeSuppliersCount }}</div>
          <div class="text-caption text-medium-emphasis">Active Suppliers</div>
        </div>
      </v-tooltip>
    </v-col>

    <v-col cols="auto" class="pa-1">
      <v-tooltip location="top">
        <template #activator="{ props }">
          <v-icon
            v-bind="props"
            icon="mdi-trending-up"
            color="success"
            size="22"
            class="quick-stat-icon"
          />
        </template>
        <div class="text-center pa-2">
          <div class="text-h6 font-weight-bold">{{ revenueGrowth }}</div>
          <div class="text-caption text-medium-emphasis">Revenue Growth</div>
        </div>
      </v-tooltip>
    </v-col>
  </v-row>

  <SuppliersDialog v-model="showSuppliersDialog" />
</template>

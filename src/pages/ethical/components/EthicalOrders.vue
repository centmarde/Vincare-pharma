<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useEthicalOrders } from '../composables/useEthicalOrders'
import CreateOrderDialog from './dialogs/CreateOrderDialog.vue'
import OrderDetailDialog from './dialogs/OrderDetailDialog.vue'

const { orders, loading, searchText, statusFilter, statusOptions, statusMeta, isOverdue, init } = useEthicalOrders()
const { headers } = useEthicalOrders()

const showCreateDialog = ref(false)
const showDetailDialog = ref(false)
const selectedOrderId = ref<number | null>(null)

function openOrderDialog(item: any) {
  selectedOrderId.value = item.id
  showDetailDialog.value = true
}

function handleRowClick(_: any, { item }: any) {
  openOrderDialog(item)
}

async function fetchOrders() {
  showCreateDialog.value = false
  await init()
}

onMounted(() => {
  init()
})
</script>

<template>
  <v-container fluid pa-0>
    <v-card class="elevation-0">
      <v-card-title class="d-flex align-center gap-2 pb-2">
        <span>Ethical Orders</span>
        <v-spacer />
        <v-btn size="small" prepend-icon="mdi-plus" @click="showCreateDialog = true" color="primary">
          New Order
        </v-btn>
      </v-card-title>

      <v-card-text>
        <div class="mb-4 d-flex gap-2">
          <v-text-field v-model="searchText" density="compact" placeholder="Search..." prepend-icon="mdi-magnify" />
          <v-select
            v-model="statusFilter"
            :items="statusOptions"
            density="compact"
            style="max-width: 150px"
            label="Status"
          />
        </div>

        <v-progress-linear v-if="loading" indeterminate />

        <v-data-table
          :headers="headers"
          :items="orders"
          :loading="loading"
          item-value="id"
          @click:row="handleRowClick"
          class="cursor-pointer"
        >
          <template #item.status="{ item }">
            <v-chip :color="statusMeta(item.status).color" label size="small">
              {{ statusMeta(item.status).label }}
            </v-chip>
            <v-chip v-if="item.fulfillment_status === 'awaiting_stock'" color="orange" label size="small" class="ml-1">
              Awaiting Stock
            </v-chip>
          </template>
          <template #item.due_date="{ item }">
            <div :class="{ 'text-red': isOverdue(item) }">
              {{ item.due_date ? new Date(item.due_date).toLocaleDateString() : '—' }}
              <v-chip
                v-if="isOverdue(item)"
                color="error"
                size="x-small"
                label
                class="ml-1"
              >
                Overdue
              </v-chip>
            </div>
          </template>
        </v-data-table>
      </v-card-text>
    </v-card>

    <CreateOrderDialog v-model="showCreateDialog" @created="fetchOrders" />
    <OrderDetailDialog v-model="showDetailDialog" :order-id="selectedOrderId" />
  </v-container>
</template>

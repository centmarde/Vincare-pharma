<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useEthicalOrders } from '../composables/useEthicalOrders'
import CreateOrderDialog from './dialogs/CreateOrderDialog.vue'
import OrderDetailDialog from './dialogs/OrderDetailDialog.vue'
import { formatCurrency } from '@/utils/helpers'
import { useDisplay } from 'vuetify'

const { mobile } = useDisplay()
const { orders, loading, searchText, statusFilter, statusOptions, statusMeta, isOverdue, headers, init } = useEthicalOrders()

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

const notSet = (field: string) => `No ${field} set`

const balanceAmount = (item: any) => Math.max(0, (item.total_amount ?? 0) - (item.amount_paid ?? 0))
</script>

<template>
  <v-container fluid class="pa-2 pa-sm-4 fill-height align-start">
    <div class="mx-auto w-100">
      <v-card class="elevation-0" rounded="lg">
        <!-- Header -->
        <v-card-title
          class="pa-4 pa-sm-5 d-flex align-center flex-wrap ga-2"
          :class="{ 'flex-column align-start': mobile }"
        >
          <div class="d-flex align-center ga-2">
            <v-icon icon="mdi-clipboard-text-clock-outline" color="primary" />
            <span class="text-h6 font-weight-bold">Ethical Orders</span>
          </div>
          <v-spacer v-if="!mobile" />
          <v-btn
            size="small" variant="flat" color="primary" class="text-none"
            :block="mobile"
            prepend-icon="mdi-plus" @click="showCreateDialog = true"
          >
            New Order
          </v-btn>
        </v-card-title>
        <v-divider />

        <!-- Filters -->
        <div
          class="pa-4 pa-sm-5 d-flex align-center ga-3"
          :class="mobile ? 'flex-column align-stretch' : 'flex-wrap'"
        >
          <v-text-field
            v-model="searchText"
            density="compact" variant="outlined" hide-details
            :placeholder="mobile ? 'Search orders' : 'Search order no., customer, or MSR...'"
            prepend-inner-icon="mdi-magnify"
            :style="mobile ? undefined : 'max-width: 320px'" min-width="240"
            clearable
          />
          <v-select
            v-model="statusFilter"
            :items="statusOptions"
            density="compact" variant="outlined" hide-details
            :style="mobile ? undefined : 'min-width: 170px'"
          />
        </div>

        <!-- Empty state (shared by both layouts) -->
        <div
          v-if="!loading && orders.length === 0"
          class="d-flex flex-column align-center py-10 text-medium-emphasis"
        >
          <v-icon icon="mdi-clipboard-text-clock-outline" size="40" class="mb-2" />
          <span class="text-body-2">
            {{ searchText || statusFilter ? 'No orders match your filters' : 'No ethical orders yet' }}
          </span>
        </div>

        <!-- MOBILE: stacked cards -->
        <template v-else-if="mobile">
          <v-progress-linear v-if="loading" indeterminate color="primary" />
          <v-list class="pa-2" lines="two">
            <v-card
              v-for="item in orders" :key="item.id"
              variant="outlined" rounded="lg" class="mb-2 pa-3"
              @click="openOrderDialog(item)"
            >
              <div class="d-flex align-start ga-3">
                <v-avatar size="36" color="primary" variant="tonal">
                  <span class="text-body-2 font-weight-bold">
                    {{ (item.customer?.name || '?').charAt(0).toUpperCase() }}
                  </span>
                </v-avatar>

                <div class="flex-grow-1" style="min-width: 0">
                  <div class="d-flex align-center justify-space-between ga-2">
                    <span class="font-weight-medium text-body-2 text-truncate">
                      {{ item.order_no }}
                    </span>
                    <v-btn
                      size="x-small" variant="text" color="primary"
                      icon="mdi-open-in-new" @click.stop="openOrderDialog(item)"
                    />
                  </div>

                  <div class="d-flex flex-wrap ga-1 mt-1">
                    <v-chip
                      size="x-small" variant="tonal"
                      :color="statusMeta(item.status).color"
                      class="font-weight-bold"
                    >
                      {{ statusMeta(item.status).label }}
                    </v-chip>
                    <v-chip
                      v-if="item.fulfillment_status === 'awaiting_stock'"
                      size="x-small" variant="tonal" color="orange"
                    >
                      Awaiting Stock
                    </v-chip>
                    <v-chip
                      v-if="isOverdue(item)"
                      size="x-small" variant="tonal" color="error"
                    >
                      Overdue
                    </v-chip>
                  </div>

                  <div class="text-caption text-medium-emphasis mt-2">
                    <div class="d-flex align-center ga-1">
                      <v-icon size="12" icon="mdi-account-outline" />
                      <span :class="{ 'font-italic': !item.customer?.name }">
                        {{ item.customer?.name || notSet('customer') }}
                      </span>
                    </div>
                    <div class="d-flex align-center ga-1 mt-1">
                      <v-icon size="12" icon="mdi-account-tie-outline" />
                      <span :class="{ 'font-italic': !item.agent?.name }">
                        {{ item.agent?.name || notSet('MSR') }}
                      </span>
                    </div>
                    <div class="d-flex align-center ga-1 mt-1">
                      <v-icon size="12" icon="mdi-currency-php" />
                      <span class="font-weight-medium">{{ formatCurrency(item.total_amount ?? 0) }}</span>
                      <span v-if="balanceAmount(item) > 0" class="text-error font-weight-medium ml-1">
                        (Bal: {{ formatCurrency(balanceAmount(item)) }})
                      </span>
                    </div>
                    <div
                      v-if="item.due_date"
                      class="d-flex align-center ga-1 mt-1"
                      :class="{ 'text-error': isOverdue(item) }"
                    >
                      <v-icon size="12" icon="mdi-calendar-clock-outline" />
                      <span>Due {{ new Date(item.due_date).toLocaleDateString() }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </v-card>
          </v-list>
        </template>

        <!-- DESKTOP: data table -->
        <v-data-table
          v-else
          :headers="headers"
          :items="orders"
          :loading="loading"
          item-value="id"
          @click:row="handleRowClick"
          class="cursor-pointer orders-table"
        >
          <template #item.customer.tin_number="{ item }">
            <span class="text-body-2">{{ item.customer?.tin_number || '—' }}</span>
          </template>
          <template #item.customer.is_vat_registered="{ item }">
            <v-chip size="small" :color="item.customer?.is_vat_registered ? 'primary' : 'grey'" variant="tonal">
              {{ item.customer?.is_vat_registered ? 'VAT' : 'Non-VAT' }}
            </v-chip>
          </template>
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
      </v-card>

      <CreateOrderDialog v-model="showCreateDialog" @created="fetchOrders" />
      <OrderDetailDialog v-model="showDetailDialog" :order-id="selectedOrderId" />
    </div>
  </v-container>
</template>

<style scoped>
.orders-table :deep(tbody tr:hover) {
  background: rgba(var(--v-theme-primary), 0.04);
}
</style>
<script setup lang="ts">
import { onMounted } from 'vue'
import { useInhouseOrders, headers } from '../composables/useInhouseOrders'
import RaiseOrderDialog from '../dialogs/RaiseOrderDialog.vue'
import OrderDetailDialog from '../dialogs/OrderDetailDialog.vue'
import { formatCurrency } from '@/utils/helpers'
import { useDisplay } from 'vuetify'

const { mobile } = useDisplay()
const {
  loading, search, filterStatus, statusOptions,
  filtered, showRaise, showDetail, selected,
  statusLabel, statusColor, deliveryPct,
  openRaise, openDetail, handleRaised, handleChanged, init,
} = useInhouseOrders()

onMounted(init)

const notSet = (field: string) => `No ${field} set`
</script>

<template>
  <v-container fluid class="pa-2 pa-sm-4 fill-height align-start">
    <div class="mx-auto w-100">
      <v-card rounded="lg" elevation="1">
        <!-- Header -->
        <v-card-title
          class="pa-4 pa-sm-5 d-flex align-center flex-wrap ga-2"
          :class="{ 'flex-column align-start': mobile }"
        >
          <div class="d-flex align-center ga-2">
            <v-icon icon="mdi-clipboard-text-clock-outline" color="primary" />
            <span class="text-h6 font-weight-bold">In-House Orders</span>
          </div>
          <v-spacer v-if="!mobile" />
          <v-btn
            size="small" variant="flat" color="primary" class="text-none"
            :block="mobile"
            prepend-icon="mdi-plus" @click="openRaise"
          >
            Place Order
          </v-btn>
        </v-card-title>
        <v-divider />

        <!-- Filters -->
        <div
          class="pa-4 pa-sm-5 d-flex align-center ga-3"
          :class="mobile ? 'flex-column align-stretch' : 'flex-wrap'"
        >
          <v-text-field
            v-model="search"
            :placeholder="mobile ? 'Search order / PO / customer' : 'Search order / PO / customer...'"
            prepend-inner-icon="mdi-magnify"
            variant="outlined" density="compact" hide-details
            :style="mobile ? undefined : 'max-width: 320px'" min-width="240"
            clearable
          />
          <v-select
            v-model="filterStatus"
            :items="statusOptions"
            variant="outlined" density="compact" hide-details
            :style="mobile ? undefined : 'min-width: 170px'"
          />
        </div>

        <!-- Empty state (shared by both layouts) -->
        <div
          v-if="!loading && filtered.length === 0"
          class="d-flex flex-column align-center py-10 text-medium-emphasis"
        >
          <v-icon icon="mdi-clipboard-text-clock-outline" size="40" class="mb-2" />
          <span class="text-body-2">
            {{ search || filterStatus ? 'No orders match your filters' : 'No in-house orders yet' }}
          </span>
        </div>

        <!-- MOBILE: stacked cards -->
        <template v-else-if="mobile">
          <v-progress-linear v-if="loading" indeterminate color="primary" />
          <v-list class="pa-2" lines="two">
            <v-card
              v-for="item in filtered" :key="item.id"
              variant="outlined" rounded="lg" class="mb-2 pa-3"
              @click="openDetail(item)"
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
                      icon="mdi-open-in-new" @click.stop="openDetail(item)"
                    />
                  </div>

                  <div class="d-flex flex-wrap ga-1 mt-1">
                    <v-chip
                      size="x-small" variant="tonal"
                      :color="statusColor(item.status)"
                      class="font-weight-bold"
                    >
                      {{ statusLabel(item.status) }}
                    </v-chip>
                    <v-chip v-if="item.po_no" size="x-small" variant="tonal">
                      PO: {{ item.po_no }}
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
                      <v-icon size="12" icon="mdi-currency-php" />
                      <span class="font-weight-medium">{{ formatCurrency(item.total_amount ?? 0) }}</span>
                    </div>
                    <div class="d-flex align-center ga-1 mt-1">
                      <v-icon size="12" icon="mdi-package-variant-closed" />
                      <div style="min-width: 90px" class="flex-grow-1">
                        <v-progress-linear :model-value="deliveryPct(item)" height="6" rounded color="teal" />
                        <span class="text-caption">{{ deliveryPct(item) }}% delivered</span>
                      </div>
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
          :items="filtered"
          :loading="loading"
          no-data-text="No in-house orders yet."
          hover
          class="orders-table"
        >
          <template #item.order_no="{ item }"><span class="font-weight-medium">{{ item.order_no }}</span></template>
          <template #item.po_no="{ item }">{{ item.po_no ?? '—' }}</template>
          <template #item.govt_po_no="{ item }">{{ item.govt_po_no ?? '—' }}</template>
          <template #item.customer="{ item }">{{ item.customer?.name ?? '—' }}</template>
          <template #item.total_amount="{ item }">{{ formatCurrency(item.total_amount ?? 0) }}</template>
          <template #item.delivered="{ item }">
            <div style="min-width:90px">
              <v-progress-linear :model-value="deliveryPct(item)" height="6" rounded color="teal" />
              <span class="text-caption">{{ deliveryPct(item) }}%</span>
            </div>
          </template>
          <template #item.status="{ item }">
            <v-chip :color="statusColor(item.status)" size="small" variant="tonal" class="font-weight-bold">{{ statusLabel(item.status) }}</v-chip>
          </template>
          <template #item.actions="{ item }">
            <v-btn variant="text" size="small" color="primary" class="text-none" @click="openDetail(item)">Open</v-btn>
          </template>
        </v-data-table>
      </v-card>

      <RaiseOrderDialog v-model="showRaise" @created="handleRaised" />
      <OrderDetailDialog v-model="showDetail" :order="selected" @changed="handleChanged" />
    </div>
  </v-container>
</template>

<style scoped>
.orders-table :deep(tbody tr:hover) {
  background: rgba(var(--v-theme-primary), 0.04);
}
</style>
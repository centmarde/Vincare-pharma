<script setup lang="ts">
import { useDeliveryReceipts, drHeaders } from '../composables/useDeliveryReceipts'
import DeliveryReceiptDialog from '@/components/deliveryReceipts/DeliveryReceiptDialog.vue'
import { formatDatePR_ISO } from '@/utils/helpers'
import { useDisplay } from 'vuetify'

const { mobile } = useDisplay()
const {
  loading, filtered, search,
  showReceipt, selected,
  openReceipt,
} = useDeliveryReceipts()

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
            <v-icon icon="mdi-truck-delivery-outline" color="primary" />
            <span class="text-h6 font-weight-bold">Delivery Receipts</span>
          </div>
          <v-spacer v-if="!mobile" />
          <v-text-field
            v-model="search"
            :placeholder="mobile ? 'Search DR / order / customer' : 'Search DR / order / customer...'"
            prepend-inner-icon="mdi-magnify"
            variant="outlined" density="compact" hide-details
            :style="mobile ? undefined : 'min-width: 240px'"
            :block="mobile"
            clearable
          />
        </v-card-title>
        <v-divider />

        <!-- Empty state (shared by both layouts) -->
        <div
          v-if="!loading && filtered.length === 0"
          class="d-flex flex-column align-center py-10 text-medium-emphasis"
        >
          <v-icon icon="mdi-truck-delivery-outline" size="40" class="mb-2" />
          <span class="text-body-2">
            {{ search ? `No delivery receipts match "${search}"` : 'No delivery receipts yet' }}
          </span>
        </div>

        <!-- MOBILE: stacked cards -->
        <template v-else-if="mobile">
          <v-progress-linear v-if="loading" indeterminate color="primary" />
          <v-list class="pa-2" lines="two">
            <v-card
              v-for="item in filtered" :key="item.id"
              variant="outlined" rounded="lg" class="mb-2 pa-3"
              @click="openReceipt(item)"
            >
              <div class="d-flex align-start ga-3">
                <v-avatar size="36" color="primary" variant="tonal">
                  <v-icon size="20" icon="mdi-truck-delivery-outline" />
                </v-avatar>

                <div class="flex-grow-1" style="min-width: 0">
                  <div class="d-flex align-center justify-space-between ga-2">
                    <span class="font-weight-medium text-body-2 text-truncate">
                      {{ item.dr_no }}
                    </span>
                    <v-btn
                      size="x-small" variant="text" color="primary"
                      icon="mdi-eye-outline" @click.stop="openReceipt(item)"
                    />
                  </div>

                  <div class="d-flex flex-wrap ga-1 mt-1">
                    <v-chip
                      size="x-small" variant="tonal"
                      :color="item.source === 'ethical_order' ? 'teal' : 'indigo'"
                    >
                      {{ item.source === 'ethical_order' ? 'Ethical' : item.source === 'inhouse_order' ? 'In-House' : '—' }}
                    </v-chip>
                    <v-chip v-if="item.order_no" size="x-small" variant="tonal">
                      {{ item.order_no }}
                    </v-chip>
                  </div>

                  <div class="text-caption text-medium-emphasis mt-2">
                    <div class="d-flex align-center ga-1">
                      <v-icon size="12" icon="mdi-account-outline" />
                      <span :class="{ 'font-italic': !item.customer_name }">
                        {{ item.customer_name || notSet('customer') }}
                      </span>
                    </div>
                    <div class="d-flex align-center ga-1 mt-1">
                      <v-icon size="12" icon="mdi-calendar-outline" />
                      <span>{{ formatDatePR_ISO(item.created_at) }}</span>
                    </div>
                    <div class="d-flex align-center ga-1 mt-1">
                      <v-icon size="12" icon="mdi-account-check-outline" />
                      <span :class="{ 'font-italic': !item.received_by }">
                        {{ item.received_by || notSet('receiver') }}
                      </span>
                    </div>
                    <div class="d-flex align-center ga-1 mt-1">
                      <v-icon size="12" icon="mdi-package-variant-closed" />
                      <span>{{ item.items.length }} item{{ item.items.length === 1 ? '' : 's' }}</span>
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
          :headers="drHeaders"
          :items="filtered"
          :loading="loading"
          no-data-text="No delivery receipts yet."
          hover
          class="dr-table"
        >
          <template #item.dr_no="{ item }"><span class="font-weight-medium">{{ item.dr_no }}</span></template>
          <template #item.source="{ item }">
            <v-chip size="small" variant="tonal" :color="item.source === 'ethical_order' ? 'teal' : 'indigo'">
              {{ item.source === 'ethical_order' ? 'Ethical' : item.source === 'inhouse_order' ? 'In-House' : '—' }}
            </v-chip>
          </template>
          <template #item.order_no="{ item }">{{ item.order_no ?? '—' }}</template>
          <template #item.customer_name="{ item }">{{ item.customer_name ?? '—' }}</template>
          <template #item.created_at="{ item }">{{ formatDatePR_ISO(item.created_at) }}</template>
          <template #item.received_by="{ item }">{{ item.received_by ?? '—' }}</template>
          <template #item.items="{ item }">{{ item.items.length }}</template>
          <template #item.actions="{ item }">
            <v-btn variant="text" size="small" color="primary" class="text-none" prepend-icon="mdi-eye" @click="openReceipt(item)">View</v-btn>
          </template>
        </v-data-table>
      </v-card>

      <DeliveryReceiptDialog v-model="showReceipt" :receipt="selected" />
    </div>
  </v-container>
</template>

<style scoped>
.dr-table :deep(tbody tr:hover) {
  background: rgba(var(--v-theme-primary), 0.04);
}
</style>
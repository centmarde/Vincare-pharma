<script setup lang="ts">
import { ref, watch } from 'vue'
import { useDisplay } from 'vuetify'
import { formatCurrency, formatDateOnly } from '@/utils/helpers'
import type { ConsignmentCollectorRow } from '../../composables/useAccountsReceivable'
import {
  useConsignmentStock, consignmentStockHeaders, consignmentStateLabel, consignmentStateColor,
} from '../../composables/useConsignmentStock'
import { consignmentExpiryWarnMonths } from '@/stores/consignmentData'

// Consignment customers pay as they sell and return only expired goods. Two
// views: who to visit for payment, and which delivered batches are about to
// expire on their shelves.
const props = defineProps<{
  modelValue: boolean
  collectors: ConsignmentCollectorRow[]
}>()
const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  /** Every record of the customer, for one statement. */
  (e: 'viewSoa', customerIds: number[]): void
}>()

const { mobile } = useDisplay()
const tab = ref<'collect' | 'expiry'>('collect')
const { loading, error, view, search, filtered, expiredCount, expiringCount, valueAtRisk, load } = useConsignmentStock()

// Loaded the first time the expiry tab is shown, then on Refresh.
const stockLoaded = ref(false)
watch([() => props.modelValue, tab], ([isOpen, current]) => {
  if (isOpen && current === 'expiry' && !stockLoaded.value) {
    stockLoaded.value = true
    void load()
  }
})

function sinceLabel(days: number | null): string {
  if (days == null) return '—'
  return days === 0 ? 'today' : `${days} day${days === 1 ? '' : 's'} ago`
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    :fullscreen="mobile"
    max-width="1150"
    scrollable
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card rounded="lg">
      <v-card-title class="pa-4 pa-sm-5 pb-2 d-flex align-start ga-2 text-wrap">
        <div class="flex-grow-1">
          <div class="text-h6 font-weight-bold">Consignment customers</div>
          <div class="text-caption text-medium-emphasis">
            Customers whose terms say consignment pay as they sell and return only expired goods. Their balances are
            aged by days since delivery, never "overdue".
          </div>
        </div>
        <v-btn icon="mdi-close" variant="text" size="small" @click="emit('update:modelValue', false)" />
      </v-card-title>

      <v-tabs v-model="tab" density="compact" class="px-4 px-sm-5">
        <v-tab value="collect" class="text-none">Collector list ({{ collectors.length }})</v-tab>
        <v-tab value="expiry" class="text-none">Expiring stock</v-tab>
      </v-tabs>
      <v-divider />

      <v-card-text class="pa-4 pa-sm-5">
        <v-window v-model="tab">
          <!-- Who to visit: longest since a payment first. -->
          <v-window-item value="collect">
            <div v-if="!collectors.length" class="text-center text-body-2 text-medium-emphasis py-8">
              No consignment customer owes anything right now.
            </div>
            <v-table v-else density="compact" class="border rounded-lg">
              <thead>
                <tr>
                  <th class="text-caption">Customer</th>
                  <th class="text-caption text-right">Balance</th>
                  <th class="text-caption text-center">Open docs</th>
                  <th class="text-caption text-center">Oldest delivery</th>
                  <th class="text-caption text-center">Last payment</th>
                  <th class="text-caption" />
                </tr>
              </thead>
              <tbody>
                <tr v-for="c in collectors" :key="c.customerName">
                  <td class="text-body-2">
                    {{ c.customerName }}
                    <div v-if="c.termText" class="text-caption text-medium-emphasis">{{ c.termText }}</div>
                  </td>
                  <td class="text-right font-weight-bold text-no-wrap">{{ formatCurrency(c.balance) }}</td>
                  <td class="text-center">{{ c.docCount }}</td>
                  <td class="text-center text-no-wrap">{{ sinceLabel(c.oldestDeliveryDays) }}</td>
                  <td class="text-center text-no-wrap">
                    <template v-if="c.lastPaymentAt">
                      {{ formatDateOnly(c.lastPaymentAt) }}
                      <div class="text-caption text-medium-emphasis">{{ sinceLabel(c.daysSincePayment) }}</div>
                    </template>
                    <span v-else-if="c.paid > 0.005" class="text-medium-emphasis">
                      {{ formatCurrency(c.paid) }} paid
                      <div class="text-caption">date not on record</div>
                    </span>
                    <span v-else class="text-warning">Never paid</span>
                  </td>
                  <td class="text-right">
                    <v-btn
                      v-if="c.customerIds.length"
                      size="small"
                      variant="text"
                      color="primary"
                      class="text-none"
                      @click="emit('viewSoa', c.customerIds)"
                    >
                      SOA
                    </v-btn>
                  </td>
                </tr>
              </tbody>
            </v-table>
          </v-window-item>

          <!-- What may come back: delivered, not returned, by expiry. -->
          <v-window-item value="expiry">
            <div class="d-flex flex-wrap align-center ga-2 mb-3">
              <v-chip size="small" variant="tonal" color="error">{{ expiredCount }} expired</v-chip>
              <v-chip size="small" variant="tonal" color="warning">
                {{ expiringCount }} expiring within {{ consignmentExpiryWarnMonths }} months
              </v-chip>
              <span class="text-caption text-medium-emphasis">
                {{ formatCurrency(valueAtRisk) }} at delivered price
              </span>
              <v-spacer />
              <v-btn-toggle v-model="view" mandatory density="compact" variant="outlined" divided>
                <v-btn value="attention" size="small" class="text-none">Needs attention</v-btn>
                <v-btn value="all" size="small" class="text-none">All</v-btn>
              </v-btn-toggle>
              <v-text-field
                v-model="search"
                placeholder="Customer, product or batch"
                prepend-inner-icon="mdi-magnify"
                variant="outlined"
                density="compact"
                hide-details
                clearable
                :style="mobile ? 'width: 100%' : 'max-width: 260px'"
              />
              <v-btn variant="text" size="small" class="text-none" prepend-icon="mdi-refresh" :loading="loading" @click="load">
                Refresh
              </v-btn>
            </div>
            <div class="text-caption text-medium-emphasis mb-2">
              Quantities are what was delivered and not yet returned — the most that can still be on their shelf. What
              they have already sold is not recorded.
            </div>

            <v-alert v-if="error" type="error" variant="tonal" density="compact" class="text-body-2 mb-2">{{ error }}</v-alert>
            <v-data-table
              :headers="consignmentStockHeaders"
              :items="filtered"
              :loading="loading"
              item-value="key"
              density="compact"
              mobile-breakpoint="md"
              :items-per-page="25"
            >
              <template #item.customer_name="{ item }">
                <div class="text-body-2">{{ item.customer_name ?? '—' }}</div>
                <div v-if="item.customer_area" class="text-caption text-medium-emphasis">{{ item.customer_area }}</div>
              </template>
              <template #item.product_name="{ item }">
                <div class="text-body-2">{{ item.product_name ?? '—' }}</div>
                <div class="text-caption text-medium-emphasis">
                  Batch {{ item.batch_no || '—' }}<template v-if="item.documents.length"> · {{ item.documents.join(', ') }}</template>
                </div>
              </template>
              <template #item.expiry_date="{ item }">
                <div class="text-no-wrap">{{ item.expiry_date ? formatDateOnly(item.expiry_date) : '—' }}</div>
                <v-chip size="x-small" variant="tonal" label :color="consignmentStateColor[item.state]">
                  {{ item.state === 'expiring' && item.days_to_expiry != null
                    ? `${item.days_to_expiry} days left`
                    : consignmentStateLabel[item.state] }}
                </v-chip>
              </template>
              <template #item.out_qty="{ item }">
                <span class="font-weight-bold">{{ item.out_qty.toLocaleString() }}</span>
                <span v-if="item.unit" class="text-caption text-medium-emphasis"> {{ item.unit }}</span>
                <div v-if="item.returned_qty" class="text-caption text-medium-emphasis">
                  {{ item.returned_qty.toLocaleString() }} of {{ item.delivered_qty.toLocaleString() }} returned
                </div>
              </template>
              <template #item.out_value="{ item }">{{ formatCurrency(item.out_value) }}</template>
              <template #item.last_delivered_at="{ item }">
                {{ item.last_delivered_at ? formatDateOnly(item.last_delivered_at) : '—' }}
              </template>
              <template #no-data>
                <div class="text-center pa-6 text-body-2 text-medium-emphasis">
                  {{ view === 'attention'
                    ? `Nothing at consignment customers expires within ${consignmentExpiryWarnMonths} months.`
                    : 'Nothing delivered to consignment customers is still out.' }}
                </div>
              </template>
            </v-data-table>
          </v-window-item>
        </v-window>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

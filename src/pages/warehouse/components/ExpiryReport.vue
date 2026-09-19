<script setup lang="ts">
import { onMounted } from 'vue'
import { useExpiryReport } from '../composables/useExpiryReport'
import ExpiryReportPrintDialog from '../dialogs/ExpiryReportPrintDialog.vue'

const {
  loading,
  error,
  search,
  categoryFilter,
  showPrintDialog,
  printFormat,
  catalogueCount,
  selectedMonthKey,
  items,
  filteredItems,
  totalValue,
  totalUnits,
  itemCount,
  hasData,
  breakdown,
  findings,
  recommendations,
  monthLabel,
  monthOptions,
  categoryOptions,
  headlineExpiry,
  daysToExpiry,
  asOf,
  urgencyColor,
  severityColor,
  shareLabel,
  money,
  expiryHeaders,
  init,
  openPrintDialog,
  clearFilters,
} = useExpiryReport()

onMounted(init)
</script>

<template>
  <v-container fluid class="pa-2">
    <v-card class="mx-auto w-100" rounded="lg" elevation="1">
      <v-card-item class="pa-4 pa-sm-5 pb-2">
        <div class="d-flex align-center flex-wrap ga-2">
          <div>
            <v-card-title class="text-h6 font-weight-bold pa-0">Expiring Inventory</v-card-title>
            <v-card-subtitle class="pa-0 pt-1">
              Stock at risk of write-off, valued at cost
            </v-card-subtitle>
          </div>
          <v-spacer />
          <v-select
            v-model="selectedMonthKey"
            :items="monthOptions"
            item-title="title"
            item-value="value"
            label="Expiry month"
            variant="outlined"
            density="compact"
            hide-details
            style="max-width: 240px"
          >
            <template #item="{ props: itemProps, item }">
              <v-list-item v-bind="itemProps" :subtitle="item.raw.subtitle" />
            </template>
          </v-select>
          <v-btn
            color="primary"
            variant="tonal"
            size="small"
            prepend-icon="mdi-file-document-outline"
            :disabled="!hasData"
            @click="openPrintDialog('executive')"
          >
            Executive Summary
          </v-btn>
          <v-btn
            color="primary"
            variant="flat"
            size="small"
            prepend-icon="mdi-file-pdf-box"
            :disabled="!hasData"
            @click="openPrintDialog('full')"
          >
            Full Report
          </v-btn>
        </div>
      </v-card-item>

      <v-divider />

      <v-card-text class="pa-4 pa-sm-5">
        <v-alert v-if="error" type="error" variant="tonal" class="mb-4" :text="error" />

        <div v-if="loading" class="py-8">
          <v-skeleton-loader type="heading, subtitle, table" />
        </div>

        <v-alert
          v-else-if="!hasData"
          type="info"
          variant="tonal"
          text="No stock on hand expires in the selected month."
        />

        <template v-else>
          <!-- Headline -->
          <v-row class="mb-2">
            <v-col cols="12" md="5">
              <v-card variant="tonal" color="error" rounded="lg" class="pa-4 h-100">
                <div class="text-caption text-uppercase font-weight-medium">
                  Value at risk — {{ monthLabel }}
                </div>
                <div class="text-h4 font-weight-bold mt-1">{{ money(totalValue) }}</div>
                <div class="text-body-2 mt-1">
                  {{ itemCount }} SKU{{ itemCount === 1 ? '' : 's' }} ·
                  {{ totalUnits.toLocaleString() }} units
                </div>
                <div v-if="headlineExpiry" class="text-caption mt-2">
                  Expires {{ headlineExpiry }}
                  <template v-if="daysToExpiry != null">
                    ·
                    <strong>
                      {{
                        daysToExpiry < 0
                          ? `${Math.abs(daysToExpiry)} days ago`
                          : daysToExpiry === 0
                            ? 'today'
                            : `in ${daysToExpiry} days`
                      }}
                    </strong>
                  </template>
                </div>
              </v-card>
            </v-col>

            <v-col cols="12" md="7">
              <v-card variant="outlined" rounded="lg" class="pa-4 h-100">
                <div class="text-caption text-uppercase font-weight-medium mb-2">
                  Breakdown by category
                </div>
                <div v-for="row in breakdown" :key="row.category" class="mb-3">
                  <div class="d-flex align-center ga-2 text-body-2">
                    <span class="text-capitalize">{{ row.category }}</span>
                    <v-spacer />
                    <span class="font-weight-medium">{{ money(row.value) }}</span>
                    <span class="text-medium-emphasis" style="min-width: 48px; text-align: right">
                      {{ shareLabel(row.share) }}
                    </span>
                  </div>
                  <v-progress-linear
                    :model-value="row.share * 100"
                    color="primary"
                    height="6"
                    rounded
                    class="mt-1"
                  />
                </div>
                <div class="text-caption text-medium-emphasis mt-1">
                  Product master's own classification — see findings for items that look misfiled.
                </div>
              </v-card>
            </v-col>
          </v-row>

          <!-- Findings -->
          <div v-if="findings.length" class="mb-4">
            <div class="text-caption text-uppercase font-weight-medium mb-2">
              Findings &amp; data quality
            </div>
            <v-alert
              v-for="finding in findings"
              :key="finding.id"
              :type="severityColor(finding.severity)"
              variant="tonal"
              density="comfortable"
              class="mb-2"
            >
              <div class="font-weight-bold text-body-2">{{ finding.title }}</div>
              <div class="text-body-2 mt-1">{{ finding.body }}</div>
            </v-alert>
          </div>

          <!-- Recommendations -->
          <div v-if="recommendations.length" class="mb-4">
            <div class="text-caption text-uppercase font-weight-medium mb-2">
              Recommended actions
            </div>
            <v-list density="compact" class="bg-transparent pa-0">
              <v-list-item
                v-for="(rec, index) in recommendations"
                :key="rec.id"
                class="px-0"
                :title="undefined"
              >
                <template #prepend>
                  <v-avatar size="24" color="primary" variant="tonal" class="mr-2">
                    <span class="text-caption font-weight-bold">{{ index + 1 }}</span>
                  </v-avatar>
                </template>
                <div class="text-body-2">{{ rec.text }}</div>
              </v-list-item>
            </v-list>
          </div>

          <!-- Item table -->
          <div class="d-flex align-center flex-wrap ga-2 mb-3">
            <v-text-field
              v-model="search"
              placeholder="Search product, SKU or category"
              prepend-inner-icon="mdi-magnify"
              variant="outlined"
              density="compact"
              hide-details
              clearable
              style="max-width: 320px"
            />
            <v-select
              v-model="categoryFilter"
              :items="categoryOptions"
              label="Category"
              variant="outlined"
              density="compact"
              hide-details
              clearable
              style="max-width: 220px"
            />
            <v-btn
              v-if="search || categoryFilter"
              variant="text"
              size="small"
              @click="clearFilters"
            >
              Clear
            </v-btn>
            <v-spacer />
            <span class="text-caption text-medium-emphasis">
              Showing {{ filteredItems.length }} of {{ itemCount }}
            </span>
          </div>

          <v-data-table
            :headers="expiryHeaders"
            :items="filteredItems"
            :items-per-page="25"
            density="compact"
            class="border rounded"
          >
            <template #item.rank="{ item }">
              <span class="text-medium-emphasis">{{ item.rank }}</span>
            </template>
            <template #item.category="{ item }">
              <span class="text-capitalize">{{ item.category || '—' }}</span>
            </template>
            <template #item.quantity="{ item }">
              {{ item.quantity.toLocaleString() }}
            </template>
            <template #item.cost_price="{ item }">
              {{ money(item.cost_price) }}
            </template>
            <template #item.value="{ item }">
              <span class="font-weight-medium">{{ money(item.value) }}</span>
            </template>
            <template #item.expiry_date="{ item }">
              <v-chip :color="urgencyColor(item)" size="x-small" variant="flat" label>
                {{ item.expiry_date }}
              </v-chip>
            </template>
          </v-data-table>
        </template>
      </v-card-text>
    </v-card>

    <ExpiryReportPrintDialog
      v-model="showPrintDialog"
      :format="printFormat"
      :month-label="monthLabel"
      :as-of="asOf"
      :items="items"
      :total-value="totalValue"
      :total-units="totalUnits"
      :breakdown="breakdown"
      :findings="findings"
      :recommendations="recommendations"
      :headline-expiry="headlineExpiry"
      :days-to-expiry="daysToExpiry"
      :catalogue-count="catalogueCount"
    />
  </v-container>
</template>

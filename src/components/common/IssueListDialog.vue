<script setup lang="ts">
import { computed } from 'vue'
import { useDisplay } from 'vuetify'
import { useIssueList } from '@/composables/useIssueList'
import type { IssueRow } from '@/composables/useIssueList'

// The app-wide problem list (see useIssueList), mounted once in App.vue next to
// ConfirmDialog.
const { isOpen, current, closeIssues } = useIssueList()

const isWarning = computed(() => current.value?.tone === 'warning')
// A four-column table is too wide for a phone and pushed ISSUE — the column
// that matters — off the screen, so small screens get a stacked list.
const { smAndDown } = useDisplay()

/** "SKU 1203 · #411" — the id tells apart rows that share a name and SKU. */
function productRef(row: IssueRow): string {
  return [row.sku ? `SKU ${row.sku}` : null, row.productId != null ? `#${row.productId}` : null]
    .filter(Boolean).join(' · ')
}

/** Everything identifying the row on one line, for the stacked phone layout. */
function rowDetails(row: IssueRow): string {
  return [
    productRef(row) || null,
    row.batch ? `Batch ${row.batch}` : null,
    row.expiry ? `Exp ${row.expiry}` : null,
  ].filter(Boolean).join(' · ')
}
</script>

<template>
  <v-dialog v-model="isOpen" max-width="760" scrollable>
    <v-card v-if="current" rounded="lg">
      <v-card-title class="d-flex align-center pa-4">
        <v-icon
          :icon="isWarning ? 'mdi-alert' : 'mdi-alert-circle'"
          :color="isWarning ? 'warning' : 'error'"
          class="mr-2"
        />
        <span class="text-h6 font-weight-bold">{{ current.title }}</span>
      </v-card-title>
      <v-divider />
      <v-card-text class="pa-4">
        <p class="text-body-2 mb-3">{{ current.message }}</p>
        <v-list v-if="smAndDown" density="compact" class="py-0">
          <v-list-item v-for="(row, index) in current.rows" :key="index" class="px-0 issue-item">
            <div class="font-weight-medium text-body-2">{{ row.product }}</div>
            <div v-if="rowDetails(row)" class="text-caption text-medium-emphasis">{{ rowDetails(row) }}</div>
            <div class="text-body-2" :class="isWarning ? 'text-warning' : 'text-error'">{{ row.problem }}</div>
          </v-list-item>
        </v-list>
        <v-table v-else density="compact">
          <thead>
            <tr>
              <th>PRODUCT</th>
              <th>BATCH</th>
              <th>EXPIRY</th>
              <th class="issue-col">ISSUE</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, index) in current.rows" :key="index">
              <td>
                <div class="font-weight-medium">{{ row.product }}</div>
                <div v-if="productRef(row)" class="text-caption text-medium-emphasis">{{ productRef(row) }}</div>
              </td>
              <td class="text-no-wrap">{{ row.batch ?? '—' }}</td>
              <td class="text-no-wrap">{{ row.expiry ?? '—' }}</td>
              <td class="issue-col" :class="isWarning ? 'text-warning' : 'text-error'">{{ row.problem }}</td>
            </tr>
          </tbody>
        </v-table>
        <p v-if="current.footnote" class="text-caption text-medium-emphasis mt-3 mb-0">{{ current.footnote }}</p>
      </v-card-text>
      <v-divider />
      <v-card-actions class="px-4 py-3">
        <v-spacer />
        <v-btn variant="flat" color="primary" class="text-none" @click="closeIssues">OK</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.issue-col {
  min-width: 190px;
}

.issue-item + .issue-item {
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}
</style>

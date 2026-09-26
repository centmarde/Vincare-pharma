<script setup lang="ts">
import AcceptReturnDialog from '../dialogs/AcceptReturnDialog.vue'
import IssueReplacementDialog from '../dialogs/IssueReplacementDialog.vue'
import { useSalesReturns } from '../composables/useSalesReturns'

const {
  filtered, loading, search, headers,
  totalCredited, writeOffValue, conditionSummary,
  settlementLabel, settlementColor,
  showAcceptDialog, openAcceptDialog, onReturnCreated,
  showReplacementDialog, replacementTarget, openReplacementDialog, onReplacementIssued,
  formatCurrency, formatDate,
} = useSalesReturns()
</script>

<template>
  <v-container class="pa-2" fluid>
    <v-card class="mx-auto w-100" rounded="lg" elevation="1">
      <v-card-title class="d-flex flex-wrap align-center ga-2 pa-4 pa-sm-5">
        <v-icon icon="mdi-keyboard-return" class="mr-1 text-primary" size="26" />
        <span class="text-h6 font-weight-bold">Sales Returns</span>
        <v-spacer />
        <v-text-field
          v-model="search"
          placeholder="Search return no., customer or product..."
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          density="compact"
          hide-details
          clearable
          style="max-width: 320px"
        />
        <v-btn color="primary" variant="flat" prepend-icon="mdi-plus" @click="openAcceptDialog">
          Accept Return
        </v-btn>
      </v-card-title>

      <v-divider />

      <v-card-text class="pa-3 pa-sm-5">
        <p class="text-body-2 text-medium-emphasis mb-4">
          Returned goods are exchanged for other goods, never refunded as money. Items in
          good condition go back to their original batch; expired or broken items are
          written off and never re-enter stock.
        </p>

        <v-data-table
          :headers="headers"
          :items="filtered"
          :loading="loading"
          density="comfortable"
          items-per-page="25"
        >
          <template #[`item.created_at`]="{ item }">
            {{ formatDate(item.created_at) }}
          </template>

          <template #[`item.customer_name`]="{ item }">
            <span v-if="item.customer_name">{{ item.customer_name }}</span>
            <span v-else class="text-medium-emphasis">Walk-in</span>
          </template>

          <template #[`item.lines`]="{ item }">
            <div class="text-body-2">{{ item.lines.length }} line(s)</div>
            <div class="text-caption text-medium-emphasis">{{ conditionSummary(item) }}</div>
          </template>

          <template #[`item.settlement`]="{ item }">
            <v-chip :color="settlementColor(item)" size="small" variant="tonal">
              {{ settlementLabel(item) }}
            </v-chip>
          </template>

          <template #[`item.total_amount`]="{ item }">
            <div class="text-body-2 font-weight-medium">
              {{ formatCurrency(item.total_amount) }}
            </div>
            <div v-if="writeOffValue(item) > 0" class="text-caption text-warning">
              {{ formatCurrency(writeOffValue(item)) }} written off
            </div>
          </template>

          <template #[`item.actions`]="{ item }">
            <v-btn
              size="small"
              variant="tonal"
              prepend-icon="mdi-swap-horizontal"
              @click="openReplacementDialog(item)"
            >
              Issue Replacement
            </v-btn>
          </template>

          <template #no-data>
            <div class="text-center pa-8 text-medium-emphasis">
              No returns recorded yet.
            </div>
          </template>
        </v-data-table>

        <v-divider class="my-3" />

        <div class="d-flex justify-end">
          <div class="text-right">
            <div class="text-caption text-medium-emphasis">Total credited</div>
            <div class="text-h6 font-weight-bold">{{ formatCurrency(totalCredited) }}</div>
          </div>
        </div>
      </v-card-text>
    </v-card>

    <AcceptReturnDialog v-model="showAcceptDialog" @created="onReturnCreated" />
    <IssueReplacementDialog
      v-model="showReplacementDialog"
      :return-row="replacementTarget"
      @issued="onReplacementIssued"
    />
  </v-container>
</template>

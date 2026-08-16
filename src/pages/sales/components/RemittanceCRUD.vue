<script setup lang="ts">
import { onMounted } from 'vue'
import ChangeRequestDialog from '@/components/changeRequests/ChangeRequestDialog.vue'
import { useChangeRequestFiling } from '@/composables/useChangeRequestFiling'
import { useSalesChangeRequestStore } from '../stores/salesChangeRequest'
import { useRemittance, headers } from '../composables/useRemittance'
import { formatCurrency, formatDatePR_ISO } from '@/utils/helpers'
import RemittanceSubmitDialog from './RemittanceSubmitDialog.vue'
import type { RemittanceType } from '@/stores/remittancesData'
import { useDisplay } from 'vuetify'

const { mobile } = useDisplay()
const {
  remittances, loading,
  selectedOutletId, outletOptions, setOutlet,
  showSubmitDialog, expected, actualAmount, notes, resolution,
  discrepancy, requiresNote, canSubmit, isShortfall, recommendReceivable,
  init, openSubmitDialog, handleSubmit,
} = useRemittance()

// A remittance is a cash-reconciliation artifact (GL-silent), so a correction
// to the counted cash / notes is an edit — there's no undo (allowVoid=false).
const { showDialog, config, isPending, loadPending, open, submit, submitting } =
  useChangeRequestFiling(useSalesChangeRequestStore())

function openChange(r: RemittanceType) {
  open({
    id: r.id,
    ref: r.remittance_no,
    fields: [
      { key: 'actual_amount', label: 'Actual Cash Counted', value: r.actual_amount, type: 'number' },
      { key: 'notes', label: 'Notes', value: r.notes, type: 'text' },
    ],
    voidSummary: '',
    allowEdit: true,
    allowVoid: false,
  })
}

onMounted(async () => { await init(); await loadPending() })
</script>

<template>
  <v-container fluid class="pa-2 fill-height align-start">
    <v-card class="mx-auto w-100" rounded="lg" elevation="1">

      <v-card-title class="d-flex justify-space-between align-center pa-5 flex-wrap ga-3">
        <span class="text-h6 font-weight-bold">Cash Remittances</span>
        <div class="d-flex align-center ga-3" :class="mobile ? 'w-100 flex-column align-stretch' : ''">
          <v-select
            :model-value="selectedOutletId"
            :items="outletOptions"
            item-title="title"
            item-value="value"
            label="Branch"
            variant="outlined"
            density="compact"
            hide-details
            :style="mobile ? 'width: 100%' : 'min-width: 200px'"
            @update:model-value="setOutlet"
          />
          <v-btn
            color="primary"
            class="text-none font-weight-bold"
            elevation="0"
            prepend-icon="mdi-cash-multiple"
            :block="mobile"
            @click="openSubmitDialog"
          >
            Close Day / Remit
          </v-btn>
        </div>
      </v-card-title>

      <v-divider />

      <!-- Mobile: card list -->
      <v-list v-if="mobile" lines="two" :loading="loading">
        <v-list-item v-for="r in remittances" :key="r.id">
          <template #prepend>
            <v-avatar color="primary" variant="tonal" size="40" class="text-caption font-weight-bold">
              {{ r.remittance_no?.slice(-4) }}
            </v-avatar>
          </template>
          <template #title>
            <div class="text-body-2 font-weight-medium">{{ r.remittance_no }}</div>
          </template>
          <template #subtitle>
            <div class="text-caption">{{ formatDatePR_ISO(r.remittance_date ?? r.created_at) }}</div>
          </template>
          <template #append>
            <div class="text-right">
              <div class="text-caption text-medium-emphasis">Actual</div>
              <div class="font-weight-bold text-body-2">{{ formatCurrency(r.actual_amount ?? 0) }}</div>
              <v-chip
                :color="(r.discrepancy ?? 0) === 0 ? 'success' : 'error'"
                size="x-small"
                variant="tonal"
                class="font-weight-bold mt-1"
              >
                {{ formatCurrency(r.discrepancy ?? 0) }}
              </v-chip>
            </div>
          </template>
          <template #default>
            <div class="text-caption text-medium-emphasis mt-1">
              <div>{{ r.outlet?.name ?? '—' }}</div>
              <div>
                <template v-if="r.resolution === 'paid_on_spot'">
                  <v-chip size="x-small" variant="tonal" color="success" class="mt-1">Paid on spot — Balanced</v-chip>
                </template>
                <template v-else-if="r.resolution === 'employee_receivable'">
                  <v-chip
                    size="x-small" variant="tonal"
                    :color="r.receivable_status === 'paid' ? 'success' : 'warning'"
                    class="mt-1"
                  >
                    {{ r.receivable_status === 'paid' ? 'Employee Receivable — Paid, Balanced' : 'Employee Receivable — Outstanding' }}
                  </v-chip>
                </template>
                <template v-else>—</template>
              </div>
              <div v-if="r.notes" class="mt-1">{{ r.notes }}</div>
            </div>
            <div class="mt-2">
              <v-chip v-if="isPending(r.id)" size="x-small" color="warning" variant="tonal" label>Change pending</v-chip>
              <v-btn
                v-else
                prepend-icon="mdi-pencil-box-outline"
                size="small"
                variant="tonal"
                color="primary"
                class="text-none"
                title="Request a correction (needs executive approval)"
                @click="openChange(r)"
              >
                Request Correction
              </v-btn>
            </div>
          </template>
        </v-list-item>
        <v-list-item v-if="!remittances.length && !loading">
          <template #title>
            <div class="text-medium-emphasis text-body-2">No remittances yet.</div>
          </template>
        </v-list-item>
      </v-list>

      <!-- Desktop: table -->
      <v-data-table
        v-else
        :headers="headers"
        :items="remittances"
        :loading="loading"
        loading-text="Loading remittances..."
        no-data-text="No remittances yet."
        hover
      >
        <template #item.remittance_no="{ item }">
          <span class="font-weight-medium">{{ item.remittance_no }}</span>
        </template>

        <template #item.outlet="{ item }">
          {{ item.outlet?.name ?? '—' }}
        </template>

        <template #item.remittance_date="{ item }">
          <span class="text-body-2 text-medium-emphasis">
            {{ formatDatePR_ISO(item.remittance_date ?? item.created_at) }}
          </span>
        </template>

        <template #item.expected_amount="{ item }">
          {{ formatCurrency(item.expected_amount ?? 0) }}
        </template>

        <template #item.actual_amount="{ item }">
          {{ formatCurrency(item.actual_amount ?? 0) }}
        </template>

        <template #item.discrepancy="{ item }">
          <v-chip
            :color="(item.discrepancy ?? 0) === 0 ? 'success' : 'error'"
            size="small"
            variant="tonal"
            class="font-weight-bold"
          >
            {{ formatCurrency(item.discrepancy ?? 0) }}
          </v-chip>
        </template>

        <template #item.resolution="{ item }">
          <v-chip v-if="item.resolution === 'paid_on_spot'" size="small" variant="tonal" color="success">Paid on spot — Balanced</v-chip>
          <v-chip
            v-else-if="item.resolution === 'employee_receivable'"
            size="small" variant="tonal"
            :color="item.receivable_status === 'paid' ? 'success' : 'warning'"
          >
            {{ item.receivable_status === 'paid' ? 'Employee Receivable — Paid, Balanced' : 'Employee Receivable — Outstanding' }}
          </v-chip>
          <span v-else class="text-medium-emphasis">—</span>
        </template>

        <template #item.notes="{ item }">
          <span class="text-caption">{{ item.notes ?? '—' }}</span>
        </template>

        <template #item.cr_actions="{ item }">
          <v-chip v-if="isPending(item.id)" size="x-small" color="warning" variant="tonal" label>Change pending</v-chip>
          <v-btn
            v-else prepend-icon="mdi-pencil-box-outline" size="small" variant="tonal" color="primary" class="text-none"
            title="Request a correction (needs executive approval)"
            @click="openChange(item)"
          >
            Request Correction
          </v-btn>
        </template>
      </v-data-table>

    </v-card>

    <ChangeRequestDialog
      v-if="config"
      v-model="showDialog"
      :target-ref="config.ref"
      :fields="config.fields"
      :allow-edit="config.allowEdit"
      :allow-void="config.allowVoid"
      :void-summary="config.voidSummary"
      :loading="submitting"
      @submit="submit"
    />

    <RemittanceSubmitDialog
      v-model="showSubmitDialog"
      :expected="expected"
      :actual-amount="actualAmount"
      :notes="notes"
      :discrepancy="discrepancy"
      :requires-note="requiresNote"
      :can-submit="canSubmit"
      :loading="loading"
      :is-shortfall="isShortfall"
      :recommend-receivable="recommendReceivable"
      :resolution="resolution"
      @update:actual-amount="actualAmount = $event"
      @update:notes="notes = $event"
      @update:resolution="resolution = $event"
      @submit="handleSubmit"
    />

  </v-container>
</template>

<style scoped>
:deep(.v-data-table thead th) {
  background: #f5f5f5 !important;
  font-weight: 700 !important;
  font-size: 0.75rem !important;
  letter-spacing: 0.04em;
  color: #616161 !important;
}
:deep(.v-data-table td) {
  text-align: center !important;
}
</style>
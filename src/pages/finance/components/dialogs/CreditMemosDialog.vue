<script setup lang="ts">
import { watch } from 'vue'
import { useDisplay } from 'vuetify'
import CreditMemoPrintDialog from './CreditMemoPrintDialog.vue'
import { useCreditMemoRegister, creditMemoStatusMeta } from '../../composables/useCreditMemos'
import { creditMemoReasonLabel } from '@/stores/creditMemosData'
import { formatCurrency, formatDatePR_ISO } from '@/utils/helpers'

// Every credit memo: awaiting approval, issued (printable), rejected.
const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', value: boolean): void }>()

const { mobile } = useDisplay()
const { loading, statusFilter, search, filtered, headers, printTarget, showPrint, load, openPrint } = useCreditMemoRegister()

watch(() => props.modelValue, (isOpen) => { if (isOpen) void load() }, { immediate: true })

const statusOptions = [
  { title: 'All', value: null },
  { title: 'Awaiting approval', value: 'pending_approval' },
  { title: 'Issued', value: 'issued' },
  { title: 'Rejected', value: 'rejected' },
]
</script>

<template>
  <v-dialog :model-value="modelValue" :fullscreen="mobile" max-width="1150" scrollable @update:model-value="emit('update:modelValue', $event)">
    <v-card rounded="lg">
      <v-card-title class="pa-4 pa-sm-5 pb-2 d-flex align-start ga-2 text-wrap">
        <div class="flex-grow-1">
          <div class="text-h6 font-weight-bold">Credit memos</div>
          <div class="text-caption text-medium-emphasis">
            What was taken off customers' accounts, and why. A credit memo is issued — numbered and applied to the bill
            — once an executive approves it.
          </div>
        </div>
        <v-btn icon="mdi-close" variant="text" size="small" @click="emit('update:modelValue', false)" />
      </v-card-title>

      <div class="px-4 px-sm-5 pb-3 d-flex flex-wrap align-center ga-3">
        <v-btn-toggle v-model="statusFilter" density="compact" variant="outlined" divided>
          <v-btn v-for="o in statusOptions" :key="String(o.value)" :value="o.value" size="small" class="text-none">{{ o.title }}</v-btn>
        </v-btn-toggle>
        <v-spacer />
        <v-text-field
          v-model="search"
          placeholder="Search CM no., customer, bill, reason, amount…"
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          density="compact"
          hide-details
          clearable
          :style="mobile ? 'width: 100%' : 'max-width: 340px'"
        />
      </div>
      <v-divider />

      <v-card-text class="pa-0">
        <v-data-table
          :headers="headers"
          :items="filtered"
          :loading="loading"
          item-value="id"
          density="comfortable"
          mobile-breakpoint="md"
          :items-per-page="10"
        >
          <template #item.cm_no="{ item }">
            <div class="font-weight-medium">{{ item.cm_no ?? 'Not yet numbered' }}</div>
            <v-chip size="x-small" variant="tonal" label :color="creditMemoStatusMeta[item.status].color">
              {{ creditMemoStatusMeta[item.status].label }}
            </v-chip>
          </template>
          <template #item.created_at="{ item }">{{ formatDatePR_ISO(item.approved_at ?? item.created_at) }}</template>
          <template #item.applies_to_no="{ item }">
            {{ item.applies_to_no ?? '—' }}
            <div v-if="item.sales_return_no" class="text-caption text-medium-emphasis">Return {{ item.sales_return_no }}</div>
          </template>
          <template #item.reason="{ item }">
            <div class="text-body-2">{{ creditMemoReasonLabel(item.reason_code) }}</div>
            <div class="text-caption text-medium-emphasis">{{ item.reason }}</div>
          </template>
          <template #item.amount="{ item }"><span class="font-weight-bold">{{ formatCurrency(item.amount) }}</span></template>
          <template #item.actions="{ item }">
            <v-btn
              v-if="item.status === 'issued'"
              size="small"
              variant="tonal"
              class="text-none"
              prepend-icon="mdi-printer"
              @click="openPrint(item)"
            >
              Print
            </v-btn>
          </template>
          <template #no-data>
            <div class="text-center pa-6 text-body-2 text-medium-emphasis">No credit memos yet.</div>
          </template>
        </v-data-table>
      </v-card-text>
    </v-card>

    <CreditMemoPrintDialog v-model="showPrint" :memo="printTarget" />
  </v-dialog>
</template>

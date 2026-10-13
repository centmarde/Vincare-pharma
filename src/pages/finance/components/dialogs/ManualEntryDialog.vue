<script setup lang="ts">
import { useDisplay } from 'vuetify'
import type { JournalLineInput } from '@/stores/glData'
import type { AccountOption } from '../../composables/useGeneralJournal'
import MoneyField from '@/components/inputs/MoneyField.vue'
import { formatCurrency } from '@/utils/helpers'

const open = defineModel<boolean>({ required: true })
const entryDate = defineModel<string>('entryDate', { required: true })
const description = defineModel<string>('description', { required: true })

const props = defineProps<{
  accountOptions: AccountOption[]
  accountFilter: (value: string, query: string) => boolean | [number, number][]
  lines: JournalLineInput[]
  totalDebit: number
  totalCredit: number
  isBalanced: boolean
  loading: boolean
}>()

const emit = defineEmits<{
  (e: 'add-line'): void
  (e: 'remove-line', idx: number): void
  (e: 'submit'): void
}>()

// Full screen on a phone: a five-column ledger table cannot fit a dialog there.
const { xs } = useDisplay()
</script>

<template>
  <v-dialog v-model="open" max-width="1100" scrollable :fullscreen="xs">
    <v-card rounded="lg">
      <v-card-title class="pa-4 pb-2">Manual Journal Entry</v-card-title>
      <v-divider />
      <v-card-text class="pa-4 pa-sm-5">
        <div class="text-caption text-medium-emphasis mb-3">
          Manual entries require approval before they affect any balance or report — they post as a
          draft first.
        </div>

        <v-row dense>
          <v-col cols="12" sm="4">
            <v-text-field v-model="entryDate" type="date" label="Entry date" variant="outlined" density="compact" />
          </v-col>
          <v-col cols="12" sm="8">
            <v-text-field v-model="description" label="Description" variant="outlined" density="compact" />
          </v-col>
        </v-row>

        <v-table density="compact" class="mt-2">
          <thead>
            <tr>
              <th class="text-left">Account</th>
              <th class="text-right" style="width:190px">Debit</th>
              <th class="text-right" style="width:190px">Credit</th>
              <th style="width:40px"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(line, idx) in props.lines" :key="idx">
              <td class="py-1">
                <!-- Type a name or a code; every word must match, in any order. -->
                <v-autocomplete
                  v-model="line.account_code"
                  :items="props.accountOptions"
                  :custom-filter="props.accountFilter"
                  item-title="title"
                  item-value="value"
                  placeholder="Search account name or code, e.g. cash or 1020"
                  prepend-inner-icon="mdi-magnify"
                  no-data-text="No account matches that search"
                  density="compact"
                  variant="outlined"
                  hide-details
                  auto-select-first
                />
              </td>
              <td class="py-1">
                <MoneyField
                  v-model="line.debit"
                  density="compact"
                  variant="outlined"
                  hide-details
                  @update:model-value="line.debit > 0 ? (line.credit = 0) : null"
                />
              </td>
              <td class="py-1">
                <MoneyField
                  v-model="line.credit"
                  density="compact"
                  variant="outlined"
                  hide-details
                  @update:model-value="line.credit > 0 ? (line.debit = 0) : null"
                />
              </td>
              <td>
                <v-btn icon="mdi-close" variant="text" size="x-small" @click="emit('remove-line', idx)" />
              </td>
            </tr>
          </tbody>
        </v-table>

        <v-btn variant="text" size="small" color="info" class="text-none mt-1" prepend-icon="mdi-plus"
          @click="emit('add-line')">Add line</v-btn>

        <v-divider class="my-3" />

        <div class="d-flex justify-space-between align-center flex-wrap ga-2 text-body-2">
          <span>Total Debit: <b>{{ formatCurrency(props.totalDebit) }}</b></span>
          <span>Total Credit: <b>{{ formatCurrency(props.totalCredit) }}</b></span>
          <v-chip :color="props.isBalanced ? 'success' : 'warning'" size="small" label>
            {{ props.isBalanced ? 'Balanced' : 'Not balanced' }}
          </v-chip>
        </div>
      </v-card-text>
      <v-divider />
      <v-card-actions class="pa-4">
        <v-spacer />
        <v-btn variant="text" @click="open = false">Cancel</v-btn>
        <v-btn
          color="success" class="text-none font-weight-bold" elevation="0"
          :disabled="!props.isBalanced" :loading="props.loading"
          @click="emit('submit')">
          Post as Draft
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import type { JournalLineInput } from '@/stores/glData'
import { formatCurrency } from '@/utils/helpers'

const open = defineModel<boolean>({ required: true })
const entryDate = defineModel<string>('entryDate', { required: true })
const description = defineModel<string>('description', { required: true })

const props = defineProps<{
  accountOptions: { title: string; value: string }[]
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
</script>

<template>
  <v-dialog v-model="open" max-width="700px">
    <v-card rounded="lg">
      <v-card-title class="pa-4 pb-2">Manual Journal Entry</v-card-title>
      <v-divider />
      <v-card-text class="pa-4">
        <div class="text-caption text-medium-emphasis mb-3">
          Manual entries require approval before they affect any balance or report — they post as a
          draft first.
        </div>

        <v-row dense>
          <v-col cols="12" sm="6">
            <v-text-field v-model="entryDate" type="date" label="Entry date" variant="outlined" density="compact" />
          </v-col>
          <v-col cols="12" sm="6">
            <v-text-field v-model="description" label="Description" variant="outlined" density="compact" />
          </v-col>
        </v-row>

        <v-table density="compact" class="mt-2">
          <thead>
            <tr>
              <th class="text-left">Account</th>
              <th class="text-right" style="width:130px">Debit</th>
              <th class="text-right" style="width:130px">Credit</th>
              <th style="width:40px"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(line, idx) in props.lines" :key="idx">
              <td>
                <v-select
                  v-model="line.account_code" :items="props.accountOptions"
                  density="compact" variant="outlined" hide-details placeholder="Select account" />
              </td>
              <td>
                <v-text-field
                  v-model.number="line.debit" type="number" min="0" density="compact" variant="outlined" hide-details
                  @update:model-value="line.debit > 0 ? (line.credit = 0) : null" />
              </td>
              <td>
                <v-text-field
                  v-model.number="line.credit" type="number" min="0" density="compact" variant="outlined" hide-details
                  @update:model-value="line.credit > 0 ? (line.debit = 0) : null" />
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

        <div class="d-flex justify-space-between text-body-2">
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

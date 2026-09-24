<script setup lang="ts">
import { useBookEntry } from '../composables/useBookEntry'
import { formatCurrency } from '@/utils/helpers'

const {
  groups, templateId, template,
  entryDate, description, amounts, codes, posting,
  cashOptions, accountOptionsFor, accountName,
  lines, totalDebit, totalCredit,
  blockers, canSubmit,
  reset, submit,
} = useBookEntry()
</script>

<template>
  <v-container fluid class="pa-0">
    <v-row>
      <!-- Pick the transaction, the way he'd pick which book to write in. -->
      <v-col cols="12" md="4">
        <v-card class="elevation-0">
          <v-card-title class="pb-2">Transaction</v-card-title>
          <v-card-text class="pt-0">
            <v-list density="compact" nav>
              <template v-for="group in groups" :key="group.group">
                <v-list-subheader>{{ group.group }}</v-list-subheader>
                <v-list-item
                  v-for="t in group.templates" :key="t.id"
                  :active="templateId === t.id"
                  :title="t.title"
                  rounded="lg"
                  @click="templateId = t.id"
                />
              </template>
            </v-list>
          </v-card-text>
        </v-card>
      </v-col>

      <v-col cols="12" md="8">
        <v-card class="elevation-0">
          <v-card-title class="d-flex align-center ga-2 pb-2 flex-wrap">
            <span>{{ template?.title ?? 'Record a transaction' }}</span>
            <v-spacer />
            <v-btn v-if="template" size="small" variant="text" class="text-none" @click="reset">
              Clear
            </v-btn>
          </v-card-title>

          <v-card-text>
            <p v-if="!template" class="text-body-2 text-medium-emphasis">
              Pick a transaction on the left. Each one fills in its own debits and credits, the way
              a column in a journal does — you enter the amounts only.
              <br><br>
              Sales, collections, supplier payments, expenses, stock receipts and petty-cash
              replenishments are <strong>not</strong> here: those already post to the ledger from
              their own screens, and entering them again would count them twice.
            </p>

            <template v-else>
              <p class="text-body-2 text-medium-emphasis mb-4">{{ template.summary }}</p>

              <v-row dense>
                <v-col cols="12" sm="6">
                  <v-text-field
                    v-model="entryDate" type="date" label="Date"
                    density="compact" variant="outlined" hide-details
                  />
                </v-col>
                <v-col cols="12" sm="6">
                  <v-text-field
                    v-model="description" label="Description"
                    density="compact" variant="outlined" hide-details
                  />
                </v-col>

                <v-col v-for="field in template.fields" :key="field.key" cols="12" sm="6">
                  <v-text-field
                    v-if="field.kind === 'amount'"
                    v-model.number="amounts[field.key]"
                    type="number" :label="field.label" :hint="field.hint"
                    :persistent-hint="!!field.hint"
                    placeholder="0.00" density="compact" variant="outlined" reverse
                  />
                  <v-select
                    v-else-if="field.kind === 'cashAccount'"
                    v-model="codes[field.key]"
                    :items="cashOptions" item-title="title" item-value="value"
                    :label="field.label" :hint="field.hint" :persistent-hint="!!field.hint"
                    density="compact" variant="outlined"
                  />
                  <v-autocomplete
                    v-else
                    v-model="codes[field.key]"
                    :items="accountOptionsFor(field)" item-title="title" item-value="value"
                    :label="field.label" :hint="field.hint" :persistent-hint="!!field.hint"
                    density="compact" variant="outlined" auto-select-first
                  />
                </v-col>
              </v-row>

              <!-- He is used to seeing the entry in his book, so show it. -->
              <div class="mt-4">
                <div class="text-caption text-medium-emphasis mb-1">This will post</div>
                <v-table density="compact">
                  <thead>
                    <tr>
                      <th class="text-left">Account</th>
                      <th class="text-right">Debit</th>
                      <th class="text-right">Credit</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(line, i) in lines" :key="i">
                      <td>
                        <span class="text-medium-emphasis mr-2">{{ line.account_code }}</span>
                        {{ accountName(line.account_code) }}
                      </td>
                      <td class="text-right">
                        {{ line.debit ? formatCurrency(line.debit) : '—' }}
                      </td>
                      <td class="text-right">
                        {{ line.credit ? formatCurrency(line.credit) : '—' }}
                      </td>
                    </tr>
                    <tr v-if="!lines.length">
                      <td colspan="3" class="text-center text-caption text-medium-emphasis py-4">
                        Fill in the amounts to see the entry.
                      </td>
                    </tr>
                  </tbody>
                  <tfoot v-if="lines.length">
                    <tr class="font-weight-bold" style="border-top: 2px solid currentColor">
                      <td>Totals</td>
                      <td class="text-right">{{ formatCurrency(totalDebit) }}</td>
                      <td class="text-right">{{ formatCurrency(totalCredit) }}</td>
                    </tr>
                  </tfoot>
                </v-table>
              </div>
            </template>
          </v-card-text>

          <v-card-actions v-if="template" class="px-4 pb-4 flex-wrap ga-2">
            <v-spacer />
            <span v-if="blockers.length" class="text-caption text-medium-emphasis mr-2">
              Needs {{ blockers.join(', ') }}
            </span>
            <v-btn
              color="primary" variant="flat" class="text-none"
              :disabled="!canSubmit" :loading="posting" @click="submit"
            >
              Record
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

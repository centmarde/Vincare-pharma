<script setup lang="ts">
import { watch } from 'vue'
import { useDisplay } from 'vuetify'
import { useVoucherForm } from '../../composables/useVoucherForm'
import { voucherSignatories } from '@/stores/disbursementVouchersData'
import type { VoucherType, VoucherInput } from '@/stores/disbursementVouchersData'
import type { ClassifiedCashAccount } from '@/utils/cashAccountTypes'
import { formatCurrency } from '@/utils/helpers'

const props = defineProps<{
  modelValue: boolean
  loading: boolean
  accounts: ClassifiedCashAccount[]
  /** Set only when editing an existing DRAFT voucher; null when creating. */
  editing: VoucherType | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'submit', payload: VoucherInput): void
}>()

const {
  isEditing,
  payee, payeeAddress, payeeTin, voucherDate, cashAccountId, checkNo, orSiNo, department, particulars, remarks, items,
  categoryOptions, departmentOptions, accountOptions, metaForAccount, selectedAccount,
  voucherTotal, insufficientFunds, canSubmit, blockers, signatories,
  canAddItem, resetForm, loadFrom, addItem, removeItem, buildPayload, restoreDraft,
  setSignatory, applyCachedSignatories,
} = useVoucherForm(() => props.accounts)

// The form deliberately mirrors the printed voucher cell-for-cell, so what the
// user fills in is laid out exactly where it lands on the paper they sign.
// Signatory names are typed here and print above the rule; only the signature
// itself is handwritten.

// The ruled cells divide vertically on a wide screen and stack on a narrow one,
// so the divider that separates a pair has to switch edges with the breakpoint.
const { smAndUp } = useDisplay()

// Signature blocks sit 4-across on a wide screen and 2-across on a narrow one.
// Only rule the edges that fall *between* blocks — the outer frame draws the rest.
function signatoryBorder(index: number) {
  const perRow = smAndUp.value ? 4 : 2
  const classes: string[] = []
  if ((index + 1) % perRow !== 0) classes.push('border-e')
  if (index < voucherSignatories.length - perRow) classes.push('border-b')
  return classes
}

// Prefill on open: an existing draft loads its own values, a new voucher picks
// up any autosaved draft instead.
watch(() => props.modelValue, (open) => {
  if (!open) return
  resetForm()
  if (props.editing) loadFrom(props.editing)
  else restoreDraft()
  // Prefill any signature block still blank with the last names used. Runs for
  // edits too — an older voucher saved before this field existed has none.
  applyCachedSignatories()
})

function handleSubmit() {
  const payload = buildPayload()
  if (!payload) return
  emit('submit', payload)
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="1100"
    scrollable
    persistent
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card rounded="lg">
      <v-card-text class="pa-4 pa-sm-5">

        <v-alert type="info" variant="tonal" density="compact" class="mb-4 text-body-2">
          Fill in the voucher, then <strong>print and sign it</strong>. Expenses are only
          recorded — and cash only moves — after the printed voucher is recorded.
        </v-alert>

        <!-- Ruled like the paper voucher it produces: each v-row is a ruled band,
             each v-col a cell. The divider between a pair sits on the inline edge
             when they're side by side and on the block edge once they stack. -->
        <div class="border">
          <!-- Title + DV No. -->
          <v-row no-gutters class="border-b">
            <v-col
              cols="12"
              sm="8"
              class="pa-2 d-flex align-center justify-center text-h6 font-weight-bold"
              :class="smAndUp ? 'border-e' : 'border-b'"
            >
              DISBURSEMENT VOUCHER
            </v-col>
            <v-col cols="12" sm="4" class="pa-2">
              <div class="text-caption font-weight-bold text-uppercase text-medium-emphasis">
                DV No.
              </div>
              <div class="text-body-2 font-weight-bold py-1">
                {{ editing?.dv_no ?? 'Assigned on save' }}
              </div>
            </v-col>
          </v-row>

          <!-- Payee block -->
          <v-row no-gutters class="border-b">
            <v-col cols="12" sm="8" class="pa-2" :class="smAndUp ? 'border-e' : 'border-b'">
              <div class="text-caption font-weight-bold text-uppercase text-medium-emphasis">
                Payee <span class="text-error">*</span>
              </div>
              <v-text-field
                v-model="payee"
                placeholder="Who is being paid"
                variant="plain"
                density="compact"
                hide-details
              />
            </v-col>
            <v-col cols="12" sm="4" class="pa-2">
              <div class="text-caption font-weight-bold text-uppercase text-medium-emphasis">
                Date <span class="text-error">*</span>
              </div>
              <v-text-field
                v-model="voucherDate"
                type="date"
                variant="plain"
                density="compact"
                hide-details
              />
            </v-col>
          </v-row>

          <v-row no-gutters class="border-b">
            <v-col cols="12" sm="8" class="pa-2" :class="smAndUp ? 'border-e' : 'border-b'">
              <div class="text-caption font-weight-bold text-uppercase text-medium-emphasis">
                Address
              </div>
              <v-text-field
                v-model="payeeAddress"
                placeholder="Payee address"
                variant="plain"
                density="compact"
                hide-details
              />
            </v-col>
            <v-col cols="12" sm="4" class="pa-2">
              <!-- Not "Fund" (an LGU fund-cluster term from the source form) and
                   not "Bank/Checking Account" — this can be a bank account, the
                   petty cash box, or a placement. "Payment Mode" covers all
                   three, and is the wording used across the whole module. -->
              <div class="text-caption font-weight-bold text-uppercase text-medium-emphasis">
                Payment Mode <span class="text-error">*</span>
              </div>
              <v-select
                v-model="cashAccountId"
                :items="accountOptions"
                placeholder="Select payment mode"
                variant="plain"
                density="compact"
                hide-details
              >
                <template #item="{ props: itemProps, item }">
                  <v-list-item v-bind="itemProps">
                    <template #prepend>
                      <v-icon
                        :icon="metaForAccount(item.value).icon"
                        :color="metaForAccount(item.value).color"
                        size="small"
                      />
                    </template>
                  </v-list-item>
                </template>
              </v-select>
            </v-col>
          </v-row>

          <v-row no-gutters class="border-b">
            <v-col cols="12" sm="8" class="pa-2" :class="smAndUp ? 'border-e' : 'border-b'">
              <div class="text-caption font-weight-bold text-uppercase text-medium-emphasis">
                TIN
              </div>
              <v-text-field
                v-model="payeeTin"
                placeholder="Taxpayer identification number"
                variant="plain"
                density="compact"
                hide-details
              />
            </v-col>
            <v-col cols="12" sm="4" class="pa-2">
              <div class="text-caption font-weight-bold text-uppercase text-medium-emphasis">
                Check No.
              </div>
              <v-text-field
                v-model="checkNo"
                placeholder="The check we issue"
                variant="plain"
                density="compact"
                hide-details
              />
            </v-col>
          </v-row>

          <v-row no-gutters class="border-b">
            <v-col cols="12" sm="8" class="pa-2" :class="smAndUp ? 'border-e' : 'border-b'">
              <div class="text-caption font-weight-bold text-uppercase text-medium-emphasis">
                Reference / Remarks
              </div>
              <v-text-field
                v-model="remarks"
                placeholder="Optional note carried onto the voucher"
                variant="plain"
                density="compact"
                hide-details
              />
            </v-col>
            <v-col cols="12" sm="4" class="pa-2">
              <div class="text-caption font-weight-bold text-uppercase text-medium-emphasis">
                OR/SI No.
              </div>
              <v-text-field
                v-model="orSiNo"
                placeholder="Official receipt / sales invoice"
                variant="plain"
                density="compact"
                hide-details
              />
            </v-col>
          </v-row>

          <v-row no-gutters class="border-b">
            <v-col cols="12" class="pa-2">
              <!-- One particulars for the whole voucher: a voucher describes a
                   single purpose, so this was retyped on every line before. -->
              <div class="text-caption font-weight-bold text-uppercase text-medium-emphasis">
                Particulars
              </div>
              <v-textarea
                v-model="particulars"
                placeholder="What this disbursement is for"
                variant="plain"
                density="compact"
                rows="2"
                auto-grow
                hide-details
              />
            </v-col>
          </v-row>

          <v-row no-gutters class="border-b">
            <v-col cols="12" class="pa-2">
              <!-- One department for the whole voucher. It used to be a select
                   on every line, which meant picking the same value over and
                   over; it is still saved onto each line, where the generated
                   expense reads it from. -->
              <div class="text-caption font-weight-bold text-uppercase text-medium-emphasis">
                Department
              </div>
              <v-select
                v-model="department"
                :items="departmentOptions"
                item-title="title"
                item-value="value"
                placeholder="Charged to which department"
                variant="plain"
                density="compact"
                clearable
                hide-details
              />
            </v-col>
          </v-row>

          <!-- Particulars: category + purpose per line; department is on the header -->
          <v-row no-gutters class="border-b bg-surface-light">
            <v-col
              cols="12"
              sm="8"
              class="pa-2 text-center font-weight-bold"
              :class="smAndUp ? 'border-e' : 'border-b'"
            >
              PARTICULARS
            </v-col>
            <v-col cols="12" sm="4" class="pa-2 text-center font-weight-bold">
              AMOUNT
            </v-col>
          </v-row>

          <v-row v-for="(line, index) in items" :key="index" no-gutters class="border-b">
            <v-col cols="12" sm="8" class="pa-2" :class="smAndUp ? 'border-e' : 'border-b'">
              <!-- A line is only what the spend is charged to and how much;
                   the purpose is written once on the header. -->
              <v-row dense>
                <v-col cols="12">
                  <v-select
                    v-model="line.category"
                    :items="categoryOptions"
                    item-title="title"
                    item-value="value"
                    label="Category"
                    variant="outlined"
                    density="compact"
                    hide-details
                  />
                </v-col>
              </v-row>
            </v-col>
            <v-col cols="12" sm="4" class="pa-2 d-flex align-start ga-1">
              <v-text-field
                v-model.number="line.amount"
                type="number"
                placeholder="0.00"
                variant="plain"
                density="compact"
                hide-details
                class="flex-grow-1"
              />
              <v-btn
                icon="mdi-close"
                size="x-small"
                variant="text"
                color="error"
                :disabled="items.length === 1"
                title="Remove this particular"
                @click="removeItem(index)"
              />
            </v-col>
          </v-row>

          <v-row no-gutters class="border-b">
            <v-col cols="12" sm="8" class="pa-2" :class="smAndUp ? 'border-e' : 'border-b'">
              <!-- Five accounts maximum: the printed voucher has a fixed five
                   rows so the RECORDED stamp lands in the same place every
                   time. A sixth goes on a second voucher. -->
              <v-btn
                size="small"
                variant="text"
                color="primary"
                class="text-none"
                prepend-icon="mdi-plus"
                :disabled="!canAddItem"
                @click="addItem"
              >
                Add Account
              </v-btn>
              <span v-if="!canAddItem" class="text-caption text-medium-emphasis ms-2">
                Five per voucher &mdash; record the rest on another voucher.
              </span>
            </v-col>
            <v-col cols="12" sm="4" class="pa-2" />
          </v-row>

          <v-row no-gutters class="border-b bg-surface-light">
            <v-col
              cols="12"
              sm="8"
              class="pa-2 text-right font-weight-bold"
              :class="smAndUp ? 'border-e' : 'border-b'"
            >
              TOTAL
            </v-col>
            <v-col cols="12" sm="4" class="pa-2 text-right font-weight-bold">
              {{ formatCurrency(voucherTotal) }}
            </v-col>
          </v-row>

          <!-- Names are typed here and PRINTED above the rule, so only the
               signature itself is handwritten. Optional: leave one blank and it
               prints as an empty line to fill in by hand. -->
          <v-row no-gutters>
            <v-col
              v-for="(role, index) in voucherSignatories"
              :key="role.field"
              cols="6"
              sm="3"
              class="pa-2"
              :class="signatoryBorder(index)"
            >
              <div class="text-caption font-weight-bold">{{ role.label }}:</div>
              <v-text-field
                :model-value="signatories[role.field]"
                placeholder="Name"
                variant="plain"
                density="compact"
                hide-details
                @update:model-value="setSignatory(role.field, $event)"
              />
              <div class="border-b mb-1" />
              <div class="text-caption text-center"><em>(Signature Over Printed Name)</em></div>
            </v-col>
          </v-row>

        </div>

        <div class="text-caption text-medium-emphasis mt-2">
          Section D (Received Payment — check no., bank, OR no., date) prints as blank
          lines for the payee to complete on receipt.
        </div>

        <!-- Fund balance preview, carried over from the old expense dialog -->
        <v-alert
          v-if="insufficientFunds && selectedAccount"
          type="error"
          variant="tonal"
          density="compact"
          class="mt-3 text-body-2"
        >
          The voucher total exceeds the available balance in
          {{ selectedAccount.name }} ({{ formatCurrency(selectedAccount.balance) }}).
        </v-alert>
        <div v-else-if="selectedAccount" class="text-caption text-medium-emphasis mt-2">
          {{ selectedAccount.name }} balance {{ formatCurrency(selectedAccount.balance) }} —
          {{ formatCurrency(selectedAccount.balance - voucherTotal) }} after this voucher is recorded.
        </div>
      </v-card-text>

      <v-divider />

      <v-card-actions class="pa-4">
        <!-- Why Create Voucher is disabled. Without this the button just sits
             there dead with nothing on the form saying which cell is empty. -->
        <span v-if="blockers.length" class="text-caption text-medium-emphasis">
          Still needed: {{ blockers.join(', ') }}
        </span>
        <v-spacer />
        <v-btn variant="text" class="text-none" @click="emit('update:modelValue', false)">Cancel</v-btn>
        <v-btn
          color="primary"
          variant="flat"
          class="text-none font-weight-bold"
          :disabled="!canSubmit"
          :loading="loading"
          @click="handleSubmit"
        >
          {{ isEditing ? 'Save Draft' : 'Create Voucher' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

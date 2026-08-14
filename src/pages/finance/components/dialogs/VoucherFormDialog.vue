<script setup lang="ts">
import { watch } from 'vue'
import { useVoucherForm } from '../../composables/useVoucherForm'
import { VOUCHER_SIGNATORIES } from '@/stores/disbursementVouchersData'
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
  payee, payeeAddress, payeeTin, voucherDate, cashAccountId, checkNo, orSiNo, remarks, items,
  categoryOptions, departmentOptions, accountOptions, metaForAccount, selectedAccount,
  voucherTotal, insufficientFunds, canSubmit, blockers,
  resetForm, loadFrom, addItem, removeItem, buildPayload, restoreDraft,
} = useVoucherForm(() => props.accounts)

// The form deliberately mirrors the printed voucher cell-for-cell, so what the
// user fills in is laid out exactly where it lands on the paper they sign.
// Signature blocks are shown but not editable — they're signed by hand.
const signatories = VOUCHER_SIGNATORIES

// Prefill on open: an existing draft loads its own values, a new voucher picks
// up any autosaved draft instead.
watch(() => props.modelValue, (open) => {
  if (!open) return
  resetForm()
  if (props.editing) loadFrom(props.editing)
  else restoreDraft()
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

        <div class="fv">
          <!-- Title + DV No. -->
          <div class="fv-row">
            <div class="fv-cell fv-title">DISBURSEMENT VOUCHER</div>
            <div class="fv-cell fv-side">
              <div class="fv-label">DV No.</div>
              <div class="fv-static">
                {{ editing?.dv_no ?? 'Assigned on save' }}
              </div>
            </div>
          </div>

          <!-- Payee block -->
          <div class="fv-row">
            <div class="fv-cell fv-grow">
              <div class="fv-label">Payee <span class="fv-req">*</span></div>
              <v-text-field
                v-model="payee"
                placeholder="Who is being paid"
                variant="plain"
                density="compact"
                hide-details
              />
            </div>
            <div class="fv-cell fv-side">
              <div class="fv-label">Date <span class="fv-req">*</span></div>
              <v-text-field
                v-model="voucherDate"
                type="date"
                variant="plain"
                density="compact"
                hide-details
              />
            </div>
          </div>

          <div class="fv-row">
            <div class="fv-cell fv-grow">
              <div class="fv-label">Address</div>
              <v-text-field
                v-model="payeeAddress"
                placeholder="Payee address"
                variant="plain"
                density="compact"
                hide-details
              />
            </div>
            <div class="fv-cell fv-side">
              <!-- Not "Fund" (an LGU fund-cluster term from the source form) and
                   not "Bank/Checking Account" — this can be a bank account, the
                   petty cash box, or a placement. "Paid From" is true for all. -->
              <div class="fv-label">Payment Mode <span class="fv-req">*</span></div>
              <v-select
                v-model="cashAccountId"
                :items="accountOptions"
                placeholder="Account paid from"
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
            </div>
          </div>

          <div class="fv-row">
            <div class="fv-cell fv-grow">
              <div class="fv-label">TIN</div>
              <v-text-field
                v-model="payeeTin"
                placeholder="Taxpayer identification number"
                variant="plain"
                density="compact"
                hide-details
              />
            </div>
            <div class="fv-cell fv-side">
              <div class="fv-label">Check No.</div>
              <v-text-field
                v-model="checkNo"
                placeholder="The check we issue"
                variant="plain"
                density="compact"
                hide-details
              />
            </div>
          </div>

          <div class="fv-row">
            <div class="fv-cell fv-grow">
              <div class="fv-label">Reference / Remarks</div>
              <v-text-field
                v-model="remarks"
                placeholder="Optional note carried onto the voucher"
                variant="plain"
                density="compact"
                hide-details
              />
            </div>
            <div class="fv-cell fv-side">
              <div class="fv-label">OR/SI No.</div>
              <v-text-field
                v-model="orSiNo"
                placeholder="Official receipt / sales invoice"
                variant="plain"
                density="compact"
                hide-details
              />
            </div>
          </div>

          <!-- Particulars: every field the expense form asks for lives on the line -->
          <div class="fv-row fv-head">
            <div class="fv-cell fv-grow text-center font-weight-bold">PARTICULARS</div>
            <div class="fv-cell fv-side text-center font-weight-bold">AMOUNT</div>
          </div>

          <div v-for="(line, index) in items" :key="index" class="fv-row">
            <div class="fv-cell fv-grow">
              <!-- No per-line description: the purpose is written once in
                   Reference / Remarks above. A line is only what the spend is
                   charged to. -->
              <div class="fv-sub">
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
                <v-select
                  v-model="line.department"
                  :items="departmentOptions"
                  item-title="title"
                  item-value="value"
                  label="Department"
                  variant="outlined"
                  density="compact"
                  clearable
                  hide-details
                />
              </div>
            </div>
            <div class="fv-cell fv-side d-flex align-start ga-1">
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
            </div>
          </div>

          <div class="fv-row">
            <div class="fv-cell fv-grow">
              <v-btn
                size="small"
                variant="text"
                color="primary"
                class="text-none"
                prepend-icon="mdi-plus"
                @click="addItem"
              >
                Add Particular
              </v-btn>
            </div>
            <div class="fv-cell fv-side"></div>
          </div>

          <div class="fv-row fv-total">
            <div class="fv-cell fv-grow text-right font-weight-bold">TOTAL</div>
            <div class="fv-cell fv-side text-right font-weight-bold">
              {{ formatCurrency(voucherTotal) }}
            </div>
          </div>

          <!-- Signed by hand on the printed copy, not captured here -->
          <div class="fv-row fv-certs">
            <div v-for="role in signatories" :key="role" class="fv-cell fv-quarter">
              <div class="fv-fine font-weight-bold">{{ role }}:</div>
              <div class="fv-signline"></div>
              <div class="fv-fine text-center"><em>(Signature Over Printed Name)</em></div>
            </div>
          </div>

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

<style scoped>
/* Mirrors VoucherPrintDialog's ruled layout so the form reads as the document
   it produces. Uses currentColor for borders so it works in both themes. */
.fv {
  border: 1px solid;
  border-color: rgba(var(--v-theme-on-surface), 0.38);
}

.fv-row {
  display: flex;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.38);
}

.fv-row:last-child {
  border-bottom: none;
}

.fv-cell {
  padding: 6px 10px;
  border-right: 1px solid rgba(var(--v-theme-on-surface), 0.38);
  min-width: 0;
}

.fv-cell:last-child {
  border-right: none;
}

.fv-grow {
  flex: 1 1 auto;
}

.fv-side {
  flex: 0 0 260px;
}

.fv-quarter {
  flex: 1 1 25%;
}

.fv-title {
  flex: 1 1 auto;
  text-align: center;
  font-size: 1.15rem;
  font-weight: 700;
  letter-spacing: 1px;
  align-self: center;
}

.fv-label {
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  opacity: 0.75;
}

.fv-req {
  color: rgb(var(--v-theme-error));
}

.fv-static {
  font-size: 0.9rem;
  font-weight: 700;
  padding: 6px 0;
}

.fv-head,
.fv-total {
  background: rgba(var(--v-theme-on-surface), 0.06);
}

/* The per-line expense detail fields (category / department / OR-SI) that the
   old Add Expense form asked for, kept on the particular they belong to. */
.fv-sub {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  padding: 2px 0;
  max-width: 560px;
}

.fv-certs {
  min-height: 130px;
}

.fv-fine {
  font-size: 0.68rem;
  line-height: 1.35;
}

.fv-signline {
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.6);
  margin: 28px 0 3px;
}

@media (max-width: 720px) {
  .fv-row {
    flex-direction: column;
  }

  .fv-cell {
    border-right: none;
    border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.2);
  }

  .fv-side {
    flex: 1 1 auto;
  }

  .fv-sub {
    grid-template-columns: 1fr;
  }
}
</style>

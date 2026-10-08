<script setup lang="ts">
import { cashClassifications, classificationMeta } from '@/utils/cashAccountTypes'
import type { ClassifiedCashAccount, CreateCashAccountPayload } from '@/utils/cashAccountTypes'
import { formatCurrency } from '@/utils/helpers'
import { onMounted } from 'vue'
import { useCashAccountsManager } from '../composables/useCashAccountsManager'

const props = defineProps<{
  accounts: ClassifiedCashAccount[]
  loading?: boolean
}>()

const emit = defineEmits<{
  (e: 'create', payload: CreateCashAccountPayload): void
}>()

const {
  groupedAccounts,
  totalActiveBalance,
  selectedClassificationMeta,
  glVariances,
  loadReconciliation,
  showConfirm,
  busy,
  confirmMode,
  confirmTarget,
  askRemove,
  askDeactivate,
  confirmAccountAction,
  showAddDialog,
  name,
  classification,
  openingBalance,
  isActive,
  canSubmit,
  glAccountCode,
  glAccountOptions,
  openAddDialog,
  cancelAdd,
  buildPayload,
} = useCashAccountsManager(() => props.accounts)

// The trial balance is one RPC; without it every variance reads as the full
// GL balance, which would show a false alarm on first paint.
onMounted(loadReconciliation)

const submitNewAccount = () => {
  const payload = buildPayload()
  if (!payload) return
  emit('create', payload)
  showAddDialog.value = false
}
</script>

<template>
  <!-- Embeddable section — the parent (CashAccountsPanel) owns the page container. -->
  <div class="w-100">
    <!-- Page header -->
    <div class="d-flex justify-space-between align-center mb-4">
      <div>
        <div class="text-h6 font-weight-bold">Cash Accounts</div>
        <div class="text-caption text-medium-emphasis">
          {{ accounts.length }} account{{ accounts.length === 1 ? '' : 's' }} ·
          {{ formatCurrency(totalActiveBalance) }} total active balance
        </div>
      </div>
      <v-btn
        class="text-none"
        color="primary"
        variant="flat"
        elevation="0"
        prepend-icon="mdi-plus"
        @click="openAddDialog"
      >
        Add Cash Account
      </v-btn>
    </div>

    <!-- GL reconciliation. Silent when everything ties, which is the point:
         a clean page shows nothing and a gap is impossible to walk past. -->
    <v-alert
      v-for="row in glVariances"
      :key="row.code"
      type="warning"
      variant="tonal"
      density="compact"
      class="mb-3"
    >
      <div class="font-weight-bold">
        {{ row.code }} {{ row.name }} doesn't tie to these accounts
      </div>
      <div class="text-caption">
        Ledger holds {{ formatCurrency(row.glBalance) }}; the cash accounts posting here
        total {{ formatCurrency(row.cashBalance) }} —
        <strong>{{ formatCurrency(Math.abs(row.variance)) }}</strong>
        {{ row.variance > 0 ? 'more in the ledger than on hand' : 'more on hand than the ledger shows' }}.
        Usually an account removed without reversing its opening entry, or a journal entry
        reversed by hand without the cash being put back.
      </div>
    </v-alert>

    <!-- Accounts grouped by classification -->
    <div v-for="group in groupedAccounts" :key="group.meta.value" class="mb-5">
      <div class="d-flex align-center mb-2 ga-2">
        <v-chip
          :color="group.meta.color"
          size="small"
          variant="flat"
          :prepend-icon="group.meta.icon"
        >
          {{ group.meta.title }}
        </v-chip>
        <span class="text-caption text-medium-emphasis">{{ group.meta.description }}</span>
        <v-spacer />
        <span class="text-caption font-weight-bold">{{ formatCurrency(group.activeTotal) }}</span>
      </div>

      <v-card
        v-if="!group.accounts.length"
        rounded="lg"
        elevation="0"
        border
        class="pa-4 text-center text-caption text-medium-emphasis"
      >
        No {{ group.meta.title }} accounts yet.
      </v-card>

      <v-card v-else rounded="lg" elevation="1" border>
        <v-list lines="two" density="comfortable" class="py-0">
          <template v-for="(account, i) in group.accounts" :key="account.id">
            <v-divider v-if="i > 0" />
            <v-list-item
              :class="{ 'account-inactive': !account.is_active }"
              :title="account.name"
              :subtitle="`Opening balance: ${formatCurrency(account.opening_balance)}`"
            >
              <template #prepend>
                <v-avatar size="32" :color="`${group.meta.color}-lighten-5`" rounded="lg">
                  <v-icon :icon="group.meta.icon" :color="group.meta.color" size="18" />
                </v-avatar>
              </template>
              <template #append>
                <div class="d-flex align-center ga-3">
                  <v-chip v-if="!account.is_active" color="grey" size="small" variant="tonal">
                    Inactive
                  </v-chip>
                  <span class="text-h6 font-weight-bold">{{
                    formatCurrency(account.balance)
                  }}</span>
                  <!-- Retiring an account had no UI at all until now, so the
                       only way to undo a mistyped one was hand-written SQL. -->
                  <v-menu location="bottom end">
                    <template #activator="{ props: menu }">
                      <v-btn v-bind="menu" icon="mdi-dots-vertical" variant="text" size="small" />
                    </template>
                    <v-list density="compact">
                      <v-list-item
                        v-if="account.is_active"
                        prepend-icon="mdi-archive-outline"
                        title="Deactivate"
                        subtitle="Hide it, keep its history"
                        @click="askDeactivate(account)"
                      />
                      <v-list-item
                        prepend-icon="mdi-delete-outline"
                        base-color="error"
                        title="Remove"
                        subtitle="Only if never used"
                        @click="askRemove(account)"
                      />
                    </v-list>
                  </v-menu>
                </div>
              </template>
            </v-list-item>
          </template>
        </v-list>
      </v-card>
    </div>

    <!-- Confirm removing / deactivating. States the ledger consequence BEFORE
         committing: the opening entry is the part people forget, and forgetting
         it is what strands money in the GL. -->
    <v-dialog v-model="showConfirm" max-width="460">
      <v-card rounded="lg">
        <v-card-title class="text-subtitle-1 font-weight-bold">
          {{ confirmMode === 'remove' ? 'Remove' : 'Deactivate' }} {{ confirmTarget?.name }}?
        </v-card-title>
        <v-card-text class="text-body-2">
          <template v-if="confirmMode === 'remove'">
            <p class="mb-2">
              The account is deleted and its opening entry of
              <strong>{{ formatCurrency(confirmTarget?.opening_balance ?? 0) }}</strong>
              is reversed in the ledger, so cash stays reconciled.
            </p>
            <p class="mb-0 text-medium-emphasis">
              If anything has ever been paid from or into it, this is refused —
              deactivate it instead.
            </p>
          </template>
          <template v-else>
            <p class="mb-0">
              It stops appearing in pickers and in the active totals. Every document
              that used it keeps working, and it can be reactivated later.
            </p>
          </template>
        </v-card-text>
        <v-card-actions class="px-4 pb-4">
          <v-spacer />
          <v-btn variant="text" class="text-none" @click="showConfirm = false">Cancel</v-btn>
          <v-btn
            :color="confirmMode === 'remove' ? 'error' : 'primary'"
            variant="flat"
            class="text-none"
            :loading="busy"
            @click="confirmAccountAction"
          >
            {{ confirmMode === 'remove' ? 'Remove' : 'Deactivate' }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Add cash account dialog -->
    <v-dialog v-model="showAddDialog" max-width="440" persistent>
      <v-card rounded="lg">
        <v-card-title class="pa-4 pa-sm-5 pb-3 text-h6 font-weight-bold"
          >Add Cash Account</v-card-title
        >
        <v-divider />
        <v-card-text class="pa-4 pa-sm-5">
          <label class="field-label">Account Name <span class="text-error">*</span></label>
          <v-text-field
            v-model="name"
            placeholder="e.g. BDO Savings, Office Petty Cash"
            variant="outlined"
            density="compact"
            hide-details
            class="mb-3"
          />

          <label class="field-label">Classification <span class="text-error">*</span></label>
          <v-select
            v-model="classification"
            :items="cashClassifications"
            item-title="title"
            item-value="value"
            placeholder="Select classification"
            variant="outlined"
            density="compact"
            hide-details
            class="mb-3"
          >
            <template #item="{ props: itemProps, item }">
              <v-list-item
                v-bind="itemProps"
                :subtitle="classificationMeta(item.value).description"
              >
                <template #prepend>
                  <v-icon
                    :icon="classificationMeta(item.value).icon"
                    :color="classificationMeta(item.value).color"
                    size="20"
                    class="mr-2"
                  />
                </template>
              </v-list-item>
            </template>
            <template #selection>
              <v-chip
                v-if="selectedClassificationMeta"
                :color="selectedClassificationMeta.color"
                size="small"
                variant="tonal"
                :prepend-icon="selectedClassificationMeta.icon"
              >
                {{ selectedClassificationMeta.title }}
              </v-chip>
            </template>
          </v-select>

          <!-- Which chart account this cash sits in. Defaulted from the
               classification above, but overridable: a revolving fund is
               PETTY_CASH by behaviour yet belongs in 1050, not 1010. -->
          <label class="field-label">GL Account <span class="text-error">*</span></label>
          <v-select
            v-model="glAccountCode"
            :items="glAccountOptions"
            placeholder="Where this money sits in the ledger"
            variant="outlined"
            density="compact"
            hide-details
            class="mb-1"
          />
          <div class="text-caption text-medium-emphasis mb-3">
            Postings from this account land here. Suggested from the
            classification &mdash; change it for a revolving fund or a named
            bank account.
          </div>

          <label class="field-label">Opening Balance <span class="text-error">*</span></label>
          <v-text-field
            :model-value="openingBalance"
            type="number"
            min="0"
            prefix="₱"
            placeholder="0"
            variant="outlined"
            density="compact"
            hide-details
            class="mb-3"
            @update:model-value="openingBalance = $event === '' ? null : Number($event)"
          />

          <v-switch
            v-model="isActive"
            label="Active"
            color="primary"
            density="compact"
            hide-details
            inset
          />
        </v-card-text>
        <v-divider />
        <v-card-actions class="px-5 pb-5 pt-3 d-flex justify-end ga-2">
          <v-btn variant="outlined" class="text-none" @click="cancelAdd">Cancel</v-btn>
          <v-btn
            color="primary"
            class="text-none font-weight-bold"
            elevation="0"
            :loading="loading"
            :disabled="!canSubmit"
            @click="submitNewAccount"
          >
            Add Account
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
.field-label {
  display: block;
  font-size: 0.8rem;
  font-weight: 600;
  color: #424242;
  margin-bottom: 4px;
}
.account-inactive {
  opacity: 0.6;
}
</style>

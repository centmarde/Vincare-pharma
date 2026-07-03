<script setup lang="ts">
import { CASH_CLASSIFICATIONS } from '@/utils/cashAccountTypes'
import type { ClassifiedCashAccount, CreateCashAccountPayload } from '@/utils/cashAccountTypes'
import { formatCurrency } from '@/utils/helpers'
import { useCashAccountsManager } from '../composables/useCashAccountsManager'

const props = defineProps<{
  accounts: ClassifiedCashAccount[]
  loading?: boolean
}>()

const emit = defineEmits<{
  (e: 'create', payload: CreateCashAccountPayload): void
}>()

const {
  groupedAccounts, totalActiveBalance,
  showAddDialog, name, classification, openingBalance, isActive, canSubmit,
  openAddDialog, cancelAdd, buildPayload,
} = useCashAccountsManager(() => props.accounts)

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
            {{ accounts.length }} account{{ accounts.length === 1 ? '' : 's' }}
            · {{ formatCurrency(totalActiveBalance) }} total active balance
          </div>
        </div>
        <v-btn class="text-none" color="primary" variant="flat" elevation="0" prepend-icon="mdi-plus" @click="openAddDialog">
          Add Cash Account
        </v-btn>
      </div>

      <!-- Accounts grouped by classification -->
      <div v-for="group in groupedAccounts" :key="group.meta.value" class="mb-5">
        <div class="d-flex align-center mb-2 ga-2">
          <v-chip :color="group.meta.color" size="small" variant="flat" :prepend-icon="group.meta.icon">
            {{ group.meta.title }}
          </v-chip>
          <span class="text-caption text-medium-emphasis">{{ group.meta.description }}</span>
          <v-spacer />
          <span class="text-caption font-weight-bold">{{ formatCurrency(group.activeTotal) }}</span>
        </div>

        <v-card v-if="!group.accounts.length" rounded="lg" elevation="0" border class="pa-4 text-center text-caption text-medium-emphasis">
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
                    <span class="text-h6 font-weight-bold">{{ formatCurrency(account.balance) }}</span>
                  </div>
                </template>
              </v-list-item>
            </template>
          </v-list>
        </v-card>
      </div>

    <!-- Add cash account dialog -->
    <v-dialog v-model="showAddDialog" max-width="440" persistent>
      <v-card rounded="lg">
        <v-card-title class="pa-4 pa-sm-5 pb-3 text-h6 font-weight-bold">Add Cash Account</v-card-title>
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
            :items="CASH_CLASSIFICATIONS"
            item-title="title"
            item-value="value"
            placeholder="Select classification"
            variant="outlined"
            density="compact"
            hide-details
            class="mb-3"
          >
            <template #item="{ props: itemProps, item }">
              <v-list-item v-bind="itemProps" :subtitle="item.raw.description">
                <template #prepend>
                  <v-icon :icon="item.raw.icon" :color="item.raw.color" size="20" class="mr-2" />
                </template>
              </v-list-item>
            </template>
            <template #selection="{ item }">
              <v-chip :color="item.raw.color" size="small" variant="tonal" :prepend-icon="item.raw.icon">
                {{ item.raw.title }}
              </v-chip>
            </template>
          </v-select>

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

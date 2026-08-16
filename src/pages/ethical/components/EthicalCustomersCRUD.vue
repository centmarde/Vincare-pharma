<script setup lang="ts">
import { onMounted } from 'vue'
import { useDisplay } from 'vuetify'
import CustomerTermsChips from '@/components/customers/CustomerTermsChips.vue'
import FieldValue from '@/components/customers/FieldValue.vue'
import CustomerDetailPanel from '@/components/customers/CustomerDetailPanel.vue'
import { useEthicalCustomers } from '../composables/useEthicalCustomers'
import CustomerForm from './CustomerForm.vue'
import EthicalCustCRUDMobile from '../mobile/EthicalCustCRUDMobile.vue'

const { mobile } = useDisplay()

const {
  customers, loading, totalCount, page, pageSize, searchText, showAll, profileFor, showCreateDialog, showEditDialog, editingCustomer, headers,
  agentOptions, businessStructureOptions, createCustomer, updateCustomer, deleteCustomer,
  openCreateDialog, cancelCreate, openEdit, cancelEdit, init,
} = useEthicalCustomers()

onMounted(() => init())

const editCustomer = (item: any) => openEdit(item.id)
const removeCustomer = (item: any) => deleteCustomer(item.id)

const notSet = (label: string) => `No ${label} set`
</script>

<template>
  <v-container fluid class="pa-2 pa-sm-4 fill-height align-start">
    <div class="mx-auto w-100">
      <v-card rounded="lg" elevation="1">
        <v-card-title
          class="pa-4 pa-sm-5 d-flex align-center flex-wrap ga-2"
          :class="{ 'flex-column align-start': mobile }"
        >
          <div class="d-flex align-center ga-2">
            <v-icon icon="mdi-account-group" color="primary" />
            <span class="text-h6 font-weight-bold">Ethical Customers</span>

            <v-chip v-if="totalCount" size="small" variant="tonal" color="primary">
              {{ totalCount }} total
            </v-chip>
          </div>

          <v-spacer v-if="!mobile" />

          <v-btn
            size="small"
            variant="flat"
            color="primary"
            class="text-none"
            :block="mobile"
            prepend-icon="mdi-account-plus"
            @click="openCreateDialog"
          >
            Add Customer
          </v-btn>
        </v-card-title>

        <v-divider />

        <div
          class="pa-4 pa-sm-5 d-flex align-center ga-3"
          :class="mobile ? 'flex-column align-stretch' : 'flex-wrap'"
        >
          <v-text-field
            v-model="searchText"
            placeholder="Search name, contact no., email, address, owner, TIN, or terms"
            prepend-inner-icon="mdi-magnify"
            density="compact"
            variant="outlined"
            hide-details
            :style="mobile ? undefined : 'max-width: 420px'"
            min-width="240"
            clearable
          >
            <template #append-inner>
              <v-btn
                size="small"
                variant="tonal"
                color="primary"
                density="comfortable"
                icon="mdi-magnify"
              />
            </template>
          </v-text-field>

          <v-spacer v-if="!mobile" />

          <v-switch
            v-model="showAll"
            label="Show every channel"
            color="primary"
            density="compact"
            hide-details
            inset
          />
        </div>

        <v-divider />

        <div
          v-if="!loading && customers.length === 0"
          class="d-flex flex-column align-center py-10 text-medium-emphasis"
        >
          <v-icon icon="mdi-account-search-outline" size="40" class="mb-2" />

          <span class="text-body-2">
            {{ searchText ? `No customers match "${searchText}"` : 'No customers found' }}
          </span>
        </div>

        <EthicalCustCRUDMobile
          v-else-if="mobile"
          :customers="customers"
          :total-count="totalCount"
          v-model:page="page"
          :page-size="pageSize"
          :loading="loading"
          :profile-for="profileFor"
          @edit="editCustomer"
          @delete="deleteCustomer"
        />

        <v-data-table-server
          v-else
          :headers="headers"
          :items="customers"
          :items-length="totalCount"
          :loading="loading"
          :items-per-page="pageSize"
          v-model:page="page"
          item-value="id"
          density="comfortable"
          class="customers-table"
          show-expand
        >
          <template #item.name="{ item }">
            <div class="d-flex align-center ga-2 py-1">
              <v-avatar size="28" color="primary" variant="tonal">
                <span class="text-caption font-weight-bold">
                  {{ (item.name || '?').charAt(0).toUpperCase() }}
                </span>
              </v-avatar>

              <span class="font-weight-medium">
                {{ item.name || notSet('name') }}
              </span>
            </div>
          </template>

          <template #item.agency_type="{ item }">
            <FieldValue :value="item.agency_type" />
          </template>

          <template #item.contact_no="{ item }">
            <span
              style="white-space: nowrap"
              :class="{
                'text-medium-emphasis font-italic': !item.contact_no,
              }"
            >
              {{ item.contact_no || notSet('contact number') }}
            </span>
          </template>

          <template #item.area="{ item }">
            <span
              style="white-space: nowrap"
              :class="{
                'text-medium-emphasis font-italic': !item.area,
              }"
            >
              {{ item.area || notSet('area') }}
            </span>
          </template>

          <template #item.agent_name="{ item }">
            <FieldValue :value="item.agent_name" />
          </template>

          <template #item.is_active="{ item }">
            <v-icon
              :color="item.is_active ? 'success' : 'grey'"
              :icon="item.is_active ? 'mdi-check-circle' : 'mdi-minus-circle'"
            />
          </template>

          <template #item.term_days="{ item }">
            <span
              :class="{
                'text-medium-emphasis font-italic': !item.term_days,
              }"
            >
              {{ item.term_days || notSet('payment terms') }}
            </span>
          </template>

          <template #item.rates="{ item }">
            <div class="d-flex flex-wrap ga-1">
              <CustomerTermsChips :profile="profileFor(item.id)" />
            </div>
          </template>

          <template #expanded-row="{ columns, item }">
            <tr>
              <td :colspan="columns.length" class="pa-0">
                <CustomerDetailPanel :customer="item" :profile="profileFor(item.id)" />
              </td>
            </tr>
          </template>

          <template #item.actions="{ item }">
          <div class="d-flex align-center justify-end ga-1">
            <v-btn size="small" variant="text" color="primary" icon="mdi-pencil-outline" @click="openEdit(item.id)" />
            <v-btn size="small" variant="text" color="error" icon="mdi-delete-outline" @click="deleteCustomer(item.id)" />
          </div>
        </template>
        </v-data-table-server>

        <v-divider />

        <div class="pa-4 pa-sm-5 text-caption text-medium-emphasis d-flex align-start ga-2">
          <v-icon size="16" icon="mdi-information-outline" class="mt-1 flex-shrink-0" />

          <span>
            A customer is assigned to a channel the first time they transact, and that assignment is
            never changed afterwards — so unassigned customers are listed here too. Corrections to an
            existing name, address or terms are made here.
          </span>
        </div>
      </v-card>

      <v-dialog v-model="showCreateDialog" persistent max-width="800px">
        <v-card>
          <v-card-title>New Customer</v-card-title>
          <v-card-text>
            <CustomerForm
              :agent-options="agentOptions"
              :business-structure-options="businessStructureOptions"
              @submit="createCustomer"
              @cancel="cancelCreate"
            />
          </v-card-text>
        </v-card>
      </v-dialog>

      <v-dialog v-model="showEditDialog" persistent max-width="800px">
        <v-card v-if="editingCustomer">
          <v-card-title>Edit Customer</v-card-title>
          <v-card-text>
            <CustomerForm
              :customer="editingCustomer"
              :profile="editingCustomer ? profileFor(editingCustomer.id) : null"
              :agent-options="agentOptions"
              :business-structure-options="businessStructureOptions"
              @submit="updateCustomer"
              @cancel="cancelEdit"
            />
          </v-card-text>
        </v-card>
      </v-dialog>
    </div>
  </v-container>
</template>

<style scoped>
.customers-table :deep(tbody tr:hover) {
  background: rgba(var(--v-theme-primary), 0.04);
}
</style>
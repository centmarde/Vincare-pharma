<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useDisplay } from 'vuetify'
import { useSalesCustomers } from '../composables/useSalesCustomers'
import CustomerTermsChips from '@/components/customers/CustomerTermsChips.vue'
import FieldValue from '@/components/customers/FieldValue.vue'
import CustomerDetailPanel from '@/components/customers/CustomerDetailPanel.vue'
import SalesCustomersMobile from '@/pages/sales/mobile/SalesCustomersMobile.vue'
import CustomerFormDialog from '@/pages/sales/dialogs/CustomerFormDialog.vue'

const { mobile } = useDisplay()
const {
  loading,
  customers,
  totalCount,
  page,
  pageSize,
  searchInput,
  search,
  applySearch,
  clearSearch,
  filtered,
  profileFor,
  showAll,
  showForm,
  editingId,
  form,
  rules,
  headers,
  openCreate,
  openEdit,
  cancelForm,
  submit,
  init,
} = useSalesCustomers()

onMounted(init)

const CHANNEL_COLOR: Record<string, string> = {
  pos: 'primary',
  ethical: 'purple',
  inhouse: 'teal',
}

const notSet = (label: string) => `No ${label} set`

const displayedCustomers = computed(() => customers.value ?? filtered.value)
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
            <span class="text-h6 font-weight-bold">Store Customers</span>

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
            @click="openCreate"
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
            v-model="searchInput"
            :placeholder="
              mobile
                ? 'Search customers'
                : 'Search name, contact no., email, address, owner, TIN, or terms'
            "
            prepend-inner-icon="mdi-magnify"
            density="compact"
            variant="outlined"
            hide-details
            :style="mobile ? undefined : 'max-width: 420px'"
            min-width="240"
            clearable
            @keyup.enter="applySearch"
            @click:clear="clearSearch"
          >
            <template #append-inner>
              <v-btn
                size="small"
                variant="tonal"
                color="primary"
                density="comfortable"
                icon="mdi-magnify"
                @click="applySearch"
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

        <v-fade-transition>
          <div
            v-if="search"
            class="px-4 px-sm-5 pb-3 d-flex align-center flex-wrap ga-2 text-caption text-medium-emphasis"
          >
            <v-icon size="14" icon="mdi-filter-variant" />

            <span>
              Results for <strong>"{{ search }}"</strong>
            </span>

            <v-btn
              size="x-small"
              variant="text"
              color="primary"
              class="text-none"
              prepend-icon="mdi-close"
              @click="clearSearch"
            >
              Clear
            </v-btn>
          </div>
        </v-fade-transition>

        <v-divider />

        <div
          v-if="!loading && displayedCustomers.length === 0"
          class="d-flex flex-column align-center py-10 text-medium-emphasis"
        >
          <v-icon icon="mdi-account-search-outline" size="40" class="mb-2" />

          <span class="text-body-2">
            {{ search ? `No customers match "${search}"` : 'No customers found' }}
          </span>

          <v-btn
            v-if="search"
            size="small"
            variant="text"
            color="primary"
            class="text-none mt-1"
            @click="clearSearch"
          >
            Clear search
          </v-btn>
        </div>

        <SalesCustomersMobile
          v-else-if="mobile"
          :customers="displayedCustomers"
          :total-count="totalCount"
          v-model:page="page"
          :page-size="pageSize"
          :loading="loading"
          :profile-for="profileFor"
          @edit="openEdit"
        />

        <v-data-table-server
          v-else
          :headers="headers"
          :items="displayedCustomers"
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

          <template #item.category="{ item }">
            <v-chip v-if="item.category" size="x-small" variant="tonal">
              {{ item.category }}
            </v-chip>

            <FieldValue v-else :value="null" />
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

          <template #item.address="{ item }">
            <span
              :class="{
                'text-medium-emphasis font-italic': !item.address,
              }"
            >
              {{ item.address || notSet('address') }}
            </span>
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
            <!-- How to make this wrap? and make this centered ?-->

            <div class="d-flex flex-wrap ga-1">
              <CustomerTermsChips :profile="profileFor(item.id)" />
            </div>
          </template>

          <template #item.department="{ item }">
            <v-chip
              size="x-small"
              variant="tonal"
              :color="item.department ? (CHANNEL_COLOR[item.department] ?? 'grey') : 'grey'"
            >
              {{ item.department ? item.department.toUpperCase() : 'Unassigned' }}
            </v-chip>
          </template>

          <template #expanded-row="{ columns, item }">
            <tr>
              <td :colspan="columns.length" class="pa-0">
                <CustomerDetailPanel :customer="item" :profile="profileFor(item.id)" />
              </td>
            </tr>
          </template>

          <template #item.actions="{ item }">
            <v-btn
              size="small"
              variant="text"
              color="primary"
              icon="mdi-pencil-outline"
              @click="openEdit(item)"
            />
          </template>
        </v-data-table-server>

        <v-divider />

        <div class="pa-4 pa-sm-5 text-caption text-medium-emphasis d-flex align-start ga-2">
          <v-icon size="16" icon="mdi-information-outline" class="mt-1 flex-shrink-0" />

          <span>
            A customer is assigned to a channel the first time they transact, and that assignment is
            never changed afterwards — so unassigned customers are listed here too. The checkout
            only ever fills in blank details; corrections to an existing name or address are made
            here.
          </span>
        </div>
      </v-card>

      <CustomerFormDialog
        v-model="showForm"
        :mobile="mobile"
        :editing-id="editingId"
        v-model:form="form"
        :rules="rules"
        :loading="loading"
        @cancel="cancelForm"
        @submit="submit"
      />
    </div>
  </v-container>
</template>

<style scoped>
.customers-table :deep(tbody tr:hover) {
  background: rgba(var(--v-theme-primary), 0.04);
}
</style>

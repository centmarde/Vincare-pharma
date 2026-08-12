<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useDisplay } from 'vuetify'
import { useCustomers, headers, businessStructures } from '../composables/useCustomers'
import CustomerTermsChips from '@/components/customers/CustomerTermsChips.vue'
import FieldValue from '@/components/customers/FieldValue.vue'
import CustomerDetailPanel from '@/components/customers/CustomerDetailPanel.vue'
import CustomerCRUDMobile from '@/pages/inhouse/mobile/CustomerCRUDMobile.vue'
import CustomerFormDialog from '@/pages/inhouse/dialogs/CustomerFormDialog.vue'
import { label } from '@/utils/helpers'

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
  showAll,
  showForm,
  editingId,
  form,
  rules,
  profileFor,
  openCreate,
  openEdit,
  cancelForm,
  submit,
  remove,
  init,
} = useCustomers()

const editingCustomer = computed(() =>
  editingId.value == null
    ? null
    : (customers.value.find((customer) => customer.id === editingId.value) ?? null),
)

function structureLabel(value: string | null): string {
  return businessStructures.find((structure) => structure.value === value)?.title ?? 'not set yet'
}

function displayLabel(value: string | null | undefined): string {
  return label(value)
}

const notSet = (field: string) => `No ${field} set`

onMounted(init)
</script>

<template>
  <v-container fluid class="pa-2 pa-sm-4 fill-height align-start">
    <div class="mx-auto w-100">
      <v-card rounded="lg" elevation="1">
        <v-card-title
          class="pa-4 pa-sm-5 d-flex align-center flex-wrap ga-2"
          :class="{
            'flex-column align-start': mobile,
          }"
        >
          <div class="d-flex align-center flex-wrap ga-2">
            <v-icon icon="mdi-domain" color="primary" />

            <span
              class="font-weight-bold"
              style="min-width: 0"
              :class="mobile ? 'text-subtitle-1 text-wrap' : 'text-h6'"
            >
              Customers (Government / LGU)
            </span>

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
            New Customer
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
              mobile ? 'Search customers' : 'Search name, contact person, or contact no.'
            "
            prepend-inner-icon="mdi-magnify"
            density="compact"
            variant="outlined"
            hide-details
            :style="mobile ? undefined : 'max-width: 420px'"
            :min-width="mobile ? undefined : 240"
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
              Results for
              <strong>"{{ search }}"</strong>
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
          v-if="!loading && customers.length === 0"
          class="d-flex flex-column align-center py-10 text-medium-emphasis"
        >
          <v-icon icon="mdi-domain-off-outline" size="40" class="mb-2" />

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

        <CustomerCRUDMobile
          v-else-if="mobile"
          :customers="customers"
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
            <v-chip size="x-small" variant="tonal" :color="item.agency_type ? 'primary' : 'grey'">
              {{ item.agency_type ? item.agency_type.toUpperCase() : 'Unassigned' }}
            </v-chip>
          </template>

          <template #item.contact_person="{ item }">
            <span
              :class="{
                'text-medium-emphasis font-italic': !item.contact_person,
              }"
            >
              {{ item.contact_person || notSet('contact') }}
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

          <template #item.area="{ item }">
            <FieldValue :value="item.area" />
          </template>

          <template #item.term_days="{ item }">
            <FieldValue :value="item.term_days" />
          </template>

          <template #item.tin_number="{ item }">
            <span
              style="white-space: nowrap"
              :class="{
                'text-medium-emphasis font-italic': !item.tin_number,
              }"
            >
              {{ item.tin_number || notSet('TIN') }}
            </span>
          </template>

          <template #item.is_vat_registered="{ item }">
            <v-chip
              size="x-small"
              :color="item.is_vat_registered ? 'primary' : 'grey'"
              variant="tonal"
            >
              {{ item.is_vat_registered ? 'VAT' : 'Non-VAT' }}
            </v-chip>
          </template>

          <template #item.business_structure="{ item }">
            <v-chip
              size="x-small"
              variant="tonal"
              :color="item.business_structure ? 'teal' : 'grey'"
            >
              {{ item.business_structure ? structureLabel(item.business_structure) : 'Unassigned' }}
            </v-chip>
          </template>

          <template #item.reg_no="{ item }">
            <span
              style="white-space: nowrap"
              :class="{
                'text-medium-emphasis font-italic': !item.business_structure,
              }"
            >
              {{
                displayLabel(
                  item.business_structure === 'sole_proprietorship'
                    ? item.dti_registration_no
                    : item.sec_registration_no,
                )
              }}
            </span>
          </template>

          <template #item.rates="{ item }">
            <CustomerTermsChips :profile="profileFor(item.id)" />
          </template>

          <template #item.is_active="{ item }">
            <v-icon
              :color="item.is_active ? 'success' : 'grey'"
              :icon="item.is_active ? 'mdi-check-circle' : 'mdi-minus-circle'"
            />
          </template>

          <template #item.department="{ item }">
            <v-chip size="x-small" variant="tonal" :color="item.department ? 'primary' : 'grey'">
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
            <div class="d-flex align-center" style="gap: 2px; white-space: nowrap">
              <v-btn
                size="small"
                variant="text"
                color="primary"
                icon="mdi-pencil-outline"
                @click="openEdit(item)"
              />

              <v-btn
                size="small"
                variant="text"
                color="error"
                icon="mdi-delete-outline"
                @click="remove(item)"
              />
            </div>
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
        :form="form"
        :rules="rules"
        :loading="loading"
        :editing-customer="editingCustomer"
        :profile-for="profileFor"
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

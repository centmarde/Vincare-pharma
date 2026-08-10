<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useDisplay } from 'vuetify'
import { useCustomers, headers, agencyTypes, businessStructures } from '../composables/useCustomers'

const { mobile } = useDisplay()
const {
  loading, customers, totalCount, page, pageSize,
  searchInput, search, applySearch, clearSearch,
  showAll,
  showForm, editingId, form, rules,
  openCreate, openEdit, cancelForm, submit, remove, init,
} = useCustomers()

const formRef = ref()

function structureLabel(value: string | null): string {
  return businessStructures.find((s) => s.value === value)?.title ?? 'not set yet'
}

function label(value: string | null | undefined): string {
  return value && value.trim() !== '' ? value : 'not set yet'
}

const notSet = (field: string) => `No ${field} set`

async function onSubmit() {
  const { valid } = await formRef.value.validate()
  if (!valid) return
  await submit()
}

onMounted(init)
</script>

<template>
  <v-container fluid class="pa-2 pa-sm-4 fill-height align-start">
    <div class="mx-auto w-100">
      <v-card rounded="lg" elevation="1">
        <!-- Header -->
        <v-card-title
          class="pa-4 pa-sm-5 d-flex align-center flex-wrap ga-2"
          :class="{ 'flex-column align-start': mobile }"
        >
          <div class="d-flex align-center ga-2">
            <v-icon icon="mdi-domain" color="primary" />
            <span class="text-h6 font-weight-bold">Customers (Government / LGU)</span>
            <v-chip v-if="totalCount" size="small" variant="tonal" color="primary">
              {{ totalCount }} total
            </v-chip>
          </div>
          <v-spacer v-if="!mobile" />
          <v-btn
            size="small" variant="flat" color="primary" class="text-none"
            :block="mobile"
            prepend-icon="mdi-account-plus" @click="openCreate"
          >
            New Customer
          </v-btn>
        </v-card-title>
        <v-divider />

        <!-- Filters -->
        <div
          class="pa-4 pa-sm-5 d-flex align-center ga-3"
          :class="mobile ? 'flex-column align-stretch' : 'flex-wrap'"
        >
          <v-text-field
            v-model="searchInput"
            :placeholder="mobile ? 'Search customers' : 'Search name, contact person, or contact no.'"
            prepend-inner-icon="mdi-magnify"
            density="compact" variant="outlined" hide-details
            :style="mobile ? undefined : 'max-width: 420px'" min-width="240"
            clearable
            @keyup.enter="applySearch"
            @click:clear="clearSearch"
          >
            <template #append-inner>
              <v-btn
                size="small" variant="tonal" color="primary" density="comfortable"
                icon="mdi-magnify" @click="applySearch"
              />
            </template>
          </v-text-field>

          <v-spacer v-if="!mobile" />
        </div>

        <v-fade-transition>
          <div
            v-if="search"
            class="px-4 px-sm-5 pb-3 d-flex align-center flex-wrap ga-2 text-caption text-medium-emphasis"
          >
            <v-icon size="14" icon="mdi-filter-variant" />
            <span>Results for <strong>"{{ search }}"</strong></span>
            <v-btn
              size="x-small" variant="text" color="primary" class="text-none"
              prepend-icon="mdi-close" @click="clearSearch"
            >
              Clear
            </v-btn>
          </div>
        </v-fade-transition>

        <v-divider />

        <!-- Empty state (shared by both layouts) -->
        <div
          v-if="!loading && customers.length === 0"
          class="d-flex flex-column align-center py-10 text-medium-emphasis"
        >
          <v-icon icon="mdi-domain-off-outline" size="40" class="mb-2" />
          <span class="text-body-2">
            {{ search ? `No customers match "${search}"` : 'No customers found' }}
          </span>
          <v-btn
            v-if="search" size="small" variant="text" color="primary"
            class="text-none mt-1" @click="clearSearch"
          >
            Clear search
          </v-btn>
        </div>

        <!-- MOBILE: stacked cards -->
        <template v-else-if="mobile">
          <v-progress-linear v-if="loading" indeterminate color="primary" />
          <v-list class="pa-2" lines="two">
            <v-card
              v-for="item in customers" :key="item.id"
              variant="outlined" rounded="lg" class="mb-2 pa-3"
              @click="openEdit(item)"
            >
              <div class="d-flex align-start ga-3">
                <v-avatar size="36" color="primary" variant="tonal">
                  <span class="text-body-2 font-weight-bold">
                    {{ (item.name || '?').charAt(0).toUpperCase() }}
                  </span>
                </v-avatar>

                <div class="flex-grow-1" style="min-width: 0">
                  <div class="d-flex align-center justify-space-between ga-2">
                    <span class="font-weight-medium text-body-2 text-truncate">
                      {{ item.name || notSet('name') }}
                    </span>
                    <v-btn
                      size="x-small" variant="text" color="primary"
                      icon="mdi-pencil-outline" @click.stop="openEdit(item)"
                    />
                  </div>

                  <div class="d-flex flex-wrap ga-1 mt-1">
                    <v-chip
                      size="x-small" variant="tonal"
                      :color="item.agency_type ? 'primary' : 'grey'"
                    >
                      {{ item.agency_type ? item.agency_type.toUpperCase() : 'Unassigned' }}
                    </v-chip>
                    <v-chip
                      v-if="item.business_structure"
                      size="x-small" variant="tonal"
                    >
                      {{ structureLabel(item.business_structure) }}
                    </v-chip>
                  </div>

                  <div class="text-caption text-medium-emphasis mt-2">
                    <div class="d-flex align-center ga-1">
                      <v-icon size="12" icon="mdi-phone-outline" />
                      <span :class="{ 'font-italic': !item.contact_no }">
                        {{ item.contact_no || notSet('contact number') }}
                      </span>
                    </div>
                    <div class="d-flex align-center ga-1 mt-1">
                      <v-icon size="12" icon="mdi-account-tie-outline" />
                      <span :class="{ 'font-italic': !item.contact_person }">
                        {{ item.contact_person || notSet('contact person') }}
                      </span>
                    </div>
                    <div class="d-flex align-center ga-1 mt-1">
                      <v-icon size="12" icon="mdi-card-account-details-outline" />
                      <span :class="{ 'font-italic': !item.tin_number }">
                        {{ item.tin_number || notSet('TIN') }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </v-card>
          </v-list>

          <v-divider />
          <div class="d-flex justify-center pa-3">
            <v-pagination
              v-model="page"
              :length="Math.ceil(totalCount / pageSize) || 1"
              density="comfortable" total-visible="5"
            />
          </div>
        </template>

        <!-- DESKTOP: data table -->
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
        >
          <template #item.name="{ item }">
            <div class="d-flex align-center ga-2 py-1">
              <v-avatar size="28" color="primary" variant="tonal">
                <span class="text-caption font-weight-bold">
                  {{ (item.name || '?').charAt(0).toUpperCase() }}
                </span>
              </v-avatar>
              <span class="font-weight-medium">{{ item.name || notSet('name') }}</span>
            </div>
          </template>

          <template #item.agency_type="{ item }">
            <v-chip
              size="x-small" variant="tonal"
              :color="item.agency_type ? 'primary' : 'grey'"
            >
              {{ item.agency_type ? item.agency_type.toUpperCase() : 'Unassigned' }}
            </v-chip>
          </template>

          <template #item.contact_person="{ item }">
            <span :class="{ 'text-medium-emphasis font-italic': !item.contact_person }">
              {{ item.contact_person || notSet('contact person') }}
            </span>
          </template>

          <template #item.contact_no="{ item }">
            <span
              style="white-space: nowrap"
              :class="{ 'text-medium-emphasis font-italic': !item.contact_no }"
            >
              {{ item.contact_no || notSet('contact number') }}
            </span>
          </template>

          <template #item.tin_number="{ item }">
            <span
              style="white-space: nowrap"
              :class="{ 'text-medium-emphasis font-italic': !item.tin_number }"
            >
              {{ item.tin_number || notSet('TIN') }}
            </span>
          </template>

          <template #item.is_vat_registered="{ item }">
            <v-chip size="x-small" :color="item.is_vat_registered ? 'primary' : 'grey'" variant="tonal">
              {{ item.is_vat_registered ? 'VAT' : 'Non-VAT' }}
            </v-chip>
          </template>

          <template #item.business_structure="{ item }">
            <v-chip
              size="x-small" variant="tonal"
              :color="item.business_structure ? 'teal' : 'grey'"
            >
              {{ item.business_structure ? structureLabel(item.business_structure) : 'Unassigned' }}
            </v-chip>
          </template>

          <template #item.reg_no="{ item }">
            <span
              style="white-space: nowrap"
              :class="{ 'text-medium-emphasis font-italic': !item.business_structure }"
            >
              {{ label(item.business_structure === 'sole_proprietorship' ? item.dti_registration_no : item.sec_registration_no) }}
            </span>
          </template>

          <template #item.is_active="{ item }">
            <v-icon :color="item.is_active ? 'success' : 'grey'">
              {{ item.is_active ? 'mdi-check-circle' : 'mdi-minus-circle' }}
            </v-icon>
          </template>

          <template #item.actions="{ item }">
            <div class="d-flex align-center" style="gap: 4px; white-space: nowrap;">
              <v-btn
                size="small" variant="text" color="primary"
                icon="mdi-pencil-outline" @click="openEdit(item)"
              />
              <v-btn
                size="small" variant="text" color="error"
                icon="mdi-delete-outline" @click="remove(item)"
              />
            </div>
          </template>
        </v-data-table-server>

        <v-divider />
        <div class="pa-4 pa-sm-5 text-caption text-medium-emphasis d-flex align-start ga-2">
          <v-icon size="16" icon="mdi-information-outline" class="mt-1 flex-shrink-0" />
          <span>
            A customer is assigned to a channel the first time they transact, and that
            assignment is never changed afterwards — so unassigned customers are listed here
            too. The checkout only ever fills in blank details; corrections to an existing
            name or address are made here.
          </span>
        </div>
      </v-card>

      <!-- Create / Edit dialog -->
      <v-dialog
        :model-value="showForm"
        :fullscreen="mobile"
        :max-width="mobile ? undefined : 640"
        :transition="mobile ? 'dialog-bottom-transition' : undefined"
        persistent
      >
        <v-card :rounded="mobile ? '0' : 'lg'">
          <v-toolbar v-if="mobile" color="surface" density="comfortable">
            <v-btn icon="mdi-close" @click="cancelForm" />
            <v-toolbar-title class="text-body-1 font-weight-bold">
              {{ editingId ? 'Edit Customer' : 'New Customer' }}
            </v-toolbar-title>
            <v-btn
              variant="flat" color="primary" class="text-none mr-2"
              :loading="loading" @click="onSubmit"
            >
              {{ editingId ? 'Save' : 'Create' }}
            </v-btn>
          </v-toolbar>

          <v-card-title v-else class="pa-4 pa-sm-5 d-flex align-center ga-2">
            <v-icon
              :icon="editingId ? 'mdi-account-edit-outline' : 'mdi-account-plus-outline'"
              color="primary"
            />
            <span class="text-h6 font-weight-bold">
              {{ editingId ? 'Edit Customer' : 'New Customer' }}
            </span>
          </v-card-title>
          <v-divider />

          <v-card-text class="pa-4 pa-sm-5">
            <v-form ref="formRef">
              <v-text-field
                v-model="form.name" label="Name *" :rules="[rules.required]"
                variant="outlined" density="compact" class="mb-3"
                prepend-inner-icon="mdi-account-outline"
              />

              <v-row dense>
                <v-col cols="12" sm="6">
                  <v-select
                    v-model="form.agency_type" :items="agencyTypes" label="Type"
                    variant="outlined" density="compact" class="mb-3" hide-details
                    prepend-inner-icon="mdi-domain"
                  />
                </v-col>
                <v-col cols="12" sm="6">
                  <v-text-field
                    v-model="form.contact_person" label="Contact person"
                    variant="outlined" density="compact" class="mb-3" hide-details
                    prepend-inner-icon="mdi-account-tie-outline"
                  />
                </v-col>
              </v-row>

              <v-row dense>
                <v-col cols="12" sm="6">
                  <v-text-field
                    v-model="form.contact_no" label="Contact no."
                    variant="outlined" density="compact" class="mb-3" hide-details
                    prepend-inner-icon="mdi-phone-outline"
                  />
                </v-col>
                <v-col cols="12" sm="6">
                  <v-text-field
                    v-model="form.email" label="Email"
                    variant="outlined" density="compact" class="mb-3" hide-details
                    prepend-inner-icon="mdi-email-outline"
                  />
                </v-col>
              </v-row>

              <v-textarea
                v-model="form.address" label="Address"
                variant="outlined" density="compact" rows="2" class="mb-3" hide-details
                prepend-inner-icon="mdi-home-outline"
              />

              <v-row dense>
                <v-col cols="12" sm="6">
                  <v-text-field
                    v-model="form.area" label="Area"
                    hint="Sales area — a column on the Statement of Accounts register"
                    persistent-hint
                    variant="outlined" density="compact" class="mb-3"
                    prepend-inner-icon="mdi-map-marker-outline"
                  />
                </v-col>
                <v-col cols="12" sm="6">
                  <v-text-field
                    v-model="form.term_days" label="Payment terms"
                    placeholder="e.g. 60 Days, COD, Consignment"
                    hint="A leading number sets the due date; without one the receivable cannot be aged."
                    persistent-hint
                    variant="outlined" density="compact" class="mb-3"
                    prepend-inner-icon="mdi-calendar-clock-outline"
                  />
                </v-col>
              </v-row>

              <v-text-field
                v-model="form.tin_number" label="TIN"
                hint="BIR Tax Identification Number, e.g. 123-456-789-000"
                persistent-hint variant="outlined" density="compact" class="mb-3"
                prepend-inner-icon="mdi-card-account-details-outline"
              />

              <v-radio-group
                v-model="form.is_vat_registered" label="VAT classification"
                inline hide-details class="mt-1 mb-3"
              >
                <v-radio label="VAT-registered" :value="true" />
                <v-radio label="Non-VAT" :value="false" />
              </v-radio-group>

              <v-select
                v-model="form.business_structure"
                :items="businessStructures"
                label="Business Structure"
                variant="outlined" density="compact" class="mb-3" hide-details
                prepend-inner-icon="mdi-bank-outline"
              />

              <v-text-field
                v-if="form.business_structure === 'corporation' || form.business_structure === 'partnership'"
                v-model="form.sec_registration_no"
                label="SEC Registration No. *"
                hint="Securities and Exchange Commission registration number"
                persistent-hint
                :rules="[rules.requiredIfSec]"
                variant="outlined" density="compact" class="mb-3"
                prepend-inner-icon="mdi-file-document-outline"
              />
              <v-text-field
                v-if="form.business_structure === 'sole_proprietorship'"
                v-model="form.dti_registration_no"
                label="DTI Registration No. *"
                hint="DTI Certificate of Business Name Registration number"
                persistent-hint
                :rules="[rules.requiredIfDti]"
                variant="outlined" density="compact" class="mb-3"
                prepend-inner-icon="mdi-file-document-outline"
              />
            </v-form>
          </v-card-text>

          <template v-if="!mobile">
            <v-divider />
            <v-card-actions class="pa-4">
              <v-spacer />
              <v-btn variant="text" class="text-none" @click="cancelForm">Cancel</v-btn>
              <v-btn
                color="primary" variant="flat" class="text-none px-6"
                :loading="loading" @click="onSubmit"
              >
                {{ editingId ? 'Save changes' : 'Create customer' }}
              </v-btn>
            </v-card-actions>
          </template>
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
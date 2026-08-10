<script setup lang="ts">
import { useSalesCustomers } from '../composables/useSalesCustomers'
import { onMounted } from 'vue'
import { useDisplay } from 'vuetify'

const { mobile } = useDisplay()
const {
  loading, customers, totalCount, page, pageSize,
  searchInput, search, applySearch, clearSearch,
  showAll,
  showForm, editingId, form, rules, headers,
  openCreate, openEdit, cancelForm, submit, init,
} = useSalesCustomers()

onMounted(init)

const CHANNEL_COLOR: Record<string, string> = {
  pos: 'primary',
  ethical: 'purple',
  inhouse: 'teal',
}

const notSet = (label: string) => `No ${label} set`
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
            <v-icon icon="mdi-account-group" color="primary" />
            <span class="text-h6 font-weight-bold">Store Customers</span>
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
            Add Customer
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
            :placeholder="mobile ? 'Search customers' : 'Search name, contact no., email, address, owner, TIN, or terms'"
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

          <v-switch
            v-model="showAll"
            label="Show every channel"
            color="primary" density="compact" hide-details inset
          />
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
          <v-icon icon="mdi-account-search-outline" size="40" class="mb-2" />
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
                      :color="item.department ? CHANNEL_COLOR[item.department] ?? 'grey' : 'grey'"
                    >
                      {{ item.department ? item.department.toUpperCase() : 'Unassigned' }}
                    </v-chip>
                    <v-chip v-if="item.category" size="x-small" variant="tonal">
                      {{ item.category }}
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
                      <v-icon size="12" icon="mdi-map-marker-outline" />
                      <span :class="{ 'font-italic': !item.area }">
                        {{ item.area || notSet('area') }}
                      </span>
                    </div>
                    <div class="d-flex align-center ga-1 mt-1">
                      <v-icon size="12" icon="mdi-calendar-clock-outline" />
                      <span :class="{ 'font-italic': !item.term_days }">
                        {{ item.term_days || notSet('payment terms') }}
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

          <template #item.category="{ item }">
            <v-chip v-if="item.category" size="x-small" variant="tonal">{{ item.category }}</v-chip>
            <span v-else class="text-medium-emphasis font-italic text-caption">{{ notSet('category') }}</span>
          </template>

          <template #item.area="{ item }">
            <span
            style="white-space: nowrap" 
            :class="{ 'text-medium-emphasis font-italic': !item.area }">
              {{ item.area || notSet('area') }}
            </span>
          </template>

          <template #item.address="{ item }">
            <span :class="{ 'text-medium-emphasis font-italic': !item.address }">
              {{ item.address || notSet('address') }}
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

          <template #item.term_days="{ item }">
            <span :class="{ 'text-medium-emphasis font-italic': !item.term_days }">
              {{ item.term_days || notSet('payment terms') }}
            </span>
          </template>

          <template #item.department="{ item }">
            <v-chip
              size="x-small" variant="tonal"
              :color="item.department ? CHANNEL_COLOR[item.department] ?? 'grey' : 'grey'"
            >
              {{ item.department ? item.department.toUpperCase() : 'Unassigned' }}
            </v-chip>
          </template>

          <template #item.actions="{ item }">
            <v-btn
              size="small" variant="text" color="primary"
              icon="mdi-pencil-outline" @click="openEdit(item)"
            />
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
              {{ editingId ? 'Edit Customer' : 'Add Customer' }}
            </v-toolbar-title>
            <v-btn
              variant="flat" color="primary" class="text-none mr-2"
              :loading="loading" @click="submit"
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
              {{ editingId ? 'Edit Customer' : 'Add Customer' }}
            </span>
          </v-card-title>
          <v-divider />

          <v-card-text class="pa-4 pa-sm-5">
            <v-text-field
              v-model="form.name" label="Name *" :rules="[rules.required]"
              variant="outlined" density="compact" class="mb-3"
              prepend-inner-icon="mdi-account-outline"
            />

            <v-row dense>
              <v-col cols="12" sm="6">
                <v-text-field
                  v-model="form.contact_person" label="Contact person"
                  variant="outlined" density="compact" class="mb-3" hide-details
                  prepend-inner-icon="mdi-account-tie-outline"
                />
              </v-col>
              <v-col cols="12" sm="6">
                <v-text-field
                  v-model="form.contact_no" label="Contact no."
                  variant="outlined" density="compact" class="mb-3" hide-details
                  prepend-inner-icon="mdi-phone-outline"
                />
              </v-col>
            </v-row>

            <v-row dense>
              <v-col cols="12" sm="6">
                <v-text-field
                  v-model="form.email" label="Email"
                  variant="outlined" density="compact" class="mb-3" hide-details
                  prepend-inner-icon="mdi-email-outline"
                />
              </v-col>
              <v-col cols="12" sm="6">
                <v-text-field
                  v-model="form.area" label="Area"
                  variant="outlined" density="compact" class="mb-3" hide-details
                  prepend-inner-icon="mdi-map-marker-outline"
                />
              </v-col>
            </v-row>

            <v-textarea
              v-model="form.address" label="Address"
              variant="outlined" density="compact" rows="2" class="mb-3" hide-details
              prepend-inner-icon="mdi-home-outline"
            />

            <v-text-field
              v-model="form.category" label="Category"
              placeholder="e.g. DRUGSTORE, PRIVATE HOSPITAL"
              variant="outlined" density="compact" class="mb-3" hide-details
              prepend-inner-icon="mdi-shape-outline"
            />

            <v-text-field
              v-model="form.term_days" label="Payment terms"
              placeholder="e.g. 60 Days, COD, Consignment"
              hint="A leading number sets the due date; without one the receivable cannot be aged."
              persistent-hint variant="outlined" density="compact"
              prepend-inner-icon="mdi-calendar-clock-outline"
            />
          </v-card-text>

          <template v-if="!mobile">
            <v-divider />
            <v-card-actions class="pa-4">
              <v-spacer />
              <v-btn variant="text" class="text-none" @click="cancelForm">Cancel</v-btn>
              <v-btn
                color="primary" variant="flat" class="text-none px-6"
                :loading="loading" @click="submit"
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
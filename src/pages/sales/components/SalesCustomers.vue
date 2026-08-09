<script setup lang="ts">
import { onMounted } from 'vue'
import { useSalesCustomers } from '../composables/useSalesCustomers'

const {
  loading, search, filtered, showAll,
  showForm, editingId, form, rules, headers,
  openCreate, openEdit, cancelForm, submit, init,
} = useSalesCustomers()

onMounted(init)

const CHANNEL_COLOR: Record<string, string> = {
  pos: 'primary',
  ethical: 'purple',
  inhouse: 'teal',
}
</script>

<template>
  <v-container fluid class="pa-2 fill-height align-start">
    <div class="mx-auto w-100">
      <v-card rounded="lg" elevation="1">
        <v-card-title class="pa-4 pa-sm-5 d-flex align-center flex-wrap ga-2">
          <span class="text-h6 font-weight-bold">Store Customers</span>
          <v-spacer />
          <v-btn
            size="small" variant="tonal" color="primary" class="text-none"
            prepend-icon="mdi-account-plus" @click="openCreate"
          >
            Add Customer
          </v-btn>
        </v-card-title>
        <v-divider />

        <div class="pa-4 pa-sm-5 d-flex align-center flex-wrap ga-2">
          <v-text-field
            v-model="search"
            placeholder="Search name, contact no. or area"
            prepend-inner-icon="mdi-magnify"
            density="compact" variant="outlined" hide-details
            style="max-width: 360px"
          />
          <v-spacer />
          <v-switch
            v-model="showAll"
            label="Show every channel"
            color="primary" density="compact" hide-details inset
          />
        </div>

        <v-divider />

        <v-data-table
          :headers="headers"
          :items="filtered"
          :loading="loading"
          item-value="id"
          density="compact"
          :items-per-page="25"
        >
          <template #item.category="{ item }">
            <v-chip v-if="item.category" size="x-small" variant="tonal">{{ item.category }}</v-chip>
            <span v-else class="text-medium-emphasis">—</span>
          </template>
          <template #item.area="{ item }">{{ item.area || '—' }}</template>
          <template #item.contact_no="{ item }">{{ item.contact_no || '—' }}</template>
          <template #item.term_days="{ item }">{{ item.term_days || '—' }}</template>
          <template #item.department="{ item }">
            <v-chip
              size="x-small" variant="tonal"
              :color="item.department ? CHANNEL_COLOR[item.department] ?? 'grey' : 'grey'"
            >
              {{ item.department ? item.department.toUpperCase() : 'Unassigned' }}
            </v-chip>
          </template>
          <template #item.actions="{ item }">
            <v-btn size="small" variant="text" icon="mdi-pencil" @click="openEdit(item)" />
          </template>
        </v-data-table>

        <v-divider />
        <div class="pa-4 pa-sm-5 text-caption text-medium-emphasis">
          A customer is assigned to a channel the first time they transact, and that
          assignment is never changed afterwards — so unassigned customers are listed here
          too. The checkout only ever fills in blank details; corrections to an existing
          name or address are made here.
        </div>
      </v-card>

      <v-dialog :model-value="showForm" max-width="560" persistent>
        <v-card rounded="lg">
          <v-card-title class="pa-4 pa-sm-5 text-h6 font-weight-bold">
            {{ editingId ? 'Edit Customer' : 'Add Customer' }}
          </v-card-title>
          <v-divider />
          <v-card-text class="pa-4 pa-sm-5">
            <v-text-field
              v-model="form.name" label="Name *" :rules="[rules.required]"
              variant="outlined" density="compact" class="mb-2"
            />
            <v-text-field v-model="form.contact_person" label="Contact person" variant="outlined" density="compact" class="mb-2" hide-details />
            <v-text-field v-model="form.contact_no" label="Contact no." variant="outlined" density="compact" class="mb-2" hide-details />
            <v-text-field v-model="form.email" label="Email" variant="outlined" density="compact" class="mb-2" hide-details />
            <v-textarea v-model="form.address" label="Address" variant="outlined" density="compact" rows="2" class="mb-2" hide-details />
            <v-text-field v-model="form.area" label="Area" variant="outlined" density="compact" class="mb-2" hide-details />
            <v-text-field
              v-model="form.category" label="Category"
              placeholder="e.g. DRUGSTORE, PRIVATE HOSPITAL"
              variant="outlined" density="compact" class="mb-2" hide-details
            />
            <v-text-field
              v-model="form.term_days" label="Payment terms"
              placeholder="e.g. 60 Days, COD, Consignment"
              hint="A leading number sets the due date; without one the receivable cannot be aged."
              persistent-hint variant="outlined" density="compact" class="mb-2"
            />
          </v-card-text>
          <v-divider />
          <v-card-actions class="pa-4">
            <v-spacer />
            <v-btn variant="text" class="text-none" @click="cancelForm">Cancel</v-btn>
            <v-btn color="primary" variant="flat" class="text-none" :loading="loading" @click="submit">
              {{ editingId ? 'Save' : 'Create' }}
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>
    </div>
  </v-container>
</template>

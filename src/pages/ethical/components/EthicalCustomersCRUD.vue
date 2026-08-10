<script setup lang="ts">
import { onMounted } from 'vue'
import CustomerTermsChips from '@/components/customers/CustomerTermsChips.vue'
import FieldValue from '@/components/customers/FieldValue.vue'
import { useEthicalCustomers } from '../composables/useEthicalCustomers'
import CustomerForm from './CustomerForm.vue'

const {
  customers, loading, searchText, showAll, profileFor, showCreateDialog, showEditDialog, editingCustomer, headers,
  agentOptions, businessStructureOptions, createCustomer, updateCustomer, deleteCustomer,
  openCreateDialog, cancelCreate, openEdit, cancelEdit, init,
} = useEthicalCustomers()

onMounted(() => init())
</script>

<template>
  <v-container fluid pa-0>
    <v-card class="elevation-0">
      <v-card-title class="d-flex align-center gap-2 pb-2">
        <span>Ethical Customers</span>
        <v-spacer />
        <v-btn size="small" prepend-icon="mdi-plus" @click="openCreateDialog" color="primary">
          New Customer
        </v-btn>
      </v-card-title>

      <v-card-text>
        <div class="d-flex align-center flex-wrap ga-2 mb-4">
          <v-text-field v-model="searchText" density="compact" placeholder="Search..." prepend-icon="mdi-magnify" hide-details class="flex-grow-1" />
          <!-- Unassigned customers already show here; this widens it to every
               channel for when an account is stamped to POS or In-House. -->
          <v-switch v-model="showAll" label="Show every channel" color="primary" density="compact" hide-details inset />
        </div>
        <v-progress-linear v-if="loading" indeterminate />
        <v-data-table
          :headers="headers"
          :items="customers"
          :loading="loading"
          density="compact"
          :items-per-page="25"
          class="text-no-wrap"
        >
          <template #item.name="{ item }">
            <FieldValue :value="item.name" />
          </template>
          <template #item.agency_type="{ item }">
            <FieldValue :value="item.agency_type" />
          </template>
          <template #item.contact_no="{ item }">
            <FieldValue :value="item.contact_no" />
          </template>
          <template #item.area="{ item }">
            <FieldValue :value="item.area" />
          </template>
          <template #item.agent_name="{ item }">
            <FieldValue :value="item.agent_name" />
          </template>
          <template #item.is_active="{ item }">
            <v-chip :color="item.is_active ? 'success' : 'grey'" size="small">
              {{ item.is_active ? 'Active' : 'Inactive' }}
            </v-chip>
          </template>
          <template #item.terms="{ item }">
            <CustomerTermsChips :profile="profileFor(item.id)" />
          </template>
          <template #item.actions="{ item }">
            <v-btn size="x-small" icon="mdi-pencil" @click="openEdit(item.id)" />
            <v-btn size="x-small" icon="mdi-delete" @click="deleteCustomer(item.id)" />
          </template>
        </v-data-table>
      </v-card-text>
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
  </v-container>
</template>

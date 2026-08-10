<script setup lang="ts">
import { onMounted } from 'vue'
import { useEthicalCustomers } from '../composables/useEthicalCustomers'
import CustomerForm from './CustomerForm.vue'

const {
  customers, loading, searchText, showAll, showCreateDialog, showEditDialog, editingCustomer, headers,
  agentOptions, businessStructureOptions, structureLabel, createCustomer, updateCustomer, deleteCustomer,
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
        <v-data-table :headers="headers" :items="customers" :loading="loading">
          <template #item.tin_number="{ item }">
            <span class="text-body-2">{{ item.tin_number || '—' }}</span>
          </template>
          <template #item.is_vat_registered="{ item }">
            <v-chip size="small" :color="item.is_vat_registered ? 'primary' : 'grey'" variant="tonal">
              {{ item.is_vat_registered ? 'VAT' : 'Non-VAT' }}
            </v-chip>
          </template>
          <template #item.business_structure="{ item }">
            <v-chip size="small" variant="tonal" class="text-uppercase">{{ structureLabel(item.business_structure) }}</v-chip>
          </template>
          <template #item.reg_no="{ item }">
            <span class="text-body-2">
              {{ item.business_structure === 'sole_proprietorship' ? (item.dti_registration_no || '—') : (item.sec_registration_no || '—') }}
            </span>
          </template>
          <template #item.is_active="{ item }">
            <v-chip :color="item.is_active ? 'success' : 'grey'" size="small">
              {{ item.is_active ? 'Active' : 'Inactive' }}
            </v-chip>
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

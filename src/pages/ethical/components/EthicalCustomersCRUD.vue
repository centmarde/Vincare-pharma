<template>
  <v-container fluid pa-0>
    <v-card class="elevation-0">
      <v-card-title class="d-flex align-center gap-2 pb-2">
        <span>Ethical Customers</span>
        <v-spacer />
        <v-btn size="small" prepend-icon="mdi-plus" @click="showCreateDialog = true" color="primary">
          New Customer
        </v-btn>
      </v-card-title>

      <v-card-text>
        <v-text-field v-model="searchText" density="compact" placeholder="Search..." prepend-icon="mdi-magnify" class="mb-4" />
        <v-progress-linear v-if="loading" indeterminate />
        <v-data-table :headers="headers" :items="customers" :loading="loading">
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

    <v-dialog v-model="showCreateDialog" persistent max-width="600px">
      <v-card>
        <v-card-title>New Customer</v-card-title>
        <v-card-text>
          <CustomerForm :agent-options="agentOptions" @submit="createCustomer; showCreateDialog = false" />
        </v-card-text>
      </v-card>
    </v-dialog>

    <v-dialog v-model="showEditDialog" persistent max-width="600px">
      <v-card v-if="editingCustomer">
        <v-card-title>Edit Customer</v-card-title>
        <v-card-text>
          <CustomerForm
            :customer="editingCustomer"
            :agent-options="agentOptions"
            @submit="updateCustomer; showEditDialog = false"
          />
        </v-card-text>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useEthicalCustomers } from '../composables/useEthicalCustomers'
import CustomerForm from './CustomerForm.vue'

const {
  customers, loading, searchText, showCreateDialog, showEditDialog, editingCustomer, headers,
  agentOptions, createCustomer, updateCustomer, deleteCustomer, openEdit, init,
} = useEthicalCustomers()

onMounted(() => init())
</script>

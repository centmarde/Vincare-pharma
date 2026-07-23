<script setup lang="ts">
import { onMounted } from 'vue'
import { useOutlets } from '../composables/useOutlets'
import OutletForm from './OutletForm.vue'

const {
  outlets, loading, searchText, showCreateDialog, showEditDialog, editingOutlet, headers,
  createOutlet, updateOutlet, deleteOutlet, openEdit, init,
} = useOutlets()

onMounted(() => init())
</script>

<template>
  <v-container fluid pa-0>
    <v-card class="elevation-0">
      <v-card-title class="d-flex align-center gap-2 pb-2">
        <span>Branches</span>
        <v-spacer />
        <v-btn size="small" prepend-icon="mdi-plus" @click="showCreateDialog = true" color="primary">
          New Branch
        </v-btn>
      </v-card-title>

      <v-card-text>
        <v-text-field v-model="searchText" density="compact" placeholder="Search..." prepend-icon="mdi-magnify" class="mb-4" />
        <v-progress-linear v-if="loading" indeterminate />
        <v-data-table :headers="headers" :items="outlets" :loading="loading">
          <template #item.channel="{ item }">
            <v-chip size="small" variant="tonal" :color="item.channel === 'pos' ? 'primary' : 'secondary'">
              {{ item.channel === 'pos' ? 'POS' : 'Ethical' }}
            </v-chip>
          </template>
          <template #item.is_active="{ item }">
            <v-chip :color="item.is_active ? 'success' : 'grey'" size="small">
              {{ item.is_active ? 'Active' : 'Inactive' }}
            </v-chip>
          </template>
          <template #item.actions="{ item }">
            <v-btn size="x-small" icon="mdi-pencil" @click="openEdit(item.id)" />
            <v-btn size="x-small" icon="mdi-delete" @click="deleteOutlet(item.id)" />
          </template>
        </v-data-table>
      </v-card-text>
    </v-card>

    <v-dialog v-model="showCreateDialog" persistent max-width="600px">
      <v-card>
        <v-card-title>New Branch</v-card-title>
        <v-card-text>
          <OutletForm @submit="createOutlet" @cancel="showCreateDialog = false" />
        </v-card-text>
      </v-card>
    </v-dialog>

    <v-dialog v-model="showEditDialog" persistent max-width="600px">
      <v-card v-if="editingOutlet">
        <v-card-title>Edit Branch</v-card-title>
        <v-card-text>
          <OutletForm :outlet="editingOutlet" @submit="updateOutlet" @cancel="showEditDialog = false" />
        </v-card-text>
      </v-card>
    </v-dialog>
  </v-container>
</template>

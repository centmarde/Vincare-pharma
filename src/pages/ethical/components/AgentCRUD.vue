<template>
  <v-container fluid pa-0>
    <v-card class="elevation-0">
      <v-card-title class="d-flex align-center gap-2 pb-2">
        <span>Sales Agents</span>
        <v-spacer />
        <v-btn size="small" prepend-icon="mdi-plus" @click="showCreateDialog = true" color="primary">
          New Agent
        </v-btn>
      </v-card-title>

      <v-card-text>
        <v-text-field v-model="searchText" density="compact" placeholder="Search..." prepend-icon="mdi-magnify" class="mb-4" />
        <v-progress-linear v-if="loading" indeterminate />
        <v-data-table :headers="headers" :items="agents" :loading="loading">
          <template #item.is_active="{ item }">
            <v-chip :color="item.is_active ? 'success' : 'grey'" size="small">
              {{ item.is_active ? 'Active' : 'Inactive' }}
            </v-chip>
          </template>
          <template #item.actions="{ item }">
            <v-btn size="x-small" icon="mdi-pencil" @click="openEdit(item.id)" />
            <v-btn size="x-small" icon="mdi-delete" @click="deleteAgent(item.id)" />
          </template>
        </v-data-table>
      </v-card-text>
    </v-card>

    <v-dialog v-model="showCreateDialog" persistent max-width="600px">
      <v-card>
        <v-card-title>New Agent</v-card-title>
        <v-card-text>
          <AgentForm @submit="createAgent; showCreateDialog = false" />
        </v-card-text>
      </v-card>
    </v-dialog>

    <v-dialog v-model="showEditDialog" persistent max-width="600px">
      <v-card v-if="editingAgent">
        <v-card-title>Edit Agent</v-card-title>
        <v-card-text>
          <AgentForm :agent="editingAgent" @submit="updateAgent; showEditDialog = false" />
        </v-card-text>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useAgents } from '../composables/useAgents'
import AgentForm from './AgentForm.vue'

const {
  agents, loading, searchText, showCreateDialog, showEditDialog, editingAgent, headers,
  createAgent, updateAgent, deleteAgent, openEdit, init,
} = useAgents()

onMounted(() => init())
</script>

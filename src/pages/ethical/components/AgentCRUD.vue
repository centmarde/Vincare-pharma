<script setup lang="ts">
import { onMounted } from 'vue'
import { useAgents } from '../composables/useAgents'
import AgentForm from './AgentForm.vue'
import { useDisplay } from 'vuetify'

const { mobile } = useDisplay()
const {
  agents, loading, searchText, showCreateDialog, showEditDialog, editingAgent, headers,
  createAgent, updateAgent, deleteAgent, openCreateDialog, cancelCreate, openEdit, cancelEdit, init,
} = useAgents()

onMounted(() => init())

const notSet = (field: string) => `No ${field} set`
</script>

<template>
  <v-container fluid class="pa-2 pa-sm-4 fill-height align-start">
    <div class="mx-auto w-100">
      <v-card class="elevation-0" rounded="lg">
        <!-- Header -->
        <v-card-title
          class="pa-4 pa-sm-5 d-flex align-center flex-wrap ga-2"
          :class="{ 'flex-column align-start': mobile }"
        >
          <div class="d-flex align-center ga-2">
            <v-icon icon="mdi-account-tie-outline" color="primary" />
            <span class="text-h6 font-weight-bold">Medical Sales Representatives</span>
          </div>
          <v-spacer v-if="!mobile" />
          <v-btn
            size="small" variant="flat" color="primary" class="text-none"
            :block="mobile"
            prepend-icon="mdi-account-plus" @click="openCreateDialog"
          >
            New MSR
          </v-btn>
        </v-card-title>
        <v-divider />

        <!-- Filters -->
        <div class="pa-4 pa-sm-5">
          <v-text-field
            v-model="searchText"
            density="compact" variant="outlined" hide-details
            :placeholder="mobile ? 'Search MSRs' : 'Search name, email, or area...'"
            prepend-inner-icon="mdi-magnify"
            :style="mobile ? undefined : 'max-width: 320px'" min-width="240"
            clearable
          />
        </div>

        <!-- Empty state (shared by both layouts) -->
        <div
          v-if="!loading && agents.length === 0"
          class="d-flex flex-column align-center py-10 text-medium-emphasis"
        >
          <v-icon icon="mdi-account-tie-outline" size="40" class="mb-2" />
          <span class="text-body-2">
            {{ searchText ? 'No MSRs match your search' : 'No medical sales representatives yet' }}
          </span>
        </div>

        <!-- MOBILE: stacked cards -->
        <template v-else-if="mobile">
          <v-progress-linear v-if="loading" indeterminate color="primary" />
          <v-list class="pa-2" lines="two">
            <v-card
              v-for="item in agents" :key="item.id"
              variant="outlined" rounded="lg" class="mb-2 pa-3"
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
                    <div class="d-flex align-center" style="gap: 4px; white-space: nowrap;">
                      <v-btn
                        size="x-small" variant="text" color="primary"
                        icon="mdi-pencil-outline" @click="openEdit(item.id)"
                      />
                      <v-btn
                        size="x-small" variant="text" color="error"
                        icon="mdi-delete-outline" @click="deleteAgent(item.id)"
                      />
                    </div>
                  </div>

                  <div class="d-flex flex-wrap ga-1 mt-1">
                    <v-chip
                      size="x-small" variant="tonal"
                      :color="item.is_active ? 'success' : 'grey'"
                    >
                      {{ item.is_active ? 'Active' : 'Inactive' }}
                    </v-chip>
                    <v-chip v-if="item.commission_rate != null" size="x-small" variant="tonal">
                      {{ item.commission_rate }}%
                    </v-chip>
                  </div>

                  <div class="text-caption text-medium-emphasis mt-2">
                    <div class="d-flex align-center ga-1">
                      <v-icon size="12" icon="mdi-map-marker-outline" />
                      <span :class="{ 'font-italic': !item.area }">
                        {{ item.area || notSet('area') }}
                      </span>
                    </div>
                    <div class="d-flex align-center ga-1 mt-1">
                      <v-icon size="12" icon="mdi-email-outline" />
                      <span :class="{ 'font-italic': !item.email }">
                        {{ item.email || notSet('email') }}
                      </span>
                    </div>
                    <div class="d-flex align-center ga-1 mt-1">
                      <v-icon size="12" icon="mdi-phone-outline" />
                      <span :class="{ 'font-italic': !item.contact_no }">
                        {{ item.contact_no || notSet('phone') }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </v-card>
          </v-list>
        </template>

        <!-- DESKTOP: data table -->
        <v-data-table
          v-else
          :headers="headers"
          :items="agents"
          :loading="loading"
          class="agents-table"
        >
          <template #item.is_active="{ item }">
            <v-chip :color="item.is_active ? 'success' : 'grey'" size="small">
              {{ item.is_active ? 'Active' : 'Inactive' }}
            </v-chip>
          </template>
          <template #item.actions="{ item }">
            <div class="d-flex align-center" style="gap: 4px; white-space: nowrap;">
              <v-btn size="x-small" icon="mdi-pencil" @click="openEdit(item.id)" />
              <v-btn size="x-small" icon="mdi-delete" @click="deleteAgent(item.id)" />
            </div>
          </template>
        </v-data-table>
      </v-card>

      <!-- Create / Edit dialog -->
      <v-dialog
        :model-value="showCreateDialog"
        :fullscreen="mobile"
        :max-width="mobile ? undefined : 600"
        :transition="mobile ? 'dialog-bottom-transition' : undefined"
        persistent
      >
        <v-card :rounded="mobile ? '0' : 'lg'">
          <v-toolbar v-if="mobile" color="surface" density="comfortable">
            <v-btn icon="mdi-close" @click="cancelCreate" />
            <v-toolbar-title class="text-body-1 font-weight-bold">
              New Medical Sales Representative
            </v-toolbar-title>
          </v-toolbar>
          <v-card-title v-else class="pa-4 pa-sm-5 d-flex align-center ga-2">
            <v-icon icon="mdi-account-plus-outline" color="primary" />
            <span class="text-h6 font-weight-bold">New Medical Sales Representative</span>
          </v-card-title>
          <v-divider />
          <v-card-text class="pa-4 pa-sm-5">
            <AgentForm @submit="createAgent" @cancel="cancelCreate" />
          </v-card-text>
        </v-card>
      </v-dialog>

      <v-dialog
        :model-value="showEditDialog"
        :fullscreen="mobile"
        :max-width="mobile ? undefined : 600"
        :transition="mobile ? 'dialog-bottom-transition' : undefined"
        persistent
      >
        <v-card v-if="editingAgent" :rounded="mobile ? '0' : 'lg'">
          <v-toolbar v-if="mobile" color="surface" density="comfortable">
            <v-btn icon="mdi-close" @click="cancelEdit" />
            <v-toolbar-title class="text-body-1 font-weight-bold">
              Edit Medical Sales Representative
            </v-toolbar-title>
          </v-toolbar>
          <v-card-title v-else class="pa-4 pa-sm-5 d-flex align-center ga-2">
            <v-icon icon="mdi-account-edit-outline" color="primary" />
            <span class="text-h6 font-weight-bold">Edit Medical Sales Representative</span>
          </v-card-title>
          <v-divider />
          <v-card-text class="pa-4 pa-sm-5">
            <AgentForm :agent="editingAgent" @submit="updateAgent" @cancel="cancelEdit" />
          </v-card-text>
        </v-card>
      </v-dialog>
    </div>
  </v-container>
</template>

<style scoped>
.agents-table :deep(tbody tr:hover) {
  background: rgba(var(--v-theme-primary), 0.04);
}
</style>
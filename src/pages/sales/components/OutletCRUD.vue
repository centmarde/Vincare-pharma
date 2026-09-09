<script setup lang="ts">
import { onMounted } from 'vue'
import { useDisplay } from 'vuetify'
import { useOutlets } from '../composables/useOutlets'
import OutletForm from './OutletForm.vue'

const { mobile } = useDisplay()

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

        <!-- Mobile: card layout -->
        <v-row v-if="mobile" dense class="mt-1">
          <v-col v-for="o in outlets" :key="o.id" cols="12">
            <v-card variant="tonal" class="flex-grow-1">
              <v-card-item>
                <template #prepend>
                  <v-avatar color="primary" variant="tonal" size="40" class="text-caption font-weight-bold">
                    {{ o.code }}
                  </v-avatar>
                </template>
                <v-card-title class="text-body-1 font-weight-bold pa-0">
                  {{ o.name }}
                </v-card-title>
                <v-card-subtitle class="text-caption pa-0">
                  {{ o.region ?? 'No region' }}
                </v-card-subtitle>
                <template #append>
                  <v-chip size="small" variant="tonal" :color="o.channel === 'pos' ? 'primary' : 'secondary'">
                    {{ o.channel === 'pos' ? 'POS' : 'Ethical' }}
                  </v-chip>
                </template>
              </v-card-item>
              <v-card-actions class="pa-2">
                <v-chip :color="o.is_active ? 'success' : 'grey'" size="x-small">
                  {{ o.is_active ? 'Active' : 'Inactive' }}
                </v-chip>
                <v-spacer />
                <v-btn size="small" icon="mdi-pencil" @click="openEdit(o.id)" />
                <v-btn size="small" icon="mdi-delete" @click="deleteOutlet(o.id)" />
              </v-card-actions>
            </v-card>
          </v-col>
          <v-col v-if="!outlets.length" cols="12">
            <v-card variant="tonal">
              <v-card-text class="text-center text-medium-emphasis">No branches found.</v-card-text>
            </v-card>
          </v-col>
        </v-row>

        <!-- Desktop: table -->
        <v-data-table v-else :headers="headers" :items="outlets" :loading="loading">
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

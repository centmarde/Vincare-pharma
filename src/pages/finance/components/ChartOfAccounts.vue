<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useChartOfAccounts, headers } from '../composables/useChartOfAccounts'
import NewAccountDialog from './dialogs/NewAccountDialog.vue'

const {
  loading,
  searchText,
  filteredAccounts,
  groupedAccounts,
  showCreateDialog,
  creating,
  newCategory,
  newName,
  newIsContra,
  previewCode,
  canCreate,
  categoryOptions,
  openCreateDialog,
  cancelCreate,
  submitCreate,
  init,
} = useChartOfAccounts()

const view = ref<'table' | 'cheatsheet'>('cheatsheet')

onMounted(init)
</script>

<template>
  <v-container fluid class="pa-2">
    <v-card rounded="lg" class="mx-auto w-100">
      <v-card-title
        class="pa-4 pa-sm-5 pb-2 d-flex justify-space-between align-center flex-wrap ga-2"
      >
        <div>
          <div class="text-h6 font-weight-bold">Chart of Accounts</div>
          <div class="text-caption text-medium-emphasis">
            The full account-code reference — grouped by category for quick lookup, or as a sortable
            table.
          </div>
        </div>
        <v-btn
          color="primary"
          class="text-none font-weight-bold"
          elevation="0"
          prepend-icon="mdi-plus"
          @click="openCreateDialog"
        >
          New Account
        </v-btn>
      </v-card-title>
      <v-divider />

      <v-card-text class="pa-4 pa-sm-5">
        <div class="d-flex justify-space-between align-center flex-wrap ga-2 mb-3">
          <v-btn-toggle
            v-model="view"
            mandatory
            density="compact"
            color="primary"
            variant="outlined"
          >
            <v-btn value="cheatsheet" size="small" class="text-none">Cheat Sheet</v-btn>
            <v-btn value="table" size="small" class="text-none">Table</v-btn>
          </v-btn-toggle>
          <v-text-field
            v-model="searchText"
            placeholder="Search code, name, or category"
            prepend-inner-icon="mdi-magnify"
            variant="outlined"
            density="compact"
            hide-details
            style="max-width: 280px"
          />
        </div>

        <v-progress-linear v-if="loading" indeterminate class="mb-3" />

        <template v-if="view === 'cheatsheet'">
          <v-row>
            <template v-for="group in groupedAccounts" :key="group.subsection">
              <v-col v-if="group.sectionHeader" cols="12" class="pb-0">
                <div class="text-overline font-weight-bold text-medium-emphasis mt-2">
                  {{ group.sectionHeader }}
                </div>
                <v-divider class="mb-1" />
              </v-col>
              <v-col cols="12" md="6">
                <v-card variant="outlined" rounded="lg" class="mb-3">
                  <v-card-title class="text-subtitle-2 font-weight-bold pa-3">{{
                    group.subsection
                  }}</v-card-title>
                  <v-divider />
                  <v-table density="compact">
                    <tbody>
                      <tr v-for="a in group.items" :key="a.code">
                        <td class="font-weight-bold" style="width: 70px">{{ a.code }}</td>
                        <td>
                          {{ a.name }}
                          <v-chip
                            v-if="a.is_contra"
                            size="x-small"
                            variant="tonal"
                            color="warning"
                            class="ml-1"
                            >contra</v-chip
                          >
                        </td>
                        <td
                          class="text-right text-caption text-medium-emphasis text-uppercase"
                          style="width: 70px"
                        >
                          {{ a.normal_balance }}
                        </td>
                      </tr>
                    </tbody>
                  </v-table>
                </v-card>
              </v-col>
            </template>
          </v-row>
        </template>

        <template v-else>
          <v-data-table
            mobile-breakpoint="md"
            :headers="headers"
            :items="filteredAccounts"
            :loading="loading"
            item-value="code"
            no-data-text="No accounts found."
            hover
          >
            <template #item.is_contra="{ item }">
              <v-chip v-if="item.is_contra" size="small" variant="tonal" color="warning"
                >Contra</v-chip
              >
              <span v-else class="text-medium-emphasis">—</span>
            </template>
            <template #item.normal_balance="{ item }">
              <span class="text-uppercase">{{ item.normal_balance }}</span>
            </template>
          </v-data-table>
        </template>
      </v-card-text>
    </v-card>

    <NewAccountDialog
      v-model="showCreateDialog"
      v-model:category="newCategory"
      v-model:name="newName"
      v-model:is-contra="newIsContra"
      :category-options="categoryOptions"
      :preview-code="previewCode"
      :can-create="canCreate"
      :loading="creating"
      @submit="submitCreate"
      @cancel="cancelCreate"
    />
  </v-container>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useWarehouseForm } from '../composables/useWarehouseForm'
import { useWarehousesDataStore } from '@/stores/warehouseData'
import { formatDatePR_ISO } from '@/utils/dateFormats'
import WareHouseFormDialog from './WareHouseFormDialog.vue'
import type { WarehouseType } from '@/stores/warehouseData'

const {
  form, editingWarehouse, warehouseToDelete,
  rules,
  openCreate, openEdit, openDelete,
  handleSubmit, handleDelete,
} = useWarehouseForm()

const warehouseStore = useWarehousesDataStore()
const { warehouses, loading } = storeToRefs(warehouseStore)
const { fetchWarehouses } = warehouseStore

const search = ref('')
const showFormModal = ref(false)
const showDeleteModal = ref(false)

const headers = [
  { title: 'NAME', key: 'name', sortable: true, align: 'center' as const },
  { title: 'LOCATION', key: 'location', sortable: true, align: 'center' as const },
  { title: 'DATE ADDED', key: 'created_at', sortable: true, align: 'center' as const },
  { title: 'ACTIONS', key: 'actions', sortable: false, align: 'center' as const },
]

function openCreateModal() {
  openCreate()
  showFormModal.value = true
}

function openEditModal(warehouse: WarehouseType) {
  openEdit(warehouse)
  showFormModal.value = true
}

function openDeleteModal(warehouse: WarehouseType) {
  openDelete(warehouse)
  showDeleteModal.value = true
}

async function submitForm() {
  const success = await handleSubmit()
  if (success) showFormModal.value = false
}

async function confirmDelete() {
  const success = await handleDelete()
  if (success) showDeleteModal.value = false
}

onMounted(fetchWarehouses)
</script>

<template>
  <v-container fluid class="pa-2 fill-height align-start">
    <v-card class="mx-auto w-100" rounded="lg" elevation="1">

      <!-- Header -->
      <v-card-title class="d-flex justify-space-between align-center pa-5 flex-wrap ga-3">
        <span class="text-h6 font-weight-bold">Warehouses</span>
        <div class="d-flex align-center ga-3">
          <v-text-field
            v-model="search"
            placeholder="Search warehouses..."
            prepend-inner-icon="mdi-magnify"
            variant="outlined"
            density="compact"
            hide-details
            style="min-width: 260px"
          />
          <v-btn
            color="primary"
            class="text-none font-weight-bold"
            elevation="0"
            prepend-icon="mdi-plus"
            @click="openCreateModal"
          >
            Add Warehouse
          </v-btn>
        </div>
      </v-card-title>

      <v-divider />

      <!-- Table -->
      <v-data-table
        :headers="headers"
        :items="warehouses"
        :search="search"
        :loading="loading"
        loading-text="Loading warehouses..."
        no-data-text="No warehouses yet. Add one to get started."
        hover
      >
        <template #item.name="{ item }">
          <span class="font-weight-medium">{{ item.name }}</span>
        </template>

        <template #item.location="{ item }">
          {{ item.location ?? '—' }}
        </template>

        <template #item.created_at="{ item }">
          <span class="text-body-2 text-medium-emphasis">{{ formatDatePR_ISO(item.created_at) }}</span>
        </template>

        <template #item.actions="{ item }">
          <div class="d-flex justify-center" style="gap: 4px">
            <v-btn
              variant="text"
              size="small"
              icon="mdi-pencil-outline"
              color="secondary"
              @click="openEditModal(item)"
            />
            <v-btn
              variant="text"
              size="small"
              icon="mdi-trash-can-outline"
              color="error"
              @click="openDeleteModal(item)"
            />
          </div>
        </template>
      </v-data-table>

    </v-card>

    <!-- Add / Edit Modal -->
    <WareHouseFormDialog
      v-model="showFormModal"
      v-model:form="form"
      :dialog-mode="editingWarehouse ? 'edit' : 'create'"
      :loading="loading"
      :rules="rules"
      @submit="submitForm"
      @close="showFormModal = false"
    />

    <!-- Delete Confirmation -->
    <v-dialog v-model="showDeleteModal" max-width="420">
      <v-card rounded="lg">
        <v-card-text class="pa-6">
          <div class="d-flex align-center mb-3" style="gap: 12px">
            <v-icon color="error" size="32">mdi-alert-circle-outline</v-icon>
            <span class="text-h6 font-weight-bold">Delete Warehouse</span>
          </div>
          <p class="text-body-2 text-medium-emphasis">
            Are you sure you want to delete <strong>{{ warehouseToDelete?.name }}</strong>?
            This action cannot be undone.
          </p>
        </v-card-text>

        <v-divider />

        <v-card-actions class="pa-4 justify-end" style="gap: 8px">
          <v-btn variant="outlined" class="text-none" @click="showDeleteModal = false">
            Cancel
          </v-btn>
          <v-btn
            color="error"
            class="text-none font-weight-bold"
            elevation="0"
            :loading="loading"
            @click="confirmDelete"
          >
            Delete
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<style scoped>
.field-label {
  display: block;
  font-size: 0.8rem;
  font-weight: 600;
  color: #424242;
  margin-bottom: 4px;
}
:deep(.v-data-table thead th) {
  background: #f5f5f5 !important;
  font-weight: 700 !important;
  font-size: 0.75rem !important;
  letter-spacing: 0.04em;
  color: #616161 !important;
}
:deep(.v-data-table td) {
  text-align: center !important;
}
</style>
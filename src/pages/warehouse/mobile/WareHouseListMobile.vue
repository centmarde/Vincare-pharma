<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useWarehouseForm } from '../composables/useWarehouseForm'
import { formatDatePR_ISO } from '@/utils/dateFormats'
import WareHouseFormDialog from '../components/WareHouseFormDialog.vue'
import type { WarehouseType } from '@/stores/warehouseData'

const {
  warehouses, loading,
  fetchWarehouses,
  form, editingWarehouse, warehouseToDelete,
  rules,
  openCreate, openEdit, openDelete,
  handleSubmit, handleDelete,
} = useWarehouseForm()

const search = ref('')
const showFormModal = ref(false)
const showDeleteModal = ref(false)
const selectedItem = ref<WarehouseType | null>(null)
const showActions = ref(false)

function openCreateModal() {
  openCreate()
  showFormModal.value = true
}

function openEditModal(warehouse: WarehouseType | null) {
  if (!warehouse) return
  openEdit(warehouse)
  showFormModal.value = true
}

function openDeleteModal(warehouse: WarehouseType | null) {
  if (!warehouse) return
  openDelete(warehouse)
  showDeleteModal.value = true
}

function openItemActions(warehouse: WarehouseType) {
  selectedItem.value = warehouse
  showActions.value = true
}

async function submitForm() {
  const success = await handleSubmit()
  if (success) showFormModal.value = false
}

async function confirmDelete() {
  const success = await handleDelete()
  if (success) {
    showDeleteModal.value = false
    showActions.value = false
    selectedItem.value = null
  }
}

const filteredWarehouses = () => {
  if (!search.value.trim()) return warehouses.value
  const s = search.value.trim().toLowerCase()
  return warehouses.value.filter((w) => {
    const name = (w.name ?? '').toLowerCase()
    const location = (w.location ?? '').toLowerCase()
    return name.includes(s) || location.includes(s)
  })
}

onMounted(fetchWarehouses)
</script>

<template>
  <v-container fluid class="pa-2 fill-height align-start">
    <v-card class="mx-auto w-100" rounded="lg" elevation="1">
      <!-- Header -->
      <v-card-title class="d-flex justify-space-between align-center pa-4 flex-wrap ga-3">
        <span class="text-h6 font-weight-bold">Warehouses</span>
        <v-btn
          color="primary"
          class="text-none font-weight-bold"
          elevation="0"
          prepend-icon="mdi-plus"
          @click="openCreateModal"
        >
          Add Warehouse
        </v-btn>
      </v-card-title>

      <v-divider />

      <!-- Search -->
      <div class="px-4 pt-3 pb-1">
        <v-text-field
          v-model="search"
          placeholder="Search warehouses..."
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          density="compact"
          hide-details
        />
      </div>

      <v-divider class="mt-2" />

      <!-- Card List -->
      <div class="pa-3">
        <div v-if="loading" class="text-center pa-6">
          <v-progress-circular indeterminate color="primary" size="32" />
          <div class="text-body-2 text-medium-emphasis mt-2">Loading warehouses...</div>
        </div>

        <div v-else-if="filteredWarehouses().length === 0" class="text-center pa-6">
          <v-icon size="48" color="grey-lighten-1">mdi-warehouse</v-icon>
          <div class="text-body-2 text-medium-emphasis mt-2">No warehouses found.</div>
        </div>

        <v-list
          v-else
          lines="two"
          class="pa-0"
        >
          <v-list-item
            v-for="warehouse in filteredWarehouses()"
            :key="warehouse.id"
            @click="openItemActions(warehouse)"
            class="mb-2 border rounded-lg"
            style="border-color: rgba(0,0,0,0.08)"
          >
            <v-list-item-title class="font-weight-medium">
              {{ warehouse.name }}
            </v-list-item-title>

            <v-list-item-subtitle class="text-body-2">
              <div v-if="warehouse.location" class="d-flex align-center ga-1 mt-1">
                <v-icon size="small" color="grey">mdi-map-marker-outline</v-icon>
                <span>{{ warehouse.location }}</span>
              </div>
              <div v-else class="text-medium-emphasis">No location provided</div>
            </v-list-item-subtitle>

            <v-list-item-subtitle class="text-body-2">
              <span v-if="!warehouse.location" class="text-medium-emphasis">No location provided</span>
            </v-list-item-subtitle>

            <template #append>
              <v-btn
                icon="mdi-dots-vertical"
                variant="text"
                size="small"
                color="grey"
              />
            </template>
          </v-list-item>
        </v-list>
      </div>
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

    <!-- Actions Sheet -->
    <v-bottom-sheet v-model="showActions">
      <v-card rounded="t-lg">
        <v-card-title v-if="selectedItem" class="pa-4">
          <span class="text-subtitle-1 font-weight-bold">{{ selectedItem.name }}</span>
          <div class="text-caption text-medium-emphasis">{{ selectedItem.location ?? 'No location' }}</div>
        </v-card-title>
        <v-divider />
        <v-list>
          <v-list-item
            prepend-icon="mdi-pencil-outline"
            title="Edit Warehouse"
            value="edit"
            @click="openEditModal(selectedItem)"
          />
          <v-list-item
            prepend-icon="mdi-trash-can-outline"
            title="Delete Warehouse"
            value="delete"
            class="text-error"
            @click="openDeleteModal(selectedItem)"
          />
        </v-list>
        <v-card-actions class="justify-end pa-3">
          <v-btn variant="tonal" class="text-none" @click="showActions = false">Close</v-btn>
        </v-card-actions>
      </v-card>
    </v-bottom-sheet>
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
</style>
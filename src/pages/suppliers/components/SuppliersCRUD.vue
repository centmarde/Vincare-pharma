<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useSuppliers } from '../composables/useSuppliers'
import { formatDatePR } from '@/utils/helpers'

const {
  suppliers, loading, error,
  fetchSuppliers,
  form, editingSupplier, supplierToDelete,
  headers, rules,
  openCreate, openEdit, openDelete,
  handleSubmit, handleDelete,
} = useSuppliers()

const search = ref('')
const showFormModal = ref(false)
const showDeleteModal = ref(false)
const formRef = ref()


function openCreateModal() {
  openCreate()
  showFormModal.value = true
}

function openEditModal(supplier: typeof supplierToDelete.value) {
  openEdit(supplier!)
  showFormModal.value = true
}

function openDeleteModal(supplier: typeof supplierToDelete.value) {
  openDelete(supplier!)
  showDeleteModal.value = true
}

async function submitForm() {
  const success = await handleSubmit(formRef.value)
  if (success) showFormModal.value = false
}

async function confirmDelete() {
  const success = await handleDelete()
  if (success) showDeleteModal.value = false
}

onMounted(fetchSuppliers)
</script>

<template>
  <v-container fluid class="pa-2 bg-surface-variant fill-height align-start">
    <v-card class="mx-auto w-100" max-width="1400" rounded="lg" elevation="1">

      <!-- Header -->
      <v-card-title class="d-flex justify-space-between align-center pa-5">
        <span class="text-h6 font-weight-bold">Suppliers</span>
        <div class="d-flex align-center" style="gap: 12px">
          <v-text-field
            v-model="search"
            placeholder="Search suppliers..."
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
            Add Supplier
          </v-btn>
        </div>
      </v-card-title>

      <v-divider />

      <!-- Table -->
      <v-data-table
        :headers="headers"
        :items="suppliers"
        :search="search"
        :loading="loading"
        loading-text="Loading suppliers..."
        no-data-text="No suppliers yet. Add one to get started."
        hover
      >
        <template #item.name="{ item }">
          <span class="font-weight-medium">{{ item.name }}</span>
        </template>

        <template #item.contact_person="{ item }">
          {{ item.contact_person ?? '—' }}
        </template>

        <template #item.phone="{ item }">
          {{ item.phone ?? '—' }}
        </template>

        <template #item.email="{ item }">
          {{ item.email ?? '—' }}
        </template>

        <template #item.city="{ item }">
          {{ item.city ?? '—' }}
        </template>

        <template #item.is_active="{ item }">
          <span
            class="status-chip text-caption font-weight-bold"
            :class="item.is_active ? 'status-chip--active' : 'status-chip--inactive'"
          >
            <span class="status-dot" />
            {{ item.is_active ? 'Active' : 'Inactive' }}
          </span>
        </template>

        <template #item.created_at="{ item }">
          <span class="text-body-2 text-medium-emphasis">{{ formatDatePR(item.created_at) }}</span>
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

    <!-- ── Add / Edit Modal ──────────────────────────────────────────── -->
    <v-dialog v-model="showFormModal" max-width="560" persistent>
      <v-card rounded="lg">

        <v-card-title class="pa-5 pb-3 text-h6 font-weight-bold">
          {{ editingSupplier ? 'Edit Supplier' : 'Add Supplier' }}
        </v-card-title>

        <v-divider />

        <v-card-text class="pa-5">
          <v-form ref="formRef">
            <v-row dense>

              <v-col cols="12">
                <label class="field-label">Supplier Name <span class="text-error">*</span></label>
                <v-text-field
                  v-model="form.name"
                  placeholder="e.g. MedSupply Inc."
                  variant="outlined"
                  density="compact"
                  hide-details="auto"
                  :rules="[rules.required]"
                />
              </v-col>

              <v-col cols="12" md="6">
                <label class="field-label">Contact Person</label>
                <v-text-field
                  v-model="form.contact_person"
                  placeholder="e.g. Juan dela Cruz"
                  variant="outlined"
                  density="compact"
                  hide-details
                />
              </v-col>

              <v-col cols="12" md="6">
                <label class="field-label">Phone</label>
                <v-text-field
                  v-model="form.phone"
                  placeholder="e.g. 09123456789"
                  variant="outlined"
                  density="compact"
                  hide-details
                />
              </v-col>

              <v-col cols="12" md="6">
                <label class="field-label">Email</label>
                <v-text-field
                  v-model="form.email"
                  placeholder="e.g. supplier@email.com"
                  variant="outlined"
                  density="compact"
                  hide-details="auto"
                  :rules="[rules.email]"
                />
              </v-col>

              <v-col cols="12" md="6">
                <label class="field-label">City</label>
                <v-text-field
                  v-model="form.city"
                  placeholder="e.g. Butuan City"
                  variant="outlined"
                  density="compact"
                  hide-details
                />
              </v-col>

              <v-col cols="12">
                <label class="field-label">Address</label>
                <v-textarea
                  v-model="form.address"
                  placeholder="e.g. 2F N.B. Bldg., Ochoa Avenue"
                  variant="outlined"
                  density="compact"
                  rows="2"
                  hide-details
                />
              </v-col>

              <v-col cols="12">
                <v-switch
                  v-model="form.is_active"
                  color="primary"
                  hide-details
                  density="compact"
                  :label="form.is_active ? 'Active' : 'Inactive'"
                />
              </v-col>

            </v-row>

            <v-alert
              v-if="error"
              type="error"
              variant="tonal"
              density="compact"
              class="mt-3"
            >
              {{ error }}
            </v-alert>
          </v-form>
        </v-card-text>

        <v-divider />

        <v-card-actions class="pa-4 justify-end" style="gap: 8px">
          <v-btn variant="outlined" class="text-none" @click="showFormModal = false">
            Cancel
          </v-btn>
          <v-btn
            color="primary"
            class="text-none font-weight-bold"
            elevation="0"
            :loading="loading"
            @click="submitForm"
          >
            {{ editingSupplier ? 'Save Changes' : 'Add Supplier' }}
          </v-btn>
        </v-card-actions>

      </v-card>
    </v-dialog>

    <!-- ── Delete Confirmation ───────────────────────────────────────── -->
    <v-dialog v-model="showDeleteModal" max-width="420">
      <v-card rounded="lg">
        <v-card-text class="pa-6">
          <div class="d-flex align-center mb-3" style="gap: 12px">
            <v-icon color="error" size="32">mdi-alert-circle-outline</v-icon>
            <span class="text-h6 font-weight-bold">Delete Supplier</span>
          </div>
          <p class="text-body-2 text-medium-emphasis">
            Are you sure you want to delete
            <strong>{{ supplierToDelete?.name }}</strong>?
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
.status-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 20px;
}
.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}
.status-active { color: #2e7d32; background: #f0f9f0; }
.status-active .status-dot { background: #4caf50; }
.status-inactive { color: #757575; background: #f5f5f5; }
.status-inactive .status-dot { background: #9e9e9e; }
.status-chip--active {
  color: #2e7d32;
  background: rgba(46, 125, 50, 0.12);
}
.status-chip--active .status-dot { background: #4caf50; }

.status-chip--inactive {
  color: #c62828;
  background: rgba(198, 40, 40, 0.12);
}
.status-chip--inactive .status-dot { background: #ef5350; }
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
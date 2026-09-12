<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useDisplay } from 'vuetify'
import { useSuppliers } from '../composables/useSuppliers'
import { formatDatePR_ISO } from '@/utils/helpers'
import  SupplierFormDialog  from './dialogs/SupplierFormDialog.vue'

const { mobile } = useDisplay()

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

// Client-side search for the mobile card list (the desktop table self-filters
// via its built-in :search).
const filteredSuppliers = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return suppliers.value ?? []
  return (suppliers.value ?? []).filter((s) =>
    [s.name, s.contact_person, s.contact_no, s.email, s.address]
      .some((v) => v != null && String(v).toLowerCase().includes(q))
  )
})

// ─── Mobile card pagination ─────────────────────────────────────────────
const mobilePage = ref(1)
const mobilePageSize = ref(5)
const mobilePageSizeOptions = [5, 10, 15, 25, 50]

const mobileTotalPages = computed(() =>
  Math.max(1, Math.ceil((filteredSuppliers.value?.length ?? 0) / mobilePageSize.value))
)

const mobilePaginatedSuppliers = computed(() => {
  const start = (mobilePage.value - 1) * mobilePageSize.value
  return (filteredSuppliers.value ?? []).slice(start, start + mobilePageSize.value)
})

// Keep the current page valid when the list shrinks or the page size changes.
watch(filteredSuppliers, () => {
  if (mobilePage.value > mobileTotalPages.value) mobilePage.value = mobileTotalPages.value
})
watch(mobilePageSize, () => {
  if (mobilePage.value > mobileTotalPages.value) mobilePage.value = mobileTotalPages.value
})


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
  const success = await handleSubmit() // CHANGED — no formRef arg
  if (success) showFormModal.value = false
}

async function confirmDelete() {
  const success = await handleDelete()
  if (success) showDeleteModal.value = false
}

onMounted(fetchSuppliers)
</script>

<template>
  <v-container fluid class="pa-2 fill-height align-start">
    <v-card class="mx-auto w-100" rounded="lg" elevation="1">

      <!-- Header -->
      <v-card-title
        class="d-flex flex-wrap align-center ga-3 pa-4 pa-sm-5"
        :class="mobile ? 'flex-column' : 'justify-space-between'"
      >
        <span class="text-h6 font-weight-bold">Suppliers</span>
        <div class="d-flex flex-wrap align-center ga-2">
          <v-text-field
            v-model="search"
            placeholder="Search suppliers..."
            prepend-inner-icon="mdi-magnify"
            variant="outlined"
            density="compact"
            hide-details
            class="flex-grow-1"
            :style="mobile ? 'min-width: 0; width: 100%' : 'min-width: 260px'"
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
        v-if="!mobile"
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

        <template #item.contact_no="{ item }">
          {{ item.contact_no ?? '—' }}
        </template>

        <template #item.email="{ item }">
          {{ item.email ?? '—' }}
        </template>

        <template #item.balance="{ item }">
          <span :class="item.balance != null && item.balance < 0 ? 'text-error' : ''">
            {{ item.balance != null ? `₱${Number(item.balance).toLocaleString()}` : '—' }}
          </span>
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

      <!-- Mobile: Cards Grid -->
      <v-row v-else dense>
        <v-col v-for="supplier in mobilePaginatedSuppliers" :key="supplier.id" cols="12" sm="6">
          <v-card variant="outlined" hover :elevation="2">
            <v-card-title class="d-flex align-center gap-2 pb-2">
              <span class="text-h6 font-weight-bold text-truncate flex-grow-1">{{ supplier.name }}</span>
              <span
                class="status-chip text-caption font-weight-bold"
                :class="supplier.is_active ? 'status-chip--active' : 'status-chip--inactive'"
              >
                <span class="status-dot" />
                {{ supplier.is_active ? 'Active' : 'Inactive' }}
              </span>
            </v-card-title>

            <v-card-text class="pt-0">
              <v-row dense>
                <v-col cols="12">
                  <div class="d-flex align-center ga-2">
                    <v-icon size="16" color="grey">mdi-account-outline</v-icon>
                    <span class="text-body-2">{{ supplier.contact_person ?? '—' }}</span>
                  </div>
                  <div class="d-flex align-center ga-2">
                    <v-icon size="16" color="grey">mdi-phone</v-icon>
                    <span class="text-body-2">{{ supplier.contact_no ?? '—' }}</span>
                  </div>
                  <div class="d-flex align-center ga-2">
                    <v-icon size="16" color="grey">mdi-email-outline</v-icon>
                    <span class="text-body-2 text-truncate">{{ supplier.email ?? '—' }}</span>
                  </div>
                  <div class="d-flex align-center ga-2">
                    <v-icon size="16" color="grey">mdi-map-marker</v-icon>
                    <span class="text-body-2 text-truncate">{{ supplier.address ?? '—' }}</span>
                  </div>
                </v-col>

                <v-col cols="12" sm="6">
                  <div class="text-caption text-medium-emphasis">Balance</div>
                  <div
                    class="font-weight-bold"
                    :class="supplier.balance != null && supplier.balance < 0 ? 'text-error' : ''"
                  >
                    {{ supplier.balance != null ? `₱${Number(supplier.balance).toLocaleString()}` : '—' }}
                  </div>
                </v-col>
                <v-col cols="12" sm="6">
                  <div class="text-caption text-medium-emphasis">Date Added</div>
                  <div class="text-body-2 text-medium-emphasis">{{ formatDatePR_ISO(supplier.created_at) }}</div>
                </v-col>
              </v-row>
            </v-card-text>

            <v-card-actions class="pt-0 px-4 pb-3 justify-end">
              <v-btn
                variant="text"
                size="small"
                color="secondary"
                prepend-icon="mdi-pencil-outline"
                @click="openEditModal(supplier)"
              >
                Edit
              </v-btn>
              <v-btn
                variant="text"
                size="small"
                color="error"
                prepend-icon="mdi-trash-can-outline"
                @click="openDeleteModal(supplier)"
              >
                Delete
              </v-btn>
            </v-card-actions>
          </v-card>
        </v-col>
      </v-row>

      <!-- Mobile: pagination -->
      <div v-if="filteredSuppliers.length > 0" class="d-flex justify-center align-center flex-wrap ga-3 pa-3">
        <v-select
          v-model="mobilePageSize"
          :items="mobilePageSizeOptions"
          label="Per page"
          density="compact"
          variant="outlined"
          hide-details
        />
        <v-pagination
          v-model="mobilePage"
          :length="mobileTotalPages"
          :total-visible="3"
          density="comfortable"
        />
      </div>

    </v-card>

    <!-- ── Add / Edit Modal ──────────────────────────────────────────── -->
    <SupplierFormDialog 
      v-model="showFormModal" 
      v-model:form="form"
      :dialog-mode="editingSupplier ? 'edit' : 'create'"
      :loading="loading"
      :rules="rules"
      @submit="submitForm"
      @close="showFormModal = false"
    />

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

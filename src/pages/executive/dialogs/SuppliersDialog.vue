<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { useSuppliersDataStore, type SupplierType } from '@/stores/suppliersData'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const suppliersStore = useSuppliersDataStore()

const activeSuppliers = computed(() => suppliersStore.activeSuppliers)
const loading = computed(() => suppliersStore.loading)

onMounted(() => {
  if (suppliersStore.suppliers.length === 0) {
    suppliersStore.fetchSuppliers({ activeOnly: true })
  }
})

function close() {
  emit('update:modelValue', false)
}
</script>

<template>
  <v-dialog :model-value="modelValue" max-width="700" @update:model-value="emit('update:modelValue', $event)">
    <v-card rounded="xl">
      <v-card-title class="d-flex align-center pa-5 pb-3">
        <v-icon icon="mdi-truck-delivery" color="primary" size="24" class="mr-2" />
        <span class="text-h6 font-weight-bold">Active Suppliers</span>
        <v-spacer />
        <v-chip color="primary" variant="tonal" size="small" label>
          {{ activeSuppliers.length }} suppliers
        </v-chip>
        <v-btn icon="mdi-close" variant="text" size="small" class="ml-2" @click="close" />
      </v-card-title>

      <v-divider />

      <v-card-text class="pa-5">
        <div v-if="loading" class="text-center py-8 text-medium-emphasis">
          <v-progress-circular indeterminate color="primary" size="40" class="mb-3" />
          <div>Loading suppliers...</div>
        </div>

        <div v-else-if="activeSuppliers.length === 0" class="text-center py-8 text-medium-emphasis">
          <v-icon icon="mdi-truck-delivery" size="48" color="grey" class="mb-2" />
          <div>No active suppliers found.</div>
        </div>

        <v-list v-else lines="two" class="pa-0">
          <v-list-item
            v-for="(supplier, idx) in activeSuppliers"
            :key="supplier.id"
            class="px-0"
          >
            <template #prepend>
              <v-avatar
                size="40"
                rounded="lg"
                color="primary"
                variant="tonal"
                class="mr-3"
              >
                <span class="font-weight-bold text-primary text-body-2">
                  {{ supplier.name?.charAt(0)?.toUpperCase() || 'S' }}
                </span>
              </v-avatar>
            </template>

            <v-list-item-title class="font-weight-medium text-body-2">
              {{ supplier.name || '—' }}
            </v-list-item-title>
            <v-list-item-subtitle class="text-caption mt-1">
              <div class="d-flex flex-wrap ga-3">
                <span v-if="supplier.contact_person">
                  <v-icon icon="mdi-account" size="12" class="mr-1" />
                  {{ supplier.contact_person }}
                </span>
                <span v-if="supplier.contact_no">
                  <v-icon icon="mdi-phone" size="12" class="mr-1" />
                  {{ supplier.contact_no }}
                </span>
                <span v-if="supplier.email">
                  <v-icon icon="mdi-email" size="12" class="mr-1" />
                  {{ supplier.email }}
                </span>
              </div>
            </v-list-item-subtitle>

            <template #append>
              <div class="text-right">
                <div v-if="supplier.balance != null" class="text-body-2 font-weight-bold">
                  ₱{{ supplier.balance.toLocaleString() }}
                </div>
                <v-chip
                  size="x-small"
                  :color="supplier.is_active ? 'success' : 'grey'"
                  variant="tonal"
                  label
                >
                  {{ supplier.is_active ? 'Active' : 'Inactive' }}
                </v-chip>
              </div>
            </template>

            <v-divider v-if="idx < activeSuppliers.length - 1" class="mt-2" />
          </v-list-item>
        </v-list>
      </v-card-text>

      <v-card-actions class="pa-5 pt-0">
        <v-spacer />
        <v-btn variant="outlined" class="text-none" @click="close">Close</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
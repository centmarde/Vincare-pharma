<script setup lang="ts">
import { getModuleColor } from '../composables/logsHelpers'

const props = defineProps<{
  activeFilter: string | null
  moduleCounts: Record<string, number>
  totalCount: number
}>()

const emit = defineEmits<{
  'update:activeFilter': [value: string | null]
}>()

// Module definitions — colors are driven by the SAME getModuleColor() used by
// the LogsWidget module chip, so the cards and table always match.
const modules = [
  {
    key: 'purchase_requisition',
    label: 'Requisition',
    icon: 'mdi-file-document-edit-outline',
  },
  {
    key: 'purchase_order',
    label: 'Purchase Order',
    icon: 'mdi-file-document-outline',
  },
  { key: 'stock_in', label: 'Stock In', icon: 'mdi-arrow-collapse-down' },
  { key: 'stock_out', label: 'Stock Out', icon: 'mdi-arrow-collapse-up' },
  { key: 'sale', label: 'Sale', icon: 'mdi-cart-outline' },
  { key: 'inhouse', label: 'Inhouse Order', icon: 'mdi-swap-horizontal-bold' },
  {
    key: 'reorder',
    label: 'Reorders',
    icon: 'mdi-cart-arrow-down',
  },
  {
    key: 'purchase_return',
    label: 'Return (Purchase)',
    icon: 'mdi mdi-keyboard-return',
  },
  { key: 'sales_return', label: 'Return (Sales)', icon: 'mdi-archive-arrow-up' },
]

const colorFor = (key: string) => getModuleColor(key)

const isActive = (key: string) => props.activeFilter === key
const isAll = () => props.activeFilter === null

const setFilter = (key: string | null) => {
  emit('update:activeFilter', key)
}
</script>

<template>
  <v-row class="ma-0 mb-4">
    <!-- Module cards -->
    <v-col v-for="mod in modules" :key="mod.key" cols="6" sm class="pa-2 col-fifth">
      <v-card
        class="rounded-xl quick-stat-card"
        :class="{ 'quick-stat-card--active': isActive(mod.key) }"
        elevation="0"
        :color="isActive(mod.key) ? 'primary' : undefined"
        :variant="isActive(mod.key) ? 'flat' : 'outlined'"
        style="cursor: pointer"
        @click="setFilter(mod.key)"
      >
        <v-card-text class="pa-3 text-center">
          <v-icon
            :icon="mod.icon"
            :color="isActive(mod.key) ? 'white' : colorFor(mod.key)"
            size="24"
            class="mb-1"
          />
          <div
            class="text-h6 font-weight-bold"
            :class="isActive(mod.key) ? 'text-white' : `text-${colorFor(mod.key)}`"
          >
            {{ moduleCounts[mod.key] || 0 }}
          </div>
          <div
            class="text-caption font-weight-medium"
            :class="
              isActive(mod.key)
                ? 'text-white text-opacity-85'
                : `text-${colorFor(mod.key)} text-opacity-70`
            "
          >
            {{ mod.label }}
          </div>
        </v-card-text>
      </v-card>
    </v-col>

    <!-- All card — theme-aware (responds to light/dark via primary color) -->
    <v-col cols="6" sm class="pa-2 col-fifth">
      <v-card
        class="rounded-xl quick-stat-card"
        :class="{ 'quick-stat-card--active': isAll() }"
        elevation="0"
        :color="isAll() ? 'primary' : undefined"
        :variant="isAll() ? 'flat' : 'outlined'"
        style="cursor: pointer"
        @click="setFilter(null)"
      >
        <v-card-text class="pa-3 text-center">
          <v-icon
            icon="mdi-view-dashboard"
            :color="isAll() ? 'white' : 'primary'"
            size="24"
            class="mb-1"
          />
          <div class="text-h6 font-weight-bold" :class="isAll() ? 'text-white' : 'text-primary'">
            {{ totalCount }}
          </div>
          <div
            class="text-caption font-weight-medium"
            :class="isAll() ? 'text-white text-opacity-85' : 'text-primary text-opacity-70'"
          >
            All
          </div>
        </v-card-text>
      </v-card>
    </v-col>
  </v-row>
</template>

<style scoped>
/* Vuetify v-col with sm uses flex-grow, so we force 20% */
@media (min-width: 600px) {
  .col-fifth {
    flex: 0 0 20% !important;
    max-width: 20% !important;
  }
}

/* Matching executive QuickStatsCards design */
.quick-stat-card {
  border: 1px solid rgba(0, 0, 0, 0.06);
  background: rgb(var(--v-theme-surface)) !important;
  transition: transform 0.2s ease;
}
.quick-stat-card:hover {
  transform: translateY(-2px);
}
.quick-stat-card--active {
  border-color: transparent;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15) !important;
}
</style>

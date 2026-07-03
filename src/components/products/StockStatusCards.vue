<script setup lang="ts">
const props = defineProps<{
  outOfStockCount: number
  lowStockCount: number
}>()

const emit = defineEmits<{
  'show-dialog': [type: 'out-of-stock' | 'low-stock']
}>()
</script>

<template>
  <div class="d-flex flex-wrap ga-3 pa-3">
    <!-- Out of Stock Card -->
    <v-card
      v-if="props.outOfStockCount > 0"
      color="error"
      variant="tonal"
      class="flex-grow-1 cursor-pointer"
      min-width="200"
      @click="emit('show-dialog', 'out-of-stock')"
    >
      <v-card-item class="pa-3">
        <template #prepend>
          <v-icon icon="mdi-close-circle-outline" color="error" size="36"></v-icon>
        </template>
        <v-card-title class="text-body-1 font-weight-bold pa-0">
          Out of Stock
        </v-card-title>
      <v-card-subtitle class="text-h6 pa-0 mt-1">
          <strong>{{ props.outOfStockCount }}</strong>
          product{{ props.outOfStockCount > 1 ? 's' : '' }}
        </v-card-subtitle>
      </v-card-item>
    </v-card>

    <!-- Low Stock Card -->
    <v-card
      v-if="props.lowStockCount > 0"
      color="warning"
      variant="tonal"
      class="flex-grow-1 cursor-pointer"
      min-width="200"
      @click="emit('show-dialog', 'low-stock')"
    >
      <v-card-item class="pa-3">
        <template #prepend>
          <v-icon icon="mdi-alert-outline" color="warning" size="36"></v-icon>
        </template>
        <v-card-title class="text-body-1 font-weight-bold pa-0">
          Low Stock
        </v-card-title>
      <v-card-subtitle class="text-h6 pa-0 mt-1">
          <strong>{{ props.lowStockCount }}</strong>
          product{{ props.lowStockCount > 1 ? 's' : '' }}
        </v-card-subtitle>
      </v-card-item>
    </v-card>
  </div>
</template>

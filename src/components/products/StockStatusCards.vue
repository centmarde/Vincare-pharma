<script setup lang="ts">
export interface StockStatusCard {
  type: 'out-of-stock' | 'low-stock' | 'no-reorder-level' | 'expiring-soon' | 'expired'
  count: number
  label: string
  icon: string
  color: string
}

const props = defineProps<{
  cards: StockStatusCard[]
}>()

const emit = defineEmits<{
  'show-dialog': [type: StockStatusCard['type']]
}>()
</script>

<template>
  <div class="d-flex flex-wrap ga-3 pa-3">
    <v-card
      v-for="card in props.cards.filter(c => c.count > 0)"
      :key="card.type"
      :color="card.color"
      variant="tonal"
      class="flex-grow-1 cursor-pointer"
      min-width="200"
      @click="emit('show-dialog', card.type)"
    >
      <v-card-item class="pa-3">
        <template #prepend>
          <v-icon :icon="card.icon" :color="card.color" size="36"></v-icon>
        </template>
        <v-card-title class="text-body-1 font-weight-bold pa-0">
          {{ card.label }}
        </v-card-title>
        <v-card-subtitle class="text-h6 pa-0 mt-1">
          <strong>{{ card.count }}</strong>
          product{{ card.count > 1 ? 's' : '' }}
        </v-card-subtitle>
      </v-card-item>
    </v-card>
  </div>
</template>

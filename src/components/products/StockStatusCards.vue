<script setup lang="ts">
import { useDisplay } from 'vuetify'

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

// Responsive display helpers
const { mobile } = useDisplay()
</script>

<template>
  <v-row class="pa-3">
    <v-col
      v-for="card in props.cards.filter(c => c.count > 0)"
      :key="card.type"
      cols="6"
      sm="6"
      md="4"
      lg="3"
      xl="2"
      class="d-flex"
    >
      <v-card
        :color="card.color"
        variant="tonal"
        class="flex-grow-1 cursor-pointer"
        @click="emit('show-dialog', card.type)"
      >
        <v-card-item class="pa-2 pa-sm-3">
          <template #prepend>
            <v-icon
              :icon="card.icon"
              :color="card.color"
              :size="mobile ? 26 : 36"
            ></v-icon>
          </template>
          <v-card-title class="text-body-2 text-sm-body-1 font-weight-bold pa-0">
            {{ card.label }}
          </v-card-title>
          <v-card-subtitle class="text-subtitle-2 text-sm-h6 pa-0 mt-1">
            <strong>{{ card.count }}</strong>
            product{{ card.count > 1 ? 's' : '' }}
          </v-card-subtitle>
        </v-card-item>
      </v-card>
    </v-col>
  </v-row>
</template>

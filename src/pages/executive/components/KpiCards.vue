<script setup lang="ts">
import type { KpiCard } from '../composables/executiveStatic'

defineProps<{
  cards: KpiCard[]
}>()

function trendIcon(trend: 'up' | 'down' | 'neutral'): string {
  if (trend === 'up') return 'mdi-trending-up'
  if (trend === 'down') return 'mdi-trending-down'
  return 'mdi-minus'
}

function trendColor(trend: 'up' | 'down' | 'neutral'): string {
  if (trend === 'up') return 'success'
  if (trend === 'down') return 'error'
  return 'grey'
}
</script>

<template>
  <v-row class="ma-0 mb-4">
    <v-col
      v-for="(kpi, i) in cards"
      :key="i"
      cols="12"
      sm="6"
      lg="3"
      class="pa-2"
    >
      <v-card
        class="kpi-card rounded-xl"
        elevation="0"
        :class="`kpi-card--${kpi.color}`"
      >
        <v-card-text class="pa-4">
          <div class="d-flex align-start justify-space-between mb-3">
            <div>
              <div class="text-caption font-weight-medium text-medium-emphasis kpi-label">
                {{ kpi.title }}
              </div>
              <div class="text-h4 font-weight-bold kpi-value mt-1">
                {{ kpi.value }}
              </div>
            </div>
            <v-avatar
              size="44"
              rounded="lg"
              class="kpi-avatar"
              :color="kpi.color"
              variant="tonal"
            >
              <v-icon :icon="kpi.icon" :color="kpi.color" size="24" />
            </v-avatar>
          </div>
          <div class="d-flex align-center ga-2">
            <v-icon
              :icon="trendIcon(kpi.trend)"
              :color="trendColor(kpi.trend)"
              size="16"
            />
            <span
              class="text-caption font-weight-medium"
              :class="`text-${trendColor(kpi.trend)}`"
            >
              {{ kpi.trendLabel }}
            </span>
            <span class="text-caption text-medium-emphasis ml-auto">{{ kpi.subtitle }}</span>
          </div>
        </v-card-text>
      </v-card>
    </v-col>
  </v-row>
</template>
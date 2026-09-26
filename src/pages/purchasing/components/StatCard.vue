<script setup lang="ts">
defineProps<{
  title: string
  value: string
  icon: string
  color: string
  valueClass?: string
  active?: boolean
}>()

const emit = defineEmits<{
  click: []
}>()
</script>

<template>
  <v-card
    elevation="1"
    class="stat-card rounded-xl"
    :class="{ 'stat-card--active': active }"
    @click="emit('click')"
  >
    <v-card-text class="d-flex align-center" style="gap: 12px">
      <v-avatar :color="color" variant="tonal" size="40">
        <v-icon :icon="icon" />
      </v-avatar>
      <div>
        <div class="text-subtitle-2">{{ title }}</div>
        <div class="text-h6 font-weight-bold" :class="valueClass">{{ value }}</div>
      </div>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.stat-card {
  min-height: 96px;
  display: flex;
  align-items: center;
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
  border: 3px solid rgba(0, 0, 0, 0.06);
}
.stat-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1) !important;
}
.stat-card--active {
  border-color: #A63EB8;
  background-color: rgba(50, 75, 219, 0.08);
  box-shadow: 0 4px 12px rgba(var(--v-theme-primary), 0.2);
}

@media (max-width: 600px) {
  .stat-card .v-card-text .v-avatar {
    width: 28px !important;
    height: 28px !important;
    font-size: 14px !important;
  }
  .stat-card .text-subtitle-2 {
    font-size: 0.75rem !important;
  }
  .stat-card .text-h6 {
    font-size: 0.875rem !important;
  }
}
</style>

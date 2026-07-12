<script setup lang="ts">
import type { LogType } from '@/stores/logsData'
import { getReferenceLabel, getActionColor, getModuleColor } from '../composables/logsHelpers'
import { formatDate } from '@/utils/helpers'

defineProps<{
  serverItems: LogType[]
  loadingTable: boolean
  totalLogs: number
  itemsPerPage: number
  page: number
}>()

defineEmits<{
  'view-history': [log: LogType]
  'update:page': [page: number]
}>()
</script>

<template>
  <div v-if="serverItems.length > 0" class="pa-3">
    <v-card
      v-for="log in serverItems"
      :key="log.id"
      class="mb-3"
      rounded="lg"
      elevation="2"
    >
      <!-- Card header: action + module chips -->
      <v-card-title class="d-flex align-center ga-2 pa-3 pb-1">

        <div class="d-flex flex-wrap ga-1">
          <v-chip
            :color="getActionColor(log.action)"
            size="x-small"
            variant="tonal"
            class="text-capitalize font-weight-medium"
          >
            {{ log.action || '—' }}
          </v-chip>
          <v-chip
            :color="getModuleColor(log.module)"
            size="x-small"
            variant="outlined"
            class="text-capitalize"
          >
            {{ log.module || '—' }}
          </v-chip>
        </div>
      </v-card-title>

      <!-- Card body: description -->
      <v-card-text class="pa-3 pt-1">
        <div class="text-body-2 mb-2">{{ log.description || '—' }}</div>
        <v-divider class="mb-2"></v-divider>
        <div class="d-flex flex-wrap align-center ga-3 text-caption text-medium-emphasis">
          <div v-if="log.created_by_email" class="d-flex align-center ga-1">
            <v-icon size="12">mdi-account</v-icon>
            <span>{{ log.created_by_email }}</span>
          </div>
          <div v-if="getReferenceLabel(log)" class="d-flex align-center ga-1">
            <v-icon size="12">mdi-hash</v-icon>
            <span>{{ getReferenceLabel(log) }}</span>
          </div>
          <div v-else class="d-flex align-center ga-1">
            <v-icon size="12">mdi-clock-outline</v-icon>
            <span>On Review</span>
          </div>
          <div class="d-flex align-center ga-1">
            <v-icon size="12">mdi-calendar</v-icon>
            <span>{{ formatDate(log.created_at) }}</span>
          </div>
        </div>
      </v-card-text>

      <!-- Mobile action button -->
      <v-card-actions class="pa-3 pt-0">
        <v-btn
          size="small"
          variant="outlined"
          color="primary"
          block
          @click="$emit('view-history', log)"
        >
          <v-icon size="16" class="mr-1">mdi-text-box-search-outline</v-icon>
          View History
        </v-btn>
      </v-card-actions>
    </v-card>
  </div>

  <!-- Mobile empty state -->
  <div v-else-if="!loadingTable" class="text-center pa-6">
    <v-icon
      icon="mdi-text-box-search-outline"
      size="48"
      color="grey-lighten-1"
      class="mb-3"
    ></v-icon>
    <div class="text-h6 text-medium-emphasis mb-1">No logs found</div>
    <div class="text-body-2 text-medium-emphasis">No activity logs to display.</div>
  </div>

  <!-- Mobile loading -->
  <div v-if="loadingTable" class="text-center pa-6">
    <v-progress-circular indeterminate color="primary" size="32"></v-progress-circular>
    <div class="text-body-2 mt-2 text-medium-emphasis">Loading logs...</div>
  </div>

  <!-- Mobile pagination info -->
  <div
    v-if="serverItems.length > 0 && totalLogs > itemsPerPage"
    class="d-flex align-center justify-center pa-3 ga-2"
  >
    <v-btn
      icon="mdi-chevron-left"
      variant="tonal"
      size="small"
      :disabled="page <= 1"
      @click="$emit('update:page', page - 1)"
    ></v-btn>
    <span class="text-caption text-medium-emphasis">
      Page {{ page }} of {{ Math.ceil(totalLogs / itemsPerPage) }}
    </span>
    <v-btn
      icon="mdi-chevron-right"
      variant="tonal"
      size="small"
      :disabled="page >= Math.ceil(totalLogs / itemsPerPage)"
      @click="$emit('update:page', page + 1)"
    ></v-btn>
  </div>
</template>

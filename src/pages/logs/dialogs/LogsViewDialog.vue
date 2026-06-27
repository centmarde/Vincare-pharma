<script setup lang="ts">
import { computed } from 'vue'
import { useDisplay } from 'vuetify'
import type { LogType } from '@/stores/logsData'

const props = defineProps<{
  modelValue: boolean
  logs: LogType[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  close: []
}>()

const { mobile } = useDisplay()

const dialog = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
})

const formatDate = (dateString: string | null) => {
  if (!dateString) return '—'
  return new Date(dateString).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const getActionColor = (action: string | null) => {
  if (!action) return 'grey'
  const lower = action.toLowerCase()
  if (lower.includes('submit') || lower.includes('create')) return 'success'
  if (lower.includes('update') || lower.includes('edit')) return 'info'
  if (lower.includes('delete') || lower.includes('remove')) return 'error'
  if (lower.includes('approve')) return 'primary'
  if (lower.includes('reject')) return 'warning'
  return 'grey'
}

const getModuleColor = (module: string | null) => {
  if (!module) return 'grey'
  const lower = module.toLowerCase()
  if (lower.includes('purchase')) return 'purple'
  if (lower.includes('order') || lower.includes('po')) return 'indigo'
  if (lower.includes('product')) return 'teal'
  if (lower.includes('user') || lower.includes('auth')) return 'blue'
  if (lower.includes('supplier')) return 'orange'
  return 'grey'
}

const handleClose = () => {
  emit('close')
}
</script>

<template>
  <v-dialog
    v-model="dialog"
    :max-width="mobile ? '100%' : '900'"
    scrollable
    @click:outside="handleClose"
    @keydown.esc="handleClose"
  >
    <v-card rounded="lg">
      <v-card-title class="d-flex align-center justify-space-between pa-4">
        <div class="d-flex align-center ga-2">
          <v-icon icon="mdi-text-box-search-outline" color="primary" />
          <span class="text-h6 font-weight-bold">Transaction History</span>
        </div>
        <span v-if="logs.length > 0" class="text-caption text-medium-emphasis">
          {{ logs.length }} log{{ logs.length === 1 ? '' : 's' }} found
        </span>
      </v-card-title>

      <v-divider />

      <v-card-text v-if="logs.length > 0" class="pa-0">
        <v-list class="pa-4" style="display: flex; flex-direction: column; gap: 12px">
          <v-card
            v-for="(log, index) in logs"
            :key="log.id"
            :class="['pa-3', mobile ? '' : 'mx-2']"
            :rounded="mobile ? 'lg' : 'md'"
            :elevation="index === 0 ? 3 : 1"
            :border="index === 0 ? 'primary' : undefined"
          >
            <div class="d-flex align-center ga-2 mb-2">
              <v-chip
                :color="getActionColor(log.action)"
                size="small"
                variant="tonal"
                class="text-capitalize font-weight-medium"
              >
                {{ log.action || '—' }}
              </v-chip>
              <v-chip
                :color="getModuleColor(log.module)"
                size="small"
                variant="outlined"
                class="text-capitalize"
              >
                {{ log.module || '—' }}
              </v-chip>
              <v-spacer />
              <span class="text-caption text-medium-emphasis">
                #{{ log.id }}
              </span>
            </div>

            <div class="text-body-2 mb-2">{{ log.description || '—' }}</div>

            <v-divider class="mb-2" />

            <div class="d-flex flex-wrap align-center ga-3 text-caption text-medium-emphasis">
              <div class="d-flex align-center ga-1">
                <v-icon size="12">mdi-account</v-icon>
                <span>{{ log.created_by_email || '—' }}</span>
              </div>
              <div v-if="log.reference_no" class="d-flex align-center ga-1">
                <v-icon size="12">mdi-hash</v-icon>
                <span>{{ log.reference_no }}</span>
              </div>
              <div class="d-flex align-center ga-1">
                <v-icon size="12">mdi-calendar</v-icon>
                <span>{{ formatDate(log.created_at) }}</span>
              </div>
            </div>
          </v-card>
        </v-list>
      </v-card-text>

      <v-card-text v-else class="text-center pa-8 text-medium-emphasis">
        <v-icon icon="mdi-text-box-search-outline" size="48" color="grey-lighten-1" class="mb-3" />
        <div>No logs found for this transaction</div>
      </v-card-text>

      <v-divider />

      <v-card-actions class="pa-4 d-flex justify-end">
        <v-btn variant="outlined" class="text-none" @click="handleClose">
          Close
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.v-list {
  background: transparent !important;
}
</style>
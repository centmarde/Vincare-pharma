<script setup lang="ts">
import { computed, watch } from 'vue'
import { useDisplay } from 'vuetify'
import { useLogsDataStore } from '@/stores/logsData'
import type { LogType } from '@/stores/logsData'

const props = defineProps<{
  modelValue: boolean
  userId: string
  userEmail: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  close: []
}>()

const logsStore = useLogsDataStore()
const { mobile } = useDisplay()

const dialog = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
})

// Ensure logs are loaded when dialog opens
watch(
  () => props.modelValue,
  async (val: boolean) => {
    if (val && !logsStore.logs.length) {
      await logsStore.fetchLogs()
    }
  },
)

const userLogs = computed(() => {
  return logsStore.logs.filter((log) => log.created_by === props.userId)
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
  if (lower.includes('purchase_requisition') || lower.includes('requisition')) return 'purple'
  if (lower.includes('purchase_order') || lower.includes('po') || lower.includes('order')) return 'indigo'
  if (lower.includes('stock_in') || lower.includes('stock in')) return 'teal'
  if (lower.includes('stock_out') || lower.includes('stock out')) return 'orange'
  if (lower.includes('sale') && !lower.includes('sales_return') && !lower.includes('return')) return 'green'
  if (lower.includes('transfer')) return 'blue'
  if (lower.includes('expense')) return 'red'
  if (lower.includes('purchase_return')) return 'purple'
  if (lower.includes('sales_return') || lower.includes('return')) return 'pink'
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
          <v-icon icon="mdi-account-text-outline" color="primary" />
          <span class="text-h6 font-weight-bold">User Activity Logs</span>
        </div>
        <span class="text-caption text-medium-emphasis">
          {{ userLogs.length }} log{{ userLogs.length === 1 ? '' : 's' }} found
        </span>
      </v-card-title>

      <v-divider />

      <v-card-text v-if="userLogs.length > 0" class="pa-0">
        <v-list class="pa-4" style="display: flex; flex-direction: column; gap: 12px">
          <v-card
            v-for="(log, index) in userLogs"
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
              <div v-if="log.reference_no" class="d-flex align-center ga-1">
                <v-icon size="12">mdi-hash</v-icon>
                <span>{{ log.reference_no }}</span>
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
          </v-card>
        </v-list>
      </v-card-text>

      <v-card-text v-else class="text-center pa-8 text-medium-emphasis">
        <v-icon icon="mdi-account-off-outline" size="48" color="grey-lighten-1" class="mb-3" />
        <div>No logs found for this user</div>
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

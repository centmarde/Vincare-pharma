<script setup lang="ts">
import { computed } from 'vue'
import { useUserVersionLogsDataStore } from '@/stores/userVersionLogsData'

interface Props {
  modelValue: boolean
}

interface Emits {
  (e: 'update:modelValue', value: boolean): void
  (e: 'confirmed'): void
  (e: 'close'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const store = useUserVersionLogsDataStore()

const internalDialog = computed({
  get: () => props.modelValue,
  set: (value: boolean) => {
    // Only allow programmatic close (the store drives opening)
    if (!value) {
      emit('update:modelValue', value)
    }
  },
})

// Only enable the confirm button when there are actually logs to confirm
const isConfirmButtonEnabled = computed(() => store.pendingVersionLogs.length > 0)

const formatDate = (dateString: string) => {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

const closeDialog = async () => {
  // Persist the dismissal so the dialog does not reappear when the user
  // returns to /account/home: mark any pending logs as read first.
  await store.markVersionLogsAsRead()
  store.closeVersionLogsDialog()
  emit('update:modelValue', false)
  emit('close')
}

const confirmRead = async () => {
  const ok = await store.markVersionLogsAsRead()
  if (ok) {
    emit('update:modelValue', false)
    emit('confirmed')
  }
}
</script>


<template>
  <v-dialog v-model="internalDialog" max-width="700" persistent scrollable>
    <v-card class="version-logs-dialog-card">
      <!-- Header -->
      <v-toolbar color="primary" density="compact" class="px-4">
        <v-toolbar-title class="text-h6 font-weight-bold"> What's New </v-toolbar-title>
        <v-spacer />
        <v-btn
          icon="mdi-close"
          variant="text"
          :disabled="store.versionLogConfirming"
          @click="closeDialog"
        />
      </v-toolbar>

      <!-- Scrollable Content Area -->
      <div class="scrollable-content px-6 py-4">
        <v-alert v-if="store.hasVersionLogError" type="error" class="mb-4">
          {{ store.versionLogError }}
        </v-alert>

        <div v-if="store.pendingVersionLogs.length" class="mt-2">
          <div v-for="item in store.pendingVersionLogs" :key="item.id" class="version-log-item mb-6">
            <div class="d-flex align-center mb-1">
              <v-chip size="small" color="primary" variant="flat" class="me-2">
                {{ item.log.version }}
              </v-chip>
              <h3 class="text-h6 font-weight-bold">{{ item.log.title }}</h3>
            </div>

            <div class="text-caption text-medium-emphasis mb-2">
              {{ formatDate(item.log.created_at) }}
            </div>

            <div class="description-text text-body-2">{{ item.log.description }}</div>
          </div>
        </div>
      </div>

      <!-- Sticky Actions -->
      <v-card-actions class="pa-4">
        <v-spacer />
        <v-btn
          color="primary"
          variant="flat"
          :loading="store.versionLogConfirming"
          :disabled="!isConfirmButtonEnabled"
          @click="confirmRead"
        >
          I've Read It
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>



<style scoped>
.version-logs-dialog-card {
  max-height: 85vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.scrollable-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  max-height: calc(85vh - 120px); /* Account for header and actions */
}

.description-text {
  white-space: pre-wrap;
  word-break: break-word;
}

/* Smooth scrolling */
.scrollable-content {
  scroll-behavior: smooth;
}

/* Responsive adjustments */
@media (max-width: 600px) {
  .version-logs-dialog-card {
    max-height: 90vh;
  }

  .scrollable-content {
    max-height: calc(90vh - 110px);
  }
}
</style>

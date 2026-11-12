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
            <!-- Celebratory version badge -->
            <div class="version-badge-wrap">

              <v-icon class="badge-sparkle left" icon="mdi-sparkles" size="22" />
              <v-icon class="badge-sparkle right" icon="mdi-sparkles" size="22" />
              <div class="version-badge">
                <v-icon icon="mdi-party-popper" class="badge-party-icon" />
                <span class="version-number">{{ item.log.version }}</span>
              </div>
            </div>

            <h3 class="text-h6 font-weight-bold mt-3 text-center">{{ item.log.title }}</h3>

            <div class="text-caption text-medium-emphasis mb-2 text-center">
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

/* ── Celebratory version badge ─────────────────────────── */
.version-badge-wrap {
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  margin: 8px 0 12px;
}

.version-badge {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 28px;
  border-radius: 999px;
  color: #fff;
  font-weight: 800;
  background: linear-gradient(135deg, #5c6bc0 0%, #7e57c2 45%, #ec407a 100%);
  box-shadow: 0 8px 24px rgba(126, 87, 194, 0.35);
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  animation: badge-pop 0.55s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

.version-number {
  font-size: 1.9rem;
  line-height: 1;
  letter-spacing: 0.5px;
}

.badge-party-icon {
  font-size: 2rem;
  animation: party-wiggle 1.6s ease-in-out infinite;
  transform-origin: 50% 100%;
}

.badge-sparkle {
  position: absolute;
  top: -14px;
  color: #ffd54f;
  animation: sparkle-float 2s ease-in-out infinite;
}

.badge-sparkle.left {
  left: calc(50% - 118px);
}

.badge-sparkle.right {
  right: calc(50% - 118px);
}


@keyframes badge-pop {
  0% {
    transform: scale(0);
    opacity: 0;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}

@keyframes ribbon-pop {
  0% {
    transform: translateX(50%) scale(0);
    opacity: 0;
  }
  100% {
    transform: translateX(50%) scale(1);
    opacity: 1;
  }
}

@keyframes party-wiggle {
  0%,
  100% {
    transform: rotate(0deg);
  }
  25% {
    transform: rotate(-12deg) scale(1.15);
  }
  75% {
    transform: rotate(12deg) scale(1.15);
  }
}

@keyframes sparkle-float {
  0%,
  100% {
    transform: translateY(0) rotate(0deg);
    opacity: 0.7;
  }
  50% {
    transform: translateY(-8px) rotate(45deg);
    opacity: 1;
  }
}

/* Responsive adjustments */
@media (max-width: 600px) {
  .version-number {
    font-size: 1.5rem;
  }

  .badge-sparkle.left {
    left: calc(50% - 92px);
  }

  .badge-sparkle.right {
    right: calc(50% - 92px);
  }
}
  .version-logs-dialog-card {
    max-height: 90vh;
  }

  .scrollable-content {
    max-height: calc(90vh - 110px);
  }

</style>

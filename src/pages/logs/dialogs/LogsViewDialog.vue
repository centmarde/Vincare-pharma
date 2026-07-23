<script setup lang="ts">
import { computed } from 'vue'
import { useDisplay } from 'vuetify'
import type { LogType } from '@/stores/logsData'
import {
  getReferenceLabel,
  getActionColor,
  getModuleColor,
  getTimelineIcon,
  getTimelineDate,
  getTimelineTime,
} from '../composables/logsHelpers'
import { formatDate } from '@/utils/helpers'

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
        <!-- Custom Timeline — vertical line grows from bottom (oldest) to top (most recent) -->
        <div class="custom-timeline pa-6">
          <div
            v-for="(log, index) in logs"
            :key="log.id"
            class="timeline-item"
          >
            <!-- Left side: date & time -->
            <div class="timeline-opposite">
              <div class="text-caption font-weight-medium text-primary">
                {{ getTimelineDate(log) }}
              </div>
              <div class="text-caption text-medium-emphasis">
                {{ getTimelineTime(log) }}
              </div>
            </div>

            <!-- Center: line (above dot) + dot -->
            <div class="timeline-line-wrapper">
              <!-- Line extends above the dot for all items except the most recent (top) -->
              <div
                v-if="index !== 0"
                class="timeline-line"
              />
              <!-- Spacer so line doesn't collapse on the first item -->
              <div
                v-else
                class="timeline-line-spacer"
              />
              <div
                class="timeline-dot"
                :style="{ backgroundColor: `rgb(var(--v-theme-${index === 0 ? 'success' : getActionColor(log.action)}))` }"
              >
                <v-icon
                  :icon="index === 0 ? 'mdi-check-circle' : getTimelineIcon(log.action)"
                  size="16"
                  color="white"
                />
              </div>
            </div>

            <!-- Right side: content card -->
            <div class="timeline-content">
              <v-card
                :elevation="index === 0 ? 3 : 1"
                :border="index === 0 ? 'primary' : undefined"
                rounded="md"
                class="pa-3"
              >
                <!-- Action + Module chips row -->
                <div class="d-flex align-center ga-2 mb-2">
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
                  <v-spacer />
                  <span class="text-caption text-medium-emphasis">#{{ log.id }}</span>
                </div>

                <!-- Description -->
                <div class="text-body-2 mb-2">{{ log.description || '—' }}</div>

                <v-divider class="mb-2" />

                <!-- Footer metadata -->
                <div class="d-flex flex-wrap align-center ga-3 text-caption text-medium-emphasis">
                  <div class="d-flex align-center ga-1">
                    <v-icon size="12">mdi-account</v-icon>
                    <span>{{ log.created_by_email || '—' }}</span>
                  </div>
                  <div v-if="getReferenceLabel(log)" class="d-flex align-center ga-1">
                    <v-icon size="12">mdi-hash</v-icon>
                    <span>{{ getReferenceLabel(log) }}</span>
                  </div>
                </div>
              </v-card>
            </div>
          </div>
        </div>
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
/* ── Custom Timeline Layout ────────────────────────────────────── */
.custom-timeline {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.timeline-item {
  display: flex;
  align-items: flex-start;
  position: relative;
}

/* Left side: date/time column */
.timeline-opposite {
  width: 90px;
  flex-shrink: 0;
  text-align: right;
  padding-right: 16px;
  padding-top: 6px;
}

/* Center: vertical line + dot */
.timeline-line-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
  width: 36px;
  position: relative;
}

.timeline-line {
  width: 2px;
  flex: 1;
  min-height: 24px;
  background: linear-gradient(
    to bottom,
    rgba(var(--v-border-color), 0.38),
    rgba(var(--v-border-color), 0.12)
  );
}

.timeline-line-spacer {
  flex: 1;
  min-height: 24px;
}

.timeline-dot {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1;
  flex-shrink: 0;
  margin: 4px 0;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
}

/* Right side: content card */
.timeline-content {
  flex: 1;
  min-width: 0;
  padding-left: 16px;
  padding-bottom: 20px;
}

/* ── Mobile responsive ─────────────────────────────────────────── */
@media (max-width: 600px) {
  .custom-timeline {
    padding: 16px 12px !important;
  }

  .timeline-opposite {
    width: 60px;
    padding-right: 8px;
  }

  .timeline-line-wrapper {
    width: 28px;
  }

  .timeline-dot {
    width: 22px;
    height: 22px;
  }

  .timeline-dot :deep(.v-icon) {
    font-size: 12px !important;
  }

  .timeline-content {
    padding-left: 8px;
  }
}
</style>

<script setup lang="ts">
import { onMounted, computed, ref, nextTick, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useLogsDataStore } from '@/stores/logsData'
import type { LogType } from '@/stores/logsData'

// Initialize logs store
const logsStore = useLogsDataStore()
const { logs, loading, error, logsCount, hasLogs, isLoading, hasError } = storeToRefs(logsStore)

// Lazy loading state
const displayedLogs = ref<LogType[]>([])
const loadCount = ref(5) // Initial load count
const hasMoreLogs = computed(() => displayedLogs.value.length < logs.value.length)
const logsContainer = ref<HTMLElement | null>(null)

// Load more logs function
const loadMoreLogs = () => {
  const currentLength = displayedLogs.value.length
  const nextBatch = logs.value.slice(currentLength, currentLength + loadCount.value)
  displayedLogs.value.push(...nextBatch)
}

// Initialize displayed logs when logs change
const initializeLogs = () => {
  displayedLogs.value = logs.value.slice(0, loadCount.value)
}

// Format date for display
const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// Get relative time
const getRelativeTime = (dateString: string) => {
  const now = new Date()
  const date = new Date(dateString)
  const diff = now.getTime() - date.getTime()

  const minutes = Math.floor(diff / (1000 * 60))
  const hours = Math.floor(diff / (1000 * 60 * 60))
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))

  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return formatDate(dateString)
}

// Get type color based on log type
const getTypeColor = (type: string) => {
  const colors: Record<string, string> = {
    'feature': 'success',
    'fix': 'error',
    'update': 'info'
  }
  return colors[type.toLowerCase()] || 'primary'
}

// Get type icon based on log type
const getTypeIcon = (type: string) => {
  const icons: Record<string, string> = {
    'feature': 'mdi-star-plus',
    'fix': 'mdi-wrench',
    'update': 'mdi-update'
  }
  return icons[type.toLowerCase()] || 'mdi-circle'
}

// Refresh logs data
const refreshLogs = async () => {
  await logsStore.fetchLogs()
  initializeLogs() // Reset to initial display
}

// Setup intersection observer for lazy loading
const setupIntersectionObserver = () => {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && hasMoreLogs.value && !isLoading.value) {
          loadMoreLogs()
        }
      })
    },
    {
      rootMargin: '100px' // Load more when 100px before reaching the bottom
    }
  )

  const sentinel = document.querySelector('#load-more-sentinel')
  if (sentinel) {
    observer.observe(sentinel)
  }
}

// Fetch logs on component mount
onMounted(async () => {
  await logsStore.fetchLogs()
  initializeLogs()

  // Setup lazy loading after next tick
  nextTick(() => {
    setupIntersectionObserver()
  })
})

// Watch logs changes to update displayed logs
watch(logs, () => {
  initializeLogs()
}, { deep: true })
</script>

<template>
  <v-card
    elevation="2"
    rounded="lg"
    class="logs-card"
  >

    <!-- Header Section -->
    <v-card-title class="d-flex align-center justify-space-between pa-3 pa-sm-4">
      <div class="d-flex align-center">
        <v-icon
          icon="mdi-text-box-outline"
          class="me-2 d-none d-sm-flex"
          color="primary"
        ></v-icon>
        <span class="text-h6 text-sm-h5">System Updates</span>
      </div>

      <div class="d-flex align-center ga-1 ga-sm-2">
        <v-chip
          :color="hasLogs ? 'primary' : 'secondary'"
          variant="tonal"
          :size="$vuetify.display.mobile ? 'x-small' : 'small'"
          class="d-none d-sm-flex"
        >
          {{ logsCount }} Updates
        </v-chip>

        <!-- Mobile chip -->
        <v-chip
          :color="hasLogs ? 'primary' : 'secondary'"
          variant="tonal"
          size="x-small"
          class="d-sm-none"
        >
          {{ logsCount }}
        </v-chip>

        <v-btn
          icon="mdi-refresh"
          variant="text"
          :size="$vuetify.display.mobile ? 'small' : 'default'"
          :loading="isLoading"
          @click="refreshLogs"
        ></v-btn>
      </div>
    </v-card-title>

    <v-divider></v-divider>

    <!-- Content Section -->
    <v-card-text class="pa-0">
      <!-- Error State -->
      <v-alert
        v-if="hasError"
        type="error"
        variant="tonal"
        class="ma-3 ma-sm-4 mb-0"
        closable
        @click:close="logsStore.clearError"
      >
        <div class="text-body-2 text-sm-body-1">
          {{ error }}
        </div>
      </v-alert>

      <!-- Loading State -->
      <div v-if="isLoading && !hasLogs" class="text-center pa-4 pa-sm-8">
        <v-progress-circular
          indeterminate
          color="primary"
          :size="$vuetify.display.mobile ? '32' : '40'"
        ></v-progress-circular>
        <div class="text-body-2 text-sm-body-1 mt-3 mt-sm-4 text-medium-emphasis">Loading logs...</div>
      </div>

      <!-- Empty State -->
      <div v-else-if="!isLoading && !hasLogs && !hasError" class="text-center pa-4 pa-sm-8">
        <v-icon
          icon="mdi-text-box-outline"
          :size="$vuetify.display.mobile ? '48' : '64'"
          color="grey-lighten-1"
          class="mb-3 mb-sm-4"
        ></v-icon>
        <div class="text-h6 text-sm-h5 text-medium-emphasis mb-2">No logs available</div>
        <div class="text-body-2 text-sm-body-1 text-medium-emphasis mb-3 mb-sm-4">
          There are no logs to display at the moment.
        </div>
        <v-btn
          color="primary"
          variant="outlined"
          :size="$vuetify.display.mobile ? 'small' : 'default'"
          @click="refreshLogs"
        >
          <v-icon icon="mdi-refresh" start :size="$vuetify.display.mobile ? '16' : '20'"></v-icon>
          Refresh
        </v-btn>
      </div>

      <!-- Timeline Layout -->
      <div v-else class="pa-1 pa-sm-2">
        <div class="mx-auto timeline-wrapper">
          <div class="timeline-container">
            <div
              v-for="(log, index) in displayedLogs"
              :key="log.id"
              class="timeline-item"
              :class="{ 'timeline-item--last': index === displayedLogs.length - 1 }"
            >
              <!-- Timeline Line & Dot -->
              <div class="timeline-line">
                <div class="timeline-dot-container">
                  <v-avatar
                    size="32"
                    :color="getTypeColor(log.type)"
                    class="timeline-dot elevation-2"
                  >
                    <v-icon
                      :icon="getTypeIcon(log.type)"
                      color="white"
                      size="16"
                    ></v-icon>
                  </v-avatar>
                </div>
                <div
                  v-if="index < displayedLogs.length - 1"
                  class="timeline-connector"
                ></div>
              </div>

              <!-- Timeline Content -->
              <div class="timeline-content">
                <v-card
                  elevation="2"
                  rounded="lg"
                  class="timeline-card"
                >
                  <!-- Card Header -->
                  <v-card-title class="pa-3 pa-sm-4 pb-2">
                    <div class="d-flex flex-column flex-sm-row align-start align-sm-center justify-space-between w-100 ga-2">
                      <div class="flex-grow-1">
                        <div class="text-subtitle-1 text-sm-h6 font-weight-bold mb-1">
                          {{ log.title }}
                        </div>
                        <!-- Desktop version -->
                        <div class="d-none d-sm-flex align-center text-caption text-medium-emphasis">
                          <v-icon
                            icon="mdi-tag-outline"
                            size="14"
                            class="me-1"
                          ></v-icon>
                          {{ log.version }}
                          <v-divider vertical class="mx-2"></v-divider>
                          <v-icon
                            icon="mdi-clock-outline"
                            size="14"
                            class="me-1"
                          ></v-icon>
                          {{ getRelativeTime(log.created_at) }}
                        </div>
                        <!-- Mobile version -->
                        <div class="d-sm-none text-caption text-medium-emphasis">
                          <div class="mb-1">
                            <v-icon
                              icon="mdi-tag-outline"
                              size="12"
                              class="me-1"
                            ></v-icon>
                            {{ log.version }}
                          </div>
                          <div>
                            <v-icon
                              icon="mdi-clock-outline"
                              size="12"
                              class="me-1"
                            ></v-icon>
                            {{ getRelativeTime(log.created_at) }}
                          </div>
                        </div>
                      </div>

                      <v-chip
                        :color="getTypeColor(log.type)"
                        :size="$vuetify.display.mobile ? 'x-small' : 'small'"
                        variant="tonal"
                        class="text-capitalize flex-shrink-0"
                      >
                        {{ log.type }}
                      </v-chip>
                    </div>
                  </v-card-title>

                  <!-- Card Content -->
                  <v-card-text class="pa-3 pa-sm-4 pt-0">
                    <div class="text-body-2 text-sm-body-1 text-high-emphasis">
                      {{ log.description }}
                    </div>
                  </v-card-text>

                  <!-- Card Footer -->
                  <v-card-actions class="pa-3 pa-sm-4 pt-0">
                    <v-spacer></v-spacer>
                    <div class="d-flex align-center text-caption text-medium-emphasis">
                      <v-icon
                        :icon="$vuetify.display.mobile ? 'mdi-calendar' : 'mdi-calendar'"
                        :size="$vuetify.display.mobile ? '12' : '14'"
                        class="me-1"
                      ></v-icon>
                      <span class="text-caption text-sm-body-2">
                        {{ formatDate(log.created_at) }}
                      </span>
                    </div>
                  </v-card-actions>
                </v-card>
              </div>
            </div>

            <!-- Load More Sentinel for Intersection Observer -->
            <div
              id="load-more-sentinel"
              v-if="hasMoreLogs"
              class="timeline-item timeline-loading"
            >
              <div class="timeline-line">
                <div class="timeline-dot-container">
                  <v-avatar
                    size="32"
                    color="primary"
                    class="timeline-dot elevation-2"
                  >
                    <v-progress-circular
                      v-if="isLoading"
                      indeterminate
                      color="white"
                      size="16"
                      width="2"
                    ></v-progress-circular>
                    <v-icon
                      v-else
                      icon="mdi-dots-horizontal"
                      color="white"
                      size="16"
                    ></v-icon>
                  </v-avatar>
                </div>
              </div>
              <div class="timeline-content">
                <v-card
                  elevation="1"
                  rounded="lg"
                  class="pa-3 pa-sm-4"
                  variant="tonal"
                >
                  <div class="text-center">
                    <div class="text-body-2 text-sm-body-1 text-medium-emphasis">
                      {{ isLoading ? 'Loading more logs...' : 'Scroll to load more...' }}
                    </div>
                  </div>
                </v-card>
              </div>
            </div>

            <!-- End of Timeline Message -->
            <div
              v-if="!hasMoreLogs && displayedLogs.length > 0"
              class="timeline-item timeline-end"
            >
              <div class="timeline-line">
                <div class="timeline-dot-container">
                  <v-avatar
                    size="32"
                    color="success"
                    class="timeline-dot elevation-2"
                  >
                    <v-icon
                      icon="mdi-check-circle-outline"
                      color="white"
                      size="16"
                    ></v-icon>
                  </v-avatar>
                </div>
              </div>
              <div class="timeline-content">
                <v-card
                  elevation="1"
                  rounded="lg"
                  class="pa-3 pa-sm-4"
                  variant="tonal"
                  color="success"
                >
                  <div class="text-center">
                    <div class="text-body-2 text-sm-body-1 text-success">
                      You've seen all {{ logsCount }} logs
                    </div>
                    <div class="text-caption text-sm-body-2 text-medium-emphasis mt-1">
                      Timeline complete
                    </div>
                  </div>
                </v-card>
              </div>
            </div>
          </div>
        </div>
      </div>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.logs-card {
  width: 100%;
  max-width: 100%;
  overflow: hidden;
}

.timeline-container {
  position: relative;
}

.timeline-item {
  display: flex;
  margin-bottom: 1.5rem;
  position: relative;
  width: 100%;
}

.timeline-item--last {
  margin-bottom: 0;
}

.timeline-line {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-right: 1rem;
  z-index: 1;
  min-width: 32px;
}

.timeline-dot-container {
  position: relative;
  z-index: 2;
}

.timeline-dot {
  box-shadow: 0 0 0 4px rgb(var(--v-theme-surface)) !important;
  border: 2px solid rgb(var(--v-theme-background));
}

.timeline-connector {
  width: 2px;
  flex: 1;
  background: linear-gradient(
    to bottom,
    rgb(var(--v-theme-primary)) 0%,
    rgba(var(--v-theme-primary), 0.3) 50%,
    rgba(var(--v-theme-primary), 0.1) 100%
  );
  margin-top: 0.5rem;
  min-height: 2rem;
  border-radius: 1px;
}

.timeline-content {
  flex: 1;
  margin-top: -0.25rem;
}

.timeline-card {
  position: relative;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.timeline-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15) !important;
}

.timeline-card::before {
  content: '';
  position: absolute;
  left: -12px;
  top: 20px;
  width: 0;
  height: 0;
  border-top: 8px solid transparent;
  border-bottom: 8px solid transparent;
  border-right: 12px solid rgb(var(--v-theme-surface));
  z-index: 1;
}

/* Timeline wrapper responsive */
.timeline-wrapper {
  max-width: 100%;
}

/* Responsive adjustments */
@media (min-width: 1280px) {
  .timeline-wrapper {
    max-width: 90%;
  }
}

@media (min-width: 960px) and (max-width: 1279px) {
  .timeline-wrapper {
    max-width: 95%;
  }
}

@media (max-width: 959px) {
  .timeline-wrapper {
    max-width: 100%;
  }
}

/* Small tablets and large phones */
@media (max-width: 768px) {
  .timeline-line {
    margin-right: 0.75rem;
    min-width: 28px;
  }

  .timeline-dot {
    width: 28px !important;
    height: 28px !important;
  }

  .timeline-card::before {
    left: -10px;
    border-right-width: 10px;
    border-top-width: 6px;
    border-bottom-width: 6px;
  }

  .timeline-item {
    margin-bottom: 1.25rem;
  }
}

/* Mobile phones */
@media (max-width: 600px) {
  .timeline-container {
    padding: 0;
  }

  .timeline-line {
    margin-right: 0.5rem;
    min-width: 24px;
  }

  .timeline-dot {
    width: 24px !important;
    height: 24px !important;
  }

  .timeline-card::before {
    left: -8px;
    border-right-width: 8px;
    border-top-width: 5px;
    border-bottom-width: 5px;
    top: 16px;
  }

  .timeline-item {
    margin-bottom: 1rem;
  }

  .timeline-content {
    margin-top: -0.125rem;
  }
}

/* Very small phones */
@media (max-width: 480px) {
  .logs-card {
    margin: 0;
    border-radius: 8px !important;
  }

  .timeline-line {
    margin-right: 0.375rem;
    min-width: 20px;
  }

  .timeline-dot {
    width: 20px !important;
    height: 20px !important;
  }

  .timeline-card {
    border-radius: 8px !important;
  }

  .timeline-card::before {
    left: -6px;
    border-right-width: 6px;
    border-top-width: 4px;
    border-bottom-width: 4px;
    top: 14px;
  }
}/* Dark theme adjustments */
.v-theme--dark .timeline-connector {
  background: linear-gradient(
    to bottom,
    rgb(var(--v-theme-primary)) 0%,
    rgba(var(--v-theme-primary), 0.4) 50%,
    rgba(var(--v-theme-primary), 0.2) 100%
  );
}

.v-theme--dark .timeline-card::before {
  border-right-color: rgb(var(--v-theme-surface));
}

/* Animation for timeline items */
.timeline-item {
  animation: fadeInUp 0.6s ease-out;
  animation-fill-mode: both;
}

.timeline-item:nth-child(1) { animation-delay: 0.1s; }
.timeline-item:nth-child(2) { animation-delay: 0.2s; }
.timeline-item:nth-child(3) { animation-delay: 0.3s; }
.timeline-item:nth-child(4) { animation-delay: 0.4s; }
.timeline-item:nth-child(5) { animation-delay: 0.5s; }

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>

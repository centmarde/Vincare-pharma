<template>
  <v-dialog
    v-model="internalDialog"
    max-width="900"
    scrollable
  >
    <v-card v-if="announcement" class="announcement-detail-card">
      <!-- Header -->
      <v-card-title class="pa-0 sticky-header">
        <v-toolbar
          color="primary"
          density="compact"
          class="px-4"
        >
          <v-toolbar-title class="text-h6 font-weight-bold">
            {{ announcement.title }}
          </v-toolbar-title>

          <v-spacer />

          <v-btn
            icon="mdi-close"
            variant="text"
            @click="closeDialog"
          />
        </v-toolbar>
      </v-card-title>

      <!-- Scrollable Content Area -->
      <div class="scrollable-content">
        <!-- Image Section -->
      <div v-if="announcement.image_url" class="image-section">
        <v-img
          :src="announcement.image_url"
          max-height="400"
          cover
          class="announcement-detail-image"
        >
          <template v-slot:error>
            <div class="d-flex align-center justify-center fill-height bg-grey-lighten-3">
              <v-icon
                icon="mdi-image-broken-variant"
                size="64"
                color="grey-lighten-1"
              />
            </div>
          </template>

          <template v-slot:placeholder>
            <div class="d-flex align-center justify-center fill-height">
              <v-progress-circular
                indeterminate
                color="primary"
              />
            </div>
          </template>
        </v-img>
      </div>

      <!-- Content -->
      <v-card-text class="pa-6">
        <!-- Title (repeated for emphasis) -->
        <h2 class="text-h5 font-weight-bold mb-4">
          {{ announcement.title }}
        </h2>

        <!-- Description -->
        <div class="announcement-description mb-6">
          <p class="text-body-1 line-height-1-6">
            {{ announcement.description }}
          </p>
        </div>

        <!-- Metadata -->
        <v-divider class="my-4" />

        <div class="metadata-section">
          <v-row>
            <v-col cols="12" sm="6">
              <div class="d-flex align-center">
                <v-icon
                  icon="mdi-calendar"
                  size="20"
                  color="primary"
                  class="me-2"
                />
                <div>
                  <div class="text-caption text-medium-emphasis">Created</div>
                  <div class="text-body-2 font-weight-medium">
                    {{ formatDetailDate(announcement.created_at) }}
                  </div>
                </div>
              </div>
            </v-col>

            <v-col cols="12" sm="6">
              <div class="d-flex align-center">
                <v-icon
                  icon="mdi-image"
                  size="20"
                  color="success"
                  class="me-2"
                />
                <div>
                  <div class="text-caption text-medium-emphasis">Image Status</div>
                  <div class="text-body-2 font-weight-medium">
                    {{ announcement.image_url ? 'Has Image' : 'Text Only' }}
                  </div>
                </div>
              </div>
            </v-col>
          </v-row>
        </div>
      </v-card-text>
      </div>
      <!-- End Scrollable Content Area -->

      <!-- Sticky Actions -->
      <v-card-actions class="pa-6 pt-0 sticky-actions">
        <v-spacer />

        <v-btn
          variant="outlined"
          @click="closeDialog"
        >
          Close
        </v-btn>

        <v-btn
          color="primary"
          variant="flat"
          prepend-icon="mdi-pencil"
          @click="editAnnouncement"
        >
          Edit
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { AnnouncementType } from '@/stores/announcementsData'

interface Props {
  modelValue: boolean
  announcement?: AnnouncementType
}

interface Emits {
  (e: 'update:modelValue', value: boolean): void
  (e: 'edit', announcement: AnnouncementType): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const internalDialog = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
})

const formatDetailDate = (dateString: string) => {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const closeDialog = () => {
  internalDialog.value = false
}

const editAnnouncement = () => {
  if (props.announcement) {
    emit('edit', props.announcement)
    closeDialog()
  }
}
</script>

<style scoped>
.announcement-detail-card {
  max-height: 85vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.sticky-header {
  position: sticky;
  top: 0;
  z-index: 10;
  background: white;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.scrollable-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  max-height: calc(85vh - 120px); /* Account for header and actions */
}

.sticky-actions {
  position: sticky;
  bottom: 0;
  z-index: 10;
  background: white;
  border-top: 1px solid rgba(var(--v-border-color), 0.12);
  box-shadow: 0 -2px 4px rgba(0, 0, 0, 0.05);
}

.image-section {
  position: relative;
  overflow: hidden;
  flex-shrink: 0;
}

.announcement-detail-image {
  transition: transform 0.3s ease-in-out;
}

.announcement-description {
  white-space: pre-wrap;
  word-break: break-word;
}

.line-height-1-6 {
  line-height: 1.6;
}

.metadata-section {
  background: rgba(var(--v-theme-surface-variant), 0.3);
  border-radius: 8px;
  padding: 16px;
}

/* Custom scrollbar styling */
.scrollable-content::-webkit-scrollbar {
  width: 6px;
}

.scrollable-content::-webkit-scrollbar-track {
  background: rgba(var(--v-theme-surface-variant), 0.3);
  border-radius: 3px;
}

.scrollable-content::-webkit-scrollbar-thumb {
  background: rgba(var(--v-theme-primary), 0.5);
  border-radius: 3px;
}

.scrollable-content::-webkit-scrollbar-thumb:hover {
  background: rgba(var(--v-theme-primary), 0.7);
}

/* Smooth scrolling */
.scrollable-content {
  scroll-behavior: smooth;
}

/* Responsive adjustments */
@media (max-width: 600px) {
  .announcement-detail-card {
    max-height: 90vh;
  }

  .scrollable-content {
    max-height: calc(90vh - 110px);
  }
}
</style>

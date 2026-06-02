<template>
  <div class="home-announcements mt-6">
    <!-- Header Section -->
    <div class="announcements-header mb-6">
      <div class="d-flex align-center justify-space-between">
        <div>
          <h2 class="text-h5 font-weight-bold mb-2">
            <v-icon icon="mdi-bullhorn" class="me-2" color="primary" />
            Latest Announcements
          </h2>
          <p class="text-body-2 text-medium-emphasis">
            Stay updated with the latest news and updates
          </p>
        </div>

        <v-chip
          v-if="announcements.length > 0"
          color="primary"
          variant="tonal"
          size="small"
        >
          {{ announcements.length }} {{ announcements.length === 1 ? 'Announcement' : 'Announcements' }}
        </v-chip>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="announcementsStore.isLoading" class="text-center py-8">
      <v-progress-circular
        indeterminate
        color="primary"
        size="48"
      />
      <p class="mt-3 text-subtitle-1">Loading announcements...</p>
    </div>

    <!-- Empty State -->
    <div v-else-if="announcements.length === 0" class="empty-state text-center py-12">
      <v-icon
        icon="mdi-bullhorn-outline"
        size="64"
        color="grey-lighten-1"
        class="mb-4"
      />
      <h3 class="text-h6 mb-2">No announcements available</h3>
      <p class="text-body-2 text-medium-emphasis">
        Check back later for new updates and announcements.
      </p>
    </div>

    <!-- Announcements Carousel -->
    <div v-else class="announcements-carousel">
      <v-carousel
        v-model="currentSlide"
        height="400"
        hide-delimiter-background
        show-arrows="hover"
        cycle
        interval="6000"
        class="rounded-lg"
      >
        <v-carousel-item
          v-for="(announcement, index) in announcements"
          :key="announcement.id"
          class="carousel-item"
        >
          <v-card
            class="announcement-slide fill-height"
            :class="{ 'has-image': announcement.image_url }"
            @click="viewAnnouncement(announcement)"
          >
            <!-- Background Image -->
            <div
              v-if="announcement.image_url"
              class="slide-background"
              :style="{
                backgroundImage: `url(${announcement.image_url})`,
              }"
            >
              <div class="slide-overlay" />
            </div>

            <!-- Content -->
            <v-card-text class="slide-content d-flex flex-column justify-end pa-6">
              <div class="content-wrapper">
                <!-- Badge -->
                <div class="mb-3">
                  <v-chip
                    color="white"
                    text-color="primary"
                    variant="elevated"
                    size="small"
                    class="mb-2"
                  >
                    <v-icon start icon="mdi-bullhorn" />
                    Announcement
                  </v-chip>
                </div>

                <!-- Title -->
                <h3 class="slide-title text-h5 font-weight-bold mb-3 text-white">
                  {{ announcement.title }}
                </h3>

                <!-- Description -->
                <p class="slide-description text-body-1 mb-4 text-white line-clamp-3">
                  {{ announcement.description }}
                </p>

                <!-- Metadata -->
                <div class="slide-meta d-flex align-center justify-space-between">
                  <div class="d-flex align-center text-white">
                    <v-icon icon="mdi-calendar" size="16" class="me-1" />
                    <span class="text-caption">
                      {{ formatDate(announcement.created_at) }}
                    </span>
                  </div>

                  <v-btn
                    variant="elevated"
                    color="white"
                    size="small"
                    @click.stop="viewAnnouncement(announcement)"
                  >
                    Read More
                    <v-icon end icon="mdi-arrow-right" />
                  </v-btn>
                </div>
              </div>
            </v-card-text>
          </v-card>
        </v-carousel-item>
      </v-carousel>

      <!-- Custom Navigation Dots -->
      <div class="custom-indicators mt-4">
        <div class="d-flex justify-center align-center">
          <v-btn
            v-for="(announcement, index) in announcements"
            :key="`dot-${index}`"
            :class="{ 'active-dot': index === currentSlide }"
            class="indicator-dot mx-1"
            icon
            size="x-small"
            variant="text"
            @click="currentSlide = index"
          >
            <v-icon
              :icon="index === currentSlide ? 'mdi-circle' : 'mdi-circle-outline'"
              :color="index === currentSlide ? 'primary' : 'grey-lighten-1'"
              size="12"
            />
          </v-btn>
        </div>
      </div>


    </div>

    <!-- Detail Dialog -->
    <v-dialog
      v-model="showDetailDialog"
      max-width="800"
      scrollable
    >
      <v-card v-if="selectedAnnouncement" class="announcement-detail">
        <!-- Header -->
        <v-card-title class="pa-0">
          <v-toolbar color="primary" density="compact" class="px-4">
            <v-toolbar-title class="text-h6 font-weight-bold">
              {{ selectedAnnouncement.title }}
            </v-toolbar-title>
            <v-spacer />
            <v-btn icon="mdi-close" variant="text" @click="closeDetailDialog" />
          </v-toolbar>
        </v-card-title>

        <!-- Image -->
        <div v-if="selectedAnnouncement.image_url" class="detail-image-section">
          <v-img
            :src="selectedAnnouncement.image_url"
            max-height="300"
            cover
            class="detail-image"
          >
            <template v-slot:error>
              <div class="d-flex align-center justify-center fill-height bg-grey-lighten-3">
                <v-icon icon="mdi-image-broken-variant" size="48" color="grey-lighten-1" />
              </div>
            </template>
          </v-img>
        </div>

        <!-- Content -->
        <v-card-text class="pa-6">
          <h3 class="text-h5 font-weight-bold mb-4">
            {{ selectedAnnouncement.title }}
          </h3>

          <div class="announcement-description mb-4">
            <p class="text-body-1 line-height-1-6">
              {{ selectedAnnouncement.description }}
            </p>
          </div>

          <!-- Metadata -->
          <v-divider class="my-4" />
          <div class="metadata-row">
            <div class="d-flex align-center">
              <v-icon icon="mdi-calendar" size="20" color="primary" class="me-2" />
              <div>
                <div class="text-caption text-medium-emphasis">Published</div>
                <div class="text-body-2 font-weight-medium">
                  {{ formatDetailDate(selectedAnnouncement.created_at) }}
                </div>
              </div>
            </div>
          </div>
        </v-card-text>

        <!-- Actions -->
        <v-card-actions class="pa-6 pt-0">
          <v-spacer />
          <v-btn variant="outlined" @click="closeDetailDialog">
            Close
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAnnouncementsDataStore } from '@/stores/announcementsData'
import type { AnnouncementType } from '@/stores/announcementsData'

// Store
const announcementsStore = useAnnouncementsDataStore()

// Reactive state
const currentSlide = ref(0)
const showDetailDialog = ref(false)
const selectedAnnouncement = ref<AnnouncementType | undefined>(undefined)

// Computed properties
const announcements = computed(() => {
  // Get the first 5 announcements for carousel
  return announcementsStore.announcements.slice(0, 5)
})

const announcementsWithImages = computed(() => {
  return announcements.value.filter(a => a.image_url).length
})

// Methods
const formatDate = (dateString: string) => {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

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

const viewAnnouncement = (announcement: AnnouncementType) => {
  selectedAnnouncement.value = announcement
  showDetailDialog.value = true
}

const closeDetailDialog = () => {
  showDetailDialog.value = false
  selectedAnnouncement.value = undefined
}

// Lifecycle
onMounted(async () => {
  await announcementsStore.fetchAnnouncements(true)
})
</script>

<style scoped>
.home-announcements {
  width: 100%;
}

.announcements-header {
  padding: 0 16px;
}

.empty-state {
  background: rgba(var(--v-theme-surface-variant), 0.3);
  border-radius: 12px;
  margin: 16px;
}

.announcements-carousel {
  position: relative;
}

.carousel-item {
  position: relative;
  cursor: pointer;
}

.announcement-slide {
  position: relative;
  overflow: hidden;
  border-radius: 12px !important;
  transition: transform 0.3s ease;
}

.announcement-slide:hover {
  transform: scale(1.02);
}

.announcement-slide.has-image {
  background: linear-gradient(135deg, rgba(var(--v-theme-primary), 0.8), rgba(var(--v-theme-secondary), 0.8));
}

.announcement-slide:not(.has-image) {
  background: linear-gradient(135deg, rgba(var(--v-theme-primary), 0.9), rgba(var(--v-theme-secondary), 0.9));
}

.slide-background {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
}

.slide-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(
    to bottom,
    rgba(0, 0, 0, 0.2) 0%,
    rgba(0, 0, 0, 0.6) 70%,
    rgba(0, 0, 0, 0.8) 100%
  );
}

.slide-content {
  position: relative;
  z-index: 2;
  height: 100%;
}

.content-wrapper {
  background: rgba(0, 0, 0, 0.3);
  border-radius: 12px;
  padding: 24px;
  backdrop-filter: blur(10px);
}

.slide-title {
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
}

.slide-description {
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
}

.line-clamp-3 {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-clamp: 3;
}

.custom-indicators {
  margin-top: 16px;
}

.indicator-dot {
  min-width: 24px !important;
  min-height: 24px !important;
}

.stats-section {
  background: rgba(var(--v-theme-surface-variant), 0.3);
  border-radius: 12px;
  padding: 16px;
  margin: 0 16px;
}

.detail-image-section {
  position: relative;
  overflow: hidden;
}

.detail-image {
  transition: transform 0.3s ease-in-out;
}

.announcement-description {
  white-space: pre-wrap;
  word-break: break-word;
}

.line-height-1-6 {
  line-height: 1.6;
}

.metadata-row {
  background: rgba(var(--v-theme-surface-variant), 0.3);
  border-radius: 8px;
  padding: 16px;
}

/* Carousel custom styling */
:deep(.v-carousel) {
  border-radius: 12px;
  overflow: hidden;
}

:deep(.v-carousel__controls) {
  background: transparent;
}

:deep(.v-btn--icon) {
  backdrop-filter: blur(10px);
  background: rgba(255, 255, 255, 0.2);
}

/* Responsive design */
@media (max-width: 960px) {
  .content-wrapper {
    padding: 16px;
  }

  .slide-title {
    font-size: 1.25rem !important;
  }
}

@media (max-width: 600px) {
  .announcements-header {
    padding: 0 8px;
  }

  .stats-section {
    margin: 0 8px;
  }
}
</style>

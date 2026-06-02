<template>
  <InnerLayoutWrapper>
    <template #content>
      <div class="announcements-view">
    <!-- Page Header -->
    <v-container fluid class="pa-0 mt-5">
      <v-row class="ma-0 mb-4">
        <v-col cols="12" class="pa-4">
          <div class="d-flex align-center justify-space-between">
            <div>
              <h1 class="text-h4 font-weight-bold mb-1">Announcements Management</h1>
              <p class="text-subtitle-1 text-medium-emphasis">
                Create, edit, and manage system announcements
              </p>
            </div>
            <v-btn
              color="primary"
              variant="flat"
              size="large"
              prepend-icon="mdi-plus"
              @click="openCreateDialog"
            >
              New Announcement
            </v-btn>
          </div>
        </v-col>
      </v-row>
    </v-container>



    <!-- Search -->
    <v-container fluid class="pa-0">
      <v-row class="ma-0 mb-4">
        <v-col cols="12" class="pa-4">
          <v-card class="pa-4">
            <v-row>
              <v-col cols="12" md="8">
                <v-text-field
                  v-model="searchQuery"
                  label="Search announcements by title or description"
                  prepend-inner-icon="mdi-magnify"
                  variant="outlined"
                  clearable
                  density="compact"
                />
              </v-col>
              <v-col cols="12" md="4">
                <v-btn
                  @click="clearSearch"
                  variant="outlined"
                  color="primary"
                  block
                  density="comfortable"
                >
                  Clear Search
                </v-btn>
              </v-col>
            </v-row>
          </v-card>
        </v-col>
      </v-row>
    </v-container>

    <!-- Announcements Cards -->
    <v-container fluid class="pa-0">
      <v-row class="ma-0">
        <v-col cols="12" class="pa-4">
          <!-- Loading State -->
          <div v-if="announcementsStore.isLoading" class="text-center py-8">
            <v-progress-circular
              indeterminate
              color="primary"
              size="64"
            />
            <p class="mt-4 text-subtitle-1">Loading announcements...</p>
          </div>

          <!-- Empty State -->
          <div v-else-if="filteredAnnouncements.length === 0" class="text-center py-12">
            <v-icon
              icon="mdi-bullhorn-outline"
              size="64"
              color="grey-lighten-1"
              class="mb-4"
            />
            <h3 class="text-h6 mb-2">No announcements found</h3>
            <p class="text-body-2 text-medium-emphasis mb-4">
              {{ searchQuery ? 'No announcements match your search criteria.' : 'Create your first announcement to get started.' }}
            </p>
            <v-btn
              v-if="!searchQuery"
              color="primary"
              variant="flat"
              prepend-icon="mdi-plus"
              @click="openCreateDialog"
            >
              Create Announcement
            </v-btn>
          </div>

          <!-- Announcements Grid -->
          <div v-else>
            <v-row>
              <v-col
                v-for="announcement in displayedAnnouncements"
                :key="announcement.id"
                cols="12"
                sm="6"
                lg="4"
                xl="3"
              >
                <v-card
                  class="announcement-card h-100"
                  variant="outlined"
                  hover
                  @click="viewAnnouncement(announcement)"
                >
                  <!-- Image Section -->
                  <div class="image-container">
                    <v-img
                      v-if="announcement.image_url"
                      :src="announcement.image_url"
                      height="200"
                      cover
                      class="announcement-image"
                    >
                      <template v-slot:error>
                        <div class="d-flex align-center justify-center fill-height">
                          <v-icon
                            icon="mdi-image-broken-variant"
                            size="48"
                            color="grey-lighten-1"
                          />
                        </div>
                      </template>
                    </v-img>

                    <!-- Placeholder for no image -->
                    <div
                      v-else
                      class="no-image-placeholder d-flex align-center justify-center"
                    >
                      <v-icon
                        icon="mdi-image-outline"
                        size="48"
                        color="grey-lighten-1"
                      />
                    </div>
                  </div>

                  <!-- Content Section -->
                  <v-card-text class="pa-4">
                    <h3 class="text-h6 mb-2 line-clamp-2">
                      {{ announcement.title }}
                    </h3>

                    <p class="text-body-2 text-medium-emphasis line-clamp-3 mb-3">
                      {{ announcement.description }}
                    </p>

                    <!-- Metadata -->
                    <div class="d-flex align-center justify-space-between text-caption text-medium-emphasis">
                      <span>
                        <v-icon start size="16">mdi-calendar</v-icon>
                        {{ formatDate(announcement.created_at) }}
                      </span>

                      <v-chip
                        :color="announcement.image_url ? 'success' : 'secondary'"
                        variant="tonal"
                        size="x-small"
                      >
                        {{ announcement.image_url ? 'With Image' : 'Text Only' }}
                      </v-chip>
                    </div>
                  </v-card-text>

                  <!-- Actions -->
                  <v-card-actions class="pa-4 pt-0">
                    <v-tooltip text="Click to view details">
                      <template v-slot:activator="{ props }">
                        <v-btn
                          v-bind="props"
                          variant="text"
                          color="primary"
                          prepend-icon="mdi-eye"
                          @click.stop="viewAnnouncement(announcement)"
                        >
                          View Details
                        </v-btn>
                      </template>
                    </v-tooltip>

                    <v-spacer />

                    <v-tooltip text="Edit Announcement">
                      <template v-slot:activator="{ props }">
                        <v-btn
                          v-bind="props"
                          icon="mdi-pencil"
                          size="small"
                          variant="text"
                          color="primary"
                          @click.stop="editAnnouncement(announcement)"
                        />
                      </template>
                    </v-tooltip>

                    <v-tooltip text="Delete Announcement">
                      <template v-slot:activator="{ props }">
                        <v-btn
                          v-bind="props"
                          icon="mdi-delete"
                          size="small"
                          variant="text"
                          color="error"
                          @click.stop="deleteAnnouncement(announcement.id)"
                        />
                      </template>
                    </v-tooltip>
                  </v-card-actions>
                </v-card>
              </v-col>
            </v-row>

            <!-- Load More Section -->
            <div class="text-center mt-6">
              <div v-if="announcementsStore.loadingMore" class="py-4">
                <v-progress-circular
                  indeterminate
                  color="primary"
                  size="48"
                />
                <p class="mt-3 text-subtitle-1">Loading more announcements...</p>
              </div>

              <v-btn
                v-else-if="announcementsStore.hasMore && !searchQuery"
                color="primary"
                variant="outlined"
                size="large"
                prepend-icon="mdi-reload"
                @click="loadMoreAnnouncements"
                :disabled="announcementsStore.loadingMore"
              >
                Load More
              </v-btn>

              <div v-else-if="!announcementsStore.hasMore && !searchQuery" class="py-4">
                <v-icon
                  icon="mdi-check-circle"
                  color="success"
                  size="48"
                  class="mb-2"
                />
                <p class="text-subtitle-1 text-medium-emphasis">All announcements loaded</p>
              </div>
            </div>
          </div>
        </v-col>
      </v-row>
    </v-container>



    <!-- Error Alert -->
    <v-snackbar
      v-model="announcementsStore.hasError"
      color="error"
      timeout="5000"
      location="top"
    >
      {{ announcementsStore.error }}
      <template v-slot:actions>
        <v-btn @click="announcementsStore.clearError" variant="text" color="white">
          Close
        </v-btn>
      </template>
    </v-snackbar>

    <!-- Create/Edit Dialog Component -->
    <AnnouncementCreateEditDialog
      v-model="showDialog"
      :is-editing="isEditing"
      :announcement="currentAnnouncement"
      :loading="announcementsStore.isLoading"
      @save="handleSaveAnnouncement"
      @cancel="handleCancelDialog"
    />

    <!-- Delete Confirmation Dialog Component -->
    <AnnouncementDeleteConfirmationDialog
      v-model="showDeleteDialog"
      :loading="announcementsStore.isLoading"
      :announcement-title="announcementToDelete?.title || ''"
      @confirm="handleConfirmDelete"
      @cancel="handleCancelDelete"
    />

    <!-- Detail View Dialog Component -->
    <AnnouncementDetailDialog
      v-model="showDetailDialog"
      :announcement="selectedAnnouncement"
      @edit="handleEditFromDetail"
    />
      </div>
    </template>
  </InnerLayoutWrapper>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useAnnouncementsDataStore } from '@/stores/announcementsData'
import { useAuthUserStore } from '@/stores/authUser'
import { useToast } from 'vue-toastification'
import type { AnnouncementType } from '@/stores/announcementsData'
import InnerLayoutWrapper from '@/layouts/InnerLayoutWrapper.vue'
import AnnouncementCreateEditDialog from './dialogs/AnnouncementCreateEditDialog.vue'
import AnnouncementDeleteConfirmationDialog from './dialogs/AnnouncementDeleteConfirmationDialog.vue'
import AnnouncementDetailDialog from './dialogs/AnnouncementDetailDialog.vue'

// Stores
const announcementsStore = useAnnouncementsDataStore()
const authStore = useAuthUserStore()
const toast = useToast()

// Reactive state
const showDialog = ref(false)
const showDeleteDialog = ref(false)
const showDetailDialog = ref(false)
const isEditing = ref(false)
const searchQuery = ref('')
const deleteId = ref<number | undefined>(undefined)
const announcementToDelete = ref<AnnouncementType | undefined>(undefined)
const selectedAnnouncement = ref<AnnouncementType | undefined>(undefined)

const currentAnnouncement = ref<AnnouncementType | undefined>(undefined)

// Table headers
const headers = [
  { title: 'Title', key: 'title', sortable: true },
  { title: 'Description', key: 'description', sortable: false },
  { title: 'Has Image', key: 'image_url', sortable: true },
  { title: 'Created', key: 'created_at', sortable: true },
  { title: 'Actions', key: 'actions', sortable: false, width: 100 }
]

// Form validation rules
const rules = {
  required: (value: string) => !!value || 'This field is required'
}

// Computed properties
const filteredAnnouncements = computed(() => {
  if (!searchQuery.value) {
    return announcementsStore.announcements
  }
  return announcementsStore.searchAnnouncements(searchQuery.value)
})

const displayedAnnouncements = computed(() => {
  return filteredAnnouncements.value
})





// Methods
const openCreateDialog = () => {
  isEditing.value = false
  currentAnnouncement.value = undefined
  showDialog.value = true
}

const editAnnouncement = (announcement: AnnouncementType) => {
  isEditing.value = true
  currentAnnouncement.value = announcement
  showDialog.value = true
}

const viewAnnouncement = (announcement: AnnouncementType) => {
  selectedAnnouncement.value = announcement
  showDetailDialog.value = true
}

const handleEditFromDetail = (announcement: AnnouncementType) => {
  editAnnouncement(announcement)
}

const loadMoreAnnouncements = async () => {
  try {
    await announcementsStore.loadMoreAnnouncements()
  } catch (error) {
    console.error('Error loading more announcements:', error)
    toast.error('Failed to load more announcements')
  }
}

const clearSearch = () => {
  searchQuery.value = ''
}

const formatDate = (dateString: string) => {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

const handleSaveAnnouncement = async (data: { id?: number; title: string; description: string; image_url: string }) => {
  try {
    if (isEditing.value && data.id) {
      // Update existing announcement
      const updateData = {
        title: data.title,
        description: data.description,
        image_url: data.image_url || ''
      }

      const result = await announcementsStore.updateAnnouncement(data.id, updateData)

      if (result) {
        toast.success('Announcement updated successfully!')
        showDialog.value = false
      }
    } else {
      // Create new announcement
      const currentUser = await authStore.getCurrentUser()

      const createData = {
        title: data.title,
        description: data.description,
        image_url: data.image_url || '',
        user_id: currentUser?.user?.id || ''
      }

      const result = await announcementsStore.createAnnouncement(createData)

      if (result) {
        toast.success('Announcement created successfully!')
        showDialog.value = false
      }
    }
  } catch (error) {
    console.error('Error saving announcement:', error)
  }
}

const handleCancelDialog = () => {
  showDialog.value = false
  currentAnnouncement.value = undefined
}

const deleteAnnouncement = (id: number) => {
  // Find the announcement to delete for showing its title
  announcementToDelete.value = announcementsStore.announcements.find(a => a.id === id)
  deleteId.value = id
  showDeleteDialog.value = true
}

const handleConfirmDelete = async () => {
  if (deleteId.value !== undefined) {
    const success = await announcementsStore.deleteAnnouncement(deleteId.value)

    if (success) {
      toast.success('Announcement deleted successfully!')
      deleteId.value = undefined
      announcementToDelete.value = undefined
      showDeleteDialog.value = false
    }
  }
}

const handleCancelDelete = () => {
  deleteId.value = undefined
  announcementToDelete.value = undefined
  showDeleteDialog.value = false
}

// Functions moved up to avoid duplication

// Lifecycle
onMounted(async () => {
  await announcementsStore.fetchAnnouncements(true) // Reset and fetch first page
})

// Add infinite scroll functionality
let infiniteScrollTimeout: ReturnType<typeof setTimeout> | null = null

const handleScroll = () => {
  if (infiniteScrollTimeout) clearTimeout(infiniteScrollTimeout)

  infiniteScrollTimeout = setTimeout(() => {
    const { scrollTop, scrollHeight, clientHeight } = document.documentElement

    // Trigger load more when user scrolls to within 300px of bottom
    if (scrollTop + clientHeight >= scrollHeight - 300) {
      if (announcementsStore.hasMore && !announcementsStore.loadingMore && !searchQuery.value) {
        loadMoreAnnouncements()
      }
    }
  }, 100) // Debounce scroll events
}

onMounted(() => {
  window.addEventListener('scroll', handleScroll)
})

onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll)
  if (infiniteScrollTimeout) clearTimeout(infiniteScrollTimeout)
})
</script>

<style scoped>
.announcements-view {
  min-height: 100vh;
  background-color: rgb(var(--v-theme-background));
}

.v-card {
  border-radius: 12px !important;
}

.v-chip {
  font-weight: 500;
}

.announcement-card {
  transition: transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out;
  cursor: pointer;
}

.announcement-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.12);
}

.image-container {
  position: relative;
  overflow: hidden;
}

.no-image-placeholder {
  height: 200px;
  background: rgba(var(--v-theme-surface-variant), 0.3);
  border-bottom: 1px solid rgba(var(--v-border-color), 0.12);
}

.announcement-image {
  transition: transform 0.3s ease-in-out;
}

.announcement-card:hover .announcement-image {
  transform: scale(1.05);
}

.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  line-clamp: 2;
  overflow: hidden;
}

.line-clamp-3 {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  line-clamp: 3;
  overflow: hidden;
}

.text-truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>

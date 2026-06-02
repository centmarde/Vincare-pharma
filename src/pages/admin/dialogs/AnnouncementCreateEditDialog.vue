<template>
  <v-dialog v-model="show" max-width="800px" persistent>
    <v-card>
      <v-card-title class="text-h5 pa-6">
        {{ isEditing ? 'Edit Announcement' : 'Create New Announcement' }}
      </v-card-title>

      <v-card-text class="pa-6">
        <v-form ref="form" v-model="valid">
          <v-row>
            <v-col cols="12">
              <v-text-field
                v-model="formData.title"
                label="Title *"
                variant="outlined"
                :rules="[rules.required]"
              />
            </v-col>

            <v-col cols="12">
              <v-textarea
                v-model="formData.description"
                label="Description *"
                variant="outlined"
                rows="4"
                :rules="[rules.required]"
              />
            </v-col>

            <v-col cols="12">
              <v-label class="text-subtitle-2 font-weight-medium mb-2">
                Announcement Image (Optional)
              </v-label>

              <!-- Image Upload Area -->
              <v-card
                variant="outlined"
                class="pa-4 upload-area"
                :class="{ 'dragover': isDragOver }"
                @drop="handleDrop"
                @dragover.prevent="isDragOver = true"
                @dragleave="isDragOver = false"
                @click="triggerFileInput"
              >
                <input
                  ref="fileInput"
                  type="file"
                  accept="image/*"
                  style="display: none"
                  @change="handleFileSelect"
                />

                <!-- Upload content -->
                <div class="text-center">
                  <!-- Show existing image if editing -->
                  <div v-if="imagePreview" class="mb-4">
                    <v-img
                      :src="imagePreview"
                      max-height="200"
                      max-width="300"
                      class="mx-auto rounded"
                      cover
                    />
                    <v-btn
                      icon="mdi-delete"
                      size="small"
                      color="error"
                      variant="outlined"
                      class="mt-2"
                      @click.stop="removeImage"
                    />
                  </div>

                  <!-- Upload prompt -->
                  <div v-if="!imagePreview">
                    <v-icon
                      icon="mdi-cloud-upload"
                      size="48"
                      color="primary"
                      class="mb-2"
                    />
                    <p class="text-body-1 mb-2">
                      <strong>Click to upload</strong> or drag and drop
                    </p>
                    <p class="text-caption text-medium-emphasis">
                      PNG, JPG, GIF up to 5MB
                    </p>
                  </div>

                  <!-- Upload progress -->
                  <div v-if="uploading" class="mt-4">
                    <v-progress-linear
                      :model-value="uploadProgress"
                      color="primary"
                      height="4"
                      rounded
                    />
                    <p class="text-caption mt-2">Uploading... {{ uploadProgress }}%</p>
                  </div>
                </div>
              </v-card>
            </v-col>
          </v-row>
        </v-form>
      </v-card-text>

      <v-card-actions class="pa-6">
        <v-spacer />
        <v-btn @click="handleCancel" variant="outlined" :disabled="loading">
          Cancel
        </v-btn>
        <v-btn
          @click="handleSave"
          color="primary"
          :disabled="!valid || loading"
          :loading="loading"
        >
          {{ isEditing ? 'Update' : 'Create' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { supabase } from '@/lib/supabase'
import { useToast } from 'vue-toastification'
import type { AnnouncementType } from '@/stores/announcementsData'

// Props
type Props = {
  modelValue: boolean
  isEditing?: boolean
  announcement?: AnnouncementType | undefined
  loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: false,
  isEditing: false,
  announcement: undefined,
  loading: false
})

// Emits
type Emits = {
  'update:modelValue': [value: boolean]
  save: [data: { id?: number; title: string; description: string; image_url: string }]
  cancel: []
}

const emit = defineEmits<Emits>()

// Services
const toast = useToast()

// Reactive state
const valid = ref(false)
const form = ref()
const fileInput = ref()

// Image upload state
const isDragOver = ref(false)
const imagePreview = ref<string | null>(null)
const uploading = ref(false)
const uploadProgress = ref(0)
const selectedFile = ref<File | null>(null)

const formData = ref({
  id: 0,
  title: '',
  description: '',
  image_url: ''
})

// Computed
const show = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
})

// Form validation rules
const rules = {
  required: (value: string) => !!value || 'This field is required'
}

// Watch for changes in announcement prop to populate form
watch(
  () => props.announcement,
  (newAnnouncement) => {
    if (newAnnouncement && props.isEditing) {
      formData.value = {
        id: newAnnouncement.id,
        title: newAnnouncement.title,
        description: newAnnouncement.description,
        image_url: newAnnouncement.image_url || ''
      }
      // Set image preview if URL exists
      if (newAnnouncement.image_url) {
        imagePreview.value = newAnnouncement.image_url
      }
    } else {
      // Reset form for new announcement
      formData.value = {
        id: 0,
        title: '',
        description: '',
        image_url: ''
      }
      // Clear image preview
      imagePreview.value = null
      selectedFile.value = null
    }
  },
  { immediate: true }
)

// Watch for dialog open/close to reset validation
watch(show, (isOpen) => {
  if (isOpen && form.value) {
    form.value.resetValidation()
  }
})

// Methods
const handleSave = async () => {
  if (!valid.value) return

  const saveData = {
    ...formData.value,
    image_url: formData.value.image_url || ''
  }

  emit('save', saveData)
}

const handleCancel = async () => {
  // If user uploaded a new image but is canceling, clean it up
  if (selectedFile.value && formData.value.image_url && formData.value.image_url.includes('supabase.co/storage/v1/object/public/announcements/')) {
    try {
      // Extract filename from URL
      const urlParts = formData.value.image_url.split('/')
      const fileName = urlParts[urlParts.length - 1]

      // Delete the uploaded file since user is canceling
      await supabase.storage
        .from('announcements')
        .remove([fileName])
    } catch (error) {
      console.error('Error cleaning up uploaded file:', error)
    }
  }

  // Reset form
  formData.value = {
    id: 0,
    title: '',
    description: '',
    image_url: ''
  }

  // Reset image upload state
  imagePreview.value = null
  selectedFile.value = null
  uploading.value = false
  uploadProgress.value = 0

  if (form.value) {
    form.value.reset()
    form.value.resetValidation()
  }

  emit('cancel')
}

// Image upload methods
const triggerFileInput = () => {
  if (fileInput.value) {
    fileInput.value.click()
  }
}

const handleFileSelect = (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (file) {
    validateAndProcessFile(file)
  }
}

const handleDrop = (event: DragEvent) => {
  event.preventDefault()
  isDragOver.value = false

  const files = event.dataTransfer?.files
  if (files && files.length > 0) {
    validateAndProcessFile(files[0])
  }
}

const validateAndProcessFile = async (file: File) => {
  // Validate file type
  if (!file.type.startsWith('image/')) {
    toast.error('Please select an image file')
    return
  }

  // Validate file size (5MB max)
  const maxSize = 5 * 1024 * 1024 // 5MB in bytes
  if (file.size > maxSize) {
    toast.error('File size must be less than 5MB')
    return
  }

  selectedFile.value = file

  // Create preview immediately
  const reader = new FileReader()
  reader.onload = (e) => {
    imagePreview.value = e.target?.result as string
  }
  reader.readAsDataURL(file)

  // Upload to Supabase Storage
  await uploadToSupabase(file)
}

const uploadToSupabase = async (file: File) => {
  uploading.value = true
  uploadProgress.value = 0

  try {
    // Generate unique filename with original name preserved
    const fileExt = file.name.split('.').pop()
    const originalName = file.name.replace(`.${fileExt}`, '')
    const timestamp = Date.now()
    const randomId = Math.random().toString(36).substring(2)
    const fileName = `${originalName}_${timestamp}_${randomId}.${fileExt}`

    // Simulate progress start
    uploadProgress.value = 10

    // Upload file to Supabase Storage
    const { data, error } = await supabase.storage
      .from('announcements')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false
      })

    if (error) {
      throw error
    }

    // Simulate final progress steps
    uploadProgress.value = 90

    // Small delay to show progress completion
    await new Promise(resolve => setTimeout(resolve, 500))

    uploadProgress.value = 100
    uploading.value = false

    // Get the public URL
    const publicUrl = `https://vfpjlkskicwfemhgelij.supabase.co/storage/v1/object/public/announcements/${data.path}`

    // Store the public URL in form data
    formData.value.image_url = publicUrl

    toast.success('Image uploaded successfully!')

  } catch (error) {
    uploading.value = false
    uploadProgress.value = 0
    console.error('Upload error:', error)

    // Clear preview on error
    imagePreview.value = null
    selectedFile.value = null

    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    toast.error(`Upload failed: ${errorMessage}`)
  }
}

const removeImage = async () => {
  try {
    // If there's an image URL and it's from Supabase, delete it from storage
    if (formData.value.image_url && formData.value.image_url.includes('supabase.co/storage/v1/object/public/announcements/')) {
      // Extract filename from URL
      const urlParts = formData.value.image_url.split('/')
      const fileName = urlParts[urlParts.length - 1]

      // Delete from Supabase Storage
      const { error } = await supabase.storage
        .from('announcements')
        .remove([fileName])

      if (error) {
        console.error('Error deleting file from storage:', error)
        // Don't show error to user as the UI cleanup should still happen
      }
    }
  } catch (error) {
    console.error('Error during image removal:', error)
  }

  // Clear UI state regardless of storage deletion result
  imagePreview.value = null
  selectedFile.value = null
  formData.value.image_url = ''
  uploading.value = false
  uploadProgress.value = 0

  // Clear file input
  if (fileInput.value) {
    fileInput.value.value = ''
  }
}
</script>

<style scoped>
.v-card {
  border-radius: 12px !important;
}

.upload-area {
  cursor: pointer;
  transition: all 0.3s ease;
  border: 2px dashed rgb(var(--v-theme-on-surface-variant));
  background-color: rgba(var(--v-theme-surface-variant), 0.1);
}

.upload-area:hover {
  border-color: rgb(var(--v-theme-primary));
  background-color: rgba(var(--v-theme-primary), 0.1);
}

.upload-area.dragover {
  border-color: rgb(var(--v-theme-primary));
  background-color: rgba(var(--v-theme-primary), 0.2);
  transform: scale(1.02);
}

.v-img {
  border: 1px solid rgba(var(--v-theme-outline), 0.2);
}
</style>

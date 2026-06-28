<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { useBarcodeScanner } from '@/pages/admin/components/barcode/composables/barcodeLogic'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'image-captured', imageData: string): void
}>()

// Tab state: 'upload' | 'capture'
const activeTab = ref<'upload' | 'capture'>('capture')
const captureVideoRef = ref<HTMLVideoElement | null>(null)
const capturedImage = ref<string | null>(null)
const uploadedImage = ref<string | null>(null)

// Use the barcodeLogic composable for camera management
const {
  isScanning,
  isCameraReady,
  cameraError,
  initializeCamera,
  stopScanning,
  captureFrame,
  decodeImageFromDataUrl,
} = useBarcodeScanner()

const isScanningBarcode = ref(false)
const barcodeFound = ref<string | null>(null)
const barcodeFormat = ref<string | null>(null)
const barcodeScanFailed = ref(false)
const rawResult = ref<any>(null)

async function scanImageForBarcode(imageDataUrl: string): Promise<void> {
  isScanningBarcode.value = true
  barcodeFound.value = null
  rawResult.value = null

  // Log image info before scanning
  const imgInfo = getImageInfo(imageDataUrl)
  console.log(`[Scanner] Scanning image for barcode...`, imgInfo)

  barcodeScanFailed.value = false
  try {
    const result = await decodeImageFromDataUrl(imageDataUrl)
    if (result) {
      barcodeFound.value = result.text
      barcodeFormat.value = result.format
      barcodeScanFailed.value = false
      rawResult.value = result

      console.log(`%c[Scanner] ✅ Barcode DETECTED: ${result.text} (${result.format})`, 'color: green; font-weight: bold; font-size: 14px')
      console.log('[Scanner] ZXing result:', result)
    } else {
      barcodeFound.value = null
      barcodeFormat.value = null
      barcodeScanFailed.value = true
      console.log(`%c[Scanner] ❌ No barcode found in image`, 'color: orange; font-weight: bold; font-size: 14px', {
        imageInfo: imgInfo,
        message: 'Could not detect any barcode pattern. Try a clearer image with better lighting.',
        timestamp: new Date().toISOString(),
      })
    }
  } catch (err) {
    barcodeFound.value = null
    barcodeFormat.value = null
    barcodeScanFailed.value = true
    console.log(`%c[Scanner] ❌ Barcode scan failed with error`, 'color: red; font-weight: bold; font-size: 14px', {
      imageInfo: imgInfo,
      error: err instanceof Error ? err.message : String(err),
      timestamp: new Date().toISOString(),
    })
  } finally {
    isScanningBarcode.value = false
  }
}

function getImageInfo(dataUrl: string): { sizeKB: string; format: string; isDataUrl: boolean; length: number } {
  const isDataUrl = dataUrl.startsWith('data:')
  const format = isDataUrl ? dataUrl.split(';')[0].replace('data:', '') : 'unknown'
  const sizeBytes = dataUrl.length * 0.75 // approximate base64 decoded size
  return {
    sizeKB: Math.round(sizeBytes / 1024) + 'KB',
    format,
    isDataUrl,
    length: dataUrl.length,
  }
}

function capturePhoto() {
  const frame = captureFrame()
  if (frame) {
    capturedImage.value = frame
    // Stop the camera stream
    stopScanning()
    // Auto-scan for barcode
    scanImageForBarcode(frame)
  }
}

function handleFileUpload(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  // Validate file type
  if (!file.type.startsWith('image/')) {
    alert('Please select an image file')
    return
  }

  // Validate file size (max 10MB)
  if (file.size > 10 * 1024 * 1024) {
    alert('File size must be less than 10MB')
    return
  }

  const reader = new FileReader()
  reader.onload = (e) => {
    const dataUrl = e.target?.result as string
    uploadedImage.value = dataUrl
    // Auto-scan for barcode
    scanImageForBarcode(dataUrl)
  }
  reader.readAsDataURL(file)
}

function confirmImage() {
  const imageData = activeTab.value === 'capture' ? capturedImage.value : uploadedImage.value
  if (imageData) {
    const source = activeTab.value === 'capture' ? 'camera' : 'upload'
    const result: Record<string, any> = {
      source,
      preview: imageData.substring(0, 100) + '...',
      length: imageData.length,
      type: imageData.startsWith('data:image/') ? imageData.split(';')[0].replace('data:', '') : 'unknown'
    }
    if (barcodeFound.value) {
      result.barcode = barcodeFound.value
    }
    console.log(`[Scanner] Image captured via ${source}:`, result)
    emit('image-captured', imageData)
    closeDialog()
  }
}

function retakePhoto() {
  capturedImage.value = null
  nextTick(() => {
    initializeCamera(captureVideoRef)
  })
}

function closeDialog() {
  emit('update:modelValue', false)
  stopScanning()
  capturedImage.value = null
  uploadedImage.value = null
}

// Watch for dialog open
watch(
  () => props.modelValue,
  async (val) => {
    if (val) {
      activeTab.value = 'capture'
      capturedImage.value = null
      uploadedImage.value = null
      await nextTick()
      if (activeTab.value === 'capture') {
        await initializeCamera(captureVideoRef)
      }
    } else {
      stopScanning()
    }
  },
)

// Watch for tab changes
watch(activeTab, async (newTab) => {
  if (!props.modelValue) return

  capturedImage.value = null
  uploadedImage.value = null

  await nextTick()

  if (newTab === 'capture') {
    await initializeCamera(captureVideoRef)
  }
})

// Expose a method to set the active tab from parent if needed
defineExpose({
  setActiveTab: (tab: 'upload' | 'capture') => {
    activeTab.value = tab
  }
})
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="520"
    persistent
    @click:outside="closeDialog"
  >
    <v-card>
      <v-card-title class="d-flex align-center">
        <v-icon class="mr-2">
          {{ activeTab === 'capture' ? 'mdi-camera' : 'mdi-image' }}
        </v-icon>
        {{ activeTab === 'capture' ? 'Capture Photo' : 'Upload Image' }}
        <v-spacer />
        <v-btn
          icon="mdi-close"
          size="small"
          variant="text"
          @click="closeDialog"
        />
      </v-card-title>

      <!-- Tabs -->
      <v-tabs v-model="activeTab" color="primary" align-tabs="center">
        <v-tab value="capture">
          <v-icon start>mdi-camera</v-icon>
          Capture
        </v-tab>
        <v-tab value="upload">
          <v-icon start>mdi-image</v-icon>
          Upload
        </v-tab>
      </v-tabs>

      <v-card-text>
        <!-- Capture Tab -->
        <div v-if="activeTab === 'capture'">
          <!-- Camera Error -->
          <v-alert
            v-if="cameraError"
            type="error"
            variant="tonal"
            class="mb-3"
            :text="cameraError"
          />

          <!-- Show captured image or camera feed -->
          <div v-if="capturedImage" class="scanner-dialog-container">
            <img :src="capturedImage" class="scanner-dialog-video" alt="Captured image" />
            <!-- Scanning overlay -->
            <div v-if="isScanningBarcode" class="scan-overlay scan-overlay--scanning">
              <v-progress-circular indeterminate size="24" color="primary" />
              <span class="scan-overlay-text">Scanning for barcode...</span>
            </div>
            <!-- Barcode detected -->
            <div v-else-if="barcodeFound" class="scan-overlay scan-overlay--success">
              <v-icon color="white" size="20">mdi-barcode</v-icon>
              <span class="scan-overlay-text">{{ barcodeFound }}</span>
            </div>
            <!-- No barcode found -->
            <div v-else-if="barcodeScanFailed" class="scan-overlay scan-overlay--failed">
              <v-icon color="white" size="20">mdi-close-circle</v-icon>
              <span class="scan-overlay-text">No barcode detected</span>
            </div>
          </div>
          <div v-else class="scanner-dialog-container">
            <video
              ref="captureVideoRef"
              class="scanner-dialog-video"
              :class="{ 'scanner-dialog-video--hidden': !isCameraReady }"
              playsinline
              muted
            />

            <!-- Loading -->
            <div v-if="!isCameraReady && !cameraError" class="scanner-dialog-placeholder">
              <v-progress-circular indeterminate size="32" color="primary" />
              <p class="text-grey mt-3">Starting camera...</p>
            </div>
          </div>

          <!-- Capture button -->
          <div v-if="!capturedImage && isCameraReady" class="text-center mt-4">
            <v-btn
              color="primary"
              size="large"
              class="text-none"
              @click="capturePhoto"
            >
              <v-icon start>mdi-camera</v-icon>
              Take Photo
            </v-btn>
          </div>
        </div>

        <!-- Upload Tab -->
        <div v-else-if="activeTab === 'upload'">
          <!-- Show uploaded image or upload area -->
          <div v-if="uploadedImage" class="scanner-dialog-container">
            <img :src="uploadedImage" class="scanner-dialog-video" alt="Uploaded image" />
            <!-- Scanning overlay -->
            <div v-if="isScanningBarcode" class="scan-overlay scan-overlay--scanning">
              <v-progress-circular indeterminate size="24" color="primary" />
              <span class="scan-overlay-text">Scanning for barcode...</span>
            </div>
            <!-- Barcode detected -->
            <div v-else-if="barcodeFound" class="scan-overlay scan-overlay--success">
              <v-icon color="white" size="20">mdi-barcode</v-icon>
              <span class="scan-overlay-text">{{ barcodeFound }}</span>
            </div>
            <!-- No barcode found -->
            <div v-else-if="barcodeScanFailed" class="scan-overlay scan-overlay--failed">
              <v-icon color="white" size="20">mdi-close-circle</v-icon>
              <span class="scan-overlay-text">No barcode detected</span>
            </div>
          </div>
          <div v-else class="upload-area">
            <v-icon size="64" color="grey-lighten-1">mdi-image-multiple</v-icon>
            <p class="text-grey mt-2 mb-4">Drag and drop an image or click to browse</p>
            <input
              type="file"
              accept="image/*"
              class="d-none"
              @change="handleFileUpload"
            />
            <v-btn
              color="primary"
              variant="outlined"
              class="text-none"
              onclick="this.previousElementSibling.click()"
            >
              <v-icon start>mdi-folder-open</v-icon>
              Choose File
            </v-btn>
          </div>
        </div>
      </v-card-text>

      <v-card-actions class="pa-4 justify-end">
        <v-btn
          v-if="activeTab === 'capture' && capturedImage"
          variant="text"
          class="text-none"
          @click="retakePhoto"
        >
          Retake
        </v-btn>
        <v-btn
          v-if="activeTab === 'upload' && uploadedImage"
          variant="text"
          class="text-none"
          @click="uploadedImage = null"
        >
          Remove
        </v-btn>
        <v-btn
          variant="text"
          class="text-none"
          @click="closeDialog"
        >
          Cancel
        </v-btn>
        <v-btn
          v-if="(activeTab === 'capture' && capturedImage) || (activeTab === 'upload' && uploadedImage)"
          color="primary"
          variant="flat"
          class="text-none"
          @click="confirmImage"
        >
          Confirm
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
/* ── Scanner Dialog Styles ─────────────────────────── */
.scanner-dialog-container {
  position: relative;
  width: 100%;
  aspect-ratio: 4 / 3;
  background: #000;
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.scanner-dialog-video {
  width: 100%;
  height: 100%;
  object-fit: cover;

  &--hidden {
    opacity: 0;
    position: absolute;
  }
}

.scanner-dialog-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #999;
}

/* ── Scan Overlay ─────────────────────────── */
.scan-overlay {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 0.85rem;
  font-weight: 500;
  backdrop-filter: blur(4px);

  &--scanning {
    background: rgba(0, 0, 0, 0.65);
    color: #ccc;
  }

  &--success {
    background: rgba(34, 197, 94, 0.8);
    color: #fff;
  }

  &--failed {
    background: rgba(239, 68, 68, 0.8);
    color: #fff;
  }
}

.scan-overlay-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 260px;
}

/* Upload Area Styles */
.upload-area {
  width: 100%;
  aspect-ratio: 4 / 3;
  background: #f5f5f5;
  border: 2px dashed #ccc;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: border-color 0.3s ease;
}

.upload-area:hover {
  border-color: rgb(var(--v-theme-primary));
}

.upload-area input[type="file"] {
  display: none;
}
</style>

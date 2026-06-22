<template>
  <v-card class="barcode-widget" elevation="2">
    <v-card-title class="d-flex align-center">
      <v-icon class="mr-2">mdi-barcode-scan</v-icon>
      Barcode Scanner
      <v-spacer />
      <v-btn
        v-if="!isScanning && !cameraError"
        color="primary"
        variant="tonal"
        size="small"
        prepend-icon="mdi-camera"
        @click="startScanner"
      >
        Start Camera
      </v-btn>
      <v-btn
        v-if="isScanning"
        color="error"
        variant="tonal"
        size="small"
        prepend-icon="mdi-stop"
        @click="stopScanner"
      >
        Stop
      </v-btn>
    </v-card-title>

    <v-card-text>
      <!-- Camera Error State -->
      <v-alert
        v-if="cameraError"
        type="error"
        variant="tonal"
        closable
        class="mb-3"
        :text="cameraError"
        @click:close="cameraError = null"
      />

      <!-- Camera Feed -->
      <div class="scanner-container" :class="{ 'scanner-active': isScanning }">
        <video
          ref="videoRef"
          class="scanner-video"
          :class="{ 'scanner-video--hidden': !isCameraReady }"
          playsinline
          muted
        />

        <!-- Scanning Overlay -->
        <div v-if="isScanning && isCameraReady" class="scanner-overlay">
          <div class="scan-region">
            <div class="scan-line" />
            <div class="scan-corner scan-corner--tl" />
            <div class="scan-corner scan-corner--tr" />
            <div class="scan-corner scan-corner--bl" />
            <div class="scan-corner scan-corner--br" />
          </div>
          <div class="scanner-hint">Point the camera at a barcode</div>
        </div>

        <!-- Loading State -->
        <div v-if="!isScanning && !cameraError" class="scanner-placeholder">
          <v-icon size="64" color="grey-lighten-1">mdi-barcode-scan</v-icon>
          <p class="text-grey mt-3">Click "Start Camera" to begin scanning</p>
        </div>
      </div>

      <!-- Last Scanned Result -->
      <v-slide-y-reverse-transition>
        <v-alert
          v-if="lastScannedCode"
          type="success"
          variant="tonal"
          class="mt-3"
          closable
          @click:close="lastScannedCode = null"
        >
          <template #title>
            <v-icon class="mr-1">mdi-check-circle</v-icon>
            Scanned Successfully
          </template>

          <div class="text-body-1 font-weight-bold">
            Code: {{ lastScannedCode.code }}
          </div>
          <div class="text-caption text-grey">
            Format: {{ lastScannedCode.format }}
          </div>
          <div class="text-caption text-grey">
            {{ formatTimestamp(lastScannedCode.timestamp) }}
          </div>
        </v-alert>
      </v-slide-y-reverse-transition>

      <!-- Scan History -->
      <v-expansion-panels v-if="scannedHistory.length > 0" class="mt-3" variant="accordion">
        <v-expansion-panel>
          <v-expansion-panel-title class="text-subtitle-2">
            <v-icon class="mr-1">mdi-history</v-icon>
            Scan History ({{ scannedHistory.length }})
          </v-expansion-panel-title>
          <v-expansion-panel-text>
            <v-list density="compact" max-height="200" class="overflow-y-auto">
              <v-list-item
                v-for="(item, index) in [...scannedHistory].reverse()"
                :key="index"
                lines="two"
              >
                <template #prepend>
                  <v-icon color="success">mdi-check-circle-outline</v-icon>
                </template>

                <v-list-item-title class="font-weight-medium">
                  {{ item.code }}
                </v-list-item-title>

                <v-list-item-subtitle>
                  {{ item.format }} &middot; {{ formatTimestamp(item.timestamp) }}
                </v-list-item-subtitle>

                <template #append>
                  <v-icon
                    size="small"
                    class="cursor-pointer"
                    @click="copyToClipboard(item.code)"
                  >
                    mdi-content-copy
                  </v-icon>
                </template>
              </v-list-item>
            </v-list>

            <v-btn
              color="grey"
              variant="text"
              size="small"
              class="mt-2"
              block
              @click="clearHistory"
            >
              <v-icon class="mr-1">mdi-delete-sweep</v-icon>
              Clear History
            </v-btn>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useBarcodeScanner } from './composables/barcodeLogic'

const {
  isScanning,
  isCameraReady,
  cameraError,
  lastScannedCode,
  scannedHistory,
  initializeCamera,
  stopScanning,
  clearHistory,
} = useBarcodeScanner()

const videoRef = ref<HTMLVideoElement | null>(null)

async function startScanner() {
  await initializeCamera(videoRef)
}

function stopScanner() {
  stopScanning()
}

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString()
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    // Fallback for older browsers
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
  }
}
</script>

<style scoped lang="scss">
.barcode-widget {
  max-width: 600px;
  margin: 0 auto;
}

.scanner-container {
  position: relative;
  width: 100%;
  aspect-ratio: 4 / 3;
  background: #000;
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;

  &.scanner-active {
    border: 2px solid rgb(var(--v-theme-primary));
  }
}

.scanner-video {
  width: 100%;
  height: 100%;
  object-fit: cover;

  &--hidden {
    opacity: 0;
    position: absolute;
  }
}

.scanner-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.scan-region {
  position: relative;
  width: 70%;
  height: 40%;
}

.scan-line {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgb(var(--v-theme-primary)) 50%,
    transparent 100%
  );
  animation: scan-line-move 2s ease-in-out infinite;
  box-shadow: 0 0 8px rgb(var(--v-theme-primary));
}

@keyframes scan-line-move {
  0% {
    top: 0;
  }
  50% {
    top: calc(100% - 2px);
  }
  100% {
    top: 0;
  }
}

.scan-corner {
  position: absolute;
  width: 24px;
  height: 24px;
  border-color: rgb(var(--v-theme-primary));
  border-style: solid;

  &--tl {
    top: 0;
    left: 0;
    border-width: 3px 0 0 3px;
  }

  &--tr {
    top: 0;
    right: 0;
    border-width: 3px 3px 0 0;
  }

  &--bl {
    bottom: 0;
    left: 0;
    border-width: 0 0 3px 3px;
  }

  &--br {
    bottom: 0;
    right: 0;
    border-width: 0 3px 3px 0;
  }
}

.scanner-hint {
  position: absolute;
  bottom: 16px;
  color: rgba(255, 255, 255, 0.8);
  font-size: 0.85rem;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.6);
}

.scanner-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #999;
}

.cursor-pointer {
  cursor: pointer;
}
</style>
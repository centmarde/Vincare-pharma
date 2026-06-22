import { ref, onUnmounted, type Ref } from 'vue'
import Quagga from 'quagga'

export interface BarcodeResult {
  code: string
  format: string
  timestamp: number
}

export function useBarcodeScanner() {
  const isScanning = ref(false)
  const isCameraReady = ref(false)
  const cameraError = ref<string | null>(null)
  const lastScannedCode = ref<BarcodeResult | null>(null)
  const scannedHistory = ref<BarcodeResult[]>([])

  let scanCooldown = false
  let videoElement: HTMLVideoElement | null = null

  // Cooldown period in ms to prevent duplicate scans
  const SCAN_COOLDOWN_MS = 2000

  async function initializeCamera(videoRef: Ref<HTMLVideoElement | null>): Promise<void> {
    try {
      cameraError.value = null
      isCameraReady.value = false

      videoElement = videoRef.value
      if (!videoElement) {
        throw new Error('Video element reference is not available')
      }

      // Configure Quagga
      Quagga.init(
        {
          inputStream: {
            name: 'Live',
            type: 'LiveStream',
            target: videoElement,
            constraints: {
              facingMode: 'environment',
              width: { ideal: 640 },
              height: { ideal: 480 },
            },
            area: {
              top: '0%',
              right: '0%',
              left: '0%',
              bottom: '0%',
            },
          },
          decoder: {
            readers: [
              'code_128_reader',
              'ean_reader',
              'ean_8_reader',
              'code_39_reader',
              'code_39_vin_reader',
              'codabar_reader',
              'upc_reader',
              'upc_e_reader',
              'i2of5_reader',
              '2of5_reader',
              'code_93_reader',
            ],
          },
          locate: true,
          numOfWorkers: navigator.hardwareConcurrency || 4,
        },
        (err: any) => {
          if (err) {
            console.error('Quagga init error:', err)
            cameraError.value = err.message || 'Failed to initialize barcode scanner'
            isCameraReady.value = false
            isScanning.value = false
            return
          }

          isCameraReady.value = true
          isScanning.value = true

          // Start Quagga
          Quagga.start()

          // Register detection callback
          Quagga.onDetected(onDetected)
        },
      )
    } catch (error: any) {
      console.error('Camera initialization error:', error)
      cameraError.value = error.message || 'Failed to access camera'
      isCameraReady.value = false
      isScanning.value = false
    }
  }

  function onDetected(result: any) {
    if (!result || scanCooldown) return

    const code = result.codeResult?.code
    const format = result.codeResult?.format || 'unknown'

    if (!code) return

    scanCooldown = true

    const barcodeResult: BarcodeResult = {
      code,
      format,
      timestamp: Date.now(),
    }

    lastScannedCode.value = barcodeResult
    scannedHistory.value.push(barcodeResult)

    // Trigger haptic feedback if available
    if (navigator.vibrate) {
      navigator.vibrate(100)
    }

    // Reset cooldown after delay
    setTimeout(() => {
      scanCooldown = false
    }, SCAN_COOLDOWN_MS)
  }

  function captureFrame(): string | null {
    if (!videoElement) return null

    const canvas = document.createElement('canvas')
    canvas.width = videoElement.videoWidth
    canvas.height = videoElement.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    ctx.drawImage(videoElement, 0, 0)
    return canvas.toDataURL('image/png')
  }

  function stopScanning(): void {
    isScanning.value = false
    scanCooldown = false

    try {
      Quagga.offDetected(onDetected)
      Quagga.stop()
    } catch {
      // Ignore if already stopped
    }

    if (videoElement) {
      // Quagga manages the media stream, but we can help clean up
      const stream = (videoElement as any).srcObject as MediaStream | null
      if (stream) {
        stream.getTracks().forEach((track) => track.stop())
        videoElement.srcObject = null
      }
    }

    isCameraReady.value = false
    videoElement = null
  }

  function clearHistory(): void {
    scannedHistory.value = []
    lastScannedCode.value = null
  }

  // Cleanup on component unmount
  onUnmounted(() => {
    stopScanning()
  })

  return {
    isScanning,
    isCameraReady,
    cameraError,
    lastScannedCode,
    scannedHistory,
    initializeCamera,
    stopScanning,
    captureFrame,
    clearHistory,
  }
}
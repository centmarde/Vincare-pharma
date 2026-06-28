import { ref, type Ref } from 'vue'
import { BrowserMultiFormatReader } from '@zxing/library'

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

  let videoElement: HTMLVideoElement | null = null
  let mediaStream: MediaStream | null = null
  let codeReader: BrowserMultiFormatReader | null = null

  const SCAN_COOLDOWN_MS = 2000
  let scanCooldown = false

  /**
   * Request camera permission and get media stream
   */
  async function requestCameraAccess(): Promise<MediaStream> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      })
      return stream
    } catch (firstError: any) {
      console.warn('First camera attempt failed:', firstError.message)
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        })
        return stream
      } catch (finalError: any) {
        throw finalError
      }
    }
  }

  /**
   * Format error message for user-friendly display
   */
  function formatErrorMessage(error: any): string {
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
      return 'Camera access denied. Please allow camera permissions in your browser settings.'
    }
    if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
      return 'No camera found. Please connect a camera and try again.'
    }
    return error.message || 'Failed to access camera. Please try again.'
  }

  /**
   * Initialize camera and show live feed on the video element
   */
  async function initializeCamera(videoRef: Ref<HTMLVideoElement | null>): Promise<void> {
    try {
      cameraError.value = null
      isCameraReady.value = false
      isScanning.value = false

      videoElement = videoRef.value
      if (!videoElement) {
        throw new Error('Video element reference is not available')
      }

      console.log('Using browser camera API')
      mediaStream = await requestCameraAccess()

      videoElement.srcObject = mediaStream

      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Camera stream timeout. Please try again.'))
        }, 10000)

        videoElement!.onloadedmetadata = () => {
          clearTimeout(timeout)
          videoElement!.play().catch((playError) => {
            clearTimeout(timeout)
            reject(new Error('Failed to play video stream'))
          })
          resolve(true)
        }

        videoElement!.onerror = () => {
          clearTimeout(timeout)
          reject(new Error('Video element error'))
        }
      })

      isCameraReady.value = true
    } catch (error: any) {
      console.error('Camera initialization error:', error)
      cameraError.value = formatErrorMessage(error)
      isCameraReady.value = false
      isScanning.value = false

      if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop())
        mediaStream = null
      }
    }
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

    if (codeReader) {
      try { codeReader.reset() } catch {}
      codeReader = null
    }

    if (mediaStream) {
      mediaStream.getTracks().forEach((track) => track.stop())
      mediaStream = null
    }

    if (videoElement) {
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

  /**
   * Decode a barcode from a static image data URL (JPEG/PNG base64).
   * Uses @zxing/library BrowserMultiFormatReader.
   * Returns the full ZXing result object, or null if nothing found.
   * The result contains:
   *   - text: the decoded barcode string
   *   - format: the barcode format name
   *   - resultPoints: corner points of the barcode
   */
  async function decodeImageFromDataUrl(imageDataUrl: string): Promise<any | null> {
    const reader = new BrowserMultiFormatReader()

    try {
      const img = new Image()
      const imageLoaded = new Promise<HTMLImageElement>((resolve, reject) => {
        img.onload = () => resolve(img)
        img.onerror = () => reject(new Error('Failed to load image'))
      })
      img.src = imageDataUrl
      await imageLoaded

      // Create a unique ID for the image element
      const imgId = 'barcode-img-' + Date.now()
      const existingImg = document.getElementById(imgId) as HTMLImageElement
      if (existingImg) existingImg.remove()

      const imgElement = document.createElement('img')
      imgElement.id = imgId
      imgElement.src = imageDataUrl
      imgElement.style.display = 'none'
      document.body.appendChild(imgElement)

      const result = await reader.decodeFromImage(imgElement)
      imgElement.remove()
      return {
        text: result.getText(),
        format: result.getBarcodeFormat().toString(),
        resultPoints: result.getResultPoints().map(p => ({ x: p.getX(), y: p.getY() })),
      }
    } catch (err: any) {
      // ZXing throws an error when no barcode is found
      if (err?.message?.includes('NotFoundException') || err?.toString?.()?.includes('NotFoundException')) {
        return null
      }
      console.error('[Barcode] ZXing decode error:', err)
      return null
    }
  }

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
    decodeImageFromDataUrl,
  }
}

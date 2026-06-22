declare module 'quagga' {
  interface QuaggaStatic {
    init(
      config: {
        inputStream: {
          name: string
          type: string
          target: HTMLVideoElement | null
          constraints?: MediaTrackConstraints
          area?: {
            top: string
            right: string
            left: string
            bottom: string
          }
        }
        decoder: {
          readers: string[]
        }
        locate?: boolean
        numOfWorkers?: number
      },
      callback: (err: any) => void,
    ): void

    start(): void
    stop(): void
    onDetected(callback: (result: any) => void): void
    offDetected(callback: (result: any) => void): void
    canvas?: {
      ctx: {
        overlay: CanvasRenderingContext2D
      }
      dom: {
        overlay: HTMLCanvasElement
      }
    }
  }

  const Quagga: QuaggaStatic
  export default Quagga
}
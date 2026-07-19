import type { StreamMediaConfig } from '../mediaConfig'

type SnapshotConfig = Pick<
  StreamMediaConfig,
  'snapshotMaxWidth' | 'snapshotQuality'
>

/**
 * Maintains one bounded poster snapshot for a video element.
 *
 * The upstream implementation encoded a source-resolution PNG every second
 * and never retained the newly-created object URL, so it could never revoke
 * older blobs. This controller scales to the visible tile, uses lossy WebP,
 * prevents overlapping encodes, and owns exactly one revocable URL.
 */
export class SnapshotController {
  private readonly canvas: HTMLCanvasElement
  private readonly config: SnapshotConfig
  private latestSnapshotURL: string | null = null
  private pending = false
  private disposed = false

  constructor(config: SnapshotConfig) {
    this.canvas = document.createElement('canvas')
    this.config = config
  }

  snapshotVideo(videoEl: HTMLVideoElement): void {
    if (
      this.disposed ||
      this.pending ||
      !('requestVideoFrameCallback' in videoEl) ||
      videoEl.videoWidth <= 0 ||
      videoEl.videoHeight <= 0
    ) {
      return
    }

    this.pending = true
    videoEl.requestVideoFrameCallback(() => {
      const sourceWidth = videoEl.videoWidth
      const sourceHeight = videoEl.videoHeight
      const visibleWidth = videoEl.clientWidth || sourceWidth
      const width = Math.max(
        1,
        Math.min(sourceWidth, visibleWidth, this.config.snapshotMaxWidth),
      )
      const height = Math.max(
        1,
        Math.round((sourceHeight * width) / sourceWidth),
      )

      this.canvas.width = width
      this.canvas.height = height

      const ctx = this.canvas.getContext('2d')
      if (!ctx) {
        this.pending = false
        console.warn('could not get canvas context')
        return
      }

      ctx.drawImage(videoEl, 0, 0, width, height)
      this.canvas.toBlob(
        (blob) => {
          this.pending = false
          if (this.disposed) {
            return
          }
          if (!blob) {
            console.warn('could not create blob from canvas')
            return
          }

          const previousURL = this.latestSnapshotURL
          const nextURL = URL.createObjectURL(blob)
          this.latestSnapshotURL = nextURL
          videoEl.poster = nextURL
          if (previousURL) {
            URL.revokeObjectURL(previousURL)
          }
        },
        'image/webp',
        this.config.snapshotQuality,
      )
    })
  }

  dispose(): void {
    this.disposed = true
    if (this.latestSnapshotURL) {
      URL.revokeObjectURL(this.latestSnapshotURL)
      this.latestSnapshotURL = null
    }
  }
}

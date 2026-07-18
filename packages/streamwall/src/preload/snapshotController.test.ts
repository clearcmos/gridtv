// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SnapshotController } from './snapshotController'

describe('SnapshotController', () => {
  const drawImage = vi.fn()
  const createObjectURL = vi.fn()
  const revokeObjectURL = vi.fn()

  beforeEach(() => {
    drawImage.mockClear()
    createObjectURL.mockReset()
    revokeObjectURL.mockReset()
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURL,
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectURL,
    })
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage,
    } as unknown as CanvasRenderingContext2D)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function makeVideo(overrides: Partial<HTMLVideoElement> = {}) {
    return {
      videoWidth: 1920,
      videoHeight: 1080,
      clientWidth: 320,
      poster: '',
      requestVideoFrameCallback: (callback: VideoFrameRequestCallback) => {
        callback(0, {} as VideoFrameCallbackMetadata)
        return 1
      },
      ...overrides,
    } as unknown as HTMLVideoElement
  }

  it('scales snapshots to the visible tile and encodes lossy WebP', () => {
    const toBlob = vi
      .spyOn(HTMLCanvasElement.prototype, 'toBlob')
      .mockImplementation((callback, type, quality) => {
        expect(type).toBe('image/webp')
        expect(quality).toBe(0.65)
        callback(new Blob(['frame']))
      })
    createObjectURL.mockReturnValue('blob:frame-1')
    const video = makeVideo()
    const controller = new SnapshotController({
      snapshotMaxWidth: 640,
      snapshotQuality: 0.65,
    })

    controller.snapshotVideo(video)

    expect(toBlob).toHaveBeenCalledTimes(1)
    expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 320, 180)
    expect(video.poster).toBe('blob:frame-1')
  })

  it('keeps one object URL and revokes both the replaced and final snapshot', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(
      (callback) => callback(new Blob(['frame'])),
    )
    createObjectURL
      .mockReturnValueOnce('blob:frame-1')
      .mockReturnValueOnce('blob:frame-2')
    const controller = new SnapshotController({
      snapshotMaxWidth: 640,
      snapshotQuality: 0.65,
    })
    const video = makeVideo()

    controller.snapshotVideo(video)
    controller.snapshotVideo(video)

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:frame-1')
    expect(video.poster).toBe('blob:frame-2')

    controller.dispose()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:frame-2')
  })

  it('does not start a second encode while the first is pending', () => {
    let finishEncode: BlobCallback | undefined
    const toBlob = vi
      .spyOn(HTMLCanvasElement.prototype, 'toBlob')
      .mockImplementation((callback) => {
        finishEncode = callback
      })
    createObjectURL.mockReturnValue('blob:frame')
    const controller = new SnapshotController({
      snapshotMaxWidth: 640,
      snapshotQuality: 0.65,
    })
    const video = makeVideo()

    controller.snapshotVideo(video)
    controller.snapshotVideo(video)
    expect(toBlob).toHaveBeenCalledTimes(1)

    finishEncode?.(new Blob(['frame']))
    controller.snapshotVideo(video)
    expect(toBlob).toHaveBeenCalledTimes(2)
  })

  it('does not retain a snapshot that finishes after disposal', () => {
    let finishEncode: BlobCallback | undefined
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(
      (callback) => {
        finishEncode = callback
      },
    )
    const controller = new SnapshotController({
      snapshotMaxWidth: 640,
      snapshotQuality: 0.65,
    })

    controller.snapshotVideo(makeVideo())
    controller.dispose()
    finishEncode?.(new Blob(['frame']))

    expect(createObjectURL).not.toHaveBeenCalled()
  })
})

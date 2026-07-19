// @vitest-environment happy-dom
import { render } from 'preact'
import { act } from 'preact/test-utils'
import type { WallControlCommand } from 'streamwall-shared'
import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  nextWallAudioMode,
  nextWallFitMode,
  WallMediaControls,
} from './WallMediaControls'

let container: HTMLDivElement | undefined

afterEach(() => {
  if (container) {
    act(() => render(null, container!))
    container.remove()
    container = undefined
  }
})

function renderControls({
  isPaused = false,
  volume = 0.8,
  audioMode = 'muted' as const,
  fitMode = 'fit' as const,
  isVisible = true,
  onControl = vi.fn<(command: WallControlCommand) => void>(),
} = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  act(() => {
    render(
      <WallMediaControls
        viewId={17}
        viewIdx={3}
        isPaused={isPaused}
        volume={volume}
        audioMode={audioMode}
        fitMode={fitMode}
        isVisible={isVisible}
        onControl={onControl}
      />,
      container!,
    )
  })
  return { root: container, onControl }
}

function click(element: Element) {
  act(() => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

describe('WallMediaControls', () => {
  test('toggles playback for the stable view id', () => {
    const { root, onControl } = renderControls()

    click(root.querySelector('[aria-label="Pause stream"]')!)

    expect(onControl).toHaveBeenCalledWith({
      type: 'set-wall-playback',
      viewId: 17,
      viewIdx: 3,
      paused: true,
    })
  })

  test('offers play when the stream is paused', () => {
    const { root, onControl } = renderControls({ isPaused: true })

    click(root.querySelector('[aria-label="Play stream"]')!)

    expect(onControl).toHaveBeenCalledWith({
      type: 'set-wall-playback',
      viewId: 17,
      viewIdx: 3,
      paused: false,
    })
  })

  test('sends live volume changes', () => {
    const { root, onControl } = renderControls()
    const slider = root.querySelector(
      '[aria-label="Stream volume"]',
    ) as HTMLInputElement

    act(() => {
      slider.value = '0.35'
      slider.dispatchEvent(new Event('input', { bubbles: true }))
    })

    expect(onControl).toHaveBeenCalledWith({
      type: 'set-wall-volume',
      viewId: 17,
      viewIdx: 3,
      volume: 0.35,
    })
  })

  test('toggles the speaker from Muted to Unmuted', () => {
    const { root, onControl } = renderControls()

    click(root.querySelector('[aria-label="Audio mode: Muted"]')!)

    expect(onControl).toHaveBeenCalledWith({
      type: 'set-wall-audio-mode',
      viewId: 17,
      viewIdx: 3,
      mode: 'unmuted',
    })
  })

  test('toggles between exactly two audio modes', () => {
    expect(nextWallAudioMode('muted')).toBe('unmuted')
    expect(nextWallAudioMode('unmuted')).toBe('muted')
  })

  test('toggles video from uncropped Fit to edge-to-edge Fill', () => {
    const { root, onControl } = renderControls()

    click(root.querySelector('[aria-label="Video fit: Fit"]')!)

    expect(onControl).toHaveBeenCalledWith({
      type: 'set-wall-fit-mode',
      viewId: 17,
      viewIdx: 3,
      mode: 'fill',
    })
    expect(nextWallFitMode('fit')).toBe('fill')
    expect(nextWallFitMode('fill')).toBe('fit')
  })
})

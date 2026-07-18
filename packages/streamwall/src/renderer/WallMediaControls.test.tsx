// @vitest-environment happy-dom
import { render } from 'preact'
import { act } from 'preact/test-utils'
import type { WallControlCommand } from 'streamwall-shared'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { nextWallAudioMode, WallMediaControls } from './WallMediaControls'

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
  audioMode = 'stage' as const,
  onControl = vi.fn<(command: WallControlCommand) => void>(),
} = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  act(() => {
    render(
      <WallMediaControls
        viewId={17}
        isPaused={isPaused}
        volume={volume}
        audioMode={audioMode}
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
      paused: true,
    })
  })

  test('offers play when the stream is paused', () => {
    const { root, onControl } = renderControls({ isPaused: true })

    click(root.querySelector('[aria-label="Play stream"]')!)

    expect(onControl).toHaveBeenCalledWith({
      type: 'set-wall-playback',
      viewId: 17,
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
      volume: 0.35,
    })
  })

  test('cycles the speaker from Stage to Muted', () => {
    const { root, onControl } = renderControls()

    click(root.querySelector('[aria-label="Audio mode: Stage"]')!)

    expect(onControl).toHaveBeenCalledWith({
      type: 'set-wall-audio-mode',
      viewId: 17,
      mode: 'muted',
    })
  })

  test('cycles all three audio modes in the requested order', () => {
    expect(nextWallAudioMode('stage')).toBe('muted')
    expect(nextWallAudioMode('muted')).toBe('unmuted')
    expect(nextWallAudioMode('unmuted')).toBe('stage')
  })
})

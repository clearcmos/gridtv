// @vitest-environment happy-dom
import type {
  LiveWallSlotState,
  StreamData,
  StreamWindowConfig,
  ViewState,
} from 'gridtv-shared'
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { Overlay, WALL_CHROME_IDLE_MS } from './OverlayRoot'

let container: HTMLDivElement | undefined

afterEach(() => {
  if (container) {
    act(() => render(null, container!))
    container.remove()
    container = undefined
  }
  vi.useRealTimers()
})

function makeConfig(cols: number): StreamWindowConfig {
  return {
    cols,
    rows: 1,
    tileCount: cols,
    width: 100 * cols,
    height: 100,
    frameless: false,
    fullscreen: false,
    activeColor: '#0f0',
    backgroundColor: '#000',
  }
}

function makeView(idx: number, label: string): ViewState {
  return {
    state: {
      displaying: {
        running: { playback: 'playing', video: 'normal', audio: 'muted' },
      },
    },
    context: {
      id: idx,
      content: { url: `https://example.com/${label}`, kind: 'video' },
      info: null,
      pos: { x: idx * 100, y: 0, width: 100, height: 100, spaces: [idx] },
      error: null,
      volume: 1,
    },
  }
}

function makeStream(label: string): StreamData {
  return {
    _id: label,
    _dataSource: 'test',
    kind: 'video',
    link: `https://example.com/${label}`,
    label,
  }
}

function renderOverlay(
  views: ViewState[],
  streams: StreamData[],
): HTMLDivElement {
  container = document.createElement('div')
  document.body.appendChild(container)
  act(() => {
    render(
      <Overlay
        config={makeConfig(views.length)}
        views={views}
        streams={streams}
        fullscreenViewIdx={null}
        onControl={() => {}}
      />,
      container!,
    )
  })
  return container
}

// Each active view's border/tile used to be rendered without a `key`, so
// Preact matched them purely by position. When an earlier view disappears,
// every later view's position shifts down a slot and Preact grafts the
// surviving view's content onto the wrong DOM node - see #39. Keying each
// tile by its stable grid position fixes this.
describe('overlay view identity across a shrinking view list', () => {
  test('a surviving tile keeps its own DOM node after an earlier view disappears', () => {
    const streams = [makeStream('view-0'), makeStream('view-1')]
    const root = renderOverlay(
      [makeView(0, 'view-0'), makeView(1, 'view-1')],
      streams,
    )
    const tileBefore = root.querySelector('[data-view-idx="1"]')
    expect(tileBefore, 'expected to find a tile for view-1').not.toBeNull()

    act(() => {
      render(
        <Overlay
          config={makeConfig(2)}
          views={[makeView(1, 'view-1')]}
          streams={streams}
          fullscreenViewIdx={null}
          onControl={() => {}}
        />,
        root,
      )
    })

    const tileAfter = root.querySelector('[data-view-idx="1"]')
    expect(tileAfter, 'expected to still find a tile for view-1').not.toBeNull()
    expect(tileAfter).toBe(tileBefore)
  })
})

describe('self-contained wall controls', () => {
  test('F1 opens the 1-9 tile picker and selecting a number sends the exact count', () => {
    const onControl = vi.fn()
    container = document.createElement('div')
    document.body.appendChild(container)
    act(() => {
      render(
        <Overlay
          config={makeConfig(4)}
          views={[]}
          streams={[]}
          fullscreenViewIdx={null}
          onControl={onControl}
        />,
        container!,
      )
    })

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F1' }))
    })
    expect(container.querySelector('[data-testid="grid-size-menu"]')).not.toBe(
      null,
    )
    expect(container.textContent).toContain('Quick reference')
    expect(container.textContent).toContain('Fit / Fill wall')
    expect(container.textContent).toContain('Double-click')
    expect(container.textContent).toContain('Left-drag')
    expect(container.textContent).toContain('Right-drag')

    const twoTiles = container.querySelector('[aria-label="2 tiles"]')!
    act(() => {
      twoTiles.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onControl).toHaveBeenCalledWith({
      type: 'set-wall-tile-count',
      count: 2,
    })
    expect(container.querySelector('[data-testid="grid-size-menu"]')).toBe(null)
  })

  test('F2 cycles every active tile between Fill and Fit outside fullscreen', () => {
    const onControl = vi.fn()
    const fillViews = [makeView(0, 'view-0'), makeView(1, 'view-1')]
    for (const view of fillViews) {
      view.context.wallFitMode = 'fill'
    }
    container = document.createElement('div')
    document.body.appendChild(container)
    act(() => {
      render(
        <Overlay
          config={makeConfig(2)}
          views={fillViews}
          streams={[makeStream('view-0'), makeStream('view-1')]}
          fullscreenViewIdx={null}
          onControl={onControl}
        />,
        container!,
      )
    })

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2' }))
    })
    expect(onControl).toHaveBeenLastCalledWith({
      type: 'set-wall-fit-mode-all',
      mode: 'fit',
    })

    const fitViews = [makeView(0, 'view-0'), makeView(1, 'view-1')]
    for (const view of fitViews) {
      view.context.wallFitMode = 'fit'
    }
    act(() => {
      render(
        <Overlay
          config={makeConfig(2)}
          views={fitViews}
          streams={[makeStream('view-0'), makeStream('view-1')]}
          fullscreenViewIdx={null}
          onControl={onControl}
        />,
        container!,
      )
    })
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2' }))
    })
    expect(onControl).toHaveBeenLastCalledWith({
      type: 'set-wall-fit-mode-all',
      mode: 'fill',
    })

    onControl.mockClear()
    act(() => {
      render(
        <Overlay
          config={makeConfig(2)}
          views={fitViews}
          streams={[makeStream('view-0'), makeStream('view-1')]}
          fullscreenViewIdx={0}
          onControl={onControl}
        />,
        container!,
      )
    })
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2' }))
    })
    expect(onControl).not.toHaveBeenCalled()
  })

  test('handles an F2 shortcut forwarded from a focused stream view', () => {
    const onControl = vi.fn()
    container = document.createElement('div')
    document.body.appendChild(container)

    act(() => {
      render(
        <Overlay
          config={makeConfig(1)}
          views={[makeView(0, 'view-0')]}
          streams={[makeStream('view-0')]}
          fullscreenViewIdx={null}
          fitModeShortcut={1}
          onControl={onControl}
        />,
        container!,
      )
    })

    expect(onControl).toHaveBeenCalledWith({
      type: 'set-wall-fit-mode-all',
      mode: 'fit',
    })
  })

  test('renders a stream chooser for every slot, including empty ones', () => {
    const root = renderOverlay([makeView(0, 'view-0')], [makeStream('view-0')])
    // renderOverlay uses a one-tile config; re-render it as four slots.
    act(() => {
      render(
        <Overlay
          config={makeConfig(4)}
          views={[makeView(0, 'view-0')]}
          streams={[makeStream('view-0')]}
          fullscreenViewIdx={null}
          onControl={() => {}}
        />,
        root,
      )
    })

    expect(root.querySelectorAll('[data-wall-tile-picker]')).toHaveLength(4)
    expect(root.textContent).toContain('Empty tile 4')
  })

  test('replaces an empty tile from a bare Twitch username', () => {
    const onControl = vi.fn()
    container = document.createElement('div')
    document.body.appendChild(container)
    act(() => {
      render(
        <Overlay
          config={makeConfig(2)}
          views={[]}
          streams={[]}
          fullscreenViewIdx={null}
          onControl={onControl}
        />,
        container!,
      )
    })

    const picker = container.querySelector(
      '[aria-label="Choose stream for tile 2"]',
    )!
    act(() => {
      picker.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    const input = container.querySelector(
      '[aria-label="Twitch username"]',
    ) as HTMLInputElement
    act(() => {
      input.value = 'lacy'
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    act(() => {
      input.form!.dispatchEvent(
        new SubmitEvent('submit', { bubbles: true, cancelable: true }),
      )
    })

    expect(onControl).toHaveBeenCalledWith({
      type: 'set-wall-stream',
      viewIdx: 1,
      username: 'lacy',
    })
  })

  test('shows an offline assignment without rendering a player control bar', () => {
    const stream: StreamData = {
      _id: 'twitch-offline_name',
      _dataSource: 'custom',
      kind: 'video',
      link: 'https://www.twitch.tv/offline_name',
      label: 'OfflineName',
    }
    const wallSlots: LiveWallSlotState[] = [
      {
        viewIdx: 0,
        streamId: stream._id,
        twitchStatus: 'offline',
      },
    ]
    container = document.createElement('div')
    document.body.appendChild(container)
    act(() => {
      render(
        <Overlay
          config={makeConfig(1)}
          views={[]}
          streams={[stream]}
          wallSlots={wallSlots}
          fullscreenViewIdx={null}
          onControl={() => {}}
        />,
        container!,
      )
    })

    expect(container.querySelector('[data-testid="offline-tile"]')).not.toBe(
      null,
    )
    expect(container.textContent).toContain('OfflineName')
    expect(container.textContent).toContain('Offline')
    expect(container.querySelector('[data-wall-media-controls]')).toBe(null)
  })

  test('double-click expands a stream and Escape restores the wall', () => {
    const onControl = vi.fn()
    container = document.createElement('div')
    document.body.appendChild(container)
    act(() => {
      render(
        <Overlay
          config={makeConfig(1)}
          views={[makeView(0, 'view-0')]}
          streams={[makeStream('view-0')]}
          fullscreenViewIdx={null}
          onControl={onControl}
        />,
        container!,
      )
    })

    act(() => {
      container!
        .querySelector('[data-wall-tile]')!
        .dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    })
    expect(onControl).toHaveBeenCalledWith({
      type: 'set-wall-fullscreen',
      viewIdx: 0,
      fullscreen: true,
    })

    act(() => {
      render(
        <Overlay
          config={makeConfig(1)}
          views={[makeView(0, 'view-0')]}
          streams={[makeStream('view-0')]}
          fullscreenViewIdx={0}
          onControl={onControl}
        />,
        container!,
      )
    })
    act(() => {
      container!
        .querySelector('[data-wall-tile]')!
        .dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    })
    expect(onControl).toHaveBeenLastCalledWith({
      type: 'set-wall-fullscreen',
      viewIdx: 0,
      fullscreen: false,
    })

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(onControl).toHaveBeenLastCalledWith({
      type: 'set-wall-fullscreen',
      viewIdx: 0,
      fullscreen: false,
    })
  })

  test('dragging one tile onto another requests a swap', () => {
    const onControl = vi.fn()
    container = document.createElement('div')
    document.body.appendChild(container)
    act(() => {
      render(
        <Overlay
          config={makeConfig(2)}
          views={[makeView(0, 'view-0'), makeView(1, 'view-1')]}
          streams={[makeStream('view-0'), makeStream('view-1')]}
          fullscreenViewIdx={null}
          onControl={onControl}
        />,
        container!,
      )
    })
    const dispatchPointer = (
      element: Element,
      type: string,
      clientX: number,
      clientY: number,
      button = 0,
    ) => {
      element.dispatchEvent(
        new PointerEvent(type, {
          pointerId: 1,
          button,
          clientX,
          clientY,
          bubbles: true,
          cancelable: true,
        }),
      )
    }
    const source = container.querySelector('[data-view-idx="0"]')!

    act(() => dispatchPointer(source, 'pointerdown', 25, 50))
    act(() => dispatchPointer(source, 'pointermove', 175, 50))
    act(() => dispatchPointer(source, 'pointerup', 175, 50))

    expect(onControl).toHaveBeenCalledWith({
      type: 'swap-wall-streams',
      fromViewIdx: 0,
      toViewIdx: 1,
    })
  })

  test('right-dragging a stream requests a persisted tile resize', () => {
    const onControl = vi.fn()
    container = document.createElement('div')
    document.body.appendChild(container)
    act(() => {
      render(
        <Overlay
          config={makeConfig(4)}
          views={[makeView(0, 'view-0')]}
          streams={[makeStream('view-0')]}
          fullscreenViewIdx={null}
          onControl={onControl}
        />,
        container!,
      )
    })
    const source = container.querySelector('[data-view-idx="0"]')!
    const dispatchPointer = (
      type: string,
      clientX: number,
      clientY: number,
    ) => {
      source.dispatchEvent(
        new PointerEvent(type, {
          pointerId: 2,
          button: 2,
          clientX,
          clientY,
          bubbles: true,
          cancelable: true,
        }),
      )
    }

    act(() => dispatchPointer('pointerdown', 25, 25))
    act(() => dispatchPointer('pointermove', 350, 75))
    const preview = container.querySelector('[data-wall-resize-preview]')!
    expect(preview).not.toBeNull()
    expect(getComputedStyle(preview).borderLeftWidth).toBe('0px')
    expect(getComputedStyle(preview).boxShadow).toBe('none')
    act(() => dispatchPointer('pointerup', 350, 75))

    expect(onControl).toHaveBeenCalledWith({
      type: 'resize-wall-tile',
      viewIdx: 0,
      targetViewIdx: 3,
    })
  })

  test('volume-slider gestures never begin a tile drag', () => {
    const onControl = vi.fn()
    container = document.createElement('div')
    document.body.appendChild(container)
    act(() => {
      render(
        <Overlay
          config={makeConfig(2)}
          views={[makeView(0, 'view-0'), makeView(1, 'view-1')]}
          streams={[makeStream('view-0'), makeStream('view-1')]}
          fullscreenViewIdx={null}
          onControl={onControl}
        />,
        container!,
      )
    })
    const slider = container.querySelector('[aria-label="Stream volume"]')!
    for (const [type, clientX] of [
      ['pointerdown', 25],
      ['pointermove', 175],
      ['pointerup', 175],
    ] as const) {
      act(() => {
        slider.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 3,
            button: 0,
            clientX,
            clientY: 50,
            bubbles: true,
            cancelable: true,
          }),
        )
      })
    }

    expect(onControl).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'swap-wall-streams' }),
    )
  })

  test('renders the hovered-tile username overlay from the stream URL', () => {
    const twitchStream: StreamData = {
      ...makeStream('payo'),
      link: 'https://www.twitch.tv/payo',
      label: 'Payo Display Name',
    }
    const view = makeView(0, 'payo')
    view.context.content = { url: twitchStream.link, kind: 'video' }
    const root = renderOverlay([view], [twitchStream])

    const badge = root.querySelector('[data-wall-username]')
    expect(badge).not.toBeNull()
    expect(badge?.textContent).toBe('payo')
  })

  test('never exposes native cursor tooltips on wall tiles or controls', () => {
    const root = renderOverlay([makeView(0, 'view-0')], [makeStream('view-0')])

    expect(root.querySelectorAll('[title]')).toHaveLength(0)
  })

  test('auto-hides all tile chrome after pointer activity becomes idle', () => {
    vi.useFakeTimers()
    const root = renderOverlay([makeView(0, 'view-0')], [makeStream('view-0')])
    const tile = root.querySelector('[data-wall-tile]')!
    const controls = root.querySelector('[data-wall-media-controls]')!
    const username = root.querySelector('[data-wall-username]')!
    const picker = root.querySelector('[data-wall-tile-picker]')!

    expect(tile.getAttribute('data-wall-chrome-visible')).toBe('false')

    act(() => {
      tile.dispatchEvent(
        new PointerEvent('pointermove', { pointerId: 9, bubbles: true }),
      )
    })
    expect(tile.getAttribute('data-wall-chrome-visible')).toBe('true')
    expect(getComputedStyle(controls).opacity).toBe('1')
    expect(getComputedStyle(username).opacity).toBe('1')
    expect(getComputedStyle(picker).opacity).toBe('1')

    act(() => vi.advanceTimersByTime(WALL_CHROME_IDLE_MS - 500))
    act(() => {
      tile.dispatchEvent(
        new PointerEvent('pointermove', { pointerId: 9, bubbles: true }),
      )
    })
    act(() => vi.advanceTimersByTime(500))
    expect(tile.getAttribute('data-wall-chrome-visible')).toBe('true')

    act(() => vi.advanceTimersByTime(WALL_CHROME_IDLE_MS - 500))
    expect(tile.getAttribute('data-wall-chrome-visible')).toBe('false')
    expect(getComputedStyle(controls).opacity).toBe('0')
    expect(getComputedStyle(username).opacity).toBe('0')
    expect(getComputedStyle(picker).opacity).toBe('0')
  })

  test('uses edge-to-edge tile hit areas without borders or audible glows', () => {
    const view = makeView(0, 'view-0')
    view.context.wallAudioMode = 'unmuted'
    container = document.createElement('div')
    document.body.appendChild(container)
    act(() => {
      render(
        <Overlay
          config={makeConfig(1)}
          views={[view]}
          streams={[makeStream('view-0')]}
          fullscreenViewIdx={0}
          onControl={() => {}}
        />,
        container!,
      )
    })

    const style = getComputedStyle(container.querySelector('[data-wall-tile]')!)
    expect(style.borderLeftWidth).toBe('0px')
    expect(style.borderRightWidth).toBe('0px')
    expect(style.boxShadow).toBe('none')
  })
})

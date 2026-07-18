// @vitest-environment happy-dom
import { render } from 'preact'
import { act } from 'preact/test-utils'
import type {
  StreamData,
  StreamWindowConfig,
  ViewState,
} from 'streamwall-shared'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { Overlay } from './OverlayRoot'

let container: HTMLDivElement | undefined

afterEach(() => {
  if (container) {
    act(() => render(null, container!))
    container.remove()
    container = undefined
  }
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

// Walks up from the matched label span to the tile element that is a direct
// child of the overlay container (i.e. the `SpaceBorder` for that view),
// rather than stopping at the shared container itself.
function findTile(root: HTMLDivElement, label: string): Element | undefined {
  const overlayContainer = root.firstElementChild
  const span = [...root.querySelectorAll('span')].find(
    (el) => el.textContent === label,
  )
  let node: Element | null = span ?? null
  while (node && node.parentElement !== overlayContainer) {
    node = node.parentElement
  }
  return node ?? undefined
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
    const tileBefore = findTile(root, 'view-1')
    expect(tileBefore, 'expected to find a tile for view-1').not.toBeUndefined()

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

    const tileAfter = findTile(root, 'view-1')
    expect(
      tileAfter,
      'expected to still find a tile for view-1',
    ).not.toBeUndefined()
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
})

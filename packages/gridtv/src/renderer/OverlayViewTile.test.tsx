// @vitest-environment happy-dom
import type { StreamData } from 'gridtv-shared'
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, describe, expect, test } from 'vitest'
import { OverlayViewTile } from './OverlayViewTile'

let container: HTMLDivElement | undefined

afterEach(() => {
  if (container) {
    act(() => render(null, container!))
    container.remove()
    container = undefined
  }
})

function renderTile(
  props: Partial<Parameters<typeof OverlayViewTile>[0]> = {},
): HTMLDivElement {
  container = document.createElement('div')
  document.body.appendChild(container)
  act(() => {
    render(
      <OverlayViewTile
        url="https://example.com/stream"
        data={undefined}
        isError={false}
        errorReason={null}
        isBlurred={false}
        isLoading={false}
        {...props}
      />,
      container!,
    )
  })
  return container
}

describe('OverlayViewTile', () => {
  test('renders the error badge and reason for an errored view', () => {
    const data: StreamData = {
      _id: 'a',
      _dataSource: 'test',
      kind: 'video',
      link: 'https://example.com/stream',
      source: 'Example',
      label: 'Example Stream',
    }
    const tile = renderTile({
      data,
      isError: true,
      errorReason: 'Stream unavailable',
    })

    expect(tile.textContent).toContain('Example Stream')
    expect(tile.textContent).toContain('Stream unavailable')
    expect(tile.querySelector('svg')).not.toBeNull()
  })

  test('falls back to a generic label when the errored stream has no title', () => {
    const tile = renderTile({
      data: undefined,
      isError: true,
      errorReason: null,
    })

    expect(tile.textContent).toContain('Stream error')
    // No reason was provided, so the heading is the only text rendered.
    expect(tile.textContent).toBe('Stream error')
  })

  test('does not render attribution over a healthy stream', () => {
    const data: StreamData = {
      _id: 'a',
      _dataSource: 'test',
      kind: 'video',
      link: 'https://example.com/stream',
      source: 'Example',
      label: 'Example Stream',
    }
    const tile = renderTile({
      data,
      isError: false,
      errorReason: null,
    })

    expect(tile.textContent).not.toContain('Stream error')
    expect(tile.textContent).not.toContain('Stream unavailable')
    expect(tile.textContent).not.toContain('Example Stream')
    // The hidden loading spinner is the only overlay retained for a healthy
    // stream; the platform/name badge must not cover the video.
    const svgs = tile.querySelectorAll('svg')
    expect(svgs).toHaveLength(1)
    expect(svgs[0].querySelector('circle')).not.toBeNull()
  })

  test('shows the loading spinner while isLoading is true', () => {
    const tile = renderTile({ isLoading: true })

    const spinner = tile.querySelector('svg circle')?.closest('svg')
    expect(spinner).not.toBeNull()
    expect(getComputedStyle(spinner!).opacity).toBe('0.5')
    expect(getComputedStyle(spinner!).visibility).toBe('visible')
  })

  test('hides the loading spinner while isLoading is false', () => {
    const tile = renderTile({ isLoading: false })

    const spinner = tile.querySelector('svg circle')?.closest('svg')
    expect(spinner).not.toBeNull()
    expect(getComputedStyle(spinner!).opacity).toBe('0')
    expect(getComputedStyle(spinner!).visibility).toBe('hidden')
  })

  test('does not leak custom styled-component props onto the DOM nodes (#152)', () => {
    const data: StreamData = {
      _id: 'a',
      _dataSource: 'test',
      kind: 'video',
      link: 'https://example.com/stream',
      source: 'Example',
      label: 'Example Stream',
      city: 'Portland',
      state: 'OR',
    }
    const tile = renderTile({
      data,
      isError: false,
      isBlurred: true,
      isLoading: true,
    })

    for (const el of tile.querySelectorAll('*')) {
      for (const propName of ['isvisible', 'isblurred', 'isdesaturated']) {
        expect(
          el.hasAttribute(propName),
          `<${el.tagName.toLowerCase()}> unexpectedly has a "${propName}" attribute`,
        ).toBe(false)
      }
    }
  })
})

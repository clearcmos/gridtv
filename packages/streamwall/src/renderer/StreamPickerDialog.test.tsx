// @vitest-environment happy-dom
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StreamPickerDialog } from './StreamPickerDialog'

let container: HTMLDivElement | undefined

afterEach(() => {
  vi.useRealTimers()
  if (container) {
    act(() => render(null, container!))
    container.remove()
    container = undefined
  }
})

describe('StreamPickerDialog', () => {
  it('debounces remote Twitch suggestions and selects a result', async () => {
    vi.useFakeTimers()
    const onSearch = vi.fn(async () => [
      { login: 'lacy', displayName: 'Lacy', isLive: true },
    ])
    const onSubmit = vi.fn()
    container = document.createElement('div')
    document.body.appendChild(container)
    act(() => {
      render(
        <StreamPickerDialog
          viewIdx={0}
          initialValue=""
          onSearch={onSearch}
          onSubmit={onSubmit}
          onClose={() => {}}
        />,
        container!,
      )
    })
    const input = container.querySelector(
      '[aria-label="Twitch username"]',
    ) as HTMLInputElement
    act(() => {
      input.value = 'lac'
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(onSearch).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(350)
    })
    expect(onSearch).toHaveBeenCalledTimes(1)
    expect(onSearch).toHaveBeenCalledWith('lac')

    const suggestion = [...container.querySelectorAll('button')].find(
      (button) => button.textContent?.includes('@lacy'),
    )!
    act(() => {
      suggestion.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onSubmit).toHaveBeenCalledWith('lacy')
  })
})

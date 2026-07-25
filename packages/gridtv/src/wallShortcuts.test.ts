import { describe, expect, it, vi } from 'vitest'
import {
  WallShortcutRouter,
  createLocalWallShortcutBridge,
  parseWallShortcutInput,
} from './wallShortcuts'

describe('WallShortcutRouter', () => {
  it('emits one shortcut when two views observe the same physical key press', () => {
    const router = new WallShortcutRouter()
    const input = { type: 'keyDown', key: 'f', code: 'KeyF' } as const

    expect(router.route(input).shortcut).toEqual({
      type: 'tile-key',
      key: 'f',
    })
    expect(router.route(input)).toEqual({ handled: true })
  })

  it('allows a deliberate repeat after keyUp without using a clock window', () => {
    const router = new WallShortcutRouter()
    const down = { type: 'keyDown', key: 'F2', code: 'F2' } as const
    const up = { type: 'keyUp', key: 'F2', code: 'F2' } as const

    expect(router.route(down).shortcut).toEqual({ type: 'cycle-fit-mode' })
    expect(router.route(up)).toEqual({ handled: true })
    expect(router.route(down).shortcut).toEqual({ type: 'cycle-fit-mode' })
  })

  it('does not claim letter shortcuts while chat owns text input', () => {
    const router = new WallShortcutRouter()

    expect(
      router.route({ type: 'keyDown', key: 'c', code: 'KeyC' }, false),
    ).toEqual({ handled: false })
  })

  it('ignores modified tile keys and auto-repeat', () => {
    const router = new WallShortcutRouter()

    expect(
      router.route({
        type: 'keyDown',
        key: 'f',
        code: 'KeyF',
        control: true,
      }),
    ).toEqual({ handled: false })
    expect(
      router.route({
        type: 'keyDown',
        key: 'e',
        code: 'KeyE',
        isAutoRepeat: true,
      }),
    ).toEqual({ handled: true })
  })

  it('validates untrusted renderer input', () => {
    expect(
      parseWallShortcutInput({
        type: 'keyDown',
        key: 'F1',
        code: 'F1',
        control: false,
      }),
    ).toEqual({
      type: 'keyDown',
      key: 'F1',
      code: 'F1',
      alt: undefined,
      control: false,
      meta: undefined,
      shift: undefined,
      isAutoRepeat: undefined,
    })
    expect(parseWallShortcutInput({ type: 'keyDown', key: 1 })).toBeUndefined()
  })
})

describe('createLocalWallShortcutBridge', () => {
  it('delivers semantic shortcuts through the same subscription interface', () => {
    const bridge = createLocalWallShortcutBridge()
    const handler = vi.fn()
    const unsubscribe = bridge.subscribe(handler)

    bridge.send({ type: 'keyDown', key: 'Escape', code: 'Escape' })

    expect(handler).toHaveBeenCalledWith({ type: 'exit-fullscreen' })
    unsubscribe()
  })
})

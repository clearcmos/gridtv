export type WallShortcut =
  | { type: 'toggle-grid-menu' }
  | { type: 'cycle-fit-mode' }
  | { type: 'exit-fullscreen' }
  | { type: 'tile-key'; key: 'f' | 'e' | 'c' }

export interface WallShortcutInput {
  type: 'keyDown' | 'keyUp'
  key: string
  code?: string
  alt?: boolean
  control?: boolean
  meta?: boolean
  shift?: boolean
  isAutoRepeat?: boolean
}

export interface WallShortcutBridge {
  send(input: WallShortcutInput): void
  subscribe(handler: (shortcut: WallShortcut) => void): () => void
}

export interface WallShortcutRoute {
  handled: boolean
  shortcut?: WallShortcut
}

function normalizedKey(input: Pick<WallShortcutInput, 'key'>): string {
  return input.key.toLowerCase()
}

function inputIdentity(input: WallShortcutInput): string {
  return input.code || normalizedKey(input)
}

export function wallShortcutForInput(
  input: WallShortcutInput,
  includeTileKeys = true,
): WallShortcut | undefined {
  if (input.key === 'F1') {
    return { type: 'toggle-grid-menu' }
  }
  if (input.key === 'F2') {
    return { type: 'cycle-fit-mode' }
  }
  if (input.key === 'Escape') {
    return { type: 'exit-fullscreen' }
  }
  const key = normalizedKey(input)
  if (
    includeTileKeys &&
    !input.alt &&
    !input.control &&
    !input.meta &&
    (key === 'f' || key === 'e' || key === 'c')
  ) {
    return { type: 'tile-key', key }
  }
  return undefined
}

/**
 * Deduplicates one physical key press observed by multiple Electron views.
 *
 * A key remains claimed from its first keyDown until keyUp. This avoids clock
 * windows while still allowing deliberate repeated presses.
 */
export class WallShortcutRouter {
  private readonly pressedKeys = new Set<string>()

  route(input: WallShortcutInput, includeTileKeys = true): WallShortcutRoute {
    const identity = inputIdentity(input)
    if (input.type === 'keyUp') {
      this.pressedKeys.delete(identity)
      return {
        handled:
          wallShortcutForInput(
            { ...input, type: 'keyDown' },
            includeTileKeys,
          ) !== undefined,
      }
    }

    const shortcut = wallShortcutForInput(input, includeTileKeys)
    if (!shortcut) {
      return { handled: false }
    }
    if (input.isAutoRepeat || this.pressedKeys.has(identity)) {
      return { handled: true }
    }
    this.pressedKeys.add(identity)
    return { handled: true, shortcut }
  }

  reset(): void {
    this.pressedKeys.clear()
  }
}

export function parseWallShortcutInput(
  value: unknown,
): WallShortcutInput | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined
  }
  const input = value as Partial<WallShortcutInput>
  if (
    (input.type !== 'keyDown' && input.type !== 'keyUp') ||
    typeof input.key !== 'string' ||
    (input.code !== undefined && typeof input.code !== 'string')
  ) {
    return undefined
  }
  for (const flag of [
    input.alt,
    input.control,
    input.meta,
    input.shift,
    input.isAutoRepeat,
  ]) {
    if (flag !== undefined && typeof flag !== 'boolean') {
      return undefined
    }
  }
  return {
    type: input.type,
    key: input.key,
    code: input.code,
    alt: input.alt,
    control: input.control,
    meta: input.meta,
    shift: input.shift,
    isAutoRepeat: input.isAutoRepeat,
  }
}

export function createLocalWallShortcutBridge(): WallShortcutBridge {
  const router = new WallShortcutRouter()
  const handlers = new Set<(shortcut: WallShortcut) => void>()
  return {
    send(input) {
      const { shortcut } = router.route(input)
      if (shortcut) {
        for (const handler of handlers) {
          handler(shortcut)
        }
      }
    },
    subscribe(handler) {
      handlers.add(handler)
      return () => handlers.delete(handler)
    },
  }
}

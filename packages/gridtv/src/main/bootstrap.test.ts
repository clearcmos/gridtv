import { describe, expect, it, vi } from 'vitest'
import { startGridtv, type GridtvBootstrapOptions } from './bootstrap'

interface TestConfig {
  help: boolean
  log: {
    level: 'debug' | 'info'
  }
  telemetry: {
    sentry: boolean
  }
}

function makeOptions(
  config: TestConfig = {
    help: false,
    log: { level: 'info' },
    telemetry: { sentry: false },
  },
) {
  const appendSwitch = vi.fn()
  const app = {
    commandLine: { appendSwitch },
    quit: vi.fn(),
    setDesktopName: vi.fn(),
    enableSandbox: vi.fn(),
    whenReady: vi.fn(() => Promise.resolve()),
  }
  const options: GridtvBootstrapOptions<TestConfig> = {
    squirrelStarted: false,
    app,
    platform: 'linux',
    initLogger: vi.fn(),
    parseArgs: vi.fn(() => config),
    resolveConfigInitError: vi.fn(() => ({ action: 'rethrow' as const })),
    setLogLevel: vi.fn(),
    initializeSentry: vi.fn(),
    sentryEnabledSwitch: 'gridtv-sentry-enabled',
    sentryEnabledSwitchValue: vi.fn((enabled) => String(enabled)),
    updateApp: vi.fn(),
    runMain: vi.fn(async () => undefined),
    log: {
      debug: vi.fn(),
      error: vi.fn(),
    },
    exit: vi.fn(),
  }
  return { options, app, appendSwitch }
}

describe('startGridtv', () => {
  it('quits immediately for a Squirrel install event', () => {
    const { options, app } = makeOptions()
    options.squirrelStarted = true

    startGridtv(options)

    expect(app.quit).toHaveBeenCalledOnce()
    expect(options.initLogger).not.toHaveBeenCalled()
    expect(options.parseArgs).not.toHaveBeenCalled()
  })

  it('prints help without initializing the Electron runtime', () => {
    const { options, app } = makeOptions({
      help: true,
      log: { level: 'debug' },
      telemetry: { sentry: true },
    })

    startGridtv(options)

    expect(options.initLogger).toHaveBeenCalledOnce()
    expect(options.setLogLevel).toHaveBeenCalledWith('debug')
    expect(options.initializeSentry).not.toHaveBeenCalled()
    expect(options.updateApp).not.toHaveBeenCalled()
    expect(app.whenReady).not.toHaveBeenCalled()
  })

  it('configures Electron and starts the runtime after app readiness', async () => {
    const { options, app, appendSwitch } = makeOptions()

    startGridtv(options)
    await vi.waitFor(() => expect(options.runMain).toHaveBeenCalledOnce())

    expect(options.initializeSentry).not.toHaveBeenCalled()
    expect(options.sentryEnabledSwitchValue).toHaveBeenCalledWith(false)
    expect(appendSwitch).toHaveBeenCalledWith('gridtv-sentry-enabled', 'false')
    expect(options.updateApp).not.toHaveBeenCalled()
    expect(app.setDesktopName).toHaveBeenCalledWith('gridtv.desktop')
    expect(appendSwitch).toHaveBeenCalledWith('high-dpi-support', '1')
    expect(appendSwitch).toHaveBeenCalledWith('force-device-scale-factor', '1')
    expect(app.enableSandbox).toHaveBeenCalledOnce()
    expect(options.runMain).toHaveBeenCalledWith(
      expect.objectContaining({ help: false }),
    )
  })

  it('initializes Sentry when telemetry is enabled', async () => {
    const { options } = makeOptions({
      help: false,
      log: { level: 'info' },
      telemetry: { sentry: true },
    })

    startGridtv(options)
    await vi.waitFor(() => expect(options.runMain).toHaveBeenCalledOnce())

    expect(options.initializeSentry).toHaveBeenCalledOnce()
  })

  it('initializes updates and omits the Linux desktop name elsewhere', async () => {
    const { options, app } = makeOptions()
    options.platform = 'win32'

    startGridtv(options)
    await vi.waitFor(() => expect(options.runMain).toHaveBeenCalledOnce())

    expect(options.updateApp).toHaveBeenCalledOnce()
    expect(app.setDesktopName).not.toHaveBeenCalled()
  })

  it('reports expected config failures and exits cleanly', () => {
    const { options } = makeOptions()
    const error = new Error('invalid config')
    vi.mocked(options.parseArgs).mockImplementation(() => {
      throw error
    })
    vi.mocked(options.resolveConfigInitError).mockReturnValue({
      action: 'exit',
      message: 'bad config.toml',
      exitCode: 1,
    })

    startGridtv(options)

    expect(options.log.error).toHaveBeenCalledWith('bad config.toml')
    expect(options.exit).toHaveBeenCalledWith(1)
    expect(options.updateApp).not.toHaveBeenCalled()
  })

  it('rethrows unexpected argument parsing failures', () => {
    const { options } = makeOptions()
    const error = new Error('unexpected')
    vi.mocked(options.parseArgs).mockImplementation(() => {
      throw error
    })

    expect(() => startGridtv(options)).toThrow(error)
  })

  it('logs an asynchronous runtime failure and exits', async () => {
    const { options } = makeOptions()
    const error = new Error('startup failed')
    vi.mocked(options.runMain).mockRejectedValue(error)

    startGridtv(options)
    await vi.waitFor(() => expect(options.exit).toHaveBeenCalledWith(1))

    expect(options.log.error).toHaveBeenCalledWith(error)
  })
})

import type { ConfigInitErrorOutcome } from './configInitError'

interface BootstrapConfig {
  help: boolean
  log: {
    level: string
  }
  telemetry: {
    sentry: boolean
  }
}

interface BootstrapAppPort {
  commandLine: {
    appendSwitch(name: string, value?: string): void
  }
  quit(): void
  setDesktopName(name: string): void
  enableSandbox(): void
  whenReady(): Promise<unknown>
}

interface BootstrapLogger {
  debug(...params: unknown[]): void
  error(...params: unknown[]): void
}

export interface GridtvBootstrapOptions<C extends BootstrapConfig> {
  squirrelStarted: boolean
  app: BootstrapAppPort
  platform: NodeJS.Platform
  initLogger(): void
  parseArgs(): C
  resolveConfigInitError(error: unknown): ConfigInitErrorOutcome
  setLogLevel(level: C['log']['level']): void
  initializeSentry(): void
  sentryEnabledSwitch: string
  sentryEnabledSwitchValue(enabled: boolean): string
  updateApp(): void
  runMain(config: C): Promise<void>
  log: BootstrapLogger
  exit(code: number): void
}

/**
 * Owns the final process bootstrap wiring around the application runtime.
 * Keeping these side effects behind ports makes the entry-point contract
 * directly testable without starting Electron.
 */
export function startGridtv<C extends BootstrapConfig>(
  options: GridtvBootstrapOptions<C>,
): void {
  if (options.squirrelStarted) {
    options.app.quit()
    return
  }

  options.log.debug('Starting gridtv...')
  options.initLogger()
  options.log.debug('Parsing command line arguments...')

  let config: C
  try {
    config = options.parseArgs()
  } catch (error) {
    const outcome = options.resolveConfigInitError(error)
    if (outcome.action === 'exit') {
      options.log.error(outcome.message)
      options.exit(outcome.exitCode)
      return
    }
    throw error
  }

  options.setLogLevel(config.log.level)
  if (config.help) {
    return
  }

  options.log.debug('Initializing Sentry...')
  if (config.telemetry.sentry) {
    options.initializeSentry()
  }
  options.app.commandLine.appendSwitch(
    options.sentryEnabledSwitch,
    options.sentryEnabledSwitchValue(config.telemetry.sentry),
  )

  if (options.platform !== 'linux') {
    options.updateApp()
  }

  options.log.debug('Setting up Electron...')
  if (options.platform === 'linux') {
    options.app.setDesktopName('gridtv.desktop')
  }
  options.app.commandLine.appendSwitch('high-dpi-support', '1')
  options.app.commandLine.appendSwitch('force-device-scale-factor', '1')

  options.log.debug('Enabling Electron sandbox...')
  options.app.enableSandbox()

  void options.app
    .whenReady()
    .then(() => options.runMain(config))
    .catch((error) => {
      options.log.error(error)
      options.exit(1)
    })
}

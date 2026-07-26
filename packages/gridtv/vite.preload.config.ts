import { defineConfig, type Plugin } from 'vite'

/**
 * Electron Forge still injects Rollup's deprecated inlineDynamicImports flag
 * for preload bundles. Translate it to Rolldown's equivalent until the Forge
 * Vite plugin does so itself.
 */
function disablePreloadCodeSplitting(): Plugin {
  return {
    name: 'gridtv:disable-preload-code-splitting',
    config(config) {
      const output = config.build?.rollupOptions?.output
      const outputs = Array.isArray(output) ? output : output ? [output] : []
      for (const options of outputs) {
        delete options.inlineDynamicImports
        ;(
          options as typeof options & { codeSplitting?: boolean }
        ).codeSplitting = false
      }
    },
  }
}

// https://vitejs.dev/config
export default defineConfig({
  build: {
    sourcemap: true,
  },
  plugins: [disablePreloadCodeSplitting()],
})

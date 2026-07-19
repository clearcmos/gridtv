import preact from '@preact/preset-vite'
import { resolve } from 'path'
import { defineConfig } from 'vite'

// https://vitejs.dev/config
export default defineConfig({
  build: {
    sourcemap: true,
    rollupOptions: {
      input: {
        background: resolve(__dirname, 'src/renderer/background.html'),
        overlay: resolve(__dirname, 'src/renderer/overlay.html'),
        playHLS: resolve(__dirname, 'src/renderer/playHLS.html'),
      },
    },
  },

  resolve: {
    alias: {
      // Necessary for vite to watch the package dir
      'gridtv-shared': resolve(__dirname, '../gridtv-shared'),
    },
  },

  plugins: [
    // devToolsEnabled: false disables the preact:transform-hook-names plugin, which
    // crashes under newer Vite/Node because zimmerframe@1.1.4 is ESM-only (no CJS
    // `main`/`require` export) and the plugin loads it via require().
    ...preact({ devToolsEnabled: false }),
  ],
})

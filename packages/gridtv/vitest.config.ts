import { defineConfig } from 'vitest/config'

// Most tests here are plain Node unit tests, but the renderer ships Preact
// components. Component tests opt into a DOM via `// @vitest-environment
// happy-dom` per file. `preact/compat` is aliased for `react`/`react-dom`,
// matching how react-icons and react-hotkeys-hook resolve at runtime.
//
// `react-icons` and `styled-components` ship both a CJS build (whose internal
// `require('react')` bypasses the alias above under Vitest's SSR-like module
// runner) and an ESM build (whose `import ... from 'react'` resolves through
// Vite's resolver, honoring the alias). `mainFields` prefers their ESM/browser
// builds, and `deps.inline` forces both through Vite's transform pipeline
// instead of being loaded as opaque external CJS modules - without both, they
// resolve the real `react` package instead of `preact/compat`, which crashes
// react-icons (`Cannot add property __, object is not extensible`, a frozen
// React element hitting Preact's reconciler) and makes styled-components
// render elements with their generated class name as the tag instead of the
// real DOM tag. `svg-loaders-react` used to have the same CJS-only problem
// (see issue #182); it was replaced with a first-party inlined component
// (see OverlayViewTile.tsx's TailSpin import) rather than extending this fix
// to a third dependency.
export default defineConfig({
  oxc: {
    jsx: {
      runtime: 'automatic',
      importSource: 'preact',
    },
  },
  resolve: {
    mainFields: ['browser', 'module', 'main'],
    alias: {
      react: 'preact/compat',
      'react-dom': 'preact/compat',
    },
  },
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.d.ts',
        '**/gridtv-shared/**',
        // These process bootstrap files are exercised by the packaged startup
        // smoke test rather than imported into a unit-test process.
        'src/main/index.ts',
        'src/preload/sentryPreload.ts',
        'src/renderer/background.tsx',
        'src/renderer/overlay.tsx',
      ],
      reporter: ['text', 'json-summary'],
      thresholds: {
        branches: 80,
        lines: 80,
      },
    },
    server: {
      deps: {
        inline: [/react-icons/, /styled-components/],
      },
    },
  },
})

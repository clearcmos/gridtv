# gridtv

gridtv is a self-contained Twitch livestream video wall built with Electron and
TypeScript. The video wall is the entire interface: there is no staging window,
no control UI, and no bundled control server. It is a fork of Streamwall (see
Provenance below), narrowed to a single live-view Twitch wall.

## Provenance

- Original: Streamwall by Max Goodhart (chromakode), MIT licensed.
- Intermediate fork: `NilsR0711/streamwall` (Nils Reeh). This repo was forked
  from there.
- This fork: gridtv (`clearcmos`).

Full upstream git history is preserved in this repo. If a future live-view
feature needs code that was removed here (the control server, control UI, or
control window), pull it back from either:

- `git log` or `git show` on this repo's own history, or
- the upstream `NilsR0711/streamwall` repository.

The public repository is `clearcmos/gridtv`. Use it as `origin`; keep
`NilsR0711/streamwall` as `upstream` when an upstream remote is useful.

## Product behavior

- The wall supports an exact count of 1 to 9 cells. F1 opens the wall menu.
- Left-drag swaps streams. Right-drag stretches one stream across adjacent
  cells; repeated stream IDs in saved Yjs state encode that span. Selecting the
  current tile count again collapses spans into distinct cells.
- F2 toggles wall-wide Fit and Fill. Double-click toggles native fullscreen for
  one stream. Escape restores the wall.
- Twitch channel URLs use the lightweight player and source quality by default.
  Both are configurable.
- Assignments and per-tile media settings persist in `streamwall-storage.json`
  under Electron's gridtv user-data directory. The filename and internal
  `streamwall` keys are intentionally retained for compatibility.

## Project structure

npm workspaces monorepo (Node >= 22), two packages:

- `packages/gridtv` - the Electron app.
  - `src/main/` - main process (window management, config, data sources,
    Twitch search/bot, Streamdelay client, the optional remote uplink,
    `viewStateMachine` built on XState).
  - `src/preload/` - sandboxed preload bridges (`layerPreload`, `mediaPreload`,
    plus `snapshotController` / `volumeController` helpers).
  - `src/renderer/` - Preact renderers for the wall: `overlay` (the wall UI),
    `background`, and `playHLS`. Styled with styled-components.
  - `forge.config.ts` / `forge.signing.ts` / `forge.publisher.ts` - Electron
    Forge build, code-signing, and GitHub publish config.
  - `vite.*.config.ts` - Vite build configs for main, preload, renderer.
- `packages/gridtv-shared` - shared TypeScript types and Zod schemas used by the
  app (`gridtv-shared` is imported both as a package specifier and, in a few
  files, via relative path into `src/`).

## Build / dev

```
npm install                 # install workspace deps
npm run start:app           # run the Electron app (dev)
npm run start:app -- --help # list all config options
npm run typecheck           # tsc --noEmit across workspaces
npm test                    # vitest across workspaces
npm run lint                # eslint
npm run format:check        # prettier check (format to write)
```

Desktop builds (in `packages/gridtv`): `npm run package` / `npm run make` /
`npm run publish` via Electron Forge. Signing is opt-in (see README).
Linux `make` needs the external Debian and RPM maker binaries; the release
workflow installs them before publishing.

## Code style

- TypeScript throughout; Prettier (config in `prettier.config.js`, with
  `prettier-plugin-organize-imports`) and flat-config ESLint 10
  (`eslint.config.mjs`). Renderer packages get the React Hooks rules (Preact
  mirrors the hooks API).
- Renderers use Preact + styled-components. State machines use XState v5.
- Do not use emojis, em dashes, or double dashes (project + global convention).

## Fork changes (relative to `NilsR0711/streamwall`)

Rename:

- `streamwall` package -> `gridtv`; `streamwall-shared` -> `gridtv-shared`
  (dirs, package.json `name`, all import specifiers and relative paths).
- App identity: `productName` and `executableName` -> `gridtv`; window titles,
  HTML `<title>`s, and user-facing "Streamwall" strings -> `gridtv`.
- Root `name` -> `gridtv`; `repository` -> `github:clearcmos/gridtv`; `author`
  -> `clearcmos`.

Removed (dropping the control/remote-operation stack):

- The 4 control packages: `streamwall-control-client`, `-server`, `-ui`,
  `-e2e`.
- The control-server deploy assets (`deploy/`) and docs
  (`docs/self-hosting.md`, `docs/images/control-ui.png`).
- The in-app control window: `src/renderer/control.tsx` + `control.html`,
  `src/main/ControlWindow.ts`, `src/main/controlWindowEcho.ts`, and
  `src/preload/controlPreload.ts` (plus their tests). The control window was
  already dead code here (the main process never opened it), but it was the only
  real consumer of `streamwall-control-ui`.
- CI jobs that built/tested the control packages (`build`, `e2e` in
  `ci.yml`); the `start:server` root script; control-UI eslint globs; the
  `controlPreload` Forge preload entry; the `control` Vite rollup input and the
  `streamwall-control-ui` Vite alias.

Kept deliberately:

- The remote uplink (`src/main/controlEndpointConnection.ts`, `uplink*.ts`) and
  the command bus (`commandDispatch.ts`, `onCommand`). These are wired into
  `src/main/index.ts` but are inert unless a `control.endpoint` is configured,
  so the app is live-view-only in practice. This is the "control-room code" most
  likely to be reused by future live-view features. Safe to excise later; it is
  a contiguous block plus a small gate in `onCommand`.
- The 3-line global CSS that the wall needs was vendored from
  `streamwall-control-ui/src/index.css` into
  `packages/gridtv/src/renderer/appGlobal.css`.
- Dependencies previously supplied only by removed workspaces are now declared
  by their consumers: Noto Sans belongs to `gridtv`, while the shared tsconfig
  presets belong to `gridtv-shared`.

Not renamed (intentional):

- Internal code identifiers that carry the `Streamwall` prefix
  (`StreamwallState`, `StreamwallConfig`, `StreamwallLayerGlobal`, the
  `window.streamwall` preload global, the `streamwall:` storage-key prefix).
  These are not user-facing; renaming them is churn with breakage risk.
- Wire-protocol / fixture values: the `'streamwall'` `AuthTokenKind` (control
  uplink protocol value) and `'streamwall'` inputs in `colors.test.ts` (their
  expected hash outputs are computed for that exact string).

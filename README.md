# gridtv

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![CI](https://github.com/clearcmos/gridtv/actions/workflows/ci.yml/badge.svg)](https://github.com/clearcmos/gridtv/actions/workflows/ci.yml)
![Platforms](https://img.shields.io/badge/platforms-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey.svg)

gridtv is a self-contained Twitch livestream video wall built with Electron and
TypeScript. It composes multiple live Twitch streams into a mosaic with
per-tile audio control. The video wall is the complete interface: there is no
separate staging window, no control UI, and no bundled control server.

> gridtv is a fork of [Streamwall](https://github.com/chromakode/streamwall) by
> Max Goodhart ([chromakode](https://github.com/chromakode)), by way of the
> [NilsR0711/streamwall](https://github.com/NilsR0711/streamwall) fork. It keeps
> Streamwall's Electron video-wall engine and strips it down to a single
> live-view Twitch wall: the remote control server, the web control client, and
> the local control window have been removed. See [Credits](#credits) and
> [LICENSE](LICENSE).

## How it works

Under the hood, gridtv is a specialized web browser for mosaicing video
streams. It uses [Electron](https://www.electronjs.org) to create a grid of
web browser views, loading the specified pages into them. Once a page loads,
gridtv finds the `<video>` tag and reformats the page so that the video fills
the tile. This works for a wide variety of pages without specialized scrapers.

## Features

- **Exact 1–9 tile wall:** press **F1** and click a number; every count fills the window edge-to-edge without an unused grid cell.
- **Direct stream replacement:** click the edit/plus icon in any tile and type a Twitch username; a full URL is optional.
- **Per-tile audio mixing:** every tile can be muted or unmuted independently, so multiple streams can play audio simultaneously, each with its own volume slider.
- **Fast wall interaction:** double-click a playing tile to expand it, press Escape or double-click again to restore the wall, and drag one tile onto another to swap them.
- **Resizable tiles:** right-drag across cells to stretch one stream over a larger region; displaced streams move to available cells when possible.
- **Offline-aware restore:** saved Twitch assignments are checked together on startup; offline channels show a replaceable placeholder without creating a failing player.
- **Blur/censor:** blur individual tiles, or trigger a wall-wide [Streamdelay](https://github.com/chromakode/streamdelay) censor mode.
- **Automatic recovery:** failed or stalled stream loads are retried automatically with exponential backoff, and the failure is surfaced on the wall.
- **Flexible data sources:** load streams from JSON APIs, TOML files, or add them ad hoc (including `overlay`/`background` kinds for widgets and chroma-key layers).
- **Playlists:** optionally cycle a grid cell through a fixed list of stream URLs on an interval.
- **Twitch chat bot:** an optional bot posts templated announcements and runs viewer polls in a Twitch channel's chat.

## Running from source

gridtv is an npm workspaces monorepo with two packages: `gridtv` (the Electron
app) and `gridtv-shared` (shared types and schemas). Requires Node.js >= 22.

```
npm install
npm run start:app
```

To see all configuration options:

```
npm run start:app -- --help
```

## Configuration

For long-term installations, put your options into a configuration file.
Development runs use the root `start:app` script:

```
npm run start:app -- --config="../gridtv.toml"
```

Packaged app builds also auto-load `config.toml` from Electron's user data
directory before applying any `--config` file or CLI flags:

| OS      | Default user data config path                      |
| ------- | -------------------------------------------------- |
| macOS   | `~/Library/Application Support/gridtv/config.toml` |
| Windows | `%APPDATA%\\gridtv\\config.toml`                   |
| Linux   | `~/.config/gridtv/config.toml`                     |

Configuration precedence is:

1. user data `config.toml`
2. `--config` file
3. CLI flags

See `example.config.toml` for an example.

The wall works without a configuration file. Create `config.toml` at the path
above only when you want to override media quality, window placement, retry
behavior, or another advanced option.

### Logging

gridtv writes logs to both the console and a file in Electron's userData log
directory (its exact path is printed to the console on startup). File and
console verbosity default to `debug`; set `log.level` in your config file (see
`example.config.toml`) or pass `--log.level=<level>` on the command line to
change it. Valid levels, from quietest to loudest: `error`, `warn`, `info`,
`verbose`, `debug`, `silly`.

### Media scaling

Stream views share one persistent browser session/cache by default. This avoids
downloading and retaining a separate copy of a site's application shell for
every tile and lets one login apply to all views from the same site. Set
`media.session-mode = "isolated"` for a unique ephemeral session per tile when
stronger browsing separation matters more than density.

Normal `https://twitch.tv/<channel>` inputs use Twitch's official lightweight
player page by default, avoiding a separate copy of Twitch navigation, chat,
and discovery UI in every tile. The default is `source`, Twitch's highest
available pass-through rendition (normally 1080p when the broadcaster offers
it, otherwise their highest source such as 720p). Set `media.twitch-quality`
to `160p`, `360p`, `480p`, `720p`, or `auto` when you prefer lower decoder and
bandwidth use. Set `media.twitch-player = false` to retain full Twitch channel
pages.

For a dense nine-tile wall, 160p players reduce bandwidth and decoder pressure:

```toml
[grid]
cols = 3
rows = 3

[media]
twitch-quality = "160p"
```

On first launch, `grid.cols × grid.rows` supplies the initial tile count and is
clamped to the live wall's 1–9 range. After that, the F1 selection is persisted.
Available CPU/GPU video-decode capacity, memory, bandwidth, and Twitch
connection behavior still determine how many simultaneous videos work well.

Poster snapshots are bounded WebP images taken every 10 seconds, scaled no
larger than the visible tile or 640 pixels wide. Configure
`media.snapshot-interval`, `media.snapshot-max-width`, and
`media.snapshot-quality` in `example.config.toml`; an interval of `0` disables
snapshots. Stream views also load at their target tile dimensions, and direct
HLS inputs cap automatic quality selection to the player size.

### Wall controls

Hover a tile to pause/play it, adjust its volume, or toggle it between
**Muted** and **Unmuted**. Every unmuted tile is mixed simultaneously. The
wall does not place a permanent platform/name badge over a healthy video.

Double-click a playing tile to fill the wall. Double-click it again or press
**Escape** to return to the grid. Click and hold on a tile, then drag it onto
another tile to swap their positions; mute, volume, and playback settings move
with their streams.

Press **F1** to choose an exact tile count from 1 through 9. Shrinking keeps the
first active streams in visual order and closes every player that no longer
fits. The edit/plus icon in each tile opens the Twitch channel picker. Bare
usernames such as `lacy`, `@lacy`, and full channel URLs are all accepted.

Right-drag from an assigned tile across adjacent cells to stretch that stream.
The displaced streams move to the nearest available cells when room exists. A
stretched stream intentionally occupies multiple saved cells, so a nine-cell
wall can contain fewer than nine distinct views. To reset every stream to one
cell, press **F1** and select the current tile count again; empty cells can then
be filled with their plus buttons.

Channel suggestions are requested only after 350 ms without another keystroke,
require at least two characters, return at most eight names, and are cached for
one minute. Search failure never prevents entering an exact username.

On every launch, assigned Twitch usernames are checked in one batched request
before players are created. A channel confirmed offline remains assigned and
is shown as **Offline**, where its edit button can replace it. If Twitch status
cannot be checked, the tile says **Status unavailable** and is also not loaded,
avoiding a misleading media/network failure.

Tile count, assignments, mute state, volume, and paused state are written while
the app runs. Pending writes are flushed before quit. Custom Twitch sources use
stable URL-derived IDs, so removing or reordering sources cannot detach the
saved layout on the next launch.

The overlay window has one keyboard hotkey:

- **ctrl+shift+i**: Open devtools for the overlay

### Optional compatibility uplink

The app retains Streamwall's remote command uplink for compatibility with an
external control endpoint. No control server or control client is bundled, and
the uplink remains inactive unless `control.endpoint` is explicitly configured.
It is not required for the self-contained wall.

### Telemetry

gridtv reports uncaught errors to a Sentry project (`telemetry.sentry`, default
`true`). This covers the main process and every renderer the app fully authors
(the background and overlay layers); it deliberately does **not** cover the
per-stream views, since those load arbitrary third-party URLs and attaching
error reporting there would leak that content's context to Sentry. To opt out,
set `sentry = false` under `[telemetry]` in your config file (see
`example.config.toml`) or pass `--telemetry.sentry=false` on the command line.

## Data sources

gridtv can load stream data from both JSON APIs and TOML files. Data sources can be specified in a config file (see `example.config.toml`) or the command line:

```
npm run start:app -- --data.json-url="https://your-site/api/streams.json" --data.toml-file="./streams.toml"
```

Each entry (a `[[streams]]` table in TOML, or an object in the JSON array) supports the following fields. See `example.streams.toml` for examples.

| Field           | Type                                                                 | Required | Description                                                                                      |
| --------------- | -------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------ |
| `link`          | string                                                               | yes      | URL of the stream page. For `overlay` streams, this is the URL loaded in the overlay `<iframe>`. |
| `kind`          | `"video"` \| `"audio"` \| `"web"` \| `"background"` \| `"overlay"`   | no       | Defaults to `"video"`. See kind reference below.                                                 |
| `label`         | string                                                               | no       | Short title shown on the wall overlay.                                                           |
| `labelPosition` | `"top-left"` \| `"top-right"` \| `"bottom-right"` \| `"bottom-left"` | no       | Corner where the label is drawn. Defaults to `"top-left"`.                                       |
| `source`        | string                                                               | no       | Attribution shown on the wall when `label` is absent.                                            |
| `notes`         | string                                                               | no       | Free-text notes (metadata, not shown on the wall overlay).                                       |
| `status`        | string                                                               | no       | Free-text status (metadata, not shown on the wall overlay).                                      |
| `city`          | string                                                               | no       | Shown under the stream label on the wall overlay.                                                |
| `state`         | string                                                               | no       | Shown alongside `city` on the wall overlay.                                                      |
| `orientation`   | `"V"` \| `"H"`                                                       | no       | Vertical or horizontal video orientation.                                                        |
| `rotation`      | number (0–360)                                                       | no       | Degrees to rotate the loaded page, e.g. for phone streams held sideways.                         |
| `addedDate`     | string                                                               | no       | Free-text date (metadata).                                                                       |

### `kind` reference

- `video` (default): a normal livestream page; gridtv finds the `<video>` tag and fills the tile with it.
- `audio`: like `video`, but the tile is treated as audio-only.
- `web`: an arbitrary webpage, shown as-is without searching for a `<video>` tag.
- `background`: a webpage loaded behind the grid instead of in a tile.
- `overlay`: a webpage loaded as a full-screen `<iframe>` layered over the whole wall (e.g. scoreboards, alerts). See [Security: overlay and background streams](#security-overlay-and-background-streams) below.

## Playlists

A grid cell can optionally cycle through a fixed list of stream URLs on an
interval, independent of manual placement or any data source. Add one
`[[playlist]]` table per cell you want to cycle (see `example.config.toml`):

```toml
[[playlist]]
view = 0
interval = 60
urls = ["https://example.com/stream-a", "https://example.com/stream-b"]
```

| Field      | Type     | Required | Description                                                             |
| ---------- | -------- | -------- | ----------------------------------------------------------------------- |
| `view`     | number   | yes      | The grid cell (0-indexed) to cycle. Must be within the configured grid. |
| `interval` | number   | yes      | Seconds between advances.                                               |
| `urls`     | string[] | yes      | Stream URLs to cycle through, in order, looping back to the start.      |

Each URL is matched against the streams currently known from your data sources
(`json-url`/`toml-file`/custom); if a URL doesn't currently resolve to a known
stream, that step is skipped with a warning and the cell keeps its previous
content until the next advance.

## Security: overlay and background streams

Streams added with the `overlay` or `background` kind are loaded as live web
pages layered over the whole wall, inside sandboxed `<iframe>`s. Anyone who can
add a custom stream can point these tiles at an arbitrary URL, so treat their
contents as untrusted.

These frames run with `sandbox="allow-scripts"` only. Scripts are allowed so
widget-style overlays (scoreboards, alerts, players) still work, but the page
runs in an opaque origin: it cannot escape its sandbox, reach gridtv's internal
APIs, or read the app's cookies and storage. Top-level navigation, popups,
forms and downloads stay blocked.

`allow-same-origin` is intentionally not granted. Combined with `allow-scripts`,
it would let a page remove its own sandbox attribute and defeat the protection.
As a result, overlay/background pages have no access to their own origin's
cookies or local storage; widgets that depend on same-origin persistence are not
supported by design.

## Building & releasing the desktop app

Run these from the repository root to build with
[Electron Forge](https://www.electronforge.io/):

```sh
npm -w packages/gridtv run package
npm -w packages/gridtv run make
npm -w packages/gridtv run publish
```

On Linux, the full `make` command invokes both Debian and RPM makers and
requires `fakeroot`, `dpkg-deb`, and `rpmbuild`. To create only a portable ZIP
from an existing package build, run:

```sh
npm -w packages/gridtv exec -- electron-forge make --skip-package --targets @electron-forge/maker-zip
```

By default these produce **unsigned** binaries, which are suitable for local
development. macOS and Windows both warn or outright block unsigned apps for
end users, and Electron's auto-updater requires a signed app on macOS.

To produce signed, notarized builds, set these environment variables before
running `make`/`publish` (see `packages/gridtv/forge.signing.ts`):

| Variable                       | Purpose                                                           |
| ------------------------------ | ----------------------------------------------------------------- |
| `APPLE_TEAM_ID`                | Apple Developer Team ID                                           |
| `APPLE_API_KEY`                | Path to an App Store Connect API key (`.p8`) used by `notarytool` |
| `APPLE_API_KEY_ID`             | App Store Connect API Key ID                                      |
| `APPLE_API_ISSUER`             | App Store Connect API Issuer ID                                   |
| `WINDOWS_CERTIFICATE_FILE`     | Path to a Windows code-signing certificate (`.pfx`)               |
| `WINDOWS_CERTIFICATE_PASSWORD` | Password for the certificate above                                |

macOS signing additionally requires a Developer ID Application certificate to
already be present in the signing machine's keychain. The macOS and Windows
variables are independent. Set either, both, or neither. Builds with none of
these set are unsigned.

**Until a release is signed:** macOS quarantines downloaded, unsigned apps and
may refuse to open them ("gridtv is damaged and can't be opened"). Users can
work around this by removing the quarantine attribute after downloading:

```sh
xattr -cr /Applications/gridtv.app
```

or by right-clicking the app and choosing "Open" instead of double-clicking.

### CI releases

Pushing a `v*` tag (or running the workflow manually) triggers
`.github/workflows/release.yml`, which runs the quality gate (lint, typecheck,
test) and then builds and publishes a GitHub release for Linux, Windows, and
macOS via `electron-forge publish`. Signing in CI is opt-in, matching the local
`make`/`publish` behavior above: builds stay unsigned until the corresponding
repository secrets are set (`APPLE_CERTIFICATE_P12`,
`APPLE_CERTIFICATE_PASSWORD`, `APPLE_TEAM_ID`, `APPLE_API_KEY_BASE64`,
`APPLE_API_KEY_ID`, `APPLE_API_ISSUER`, `WINDOWS_CERTIFICATE_BASE64`,
`WINDOWS_CERTIFICATE_PASSWORD`).

## Credits

gridtv is a fork of **Streamwall** by Max Goodhart
([chromakode](https://github.com/chromakode)), via the
[NilsR0711/streamwall](https://github.com/NilsR0711/streamwall) fork. Streamwall
is a general multi-source livestream mosaic tool for activists and journalists;
gridtv narrows it to a self-contained Twitch live-view wall by removing the
remote control server, the web control client, and the local control window.

Streamwall is MIT licensed. gridtv retains the original copyright notice in
[LICENSE](LICENSE) as required.

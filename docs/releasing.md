# Release checklist

Use this checklist for every public gridtv release. The release owner records
the completed checklist in the release pull request or release notes.

## 1. Decide the release

- [ ] Choose a fork-owned semantic version.
- [ ] Confirm whether this release is signed on macOS, Windows, both, or
      neither. Unsigned artifacts must be called out prominently in the release
      notes.
- [ ] Confirm the supported platform and architecture set for this release.
- [ ] Draft user-facing release notes, including known limitations and any
      storage or configuration compatibility changes.

## 2. Verify the candidate

- [ ] Start from a clean worktree and run `npm ci`.
- [ ] Run `npm run format:check`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run test:coverage`.
- [ ] Run `npm audit --omit=dev` and confirm zero production findings.
- [ ] Run `npm -w packages/gridtv run package`.
- [ ] On Linux, run `npm -w packages/gridtv run smoke:package:linux`.

## 3. Perform manual wall acceptance

Use a fresh temporary user-data directory first, then repeat the persistence
checks with an existing profile.

- [ ] Launch the packaged app and confirm the wall appears without a config
      file.
- [ ] Open F1 and exercise tile counts 1 through 9, including selecting the
      current count to collapse a stretched layout.
- [ ] Assign a Twitch channel from a bare login and a full channel URL.
- [ ] Confirm online, offline, and unavailable-status placeholders behave as
      documented.
- [ ] Left-drag to swap streams and right-drag to stretch a stream across
      cells.
- [ ] Toggle wall Fit and Fill with F2.
- [ ] Toggle tile audio with E and confirm per-tile volume and pause controls.
- [ ] Enter and leave fullscreen with F, double-click, and Escape.
- [ ] Toggle the Twitch chat dock with C and confirm the video resizes around
      it.
- [ ] Restart the app and confirm tile count, assignments, stretched regions,
      mute state, volume, pause state, and fit mode persist.
- [ ] Confirm the app exits cleanly and the latest log contains no unexpected
      startup or shutdown errors.

Run the acceptance pass on each platform claimed as supported by the release.
For signed builds, also confirm the operating system accepts the signature and,
on macOS, notarization.

## 4. Version and publish

- [ ] Update `packages/gridtv/package.json` and the root lockfile to the chosen
      version.
- [ ] Commit the version and release notes through a reviewed pull request.
- [ ] Create and push a matching annotated `v<version>` tag from the exact
      release commit.
- [ ] Confirm the Release workflow quality gate passes.
- [ ] Confirm Linux, Windows, and macOS publish jobs complete for the intended
      platform set.

## 5. Verify distribution

- [ ] Inspect the GitHub release and confirm its title, tag, notes, and artifact
      names are correct.
- [ ] Download every artifact from GitHub rather than reusing local output.
- [ ] Install or extract each artifact and repeat a short launch, assignment,
      playback, and persistence check.
- [ ] Confirm signed artifacts report the expected publisher identity.
- [ ] On an updater-supported platform, launch the previous release and verify
      it discovers and applies the new release.
- [ ] Record any failed or intentionally skipped check in the release notes.

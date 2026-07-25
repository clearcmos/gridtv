#!/usr/bin/env bash
set -euo pipefail

package_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
executable="${package_dir}/out/gridtv-linux-x64/gridtv"

if [[ ! -x "${executable}" ]]; then
  echo "Packaged gridtv executable not found at ${executable}" >&2
  exit 1
fi
if ! command -v xvfb-run >/dev/null; then
  echo "xvfb-run is required for the packaged Linux startup smoke test" >&2
  exit 1
fi

smoke_dir="$(mktemp -d)"
trap 'rm -rf -- "${smoke_dir}"' EXIT

electron_flags=()
if [[ "${CI:-}" == "true" ]]; then
  # GitHub's Ubuntu image restricts Chromium's unprivileged user namespaces.
  # Keep the normal sandbox enabled for local and manual release checks.
  electron_flags+=(--no-sandbox)
fi

help_output="${smoke_dir}/help.log"
if ! XDG_CONFIG_HOME="${smoke_dir}/config" xvfb-run -a \
  "${executable}" "${electron_flags[@]}" --help >"${help_output}" 2>&1; then
  cat "${help_output}"
  exit 1
fi
grep -q "Grid dimensions" "${help_output}"

startup_output="${smoke_dir}/startup.log"
set +e
XDG_CONFIG_HOME="${smoke_dir}/config" xvfb-run -a timeout 15s \
  "${executable}" "${electron_flags[@]}" --no-telemetry.sentry \
  >"${startup_output}" 2>&1
exit_code=$?
set -e

cat "${startup_output}"

if [[ ${exit_code} -ne 124 ]]; then
  echo "Packaged gridtv exited before the smoke-test timeout (status ${exit_code})" >&2
  exit 1
fi

grep -q "Creating StreamWindow" "${startup_output}"
grep -q "Initial StreamWindow geometry" "${startup_output}"

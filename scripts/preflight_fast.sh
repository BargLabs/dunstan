#!/usr/bin/env bash
# Fast local gate, the cheap half of CI: biome check (lint and format) plus tsc --noEmit.
# Tests stay in `pnpm test` and CI. Run this before pushing.
#
# Usage:
#   scripts/preflight_fast.sh
#
# Exit codes:
#   0   every check passed
#   1   one or more checks failed (see output)
#   99  could not reach the repository root

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${REPO_ROOT}" || {
  echo "preflight_fast: could not cd to ${REPO_ROOT}" >&2
  exit 99
}

# A fresh worktree has no node_modules. Install when it is missing or older than the lockfile, so a
# missing install is not reported as a broken build. PREFLIGHT_NO_INSTALL=1 skips this.
marker="node_modules/.modules.yaml"
if [ "${PREFLIGHT_NO_INSTALL:-0}" != "1" ] \
  && { [ ! -e "${marker}" ] || [ "pnpm-lock.yaml" -nt "${marker}" ]; }; then
  echo "--- dependencies missing or stale: pnpm install --frozen-lockfile ---"
  pnpm install --frozen-lockfile || echo "preflight_fast: pnpm install failed; checks below may fail for that reason" >&2
fi

fail_count=0

run_check() {
  local name="$1"
  shift
  echo ""
  echo "--- ${name}: $* ---"
  if "$@"; then
    echo "PASS: ${name}"
  else
    echo "FAIL: ${name}" >&2
    fail_count=$((fail_count + 1))
  fi
}

run_check biome pnpm exec biome check .
run_check typecheck pnpm exec tsc --noEmit -p tsconfig.json

echo ""
if [ "${fail_count}" -eq 0 ]; then
  echo "preflight_fast: OK"
  exit 0
fi
echo "preflight_fast: FAILED (${fail_count} check(s))" >&2
exit 1

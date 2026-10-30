#!/bin/zsh
# GAFUS Refactor Web -> original isolated Hono, never production or mock.
set -euo pipefail
ROOT="/Users/asmtv1/Desktop/gafus-refactor"
[[ "$(git -C "$ROOT" rev-parse --show-toplevel)" == "$ROOT" ]] || {
  print -u2 "LOCAL_WEB_DENIED:git_root"; exit 22;
}
[[ "$(git -C "$ROOT" branch --show-current)" == "vite" ]] || {
  print -u2 "LOCAL_WEB_DENIED:branch"; exit 22;
}
for path in "$ROOT" "$ROOT/apps" "$ROOT/apps/web-vite" \
    "$ROOT/apps/web-vite/vite.config.mjs" "$ROOT/scripts" "$ROOT/scripts/refactor"; do
  [[ -e "$path" && ! -L "$path" ]] || {
    print -u2 "LOCAL_WEB_DENIED:project_path"; exit 22;
  }
done
# Only allow authenticated local Web after emitted Core passes COURSE030.
# This preflight does NOT prove an already-running Hono loaded the new JS.
if ! /opt/homebrew/bin/node "$ROOT/scripts/refactor/ag2-local-web-core-privacy-guard.mjs"; then
  print -u2 "LOCAL_WEB_DENIED:stale_core_course_privacy_artifact"; exit 24;
fi
if [[ $# -ne 1 ]]; then
  print -u2 "Usage: ag2-local-web-hono-run.sh --preflight|--run"; exit 2;
fi
case "$1" in
  --preflight|--run) ;;
  *) print -u2 "LOCAL_WEB_DENIED:invalid_mode"; exit 2 ;;
esac
for path in health ready; do
  http_code=$(/usr/bin/curl --noproxy '*' -s -o /dev/null --max-time 3 \
    -w '%{http_code}' "http://127.0.0.1:3001/$path") || {
      print -u2 "LOCAL_WEB_DENIED:hono_unavailable"; exit 23;
    }
  [[ "$http_code" == "200" ]] || {
    print -u2 "LOCAL_WEB_DENIED:hono_unready"; exit 23;
  }
done
if /usr/sbin/lsof -nP -iTCP:5173 -sTCP:LISTEN 2>/dev/null | /usr/bin/grep -q LISTEN; then
  print -u2 "LOCAL_WEB_DENIED:web_port_occupied"; exit 23;
fi
print -r -- "LOCAL_WEB_HONO_PREFLIGHT_OK host=127.0.0.1:5173 api=127.0.0.1:3001"
[[ "$1" == "--preflight" ]] && exit 0
# Original MIG-SEC-003 validator still gets fixed mock base URL.
# Existing Vite local-hono mode selects the original fixed loopback Hono.
cd "$ROOT"
exec /usr/bin/env -i PATH=/opt/homebrew/bin:/usr/bin:/bin \
  HOME="$ROOT" TMPDIR="$ROOT/.local-browser-mcp/.cache/tmp/" \
  GAFUS_WEB_DEV_API_MODE=local-hono VITE_API_BASE_URL=http://127.0.0.1:4174 \
  COREPACK_ENABLE_NETWORK=0 \
  COREPACK_HOME="$ROOT/.local-pg-scratch/.cache/node/corepack" \
  /opt/homebrew/bin/pnpm --filter @gafus/web-vite dev

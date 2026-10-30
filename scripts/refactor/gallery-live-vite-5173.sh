#!/bin/zsh
# Live Gallery UI: all browser API endpoints hit the same isolated Hono JWT signer.
set -euo pipefail
R=/Users/asmtv1/Desktop/gafus-refactor
[[ "${PWD:A}" == "$R" && "$(git -C "$R" rev-parse --show-toplevel)" == "$R" &&
  "$(git -C "$R" branch --show-current)" == vite ]] || exit 31
[[ -d "$R/apps/web-vite" && ! -L "$R/apps/web-vite" &&
   "${R}/apps/web-vite" == "$(realpath "$R/apps/web-vite")" ]] || exit 32
if lsof -nP -iTCP:5173 -sTCP:LISTEN 2>/dev/null | grep -q LISTEN;then
 echo GALLERY_VITE_5173_ALREADY_RUNNING; exit 33
fi
curl --noproxy '*' -fsS --max-time 5 http://127.0.0.1:3601/__gallery_v2_test_health | grep -q '"environment":"dedicated-gallery-v2-local"'
cd "$R/apps/web-vite"
exec /usr/bin/env -i PATH=/opt/homebrew/bin:/usr/bin:/bin \
 HOME="$R/.local-pg-scratch" COREPACK_ENABLE_NETWORK=0 \
 NODE_ENV=development GAFUS_WEB_DEV_API_MODE=local-hono \
 GAFUS_WEB_GALLERY_FULL_HONO=1 VITE_API_BASE_URL=http://127.0.0.1:4174 \
 /opt/homebrew/bin/pnpm exec vite --config vite.config.mjs --host 127.0.0.1 --port 5173 --strictPort

#!/usr/bin/env bash
# Only push the 2026-10-28 independently verified linux/amd64 Chat2 images
# to the NEW organization private registry. No runtime secrets in image.
set -euo pipefail
R=/Users/asmtv1/Desktop/gafus-refactor
[[ "$(git -C "$R" rev-parse --show-toplevel)" == "$R" ]] || exit 3
[[ "$(git -C "$R" branch --show-current)" == vite ]] || exit 3
[[ "$(pwd -P)" == "$R" ]] || exit 3
for f in "$R/infra/cloudru" "$R/.local-pg-scratch" "$R/.local-pg-scratch/cloudru"; do [[ ! -L "$f" ]] || exit 3; done
REGISTRY=gafus-chat2-20261028.cr.cloud.ru
C="$R/.local-pg-scratch/cloudru/chat2-docker-config"
[[ ! -L "$C" && -f "$C/config.json" && ! -L "$C/config.json" ]] || { echo 'Run chat2-registry-login.sh first.' >&2; exit 3; }
[[ "$(stat -f %Lp "$C/config.json")" == 600 ]] || { echo 'Registry config must be mode 0600.' >&2; exit 3; }
export DOCKER_CONFIG="$C"
TAG=refactor-20261028
for row in photo:photo video:video cloud-core:core; do
  IFS=: read -r SUFFIX DEST <<< "$row"
  SRC="gafus-chat2-$SUFFIX:new-org-20261028"
  DST="$REGISTRY/gafus-chat-$DEST:$TAG"
  PLATFORM=$(docker image inspect "$SRC" --format '{{.Os}}/{{.Architecture}}')
  [[ "$PLATFORM" == linux/amd64 ]] || { echo "Invalid architecture: $SRC $PLATFORM" >&2; exit 5; }
  # Strict read-only runtime inspection before creating remote artifacts.
  docker run --rm --network none --platform linux/amd64 --entrypoint /bin/sh "$SRC" -c 'if test -f /app/chat2-job.mjs;then grep -q "gafus-chat2-media-2026" /app/chat2-job.mjs && ! grep -q "gafus-chat-public" /app/chat2-job.mjs;else grep -q "6777bd18-4ee9-4d15-bb1b-134f7a18ed3a" /app/core.mjs && ! grep -q "4c590727-4133-475b-a4bc-564c90a9e686" /app/core.mjs;fi' >/dev/null
  # Abort if a tag already exists. Never overwrite a published image.
  if docker manifest inspect "$DST" >/dev/null 2>&1; then echo "Remote tag already exists: $DST; refusing overwrite" >&2; exit 6; fi
  docker tag "$SRC" "$DST"
  echo "PUSHING_NEW_REFAC_IMAGE=$DST"
  docker push "$DST"
  echo "PUSHED_NEW_REFAC_IMAGE=$DST"
done
echo 'NEW_ORGANIZATION_PRIVATE_CHAT2_IMAGES_PUSHED'

#!/bin/sh
# One-shot synthetic-only Feed CDN smoke. Fail-closed; revert stage image/replicas.
set -eu
cd /Users/asmtv1/Desktop/gafus1
set -a
. "$HOME/.codex/cloudru/credentials.env"
. "$HOME/.codex/cloudru/storage-credentials.env"
set +a
cleanup() {
  CLOUDRU_STAGING_WARM_CONFIRM=temporary-feed-only node infra/cloudru/warm-feed-origin-staging.mjs --idle || true
  GAFUS_FEED_STAGE_CDN_CONFIRM=synthetic-only-with-restore node infra/cloudru/feed-stage-cdn-image.mjs --restore || true
}
trap cleanup EXIT
GAFUS_FEED_CDN_SMOKE_CONFIRM=temporary-synthetic-with-rollback node infra/cloudru/feed-cdn-borrowed-smoke.mjs

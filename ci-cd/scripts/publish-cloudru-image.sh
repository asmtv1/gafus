#!/usr/bin/env bash
# Retry only transient Cloud.ru registry/token endpoint failures.
# A failed Docker build or non-transient authorization failure must remain blocking.
set -euo pipefail

media="${1:?media is required}"
role="${2:?role is required}"
dockerfile="${3:?dockerfile is required}"
revision="${4:?revision is required}"

case "${media}:${role}:${dockerfile}" in
  gallery:worker:Dockerfile|feed:worker:Dockerfile|questions:worker:Dockerfile) ;;
  *) echo "Invalid Cloud.ru image selector" >&2; exit 2 ;;
esac
# Feed's large FFmpeg image must be relayed via private GHCR and the
# production host; never retry the Cloud.ru direct upload that returns 404.
if [[ "$media:$role" == feed:worker ]]; then
  echo "FEED_REQUIRES_PRIVATE_GHCR_PRODUCTION_RELAY" >&2
  exit 2
fi
if [[ ! "${revision}" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Invalid immutable image revision" >&2
  exit 2
fi

tag="gafus.cr.cloud.ru/gafus-${media}-${role}:${revision}"
log_file="$(mktemp "${RUNNER_TEMP:-$PWD/ci-cd/scripts}/cloudru-build.XXXXXXXX")"
trap 'rm -f -- "$log_file"' EXIT

# Native Buildx publication is retained for Gallery and Questions only.
# Feed exits above and is relayed from private GHCR by the manual workflow.
# Fail closed on unknown non-transient Registry responses; never re-use an
# unverified mutable tag or silently fall back to OCI PATCH.
release_budget_seconds=$((320 * 60))
release_started_at=$SECONDS
for attempt in 1 2 3 4; do
  remaining=$((release_budget_seconds - (SECONDS - release_started_at)))
  if (( remaining <= 120 )); then
    echo "Cloud.ru image publication exhausted bounded 320-minute release budget" >&2
    exit 124
  fi
  attempt_seconds=$((remaining < 150 * 60 ? remaining : 150 * 60))
  echo "Publishing Cloud.ru image (attempt ${attempt}/4, timeout ${attempt_seconds}s, release remaining ${remaining}s): gafus-${media}-${role}"
  # Distinguish a stalled upload/manifest from an ordinary failed build.
  if timeout --kill-after=30s "${attempt_seconds}s" docker buildx build \
    --file "apps/${media}-cloud/${dockerfile}" \
    --platform linux/amd64 \
    --tag "$tag" \
    --push \
    --provenance=true \
    --progress=plain \
    . 2>&1 | tee "$log_file"; then
    echo "Cloud.ru image published: gafus-${media}-${role}"
    exit 0
  else
    status=$?
  fi

  # Never retry an ordinary failed build, invalid image, or bad credentials.
  # Match transient HTTP responses only when linked to the Cloud.ru registry
  # or its OAuth token endpoint; no raw secrets are read or printed.
  upload_timeout=false
  if [[ "$status" == 124 ]] && grep -Eq '#[0-9]+ pushing layers' "$log_file"; then
    upload_timeout=true
  fi
  if [[ "$upload_timeout" != true ]] && ! grep -Eq '(id\.cloud\.ru/auth/system/docker/token|gafus\.cr\.cloud\.ru).*(429|502|503|504)([^0-9]|$)' "$log_file"; then
    echo "Cloud.ru image publish failed (not a transient Cloud.ru registry response)" >&2
    exit "$status"
  fi
  if grep -Eq '(id\.cloud\.ru/auth/system/docker/token|gafus\.cr\.cloud\.ru).*(401|403)([^0-9]|$)' "$log_file"; then
    echo "Cloud.ru registry rejected authorization (no retry)" >&2
    exit "$status"
  fi
  if (( attempt == 4 )); then
    echo "Cloud.ru registry still unavailable after 4 attempts" >&2
    exit "$status"
  fi
  delay=$((10 * (2 ** (attempt - 1))))
  echo "Temporary Cloud.ru registry failure; retrying after ${delay}s" >&2
  sleep "$delay"
done

#!/usr/bin/env bash
# Retry only transient Cloud.ru registry/token endpoint failures.
# A failed Docker build or non-transient authorization failure must remain blocking.
set -euo pipefail

media="${1:?media is required}"
role="${2:?role is required}"
dockerfile="${3:?dockerfile is required}"
revision="${4:?revision is required}"

case "${media}:${role}:${dockerfile}" in
  gallery:origin:Dockerfile.origin|feed:origin:Dockerfile.origin|gallery:worker:Dockerfile|feed:worker:Dockerfile|questions:worker:Dockerfile) ;;
  *) echo "Invalid Cloud.ru image selector" >&2; exit 2 ;;
esac
if [[ ! "${revision}" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Invalid immutable image revision" >&2
  exit 2
fi

tag="gafus.cr.cloud.ru/gafus-${media}-${role}:${revision}"
log_file="$(mktemp "${RUNNER_TEMP:-$PWD/ci-cd/scripts}/cloudru-build.XXXXXXXX")"
trap 'rm -f -- "$log_file"' EXIT

for attempt in 1 2 3 4; do
  echo "Publishing Cloud.ru image (attempt ${attempt}/4): gafus-${media}-${role}"
  if docker buildx build \
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
  if ! grep -Eq '(id\.cloud\.ru/auth/system/docker/token|gafus\.cr\.cloud\.ru).*(429|502|503|504)([^0-9]|$)' "$log_file"; then
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

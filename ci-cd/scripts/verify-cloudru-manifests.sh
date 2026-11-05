#!/usr/bin/env bash
# Cloud.ru's published video images are anonymously readable. Using the separate
# Chat2 IAM key for a read-only OCI HEAD can return 401 even when the digest exists.
# Probe by digest with Docker's registry GET client and no inherited credentials.
# Missing digests, bad manifests and authorization errors must still fail closed.
set -euo pipefail

anonymous_docker_config="$(mktemp -d)"
trap 'rm -rf -- "$anonymous_docker_config"' EXIT
chmod 700 "$anonymous_docker_config"
printf '%s\n' '{"auths":{}}' > "$anonymous_docker_config/config.json"
export DOCKER_CONFIG="$anonymous_docker_config"

checked=0
while IFS= read -r image; do
  [[ -n "$image" ]] || continue
  # An unpinned target is not silently omitted from the release preflight.
  if [[ ! "$image" =~ ^(gafus\.cr\.cloud\.ru/gafus-feed-worker|gafus-chat2-20261028\.cr\.cloud\.ru/gafus-chat-video)@sha256:[a-f0-9]{64}$ ]]; then
    echo "CLOUDRU_INVALID_IMMUTABLE_IMAGE_REFERENCE: $image" >&2
    exit 1
  fi
  checked=$((checked + 1))
  verified=false
  for attempt in 1 2 3 4 5 6 7 8; do
    if output="$(docker manifest inspect "$image" 2>&1)"; then
      # A tag-independent digest must resolve to a v2 OCI/Docker manifest with
      # layers, or to an index containing a linux/amd64 runnable image.
      if ! jq -e '(.schemaVersion == 2) and (if (.manifests | type) == "array" then any(.manifests[]; .platform.os == "linux" and .platform.architecture == "amd64") else ((.config.digest | type) == "string" and (.layers | type) == "array" and (.layers | length) > 0) end)' <<< "$output" >/dev/null; then
        echo "CLOUDRU_IMMUTABLE_MANIFEST_INVALID: $image" >&2
        exit 1
      fi
      echo "CLOUDRU_IMMUTABLE_MANIFEST_VERIFIED: $image"
      verified=true
      break
    fi
    if grep -Eqi '401 Unauthorized|403 Forbidden|denied:|unauthorized:' <<< "$output"; then
      echo "CLOUDRU_REGISTRY_READ_DENIED: $image (anonymous manifest GET rejected; check registry access policy)" >&2
      exit 1
    fi
    if grep -Eqi '404 Not Found|manifest unknown|name unknown|not found' <<< "$output"; then
      echo "CLOUDRU_IMMUTABLE_MANIFEST_MISSING: $image" >&2
      exit 1
    fi
    if ! grep -Eqi '502 Bad Gateway|503 Service Unavailable|504 Gateway Timeout|429 Too Many Requests|TLS handshake timeout|connection reset by peer|unexpected EOF|i/o timeout' <<< "$output"; then
      printf '%s\n' "$output" >&2
      echo "CLOUDRU_IMMUTABLE_MANIFEST_INVALID: $image" >&2
      exit 1
    fi
    if [[ "$attempt" -eq 8 ]]; then
      echo "CLOUDRU_REGISTRY_TRANSIENT_RETRIES_EXHAUSTED: $image" >&2
      exit 1
    fi
    echo "Cloud.ru transient registry error, retry $attempt/8 for $image" >&2
    sleep "$((attempt * 5))"
  done
  [[ "$verified" == true ]] || exit 1
done
[[ "$checked" -gt 0 ]] || { echo 'CLOUDRU_NO_PINNED_MANIFESTS_TO_VERIFY' >&2; exit 1; }
echo "CLOUDRU_IMMUTABLE_MANIFEST_CHECK_PASS: $checked unique pinned images"

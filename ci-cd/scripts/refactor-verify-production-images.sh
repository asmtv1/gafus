#!/usr/bin/env bash
# Local, isolated verification of the EXACT production Dockerfiles for AMD64.
# No GHCR login/push, no SSH, no production environment or DB migrations.
set -euo pipefail
ROOT=/Users/asmtv1/Desktop/gafus-refactor
[[ "$(pwd -P)" == "$ROOT" && "$(git rev-parse --show-toplevel)" == "$ROOT" && "$(git branch --show-current)" == vite ]] || {
  echo 'Run only inside the approved GAFUS Refactor checkout on branch vite' >&2; exit 2;
}
for path in "$ROOT" "$ROOT/ci-cd" "$ROOT/ci-cd/docker"; do
  [[ ! -L "$path" ]] || { echo 'Unsafe symlink build path' >&2; exit 2; }
done
mkdir -p .ci-report/container-builds
images=(web trainer-panel admin-panel api worker bull-board prisma)
if (( $# > 0 )); then
  selected=("$@")
else
  selected=("${images[@]}")
fi
for image in "${selected[@]}"; do
  allowed=false
  for known in "${images[@]}"; do [[ "$image" != "$known" ]] || allowed=true; done
  [[ "$allowed" == true ]] || { echo "Unknown image $image" >&2; exit 2; }
  dockerfile="ci-cd/docker/Dockerfile-${image}-optimized"
  [[ -f "$dockerfile" && ! -L "$dockerfile" ]] || exit 2
  free_kb=$(df -Pk "$ROOT" | awk 'NR==2{print $4}')
  if (( free_kb < 6291456 )); then
    echo "Insufficient free space (${free_kb} KB); stop rather than prune users' Docker data" >&2
    exit 2
  fi
  echo "BUILD_START $image linux/amd64"
  log=".ci-report/container-builds/${image}.log"
  if docker build --platform linux/amd64 --progress=plain \
    -f "$dockerfile" -t "gafus-refactor-verify-${image}:local-amd64" . > "$log" 2>&1; then
    arch=$(docker image inspect "gafus-refactor-verify-${image}:local-amd64" --format '{{.Os}}/{{.Architecture}}')
    [[ "$arch" == 'linux/amd64' ]] || { echo "ARCH_FAIL $image $arch"; exit 1; }
    # Exercise the actual runtime layer without credentials, network,
    # persistent volumes or container service startup.
    docker run --rm --platform linux/amd64 --network none --read-only \
      --cap-drop ALL --security-opt no-new-privileges \
      --entrypoint node "gafus-refactor-verify-${image}:local-amd64" --version >/dev/null
    if [[ "$image" == prisma ]]; then
      # The generated client must import with no DB or network available.
      docker run --rm --platform linux/amd64 --network none --read-only \
        --cap-drop ALL --security-opt no-new-privileges \
        --entrypoint node "gafus-refactor-verify-${image}:local-amd64" \
        -e 'const c=require("@prisma/client"); if(typeof c.PrismaClient!=="function")process.exit(1)' >/dev/null
      # Prisma runner's Corepack must be usable from its copied local cache;
      # an accidental dependency on npm Registry fails with networking off.
      docker run --rm --platform linux/amd64 --network none --read-only \
        --cap-drop ALL --security-opt no-new-privileges \
        -e COREPACK_ENABLE_NETWORK=0 --entrypoint pnpm \
        "gafus-refactor-verify-${image}:local-amd64" --version | grep -Fx '10.12.4' >/dev/null
    fi
    printf 'BUILD_AND_RUNTIME_PASS %s %s\n' "$image" "$arch"
  else
    echo "BUILD_FAIL $image (log: $log)" >&2
    # Never print arbitrary build logs: package manager messages can contain URLs/credentials.
    exit 1
  fi
done
printf 'ALL_REQUESTED_IMAGES_BUILD_PASS\n'

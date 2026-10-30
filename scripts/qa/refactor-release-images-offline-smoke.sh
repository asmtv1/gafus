#!/usr/bin/env bash
# Checks all seven locally built linux/amd64 GAFUS Refactor release candidates.
# No network connections, no production providers/volumes, no push, no deploy.
set -euo pipefail
ROOT="/Users/asmtv1/Desktop/gafus-refactor"
[[ "$PWD" == "$ROOT" ]] || { echo "IMAGE_QA_WRONG_ROOT"; exit 2; }
tag=20261029
for component in web trainer-panel admin-panel api worker bull-board prisma; do
  image="gafus-refactor-local-qa-$component:$tag"
  arch=$(docker image inspect "$image" --format '{{.Os}}/{{.Architecture}}' 2>/dev/null || true)
  if [[ "$arch" != "linux/amd64" ]]; then
    echo "IMAGE_QA_MISSING_OR_WRONG_ARCH $component"
    exit 3
  fi
  if [[ "$component" == web || "$component" == trainer-panel || "$component" == admin-panel ]]; then
    docker run --rm --network none --entrypoint /bin/sh "$image" -c       'test -s /usr/share/nginx/html/index.html && nginx -t' >/dev/null 2>&1 ||
      { echo "IMAGE_QA_NGINX_FAILED $component"; exit 4; }
  elif [[ "$component" == prisma ]]; then
    docker run --rm --network none --entrypoint node "$image" -e       'const m=require("@prisma/client");if(typeof m.PrismaClient!=="function")process.exit(3)' >/dev/null 2>&1 ||
      { echo "IMAGE_QA_PRISMA_FAILED"; exit 4; }
  elif [[ "$component" == worker ]]; then
    docker run --rm --network none --entrypoint node "$image" --check dist/worker/src/index.js >/dev/null 2>&1 ||
      { echo "IMAGE_QA_WORKER_SYNTAX_FAILED"; exit 4; }
  elif [[ "$component" == bull-board ]]; then
    docker run --rm --network none --entrypoint node "$image" --check dist/bull-board.js >/dev/null 2>&1 ||
      { echo "IMAGE_QA_BULL_BOARD_SYNTAX_FAILED"; exit 4; }
  else
    docker run --rm --network none --entrypoint node "$image" --check dist/index.js >/dev/null 2>&1 ||
      { echo "IMAGE_QA_API_SYNTAX_FAILED"; exit 4; }
  fi
  echo "IMAGE_QA_PASS $component linux/amd64, network disabled"
done
echo "ALL_SEVEN_IMAGES_OFFLINE_SMOKE_PASS"

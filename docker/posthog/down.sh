#!/usr/bin/env bash
# Остановка hobby-стека и удаление томов (данные PostHog теряются).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUNTIME_DIR="${REPO_ROOT}/docker/posthog/runtime"

if [[ ! -f "${RUNTIME_DIR}/docker-compose.yml" ]]; then
  echo "Нет ${RUNTIME_DIR}/docker-compose.yml — нечего останавливать." >&2
  exit 0
fi

cd "${RUNTIME_DIR}"
docker compose -f docker-compose.yml down -v --remove-orphans
echo "Готово. Тома hobby-стека удалены."

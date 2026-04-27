#!/usr/bin/env bash
# Официальный hobby-стек PostHog (как bin/deploy-hobby), без apt/sudo.
# Нужен публичный DNS (DOMAIN) и открытые 80/443 для Let's Encrypt — см. README.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUNTIME_DIR="${REPO_ROOT}/docker/posthog/runtime"

if [[ -z "${POSTHOG_DOMAIN:-}" ]]; then
  echo "Задайте POSTHOG_DOMAIN — FQDN, который указывает на эту машину (A/AAAA)." >&2
  echo "Пример: POSTHOG_DOMAIN=posthog.example.com bash docker/posthog/up.sh" >&2
  exit 1
fi

mkdir -p "${RUNTIME_DIR}/share"
cd "${RUNTIME_DIR}"

if [[ ! -d posthog/.git ]]; then
  echo "Клонирование PostHog (shallow)…"
  git clone --filter=blob:none --depth 1 "https://github.com/PostHog/posthog.git" posthog
fi

echo "Копирование официальных compose-файлов…"
cp posthog/docker-compose.hobby.yml docker-compose.yml
cp posthog/docker-compose.base.yml docker-compose.base.yml
cp posthog/dev-services.env dev-services.env

POSTHOG_SECRET="${POSTHOG_SECRET:-$(openssl rand -hex 32)}"
ENCRYPTION_SALT_KEYS="${ENCRYPTION_SALT_KEYS:-$(openssl rand -hex 16)}"
POSTHOG_APP_TAG="${POSTHOG_APP_TAG:-latest}"
REGISTRY_URL="${REGISTRY_URL:-posthog/posthog}"
TLS_BLOCK="${TLS_BLOCK:-}"

cat > .env <<EOF
POSTHOG_SECRET=${POSTHOG_SECRET}
ENCRYPTION_SALT_KEYS=${ENCRYPTION_SALT_KEYS}
DOMAIN=${POSTHOG_DOMAIN}
TLS_BLOCK=${TLS_BLOCK}
REGISTRY_URL=${REGISTRY_URL}
CADDY_TLS_BLOCK=${TLS_BLOCK}
CADDY_HOST="${POSTHOG_DOMAIN}, http://, https://"
POSTHOG_APP_TAG=${POSTHOG_APP_TAG}
EOF

echo "Загрузка GeoLite2 (mmdb)…"
if [[ ! -f share/GeoLite2-City.mmdb ]]; then
  curl -fsSL "https://mmdbcdn.posthog.net/" --http1.1 \
    | docker run --rm -i alpine:3.20 sh -c "apk add --no-cache brotli >/dev/null && brotli -d" \
    > share/GeoLite2-City.mmdb
  echo "{\"date\": \"$(date +%Y-%m-%d)\"}" > share/GeoLite2-City.json
  chmod 644 share/GeoLite2-City.mmdb share/GeoLite2-City.json
fi

rm -rf compose
mkdir -p compose

cat > compose/start <<'EOF'
#!/bin/bash
./compose/wait
./bin/migrate
./bin/docker-server
EOF
chmod +x compose/start

cat > compose/temporal-django-worker <<'EOF'
#!/bin/bash
./bin/temporal-django-worker
EOF
chmod +x compose/temporal-django-worker

cat > compose/wait <<'EOF'
#!/usr/bin/env python3

import socket
import time


def loop():
  print("Waiting for ClickHouse and Postgres to be ready")
  try:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
      s.connect(("clickhouse", 9000))
    print("Clickhouse is ready")
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
      s.connect(("db", 5432))
    print("Postgres is ready")
  except ConnectionRefusedError:
    time.sleep(5)
    loop()


loop()
EOF
chmod +x compose/wait

echo "Запуск docker compose (официальный hobby)…"
docker compose -f docker-compose.yml pull
docker compose -f docker-compose.yml up -d --remove-orphans

echo ""
echo "Ожидайте миграции (несколько минут). UI: https://${POSTHOG_DOMAIN}"
echo "Логи web: docker compose -f docker-compose.yml logs -f web"

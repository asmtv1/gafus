#!/bin/bash
# Проверка переменных Tracer в контейнерах на сервере
# Запуск: ssh -i ~/.ssh/gafus_server_key root@185.239.51.125 'bash -s' < scripts/check-tracer-env.sh
# Или: ssh ... "cd /path/to/gafus && ./scripts/check-tracer-env.sh"

set -e

echo "=== Tracer env (web) ==="
docker exec gafus-web env | grep -E "TRACER|NEXT_PUBLIC_APP_VERSION" || true

echo ""
echo "=== Tracer env (trainer-panel) ==="
docker exec gafus-trainer-panel env | grep -E "TRACER|NEXT_PUBLIC_APP_VERSION" || true

echo ""
echo "=== Кратко ==="
WEB_TOKEN=$(docker exec gafus-web printenv NEXT_PUBLIC_TRACER_APP_TOKEN 2>/dev/null || echo "")
WEB_ENABLE=$(docker exec gafus-web printenv NEXT_PUBLIC_ENABLE_TRACER 2>/dev/null || echo "")

if [ -z "$WEB_TOKEN" ]; then
  echo "⚠️  NEXT_PUBLIC_TRACER_APP_TOKEN не задан — Tracer не будет отправлять данные"
else
  echo "✓ NEXT_PUBLIC_TRACER_APP_TOKEN задан (длина: ${#WEB_TOKEN})"
fi

if [ "$WEB_ENABLE" = "true" ]; then
  echo "✓ NEXT_PUBLIC_ENABLE_TRACER=true"
else
  echo "⚠️  NEXT_PUBLIC_ENABLE_TRACER=$WEB_ENABLE (ожидается true)"
fi

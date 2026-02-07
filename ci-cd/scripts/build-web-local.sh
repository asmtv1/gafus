#!/usr/bin/env bash
# Локальная сборка образа web и проверка, что updateStepAndDay попал в серверный бандл.
# Запускать из корня репо, когда Docker запущен.

set -e
cd "$(dirname "$0")/../.."

echo "🔨 Сборка образа gafus-web:local..."
docker build -f ci-cd/docker/Dockerfile-web-optimized -t gafus-web:local .

echo ""
echo "🔍 Проверка: updateStepAndDay в серверных чанках standalone..."
if docker run --rm gafus-web:local sh -c 'grep -l "updateStepAndDay" /app/apps/web/.next/server/chunks/*.js 2>/dev/null | head -3'; then
  echo "✅ updateStepAndDay найден в бандле — контейнер собран корректно."
else
  echo "❌ updateStepAndDay не найден в server chunks — возможна ошибка на проде."
  exit 1
fi

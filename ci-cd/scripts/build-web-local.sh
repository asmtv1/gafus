#!/usr/bin/env bash
# Локальная сборка образа web и проверка, что updateStepAndDay попал в серверный бандл.
# Запускать из корня репо, когда Docker запущен.
# После сборки можно поднять контейнер и проверить шаги тренировки вручную (порт 3000).

set -e
cd "$(dirname "$0")/../.."

echo "🔨 Сборка образа gafus-web:local..."
docker build -f ci-cd/docker/Dockerfile-web-optimized -t gafus-web:local .

echo ""
echo "🔍 Проверка: updateStepAndDay в серверных чанках..."
if docker run --rm gafus-web:local sh -c 'grep -l "updateStepAndDay" /app/apps/web/.next/server/chunks/*.js 2>/dev/null | head -3'; then
  echo "✅ Строка updateStepAndDay найдена в чанках."
else
  echo "❌ updateStepAndDay не найден в server chunks."
  exit 1
fi

echo ""
echo "Проверка прод-поведения: запусти контейнер и открой тренировку:"
echo "  docker run --rm -p 3000:3000 --env-file .env.local gafus-web:local"
echo "  Открой http://localhost:3000/trainings/home/<dayId>, нажми Старт/Сброс на шаге — не должно быть 500."

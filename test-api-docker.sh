#!/bin/bash
# Скрипт для тестирования API Docker образа

set -e

echo "🔨 Собираем Docker образ API..."
docker build -f ci-cd/docker/Dockerfile-api-optimized -t gafus-api:local .

echo ""
echo "✅ Образ собран успешно!"
echo ""
echo "🧪 Проверяем структуру образа..."

# Проверяем наличие @hono/node-server в образе
echo "Проверка наличия @hono/node-server:"
docker run --rm gafus-api:local ls -la /app/node_modules/@hono/node-server 2>&1 || echo "❌ Пакет не найден"

echo ""
echo "Проверка структуры dist:"
docker run --rm gafus-api:local ls -la /app/dist/ | head -10

echo ""
echo "Проверка package.json:"
docker run --rm gafus-api:local cat /app/package.json | grep -A 5 '"@hono/node-server"'

echo ""
echo "🚀 Запускаем контейнер для проверки..."
docker run -d --name gafus-api-test -p 3001:3001 \
  -e DATABASE_URL="postgresql://test:test@localhost:5432/test" \
  -e REDIS_URL="redis://localhost:6379" \
  gafus-api:local

echo "Ждем 5 секунд..."
sleep 5

echo ""
echo "Проверка логов:"
docker logs gafus-api-test 2>&1 | tail -20

echo ""
echo "Проверка статуса контейнера:"
docker ps | grep gafus-api-test || echo "❌ Контейнер не запущен"

echo ""
echo "🧹 Очистка..."
docker stop gafus-api-test 2>/dev/null || true
docker rm gafus-api-test 2>/dev/null || true

echo ""
echo "✅ Тестирование завершено!"

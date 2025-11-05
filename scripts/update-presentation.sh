#!/bin/bash

# Скрипт для обновления presentation.html на сервере без пересборки образа
# Использование: ./scripts/update-presentation.sh

set -e

echo "🔄 Обновление presentation.html на сервере..."

# Находим контейнер web приложения
CONTAINER_NAME=$(docker ps --filter "name=web" --format "{{.Names}}" | head -n 1)

if [ -z "$CONTAINER_NAME" ]; then
    echo "❌ Контейнер web не найден!"
    echo "Попробуем найти через docker-compose..."
    CONTAINER_NAME=$(docker-compose -f ci-cd/docker/docker-compose.prod.yml ps -q web 2>/dev/null || echo "")
    
    if [ -z "$CONTAINER_NAME" ]; then
        echo "❌ Контейнер не найден. Проверьте, что приложение запущено."
        exit 1
    fi
fi

echo "✅ Найден контейнер: $CONTAINER_NAME"

# Проверяем, существует ли локальный файл
LOCAL_FILE="apps/web/public/presentation.html"
if [ ! -f "$LOCAL_FILE" ]; then
    echo "❌ Локальный файл $LOCAL_FILE не найден!"
    exit 1
fi

echo "📁 Копируем файл в контейнер..."

# Копируем файл в контейнер
docker cp "$LOCAL_FILE" "$CONTAINER_NAME:/app/apps/web/public/presentation.html"

# Проверяем права доступа (пользователь nextjs)
docker exec "$CONTAINER_NAME" chown nextjs:nodejs /app/apps/web/public/presentation.html || true

echo "✅ Файл успешно обновлен!"
echo "💡 Примечание: В Next.js статические файлы из public кэшируются. Если изменения не видны:"
echo "   1. Очистите кэш браузера (Ctrl+Shift+R)"
echo "   2. Или перезапустите контейнер: docker restart $CONTAINER_NAME"






#!/bin/bash

# Скрипт для загрузки бэкапа БД на Яндекс.Диск
# Требует: YANDEX_DISK_TOKEN в переменных окружения

echo "🗄️ Создание и загрузка бэкапа БД на Яндекс.Диск..."

# Проверяем наличие токена
if [ -z "$YANDEX_DISK_TOKEN" ]; then
    echo "❌ YANDEX_DISK_TOKEN не установлен!"
    exit 1
fi

# Создаем временную папку для бэкапа
TEMP_DIR="/tmp/gafus_backup_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$TEMP_DIR"

# Создаем бэкап PostgreSQL
BACKUP_FILE="$TEMP_DIR/gafus_backup_$(date +%Y%m%d_%H%M%S).sql"
echo "📦 Создание бэкапа: $BACKUP_FILE"

docker exec gafus-postgres pg_dump -U gafus -d gafus > "$BACKUP_FILE"

if [ $? -ne 0 ]; then
    echo "❌ Ошибка создания бэкапа!"
    rm -rf "$TEMP_DIR"
    exit 1
fi

# Сжимаем бэкап
COMPRESSED_FILE="$BACKUP_FILE.gz"
gzip "$BACKUP_FILE"

if [ $? -ne 0 ]; then
    echo "❌ Ошибка сжатия бэкапа!"
    rm -rf "$TEMP_DIR"
    exit 1
fi

# Загружаем на Яндекс.Диск
REMOTE_PATH="/Gafus/backups/$(basename $COMPRESSED_FILE)"
echo "☁️ Загрузка на Яндекс.Диск: $REMOTE_PATH"

# Создаем папку на диске если её нет
curl -X PUT \
  -H "Authorization: OAuth $YANDEX_DISK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"path": "/Gafus/backups"}' \
  "https://cloud-api.yandex.net/v1/disk/resources?path=/Gafus/backups" \
  > /dev/null 2>&1

# Загружаем файл
UPLOAD_URL=$(curl -s -X GET \
  -H "Authorization: OAuth $YANDEX_DISK_TOKEN" \
  "https://cloud-api.yandex.net/v1/disk/resources/upload?path=$REMOTE_PATH&overwrite=true" | \
  grep -o '"href":"[^"]*"' | cut -d'"' -f4)

if [ -z "$UPLOAD_URL" ]; then
    echo "❌ Не удалось получить URL для загрузки!"
    rm -rf "$TEMP_DIR"
    exit 1
fi

# Загружаем файл
curl -X PUT \
  -H "Authorization: OAuth $YANDEX_DISK_TOKEN" \
  --upload-file "$COMPRESSED_FILE" \
  "$UPLOAD_URL" > /dev/null 2>&1

if [ $? -eq 0 ]; then
    echo "✅ Бэкап успешно загружен на Яндекс.Диск: $REMOTE_PATH"
    
    # Удаляем временные файлы
    rm -rf "$TEMP_DIR"
    
    # Удаляем старые бэкапы на диске (оставляем только последние 10)
    echo "🧹 Очистка старых бэкапов на диске..."
    
    # Получаем список файлов в папке
    FILES=$(curl -s -X GET \
      -H "Authorization: OAuth $YANDEX_DISK_TOKEN" \
      "https://cloud-api.yandex.net/v1/disk/resources?path=/Gafus/backups&limit=100" | \
      grep -o '"[^"]*\.sql\.gz"' | cut -d'"' -f2 | sort -r)
    
    # Удаляем старые (оставляем 10)
    COUNT=0
    for FILE in $FILES; do
        COUNT=$((COUNT + 1))
        if [ $COUNT -gt 10 ]; then
            echo "🗑️ Удаление старого бэкапа: $FILE"
            curl -X DELETE \
              -H "Authorization: OAuth $YANDEX_DISK_TOKEN" \
              "https://cloud-api.yandex.net/v1/disk/resources?path=/Gafus/backups/$FILE" > /dev/null 2>&1
        fi
    done
    
    echo "🧹 Очистка завершена (оставлено 10 последних бэкапов)"
else
    echo "❌ Ошибка загрузки на Яндекс.Диск!"
    rm -rf "$TEMP_DIR"
    exit 1
fi

echo "🔒 Бэкап БД успешно сохранен в облаке"

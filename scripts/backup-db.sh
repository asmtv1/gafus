#!/bin/bash

# Скрипт для резервного копирования БД перед деплоем
# Запускается на сервере перед docker-compose down

echo "🗄️ Создание резервной копии БД..."

# Создаем папку для бэкапов если её нет
mkdir -p backups

# Создаем бэкап с timestamp
BACKUP_FILE="backups/gafus_backup_$(date +%Y%m%d_%H%M%S).sql"

# Создаем бэкап PostgreSQL
docker exec gafus-postgres pg_dump -U gafus -d gafus > "$BACKUP_FILE"

if [ $? -eq 0 ]; then
    echo "✅ Резервная копия создана: $BACKUP_FILE"
    
    # Удаляем старые бэкапы (оставляем только последние 5)
    ls -t backups/gafus_backup_*.sql | tail -n +6 | xargs -r rm
    
    echo "🧹 Старые бэкапы очищены (оставлено 5 последних)"
else
    echo "❌ Ошибка создания резервной копии!"
    exit 1
fi

echo "🔒 БД готова к безопасному деплою"

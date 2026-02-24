#!/bin/bash

set -e

# Загружаем переменные из .env (если файл существует)
if [ -f .env ]; then
  echo "✅ Найден файл .env, загружаем переменные..."
  export $(grep -v '^#' .env | grep -v '^$' | xargs)
else
  echo "⚠️  Файл .env не найден, используем системные переменные"
fi

# Проверяем наличие DATABASE_URL
if [ -z "$DATABASE_URL" ]; then
  echo "❌ Ошибка: DATABASE_URL не найден в переменных окружения"
  exit 1
fi

# Имя файла бэкапа
BACKUP_FILE="gafus_backup_20260224_132232.sql"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "❌ Ошибка: файл бэкапа $BACKUP_FILE не найден в корне проекта"
  exit 1
fi

# Извлекаем имя базы данных из DATABASE_URL
DB_NAME=$(echo "$DATABASE_URL" | sed -n 's/.*\/\([^?]*\).*/\1/p')
# Получаем URL без имени базы для подключения к postgres
DB_URL_WITHOUT_DB=$(echo "$DATABASE_URL" | sed 's/\/[^/]*$/\/postgres/')

echo "💥 Удаляем базу данных (если существует)..."
psql "$DB_URL_WITHOUT_DB" -c "DROP DATABASE IF EXISTS \"$DB_NAME\";" --quiet --no-psqlrc || true

echo "🆕 Создаём новую пустую базу данных..."
psql "$DB_URL_WITHOUT_DB" -c "CREATE DATABASE \"$DB_NAME\";" --quiet --no-psqlrc || {
  echo "❌ Ошибка при создании базы данных"
  exit 1
}

echo "📦 Восстанавливаем базу данных из бэкапа..."
psql "$DATABASE_URL" -f "$BACKUP_FILE" --quiet --no-psqlrc || {
  echo "❌ Ошибка при восстановлении из бэкапа"
  exit 1
}

echo "🔄 Генерируем Prisma Client..."
pnpm --filter @gafus/prisma db:generate

echo "📋 Проверяем статус миграций..."
pnpm --filter @gafus/prisma exec prisma migrate status || true

echo "✅ База данных восстановлена из бэкапа."
echo "🚀 Теперь можно применить миграции: pnpm --filter @gafus/prisma db:migrate:deploy"

#!/bin/bash

set -e

# Загружаем переменные из .env (если файл существует)
if [ -f .env ]; then
  echo "✅ Найден файл .env, загружаем переменные..."
  export $(grep -v '^#' .env | grep -v '^$' | xargs)
else
  echo "⚠️  Файл .env не найден, используем системные переменные"
fi

SCHEMA_PATH="packages/prisma/schema.prisma"

# Проверяем наличие DATABASE_URL
if [ -z "$DATABASE_URL" ]; then
  echo "❌ Ошибка: DATABASE_URL не найден в переменных окружения"
  exit 1
fi

echo "🧹 Очищаем кэш Prisma..."
rm -rf packages/prisma/node_modules/.prisma

echo "🔥 Удаляем миграции..."
rm -rf packages/prisma/migrations

echo "💥 Сбрасываем базу данных..."
DATABASE_URL=$DATABASE_URL pnpm exec prisma migrate reset --schema=$SCHEMA_PATH --force --skip-seed || true

echo "🛠️  Создаём новую миграцию: init"
DATABASE_URL=$DATABASE_URL pnpm exec prisma migrate dev --schema=$SCHEMA_PATH --name init

echo "🔄 Генерируем Prisma Client..."
DATABASE_URL=$DATABASE_URL pnpm --filter @gafus/prisma db:generate

echo "🌱 Прогоняем сид-скрипт..."
DATABASE_URL=$DATABASE_URL pnpm --filter @gafus/prisma db:seed

echo "✅ База данных полностью сброшена и готова."
echo "🚀 Теперь можно запускать: pnpm run build"

#запуск 
# chmod +x /reset-db.sh
# ./reset-db.sh
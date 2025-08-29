#!/bin/bash

set -e

SCHEMA_PATH="packages/prisma/schema.prisma"

echo "🔥 Удаляем миграции..."
rm -rf prisma/migrations

echo "💥 Сбрасываем базу данных..."
PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="User explicitly consented to reset development database" DATABASE_URL="postgresql://postgres:1488@localhost:5432/dog_trainer" pnpx prisma migrate reset --schema=$SCHEMA_PATH --force --skip-seed

echo "🛠️  Создаём новый мигрэйшн: init"
DATABASE_URL="postgresql://postgres:1488@localhost:5432/dog_trainer" pnpx prisma migrate dev --schema=$SCHEMA_PATH --name init

echo "🔄 Генерируем Prisma Client..."
pnpx prisma generate --schema=$SCHEMA_PATH

echo "🌱 Прогоняем сид-скрипт..."
DATABASE_URL="postgresql://postgres:1488@localhost:5432/dog_trainer" pnpm --filter @gafus/prisma db:seed

echo "✅ База данных полностью сброшена и готова."

#запуск 
# chmod +x /reset-db.sh
# ./reset-db.sh
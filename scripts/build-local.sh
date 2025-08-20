#!/bin/bash

# Скрипт для локальной сборки как в CI
# Запускает те же команды, что и в .github/workflows/ci-cd.yml

set -e

echo "🔨 Запуск локальной сборки (как в CI)..."
echo "=================================="

# Проверяем что мы в корне проекта
if [ ! -f "package.json" ] || [ ! -f "pnpm-lock.yaml" ]; then
    echo "❌ Ошибка: запустите скрипт из корня проекта"
    exit 1
fi

# Устанавливаем зависимости (как в CI)
echo "📦 Установка зависимостей..."
pnpm install

# Собираем web приложение (как в CI)
echo "🌐 Сборка web приложения..."
cd apps/web
pnpm build
cd ../..

# Собираем trainer-panel (как в CI)
echo "👨‍🏫 Сборка trainer-panel..."
cd apps/trainer-panel
pnpm build
cd ../..

# Собираем error-dashboard (как в CI)
echo "📊 Сборка error-dashboard..."
cd apps/error-dashboard
pnpm build
cd ../..

# Собираем все пакеты
echo "📦 Сборка всех пакетов..."
pnpm -r run build

echo "=================================="
echo "✅ Локальная сборка завершена успешно!"
echo "🎯 Теперь локальная сборка точно соответствует CI"

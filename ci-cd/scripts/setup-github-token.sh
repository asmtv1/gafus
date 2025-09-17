#!/bin/bash

# Скрипт для настройки GitHub токена
# Использование: ./ci-cd/scripts/setup-github-token.sh

set -e

echo "🔑 Настройка GitHub токена..."

# Проверяем, что файл с токеном существует
if [ ! -f "ci-cd/configs/github-token.env" ]; then
    echo "❌ Файл ci-cd/configs/github-token.env не найден!"
    exit 1
fi

# Загружаем переменные окружения
source ci-cd/configs/github-token.env

# Проверяем, что токен установлен
if [ -z "$GITHUB_TOKEN" ]; then
    echo "❌ GITHUB_TOKEN не установлен в файле ci-cd/configs/github-token.env!"
    exit 1
fi

# Настраиваем GitHub CLI
echo "📝 Настраиваем GitHub CLI..."
echo "$GITHUB_TOKEN" | gh auth login --with-token

# Проверяем авторизацию
echo "🔍 Проверяем авторизацию..."
if gh auth status > /dev/null 2>&1; then
    echo "✅ GitHub CLI успешно настроен!"
    echo "   Пользователь: $(gh api user --jq .login)"
    echo "   Токен: ${GITHUB_TOKEN:0:20}..."
else
    echo "❌ Ошибка настройки GitHub CLI!"
    exit 1
fi

echo ""
echo "🎉 GitHub токен успешно настроен!"
echo "   Теперь можно использовать команды git push и gh"

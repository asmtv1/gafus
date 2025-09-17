#!/bin/bash

set -e

echo "🔧 Настройка локального домена для Error Dashboard..."

# Проверяем, что мы на macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
    echo "❌ Этот скрипт предназначен только для macOS"
    exit 1
fi

# Добавляем запись в /etc/hosts
echo "📝 Добавление записи в /etc/hosts..."
if ! grep -q "errors.gafus.localhost" /etc/hosts; then
    echo "127.0.0.1 errors.gafus.localhost" | sudo tee -a /etc/hosts
    echo "✅ Запись добавлена в /etc/hosts"
else
    echo "ℹ️  Запись уже существует в /etc/hosts"
fi

# Проверяем, установлен ли nginx
if ! command -v nginx &> /dev/null; then
    echo "📦 Установка nginx..."
    brew install nginx
    echo "✅ nginx установлен"
else
    echo "ℹ️  nginx уже установлен"
fi

# Создаем конфигурацию nginx
echo "⚙️  Настройка nginx..."
NGINX_CONF_DIR="/usr/local/etc/ci-cd/nginx/sites-available"
NGINX_ENABLED_DIR="/usr/local/etc/ci-cd/nginx/sites-enabled"

# Создаем директории если их нет
sudo mkdir -p "$NGINX_CONF_DIR"
sudo mkdir -p "$NGINX_ENABLED_DIR"

# Копируем конфигурацию
sudo cp nginx-error-dashboard.conf "$NGINX_CONF_DIR/errors.gafus.localhost"

# Создаем символическую ссылку
if [ ! -L "$NGINX_ENABLED_DIR/errors.gafus.localhost" ]; then
    sudo ln -s "$NGINX_CONF_DIR/errors.gafus.localhost" "$NGINX_ENABLED_DIR/errors.gafus.localhost"
    echo "✅ Символическая ссылка создана"
else
    echo "ℹ️  Символическая ссылка уже существует"
fi

# Проверяем конфигурацию nginx
echo "🔍 Проверка конфигурации nginx..."
if sudo nginx -t; then
    echo "✅ Конфигурация nginx корректна"
else
    echo "❌ Ошибка в конфигурации nginx"
    exit 1
fi

# Перезапускаем nginx
echo "🔄 Перезапуск nginx..."
sudo nginx -s reload
echo "✅ nginx перезапущен"

echo ""
echo "🎉 Настройка завершена!"
echo ""
echo "📋 Что было сделано:"
echo "  ✅ Добавлена запись errors.gafus.localhost в /etc/hosts"
echo "  ✅ Установлен и настроен nginx"
echo "  ✅ Создана конфигурация для проксирования"
echo ""
echo "🌐 Теперь Error Dashboard доступен по адресу:"
echo "   http://errors.gafus.localhost"
echo ""
echo "🚀 Для запуска дашборда выполните:"
echo "   cd apps/error-dashboard && DATABASE_URL='postgresql://postgres:password@localhost:5432/dog_trainer' pnpm dev"
echo ""
echo "📝 Для отладки nginx используйте:"
echo "   sudo tail -f /usr/local/var/log/ci-cd/nginx/errors.gafus.localhost.error.log" 
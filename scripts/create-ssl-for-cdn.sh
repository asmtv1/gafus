#!/bin/bash

# Скрипт для создания SSL сертификата для CDN домена
# Альтернативный подход через прямое использование certbot

set -e

echo "🔐 Создание SSL сертификата для gafus-media.gafus.ru..."

# Переходим в директорию с Docker Compose
cd "$(dirname "$0")/../ci-cd/docker"

# Останавливаем nginx для освобождения портов
echo "🛑 Останавливаем nginx..."
docker-compose stop nginx

# Запускаем nginx с SSL challenge конфигурацией
echo "🚀 Запускаем nginx с SSL challenge конфигурацией..."
cp ../nginx/conf.d/gafus.ru.ssl-challenge.conf ../nginx/conf.d/ssl-challenge.conf
docker-compose up -d nginx

# Ждем запуска nginx
echo "⏳ Ждем запуска nginx..."
sleep 10

# Создаем сертификат через certbot
echo "🔐 Создаем SSL сертификат..."
docker-compose run --rm certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email admin@gafus.ru \
    --agree-tos \
    --no-eff-email \
    --force-renewal \
    -d gafus.ru \
    -d www.gafus.ru \
    -d api.gafus.ru \
    -d trainer-panel.gafus.ru \
    -d monitor.gafus.ru \
    -d queues.gafus.ru \
    -d gafus-media.gafus.ru

# Проверяем создание сертификата
echo "✅ Проверяем создание сертификата..."
if [ -f "../certbot/conf/live/gafus.ru/fullchain.pem" ]; then
    echo "✅ SSL сертификат успешно создан!"
    
    # Показываем информацию о сертификате
    echo "📋 Информация о сертификате:"
    openssl x509 -in ../certbot/conf/live/gafus.ru/fullchain.pem -text -noout | grep -A 5 "Subject Alternative Name"
else
    echo "❌ SSL сертификат не был создан!"
    exit 1
fi

# Удаляем временную конфигурацию
echo "🧹 Удаляем временную конфигурацию..."
rm -f ../nginx/conf.d/ssl-challenge.conf

# Перезапускаем nginx с полной конфигурацией
echo "🔄 Перезапускаем nginx с полной конфигурацией..."
docker-compose restart nginx

echo "✅ SSL сертификат успешно создан!"
echo "🌐 Теперь домен gafus-media.gafus.ru должен работать с HTTPS"

# Тестируем доступность
echo "🧪 Тестируем доступность домена..."
sleep 5

if curl -s -f https://gafus-media.gafus.ru/uploads/course-logo.webp > /dev/null 2>&1; then
    echo "✅ HTTPS работает для gafus-media.gafus.ru!"
else
    echo "⚠️  HTTPS может еще не работать. Проверьте DNS и подождите несколько минут."
fi

echo "🎉 Готово! SSL сертификат создан."

#!/bin/bash

# Скрипт для обновления SSL сертификата с добавлением gafus-media.gafus.ru

set -e

echo "🔐 Обновление SSL сертификата для домена gafus-media.gafus.ru..."

# Переходим в директорию с Docker Compose
cd "$(dirname "$0")/../ci-cd/docker"

# Проверяем, что nginx запущен
echo "📋 Проверяем статус nginx..."
if ! docker-compose ps nginx | grep -q "Up"; then
    echo "❌ Nginx не запущен. Запускаем..."
    docker-compose up -d nginx
    sleep 5
fi

# Создаем SSL challenge конфигурацию (если нужно)
echo "📋 Проверяем SSL challenge конфигурацию..."
if [ ! -f "../nginx/conf.d/gafus.ru.ssl-challenge.conf" ]; then
    echo "❌ SSL challenge конфигурация не найдена!"
    exit 1
fi

# Перезапускаем nginx с новой конфигурацией
echo "🔄 Перезапускаем nginx с обновленной конфигурацией..."
docker-compose restart nginx

# Ждем, пока nginx запустится
echo "⏳ Ждем запуска nginx..."
sleep 10

# Проверяем, что nginx отвечает на порту 80
echo "🔍 Проверяем доступность nginx на порту 80..."
if ! curl -s -f http://localhost/.well-known/acme-challenge/test > /dev/null 2>&1; then
    echo "⚠️  Nginx может быть не готов. Продолжаем..."
fi

# Обновляем SSL сертификат
echo "🔐 Обновляем SSL сертификат с новым доменом..."
docker-compose run --rm certbot

# Проверяем, что сертификат создался
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

# Перезапускаем nginx с новым сертификатом
echo "🔄 Перезапускаем nginx с новым SSL сертификатом..."
docker-compose restart nginx

echo "✅ SSL сертификат успешно обновлен!"
echo "🌐 Теперь домен gafus-media.gafus.ru должен работать с HTTPS"

# Тестируем доступность
echo "🧪 Тестируем доступность домена..."
sleep 5

if curl -s -f https://gafus-media.gafus.ru/uploads/course-logo.webp > /dev/null 2>&1; then
    echo "✅ HTTPS работает для gafus-media.gafus.ru!"
else
    echo "⚠️  HTTPS может еще не работать. Проверьте DNS и подождите несколько минут."
fi

echo "🎉 Готово! SSL сертификат обновлен."

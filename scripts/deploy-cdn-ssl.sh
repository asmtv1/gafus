#!/bin/bash

# Скрипт для развертывания SSL решения для CDN домена gafus-media.gafus.ru
# Этот скрипт решает проблему с отображением изображений на мобильных устройствах

set -e

echo "🚀 Развертывание SSL решения для CDN домена gafus-media.gafus.ru"
echo "================================================================"

# Переходим в директорию проекта
cd "$(dirname "$0")/.."

# Проверяем, что мы в правильной директории
if [ ! -f "ci-cd/docker/docker-compose.prod.yml" ]; then
    echo "❌ Не найдена конфигурация Docker Compose!"
    exit 1
fi

echo "📋 Проверяем текущее состояние..."

# Проверяем DNS
echo "🔍 Проверяем DNS для gafus-media.gafus.ru..."
if nslookup gafus-media.gafus.ru > /dev/null 2>&1; then
    echo "✅ DNS настроен корректно"
else
    echo "❌ DNS не настроен для gafus-media.gafus.ru!"
    echo "   Настройте CNAME запись: gafus-media → 17df3fb20ae034d3.a.yccdn.cloud.yandex.net"
    exit 1
fi

# Проверяем текущий SSL сертификат
echo "🔍 Проверяем текущий SSL сертификат..."
if [ -f "ci-cd/certbot/conf/live/gafus.ru/fullchain.pem" ]; then
    echo "✅ SSL сертификат существует"
    
    # Проверяем, включен ли домен gafus-media.gafus.ru в сертификат
    if openssl x509 -in ci-cd/certbot/conf/live/gafus.ru/fullchain.pem -text -noout | grep -q "gafus-media.gafus.ru"; then
        echo "✅ Домен gafus-media.gafus.ru уже включен в SSL сертификат"
        NEED_NEW_CERT=false
    else
        echo "⚠️  Домен gafus-media.gafus.ru не включен в SSL сертификат"
        NEED_NEW_CERT=true
    fi
else
    echo "⚠️  SSL сертификат не найден"
    NEED_NEW_CERT=true
fi

# Создаем новый SSL сертификат если нужно
if [ "$NEED_NEW_CERT" = true ]; then
    echo "🔐 Создаем новый SSL сертификат с доменом gafus-media.gafus.ru..."
    
    # Запускаем скрипт создания SSL сертификата
    if ./scripts/create-ssl-for-cdn.sh; then
        echo "✅ SSL сертификат успешно создан"
    else
        echo "❌ Ошибка при создании SSL сертификата"
        exit 1
    fi
else
    echo "🔄 Перезапускаем nginx с существующим SSL сертификатом..."
    cd ci-cd/docker
    docker-compose restart nginx
    cd ../..
fi

# Ждем запуска nginx
echo "⏳ Ждем запуска nginx..."
sleep 10

# Тестируем доступность
echo "🧪 Тестируем доступность домена gafus-media.gafus.ru..."

# Проверяем HTTP редирект
echo "📋 Проверяем HTTP редирект..."
if curl -s -I http://gafus-media.gafus.ru/uploads/course-logo.webp | grep -q "301\|302"; then
    echo "✅ HTTP редирект работает"
else
    echo "⚠️  HTTP редирект может не работать"
fi

# Проверяем HTTPS доступность
echo "📋 Проверяем HTTPS доступность..."
if curl -s -f https://gafus-media.gafus.ru/uploads/course-logo.webp > /dev/null 2>&1; then
    echo "✅ HTTPS работает для gafus-media.gafus.ru!"
    SSL_WORKING=true
else
    echo "⚠️  HTTPS может еще не работать. Проверьте DNS и подождите несколько минут."
    SSL_WORKING=false
fi

# Проверяем SSL сертификат
echo "📋 Проверяем SSL сертификат..."
if openssl s_client -connect gafus-media.gafus.ru:443 -servername gafus-media.gafus.ru < /dev/null 2>/dev/null | openssl x509 -noout -text | grep -q "gafus-media.gafus.ru"; then
    echo "✅ SSL сертификат покрывает домен gafus-media.gafus.ru"
else
    echo "⚠️  SSL сертификат может не покрывать домен gafus-media.gafus.ru"
fi

# Тестируем изображения
echo "📋 Тестируем загрузку изображений..."
if curl -s -f https://gafus-media.gafus.ru/uploads/courses/3122311.webp > /dev/null 2>&1; then
    echo "✅ Изображения доступны через HTTPS"
else
    echo "⚠️  Изображения могут быть недоступны"
fi

echo ""
echo "🎉 Развертывание завершено!"
echo "=========================="

if [ "$SSL_WORKING" = true ]; then
    echo "✅ SSL для gafus-media.gafus.ru настроен и работает"
    echo "📱 Мобильные устройства теперь должны корректно отображать изображения"
else
    echo "⚠️  SSL может потребовать дополнительной настройки"
    echo "🔍 Проверьте:"
    echo "   - DNS распространение (может занять до 24 часов)"
    echo "   - SSL сертификат в Yandex CDN"
    echo "   - nginx конфигурацию"
fi

echo ""
echo "📋 Следующие шаги:"
echo "1. Проверьте работу на мобильных устройствах"
echo "2. Настройте мониторинг SSL сертификата"
echo "3. Настройте автоматическое обновление сертификата"
echo ""
echo "📖 Документация: docs/CDN_SSL_SETUP.md"

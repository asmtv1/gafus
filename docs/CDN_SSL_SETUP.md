# Настройка SSL для CDN домена gafus-media.gafus.ru

## Проблема
Мобильные устройства не отображают изображения из-за SSL ошибки на домене `gafus-media.gafus.ru`. SSL сертификат CDN покрывает только `*.yccdn.cloud.yandex.net`, но не `gafus-media.gafus.ru`.

## Решение

### Вариант 1: Настройка SSL через nginx (Рекомендуется)

1. **Обновить SSL сертификат Let's Encrypt**:
   ```bash
   # Запустить скрипт обновления SSL сертификата
   ./scripts/update-ssl-certificate.sh
   
   # Или альтернативный скрипт
   ./scripts/create-ssl-for-cdn.sh
   ```

2. **Проверить создание сертификата**:
   ```bash
   # Проверить, что домен добавлен в сертификат
   openssl x509 -in ci-cd/certbot/conf/live/gafus.ru/fullchain.pem -text -noout | grep -A 5 "Subject Alternative Name"
   ```

3. **Перезапустить nginx**:
   ```bash
   cd ci-cd/docker
   docker-compose restart nginx
   ```

### Вариант 2: Настройка SSL в Yandex CDN

1. **Войти в панель управления Yandex Cloud**
2. **Перейти в раздел CDN**
3. **Найти ресурс для домена gafus-media.gafus.ru**
4. **Добавить SSL сертификат**:
   - Загрузить сертификат из `ci-cd/certbot/conf/live/gafus.ru/fullchain.pem`
   - Загрузить приватный ключ из `ci-cd/certbot/conf/live/gafus.ru/privkey.pem`
   - Или создать новый сертификат через Let's Encrypt

### Проверка работы

После настройки SSL проверить:

```bash
# Проверить SSL сертификат
curl -I https://gafus-media.gafus.ru/uploads/course-logo.webp

# Проверить доступность изображений
curl -I https://gafus-media.gafus.ru/uploads/courses/3122311.webp
```

## Архитектура решения

```
Мобильное устройство
       ↓ HTTPS
gafus-media.gafus.ru (nginx с SSL)
       ↓ прокси
gafus-media.storage.yandexcloud.net (Yandex Object Storage)
```

## Преимущества

- ✅ HTTPS работает для всех устройств
- ✅ Мобильные браузеры не блокируют изображения
- ✅ Безопасное соединение
- ✅ Автоматическое обновление сертификата

## Файлы конфигурации

- `ci-cd/nginx/conf.d/gafus-media.gafus.ru.conf` - nginx конфигурация для CDN домена
- `ci-cd/docker/docker-compose.prod.yml` - обновленная конфигурация certbot
- `ci-cd/nginx/conf.d/gafus.ru.ssl-challenge.conf` - SSL challenge конфигурация

## Мониторинг

После настройки SSL рекомендуется:

1. Проверить работу на различных мобильных устройствах
2. Настроить мониторинг SSL сертификата
3. Настроить автоматическое обновление сертификата

## Troubleshooting

### SSL сертификат не создается
- Проверить DNS запись для gafus-media.gafus.ru
- Убедиться, что nginx отвечает на порту 80
- Проверить логи certbot: `docker-compose logs certbot`

### Изображения все еще не загружаются
- Проверить SSL сертификат: `openssl s_client -connect gafus-media.gafus.ru:443`
- Проверить nginx конфигурацию: `docker-compose exec nginx nginx -t`
- Проверить логи nginx: `docker-compose logs nginx`

# Инструкция по настройке CDN для медиафайлов

## Что уже сделано:

✅ **Создан бакет** `gafus-media` в Yandex Object Storage  
✅ **Создан CDN ресурс** с CNAME `gafus-media.yandexcloud.net`  
✅ **Настроены параметры кеширования** для медиафайлов  

## Следующие шаги:

### 1. Авторизация в Yandex Cloud CLI

Для автоматической синхронизации медиафайлов нужно авторизоваться в CLI:

1. **Перейдите по ссылке:** https://oauth.yandex.ru/authorize?response_type=token&client_id=1a6990aa636648e9b2ef855fa7bec2fb
2. **Войдите в свой аккаунт Yandex**
3. **Скопируйте OAuth токен** из адресной строки
4. **Выполните команду:**
   ```bash
   export PATH="$HOME/yandex-cloud/bin:$PATH"
   yc init
   ```
5. **Вставьте токен** когда попросит

### 2. Альтернативный способ - загрузка через веб-интерфейс

Если CLI не работает, можно загрузить файлы вручную:

1. **Перейдите в Object Storage** в консоли Yandex Cloud
2. **Откройте бакет** `gafus-media`
3. **Нажмите "Загрузить объекты"**
4. **Загрузите папку** `packages/public-assets/public/uploads/`

### 3. После загрузки файлов

Медиафайлы будут доступны по адресу:
- **CDN URL:** `https://gafus-media.yandexcloud.net/uploads/`
- **Прямой доступ:** `https://gafus-media.storage.yandexcloud.net/uploads/`

### 4. Обновление конфигурации nginx

После загрузки файлов нужно обновить nginx для проксирования через CDN:

```nginx
# В файле ci-cd/nginx/conf.d/gafus.ru.conf
location /uploads/ {
    # Проксируем запросы к медиафайлам через CDN
    proxy_pass https://gafus-media.yandexcloud.net/uploads/;
    proxy_set_header Host gafus-media.yandexcloud.net;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    
    # Кэширование на стороне nginx
    proxy_cache_valid 200 1y;
    proxy_cache_valid 404 1m;
    
    # Заголовки для кэширования в браузере
    expires 1y;
    add_header Cache-Control "public, immutable";
    
    # Fallback на локальные файлы если CDN недоступен
    error_page 502 503 504 = @fallback_uploads;
}

# Fallback для медиафайлов (локальные файлы)
location @fallback_uploads {
    alias /var/www/public-assets/uploads/;
    expires 1y;
    add_header Cache-Control "public, immutable";
}
```

## Структура медиафайлов

Медиафайлы организованы в следующие папки:
- `/uploads/avatars/` - аватары пользователей
- `/uploads/courses/` - изображения курсов  
- `/uploads/pets/` - изображения питомцев

## Проверка работы

После настройки проверьте доступность файлов:
```bash
curl -I https://gafus-media.yandexcloud.net/uploads/avatars/avatar.svg
```

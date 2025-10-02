# Настройка DNS для CDN

## Текущий статус:

✅ **Бакет создан:** `gafus-media`  
✅ **CDN ресурс настроен:** `gafus-media.yandexcloud.net`  
✅ **Медиафайлы загружены:** 12 файлов (188K)  
✅ **Конфигурация nginx обновлена**  

## Что нужно сделать для активации CDN:

### 1. Настройка DNS записи

Вам нужно добавить CNAME запись в настройки DNS для домена `gafus-media.yandexcloud.net`:

**Параметры CNAME записи:**
- **Имя:** `gafus-media`
- **Тип:** `CNAME`
- **Значение:** `17df3fb20ae034d3.a.yccdn.cloud.yandex.net`

### 2. Где настроить DNS:

**Если у вас есть домен `gafus-media.yandexcloud.net`:**
- Перейдите в панель управления вашего DNS-провайдера
- Добавьте CNAME запись с указанными параметрами

**Если это поддомен вашего основного домена:**
- В настройках DNS вашего основного домена добавьте CNAME для `gafus-media`

### 3. Альтернативное решение (временное):

Пока DNS не настроен, можно использовать прямой доступ к бакету:

```nginx
# Временная конфигурация nginx
location /uploads/ {
    proxy_pass https://gafus-media.storage.yandexcloud.net/uploads/;
    proxy_set_header Host gafus-media.storage.yandexcloud.net;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    
    expires 1y;
    add_header Cache-Control "public, immutable";
}
```

### 4. Проверка работы:

После настройки DNS проверьте доступность:

```bash
# Проверка CDN
curl -I https://gafus-media.yandexcloud.net/uploads/avatar.svg

# Проверка прямого доступа к бакету
curl -I https://gafus-media.storage.yandexcloud.net/uploads/avatar.svg
```

## Доступные медиафайлы:

- **Аватары:** `/uploads/avatars/`
- **Курсы:** `/uploads/courses/`
- **Питомцы:** `/uploads/pets/`

## Следующие шаги:

1. **Настройте DNS** для активации CDN
2. **Перезапустите nginx** после обновления конфигурации
3. **Протестируйте** загрузку медиафайлов через ваш сайт

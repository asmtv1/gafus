# 🌐 Настройка домена gafus.ru с HTTPS

## 📋 Что настроено:

### 1. **Nginx конфигурация**
- ✅ HTTP → HTTPS редирект
- ✅ SSL сертификаты Let's Encrypt
- ✅ Безопасные заголовки
- ✅ HTTP/2 поддержка

### 2. **Docker Compose**
- ✅ Certbot контейнер для автоматических сертификатов
- ✅ Volumes для сертификатов
- ✅ Зависимости между сервисами

### 3. **Автоматическое обновление**
- ✅ Скрипт `scripts/renew-ssl.sh`
- ✅ Cron job для ежедневного обновления

## 🚀 Первый запуск:

### 1. **Запустите сервисы:**
```bash
docker-compose -f docker-compose.prod.yml up -d
```

### 2. **Получите первый сертификат:**
```bash
# Остановите nginx
docker-compose -f docker-compose.prod.yml stop nginx

# Получите сертификат (staging для тестирования)
docker-compose -f docker-compose.prod.yml run --rm certbot certbot certonly --webroot --webroot-path=/var/www/certbot --email admin@gafus.ru --agree-tos --no-eff-email --staging -d gafus.ru -d www.gafus.ru

# Запустите nginx с сертификатами
docker-compose -f docker-compose.prod.yml up -d nginx
```

### 3. **Проверьте HTTPS:**
```bash
curl -I https://gafus.ru
```

## 🔄 Продакшн сертификаты:

### 1. **Уберите флаг --staging:**
```bash
# В docker-compose.prod.yml измените команду certbot:
command: certonly --webroot --webroot-path=/var/www/certbot --email admin@gafus.ru --agree-tos --no-eff-email -d gafus.ru -d www.gafus.ru
```

### 2. **Пересоздайте сертификат:**
```bash
docker-compose -f docker-compose.prod.yml stop nginx
docker-compose -f docker-compose.prod.yml run --rm certbot certbot certonly --webroot --webroot-path=/var/www/certbot --email admin@gafus.ru --agree-tos --no-eff-email -d gafus.ru -d www.gafus.ru
docker-compose -f docker-compose.prod.yml up -d nginx
```

## ⏰ Автоматическое обновление:

### 1. **Добавьте cron job:**
```bash
# Откройте crontab
crontab -e

# Добавьте строку (замените путь):
0 12 * * * /root/gafus/scripts/renew-ssl.sh
```

### 2. **Сделайте скрипт исполняемым:**
```bash
chmod +x /root/gafus/scripts/renew-ssl.sh
```

## 🔍 Проверка:

### 1. **Статус сертификатов:**
```bash
docker-compose -f docker-compose.prod.yml run --rm certbot certbot certificates
```

### 2. **Логи nginx:**
```bash
docker-compose -f docker-compose.prod.yml logs nginx
```

### 3. **Логи certbot:**
```bash
docker-compose -f docker-compose.prod.yml logs certbot
```

## 🚨 Важно:

- **Email**: Укажите правильный email в команде certbot
- **Домен**: Убедитесь что DNS записи указывают на ваш сервер
- **Порты**: Откройте 80 и 443 порты в файрволле
- **Бэкап**: Сертификаты сохраняются в `./certbot/conf/`

## 🌍 DNS настройки:

```
A     gafus.ru        → 185.239.51.125
A     www.gafus.ru    → 185.239.51.125
```

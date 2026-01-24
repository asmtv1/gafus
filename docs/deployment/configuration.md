# Конфигурация для развертывания

## 📋 Обзор

Этот документ описывает конфигурацию переменных окружения, настройки безопасности и оптимизации для развертывания системы GAFUS в различных средах.

## 🌍 Окружения

### Development (Разработка)

```env
# .env.development
NODE_ENV=development
NEXT_PUBLIC_APP_URL=http://localhost:3000

# База данных
DATABASE_URL=postgresql://postgres:password@localhost:5432/gafus_dev

# Redis
REDIS_URL=redis://localhost:6379

# Логирование
LOG_LEVEL=debug
ENABLE_CONSOLE_LOGS=true
ENABLE_ERROR_DASHBOARD=true

# Безопасность (менее строгие настройки)
NEXTAUTH_SECRET=development-secret-key
CSRF_SECRET=development-csrf-secret
```

### Staging (Тестирование)

```env
# .env.staging
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://staging.gafus.ru

# База данных
DATABASE_URL=postgresql://gafus_user:staging_password@staging-db:5432/gafus_staging

# Redis
REDIS_URL=redis://staging-redis:6379

# Логирование
LOG_LEVEL=info
ENABLE_CONSOLE_LOGS=true
ENABLE_ERROR_DASHBOARD=true

# Безопасность
NEXTAUTH_SECRET=staging-secret-key-change-in-production
CSRF_SECRET=staging-csrf-secret
```

### Production (Продакшен)

```env
# .env.production
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://gafus.ru

# База данных
DATABASE_URL=postgresql://gafus_prod:secure_production_password@prod-db:5432/gafus_production

# Redis
REDIS_URL=redis://prod-redis:6379

# Логирование
LOG_LEVEL=warn
ENABLE_CONSOLE_LOGS=false
ENABLE_ERROR_DASHBOARD=true

# Безопасность (строгие настройки)
NEXTAUTH_SECRET=very-secure-production-secret-key-64-chars-long
CSRF_SECRET=very-secure-production-csrf-secret-64-chars-long
```

## 🔐 Безопасность

### Аутентификация и авторизация

```env
# NextAuth конфигурация
NEXTAUTH_URL=https://gafus.ru
NEXTAUTH_SECRET=your-very-secure-secret-key-64-characters-minimum
NEXTAUTH_JWT_SECRET=your-jwt-secret-key

# JWT настройки
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d

# Сессии
SESSION_MAX_AGE=604800  # 7 дней
SESSION_UPDATE_AGE=86400  # 1 день
```

### CSRF защита

```env
# CSRF токены
CSRF_SECRET=your-csrf-secret-key-32-characters-minimum
CSRF_TOKEN_NAME=_csrf
CSRF_TOKEN_MAX_AGE=3600  # 1 час
```

### Rate Limiting

```env
# Ограничения запросов
RATE_LIMIT_WINDOW_MS=900000  # 15 минут
RATE_LIMIT_MAX_REQUESTS=100  # максимум запросов в окне

# API ограничения
API_RATE_LIMIT_WINDOW_MS=60000  # 1 минута
API_RATE_LIMIT_MAX_REQUESTS=60  # максимум запросов в минуту
```

### Межсервисная коммуникация

```env
# URL web-приложения для инвалидации кэша (для trainer-panel)
NEXT_PUBLIC_WEB_APP_URL=https://gafus.ru
# Или используйте WEB_APP_URL (без NEXT_PUBLIC_)
WEB_APP_URL=https://gafus.ru

# Секретный токен для межсервисных вызовов (опционально, но рекомендуется)
# Используется для защиты API endpoints инвалидации кэша
REVALIDATE_SECRET_TOKEN=your-secure-secret-token-here
```

## 🗄️ База данных

### PostgreSQL конфигурация

```env
# Основные настройки
DATABASE_URL=postgresql://username:password@host:port/database
DATABASE_SSL=true
DATABASE_SSL_REJECT_UNAUTHORIZED=true

# Connection Pool
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=10
DATABASE_POOL_IDLE_TIMEOUT_MS=30000
DATABASE_POOL_ACQUIRE_TIMEOUT_MS=60000

# Миграции
DATABASE_MIGRATE_ON_START=true
DATABASE_SEED_ON_START=false  # только для development
```

### Redis конфигурация

```env
# Основные настройки
REDIS_URL=redis://username:password@host:port/database
REDIS_TLS=true
REDIS_PASSWORD=your-redis-password

# Connection Pool
REDIS_POOL_MIN=2
REDIS_POOL_MAX=10
REDIS_CONNECT_TIMEOUT=10000
REDIS_COMMAND_TIMEOUT=5000

# Кэширование
REDIS_CACHE_TTL=3600  # 1 час по умолчанию
REDIS_SESSION_TTL=604800  # 7 дней для сессий
```

## 📁 Файловое хранилище

### AWS S3 конфигурация

```env
# AWS настройки
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=us-east-1
AWS_S3_BUCKET=gafus-production

# CDN настройки
CDN_BASE_URL=https://cdn.gafus.ru
CDN_UPLOAD_MAX_SIZE=10485760  # 10MB
CDN_ALLOWED_TYPES=image/jpeg,image/png,image/webp,application/pdf

# Оптимизация изображений
IMAGE_OPTIMIZATION_ENABLED=true
IMAGE_QUALITY=80
IMAGE_MAX_WIDTH=1920
IMAGE_MAX_HEIGHT=1080
```

### Локальное хранилище (для разработки)

```env
# Локальная загрузка файлов
LOCAL_UPLOAD_PATH=./public/uploads
LOCAL_UPLOAD_MAX_SIZE=10485760  # 10MB
LOCAL_UPLOAD_ALLOWED_TYPES=image/jpeg,image/png,image/webp
```

## 🤖 Telegram Bot

### Bot конфигурация

```env
# Основные настройки
TELEGRAM_BOT_TOKEN=your-telegram-bot-token
TELEGRAM_WEBHOOK_URL=https://gafus.ru/api/telegram-webhook
TELEGRAM_WEBHOOK_SECRET=your-webhook-secret

# Настройки бота
TELEGRAM_BOT_USERNAME=gafus_bot
TELEGRAM_BOT_DESCRIPTION=GAFUS Training Assistant
TELEGRAM_BOT_COMMANDS=/start,/help,/reset_password,/stats

# Ограничения
TELEGRAM_RATE_LIMIT_WINDOW_MS=60000  # 1 минута
TELEGRAM_RATE_LIMIT_MAX_MESSAGES=30  # максимум сообщений в минуту
```

## 📧 Уведомления

### Email настройки (если используется)

```env
# SMTP настройки
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# Отправка писем
EMAIL_FROM=noreply@gafus.ru
EMAIL_REPLY_TO=support@gafus.ru
```

### Push уведомления

```env
# VAPID ключи для Web Push
VAPID_PUBLIC_KEY=your-vapid-public-key
VAPID_PRIVATE_KEY=your-vapid-private-key
VAPID_SUBJECT=mailto:admin@gafus.ru

# Настройки уведомлений
PUSH_NOTIFICATIONS_ENABLED=true
PUSH_BATCH_SIZE=100
PUSH_RATE_LIMIT_MS=1000  # 1 секунда между батчами
```

## 📊 Мониторинг и логирование

### Логирование

```env
# Общие настройки
LOG_LEVEL=warn  # debug, info, warn, error
LOG_FORMAT=json  # json, pretty
LOG_ENABLE_COLORS=false  # только для development

# Error Dashboard
ERROR_DASHBOARD_ENDPOINT=https://errors.gafus.ru/api/report
ERROR_DASHBOARD_API_KEY=your-error-dashboard-api-key
ERROR_SAMPLE_RATE=1.0  # процент ошибок для отправки (0.0-1.0)

# Логирование в файлы
LOG_FILE_ENABLED=true
LOG_FILE_PATH=./logs
LOG_FILE_MAX_SIZE=10485760  # 10MB
LOG_FILE_MAX_FILES=5
```

### Метрики и аналитика

```env
# Аналитика
ANALYTICS_ENABLED=true
ANALYTICS_TRACKING_ID=your-tracking-id

# Мониторинг производительности
PERFORMANCE_MONITORING_ENABLED=true
PERFORMANCE_SAMPLE_RATE=0.1  # 10% запросов
```

## 🔧 Оптимизация

### Кэширование

```env
# Redis кэширование
CACHE_ENABLED=true
CACHE_TTL=3600  # 1 час
CACHE_MAX_ITEMS=10000

# Browser кэширование
BROWSER_CACHE_MAX_AGE=31536000  # 1 год для статических файлов
BROWSER_CACHE_SHARED_MAX_AGE=86400  # 1 день для общих ресурсов
```

### Сжатие

```env
# Gzip сжатие
GZIP_ENABLED=true
GZIP_LEVEL=6
GZIP_THRESHOLD=1024  # минимальный размер для сжатия

# Brotli сжатие (если поддерживается)
BROTLI_ENABLED=true
BROTLI_LEVEL=4
```

### Оптимизация изображений

```env
# Next.js Image Optimization
IMAGE_OPTIMIZATION_ENABLED=true
IMAGE_DOMAINS=cdn.gafus.ru,images.gafus.ru
IMAGE_FORMATS=image/webp,image/avif
IMAGE_SIZES=640,750,828,1080,1200,1920,2048
```

## 🌐 CDN и статические ресурсы

### CDN конфигурация

```env
# Основные настройки
CDN_BASE_URL=https://cdn.gafus.ru
CDN_CACHE_TTL=31536000  # 1 год
CDN_COMPRESSION_ENABLED=true

# Обработка изображений
CDN_IMAGE_OPTIMIZATION=true
CDN_IMAGE_QUALITY=80
CDN_IMAGE_FORMATS=webp,avif
```

### Статические ресурсы

```env
# Пути к ресурсам
STATIC_ASSETS_PATH=./public
STATIC_ASSETS_URL=/static

# Версионирование
ASSET_VERSIONING_ENABLED=true
ASSET_HASH_LENGTH=8
```

## 🔄 CI/CD конфигурация

### GitHub Actions (пример)

```yaml
# .github/workflows/deploy.yml
env:
  NODE_ENV: production
  DATABASE_URL: ${{ secrets.DATABASE_URL }}
  REDIS_URL: ${{ secrets.REDIS_URL }}
  NEXTAUTH_SECRET: ${{ secrets.NEXTAUTH_SECRET }}
  TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
  AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
  AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
```

### Docker Environment

```env
# docker-compose.prod.yml environment
NODE_ENV=production
DATABASE_URL=postgresql://gafus:password@postgres:5432/gafus
REDIS_URL=redis://redis:6379
NEXTAUTH_URL=https://gafus.ru
```

## 📋 Проверочный список

### Перед развертыванием

- [ ] Все секретные ключи сгенерированы и настроены
- [ ] База данных настроена и миграции применены
- [ ] Redis настроен и доступен
- [ ] SSL сертификаты установлены
- [ ] CDN настроен и работает
- [ ] Мониторинг настроен
- [ ] Резервное копирование настроено
- [ ] Логирование настроено
- [ ] Rate limiting настроен
- [ ] CORS настроен правильно

### После развертывания

- [ ] Все приложения запускаются без ошибок
- [ ] База данных доступна
- [ ] Redis работает
- [ ] Файлы загружаются в CDN
- [ ] Уведомления отправляются
- [ ] Логи записываются
- [ ] Мониторинг работает
- [ ] SSL сертификаты действительны
- [ ] Производительность в норме

---

_Правильная конфигурация критически важна для стабильной работы системы в продакшене._

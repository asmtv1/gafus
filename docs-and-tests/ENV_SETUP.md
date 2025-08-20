# Настройка переменных окружения

Для запуска проекта необходимо создать файл `.env` в корне проекта со следующими переменными:

## Обязательные переменные

### База данных

```bash
DATABASE_URL="postgresql://username:password@localhost:5432/gafus"
```

### Redis

```bash
REDIS_URL="redis://localhost:6379"
```

### Telegram Bot

```bash
TELEGRAM_BOT_TOKEN="your_telegram_bot_token_here"
```

Получите токен у @BotFather в Telegram

### VAPID Keys для Push-уведомлений

```bash
VAPID_PUBLIC_KEY="your_vapid_public_key_here"
VAPID_PRIVATE_KEY="your_vapid_private_key_here"
```

Сгенерируйте ключи с помощью команды:

```bash
npx web-push generate-vapid-keys
```

### NextAuth

```bash
NEXTAUTH_SECRET="your_nextauth_secret_here"
```

Сгенерируйте секрет с помощью команды:

```bash
openssl rand -base64 32
```

## Опциональные переменные

### Окружение

```bash
NODE_ENV="development"
```

### Error Dashboard

```bash
ERROR_DASHBOARD_URL="http://errors.gafus.localhost"
```

### URL сайтов

```bash
NEXT_PUBLIC_SITE_URL="https://gafus.ru"
NEXT_PUBLIC_TRAINER_PANEL_URL="https://trainer.gafus.ru"
```

### Аутентификация

```bash
AUTH_COOKIE_DOMAIN=".gafus.ru"
```

### CSRF

```bash
CSRF_STRICT="false"
```

### Тестовые URL

```bash
TEST_URL="http://localhost:3002"
```

## Пример полного файла .env

```bash
# Database
DATABASE_URL="postgresql://username:password@localhost:5432/gafus"

# Redis
REDIS_URL="redis://localhost:6379"

# Telegram Bot
TELEGRAM_BOT_TOKEN="your_telegram_bot_token_here"

# VAPID Keys for Push Notifications
VAPID_PUBLIC_KEY="your_vapid_public_key_here"
VAPID_PRIVATE_KEY="your_vapid_private_key_here"

# NextAuth
NEXTAUTH_SECRET="your_nextauth_secret_here"

# Environment
NODE_ENV="development"

# Error Dashboard
ERROR_DASHBOARD_URL="http://errors.gafus.localhost"

# Site URLs
NEXT_PUBLIC_SITE_URL="https://gafus.ru"
NEXT_PUBLIC_TRAINER_PANEL_URL="https://trainer.gafus.ru"

# Auth
AUTH_COOKIE_DOMAIN=".gafus.ru"

# CSRF
CSRF_STRICT="false"

# Test URLs
TEST_URL="http://localhost:3002"
```

## Инструкции по получению токенов

### Telegram Bot Token

1. Найдите @BotFather в Telegram
2. Отправьте команду `/newbot`
3. Следуйте инструкциям для создания бота
4. Скопируйте полученный токен

### VAPID Keys

```bash
npx web-push generate-vapid-keys
```

### NextAuth Secret

```bash
openssl rand -base64 32
```

# 🚀 Быстрое решение проблемы

## Проблема

Ошибка: `TELEGRAM_BOT_TOKEN не задан в переменных окружения`

## Решение

### 1. Создайте файл .env

```bash
node scripts/create-env.js
```

### 2. Получите Telegram Bot Token

1. Найдите @BotFather в Telegram
2. Отправьте `/newbot`
3. Следуйте инструкциям
4. Скопируйте токен

### 3. Сгенерируйте VAPID ключи

```bash
node scripts/generate-vapid-keys.js
```

### 4. Сгенерируйте NextAuth секрет

```bash
node scripts/generate-nextauth-secret.js
```

### 5. Отредактируйте .env

Замените placeholder значения на реальные:

- `your_telegram_bot_token_here` → ваш токен бота
- `your_vapid_public_key_here` → сгенерированный публичный ключ
- `your_vapid_private_key_here` → сгенерированный приватный ключ
- `your_nextauth_secret_here` → сгенерированный секрет

### 6. Настройте базу данных

```bash
./scripts/reset-db.sh
```

### 7. Запустите проект

```bash
pnpm dev
```

## Подробные инструкции

См. [ENV_SETUP.md](ENV_SETUP.md)

#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const envTemplate = `# Database
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
`;

const envPath = path.join(__dirname, "..", ".env");

if (fs.existsSync(envPath)) {
  console.warn("⚠️  Файл .env уже существует!");
  console.warn("📝 Отредактируйте существующий файл или удалите его для создания нового.");
  process.exit(1);
}

try {
  fs.writeFileSync(envPath, envTemplate);
  console.warn("✅ Файл .env создан успешно!");
  console.warn("📝 Теперь отредактируйте файл .env и заполните необходимые значения.");
  console.warn("📖 Подробные инструкции: ENV_SETUP.md");
} catch (error) {
  console.error("❌ Ошибка при создании файла .env:", error.message);
  process.exit(1);
}

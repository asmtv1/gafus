# Руководство по настройке окружения

## 📋 Требования

### Системные требования
- **Node.js** 18.0.0 или выше
- **pnpm** 8.0.0 или выше
- **PostgreSQL** 14.0 или выше
- **Redis** 6.0 или выше
- **Docker** (опционально, для контейнеризации)

### Рекомендуемые инструменты
- **VS Code** с расширениями:
  - TypeScript
  - ESLint
  - Prettier
  - Tailwind CSS IntelliSense
  - Prisma

## 🚀 Быстрая установка

### 1. Клонирование репозитория
```bash
git clone <repository-url>
cd gafus
```

### 2. Установка зависимостей
```bash
# Установка pnpm (если не установлен)
npm install -g pnpm

# Установка всех зависимостей
pnpm install
```

### 3. Настройка окружения
```bash
# Автоматическая настройка переменных окружения
pnpm setup:env
```

### 4. Запуск базы данных
```bash
# Запуск PostgreSQL и Redis через Docker
docker-compose up -d postgres redis
```

### 5. Инициализация базы данных
```bash
# Генерация Prisma клиента
pnpm db:generate

# Применение миграций
pnpm db:migrate

# Заполнение тестовыми данными
pnpm db:seed
```

### 6. Запуск в режиме разработки
```bash
# Запуск всех сервисов
pnpm dev

# Или запуск конкретного приложения
pnpm --filter @gafus/web dev
pnpm --filter @gafus/trainer-panel dev
pnpm --filter @gafus/error-dashboard dev
```

## 🔧 Детальная настройка

### Переменные окружения

#### Основные переменные
```env
# .env.local
# Приложение
NODE_ENV=development
NEXT_PUBLIC_APP_URL=http://localhost:3000

# База данных
DATABASE_URL=postgresql://postgres:password@localhost:5432/gafus

# Redis
REDIS_URL=redis://localhost:6379

# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-key-here

# Telegram Bot
TELEGRAM_BOT_TOKEN=your-telegram-bot-token

# AWS S3 (для загрузки файлов)
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=us-east-1
AWS_S3_BUCKET=your-bucket-name
```

#### Переменные для каждого приложения

**Web App (.env.local)**
```env
# Web App
PORT=3002
NEXT_PUBLIC_API_URL=http://localhost:3002/api
```

**Trainer Panel (.env.local)**
```env
# Trainer Panel
PORT=3001
NEXT_PUBLIC_API_URL=http://localhost:3001/api
```

**Error Dashboard (.env.local)**
```env
# Error Dashboard
PORT=3000
NEXT_PUBLIC_API_URL=http://localhost:3000/api
```

**Telegram Bot (.env.local)**
```env
# Telegram Bot
TELEGRAM_BOT_TOKEN=your-bot-token
TELEGRAM_WEBHOOK_URL=https://your-domain.com/api/telegram-webhook
```

**Bull Board (.env.local)**
```env
# Bull Board
BULL_BOARD_PORT=3003
BULL_BOARD_USERNAME=admin
BULL_BOARD_PASSWORD=secure-password
```

### Настройка базы данных

#### PostgreSQL
```bash
# Создание базы данных
createdb gafus

# Подключение к базе данных
psql gafus

# Создание пользователя (опционально)
CREATE USER gafus_user WITH PASSWORD 'secure_password';
GRANT ALL PRIVILEGES ON DATABASE gafus TO gafus_user;
```

#### Prisma миграции
```bash
# Создание новой миграции
npx prisma migrate dev --name migration_name

# Применение миграций в продакшене
npx prisma migrate deploy

# Сброс базы данных (только для разработки)
npx prisma migrate reset

# Просмотр базы данных
npx prisma studio
```

### Настройка Redis
```bash
# Запуск Redis локально
redis-server

# Проверка подключения
redis-cli ping
```

## 🐳 Docker настройка

### Docker Compose для разработки
```yaml
# docker-compose.dev.yml
version: '3.8'

services:
  postgres:
    image: postgres:14
    environment:
      POSTGRES_DB: gafus
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:6-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

### Запуск через Docker
```bash
# Запуск инфраструктуры
docker-compose -f docker-compose.dev.yml up -d

# Остановка
docker-compose -f docker-compose.dev.yml down
```

## 🛠️ Настройка IDE

### VS Code настройки
```json
// .vscode/settings.json
{
  "typescript.preferences.importModuleSpecifier": "relative",
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "eslint.validate": ["javascript", "typescript", "typescriptreact"],
  "tailwindCSS.includeLanguages": {
    "typescript": "javascript",
    "typescriptreact": "javascript"
  },
  "files.associations": {
    "*.css": "tailwindcss"
  }
}
```

### VS Code расширения
```json
// .vscode/extensions.json
{
  "recommendations": [
    "bradlc.vscode-tailwindcss",
    "esbenp.prettier-vscode",
    "dbaeumer.vscode-eslint",
    "ms-vscode.vscode-typescript-next",
    "Prisma.prisma",
    "ms-vscode.vscode-json"
  ]
}
```

## 🔍 Проверка установки

### Проверка зависимостей
```bash
# Проверка версий
node --version
pnpm --version
docker --version

# Проверка подключения к базе данных
npx prisma db push

# Проверка подключения к Redis
redis-cli ping
```

### Проверка приложений
```bash
# Проверка сборки всех пакетов
pnpm build:packages

# Проверка типов
pnpm typecheck:all

# Проверка линтера
pnpm lint:all

# Запуск тестов
pnpm test:all
```

## 🚨 Решение проблем

### Частые проблемы

#### Ошибка подключения к базе данных
```bash
# Проверка статуса PostgreSQL
sudo systemctl status postgresql

# Перезапуск PostgreSQL
sudo systemctl restart postgresql

# Проверка подключения
psql -h localhost -U postgres -d gafus
```

#### Ошибки с портами
```bash
# Проверка занятых портов
lsof -i :3000
lsof -i :3001
lsof -i :3002

# Остановка процессов на портах
kill -9 <PID>
```

#### Проблемы с зависимостями
```bash
# Очистка кэша
pnpm store prune

# Переустановка зависимостей
rm -rf node_modules
rm pnpm-lock.yaml
pnpm install
```

#### Проблемы с Prisma
```bash
# Перегенерация клиента
npx prisma generate

# Сброс и повторное применение миграций
npx prisma migrate reset
```

### Логи и отладка

#### Включение подробных логов
```env
# .env.local
DEBUG=*
LOG_LEVEL=debug
```

#### Просмотр логов приложений
```bash
# Логи веб-приложения
pnpm --filter @gafus/web dev 2>&1 | tee web.log

# Логи панели тренера
pnpm --filter @gafus/trainer-panel dev 2>&1 | tee trainer.log
```

## 📚 Дополнительные ресурсы

### Полезные команды
```bash
# Анализ размера bundle
pnpm analyze:web
pnpm analyze:trainer

# Поиск неиспользуемых функций
pnpm find:unused

# Генерация документации API
pnpm generate:openapi

# Генерация документации Server Actions
pnpm generate:server-actions-docs
```

### Скрипты разработки
```bash
# Полная очистка проекта
pnpm clean:all

# Проверка портов
pnpm check:ports

# Проверка сборок
pnpm check:builds
```

---

*Это руководство поможет вам быстро настроить окружение разработки для проекта GAFUS.*

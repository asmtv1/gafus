# 🚀 Гафус - Платформа для тренировок собак

Монорепозиторий с множественными приложениями для управления тренировками собак.

## 📦 Структура проекта

### Приложения (apps/)

- **web** - Основное веб-приложение (порт 3002)
- **trainer-panel** - Панель тренера (порт 3001)
- **error-dashboard** - Дашборд ошибок (порт 3005)
- **telegram-bot** - Telegram бот (порт 3003)
- **bull-board** - Мониторинг очередей (порт 3004)

### Пакеты (packages/)

- **worker** - Фоновый воркер (порт 3006)
- **webpush** - Push уведомления (порт 3007)
- **queues** - Очереди Redis
- **auth** - Аутентификация
- **prisma** - База данных
- **types** - TypeScript типы
- **csrf** - CSRF защита
- **error-handling** - Обработка ошибок
- **swr** - Кэширование данных
- **ui-components** - UI компоненты

## 🛠️ Установка и настройка

### 1. Установка зависимостей

```bash
pnpm install
```

### 2. Настройка переменных окружения

```bash
# Скопируйте пример файла
cp .env.example .env

# Или создайте новый
node scripts/create-env.js
```

### 3. Настройка базы данных

```bash
# Сброс и инициализация БД
./scripts/reset-db.sh
```

## 🚀 Запуск приложений

### Проверка конфигурации

```bash
# Проверка портов и конфигурации
pnpm check:ports
```

### Разработка

```bash
# Запуск основных приложений для разработки
pnpm dev

# Запуск всех приложений
pnpm start:all
```

### Продакшн

```bash
# Сборка всех приложений
pnpm build:all

# Запуск всех приложений
pnpm start:all
```

## 🌐 Доступные приложения

После запуска `pnpm start:all` будут доступны:

| Приложение      | URL                   | Описание                |
| --------------- | --------------------- | ----------------------- |
| Web App         | http://localhost:3002 | Основное веб-приложение |
| Trainer Panel   | http://localhost:3001 | Панель тренера          |
| Error Dashboard | http://localhost:3005 | Мониторинг ошибок       |
| Bull Board      | http://localhost:3004 | Мониторинг очередей     |
| Telegram Bot    | Порт 3003             | Telegram бот            |
| Worker          | Порт 3006             | Фоновый воркер          |
| WebPush         | Порт 3007             | Push уведомления        |

## 📋 Команды

### Основные команды

```bash
# Установка зависимостей
pnpm install

# Разработка
pnpm dev

# Сборка
pnpm build:all

# Запуск всех приложений
pnpm start:all

# Проверка портов
pnpm check:ports

# Линтинг
pnpm lint
pnpm lint:fix

# Проверка типов
pnpm typecheck
```

### Оптимизация производительности

```bash
# Анализ бандла
pnpm analyze:web
pnpm analyze:trainer

# Оптимизация импортов
pnpm optimize:imports
pnpm optimize:deps

# Полная оптимизация
pnpm optimize:all
```

### База данных

```bash
# Сброс БД
./scripts/reset-db.sh

# Генерация Prisma клиента
pnpm --filter @gafus/prisma prisma:generate

# Миграции
pnpm --filter @gafus/prisma prisma:migrate:dev
```

## 🔧 Конфигурация

### Переменные окружения

Создайте файл `.env` в корне проекта:

```bash
# База данных
DATABASE_URL="postgresql://username:password@localhost:5432/gafus"

# Redis
REDIS_URL="redis://localhost:6379"

# Telegram Bot
TELEGRAM_BOT_TOKEN="your_telegram_bot_token"

# VAPID Keys для Push-уведомлений
VAPID_PUBLIC_KEY="your_vapid_public_key"
VAPID_PRIVATE_KEY="your_vapid_private_key"

# NextAuth
NEXTAUTH_SECRET="your_nextauth_secret"

# Окружение
NODE_ENV="development"
```

### Порты приложений

- Web App: 3002
- Trainer Panel: 3001
- Error Dashboard: 3005
- Telegram Bot: 3003
- Bull Board: 3004
- Worker: 3006
- WebPush: 3007

## 🐛 Устранение неполадок

### Проблемы с портами

```bash
# Проверка занятых портов
lsof -i :3001
lsof -i :3002
lsof -i :3005

# Остановка процессов
kill -9 <PID>
```

### Проблемы с базой данных

```bash
# Пересоздание БД
./scripts/reset-db.sh

# Проверка подключения
pnpm --filter @gafus/prisma prisma studio
```

### Проблемы с зависимостями

```bash
# Очистка кэша
pnpm store prune

# Переустановка зависимостей
rm -rf node_modules
pnpm install
```

## 📚 Документация

- [Оптимизация производительности](./docs-and-tests/PERFORMANCE_OPTIMIZATION_COMPLETE.md)
- [Настройка переменных окружения](./docs-and-tests/ENV_SETUP.md)
- [CSRF защита](./docs-and-tests/CSRF_IMPROVEMENTS_REPORT.md)
- [Мониторинг ошибок](./docs-and-tests/ERROR_MONITORING.md)

## 🤝 Разработка

### Структура коммитов

```
feat: добавлена новая функция
fix: исправлена ошибка
docs: обновлена документация
style: форматирование кода
refactor: рефакторинг
test: добавлены тесты
chore: обновление зависимостей
```

### Линтинг и форматирование

```bash
# Проверка линтера
pnpm lint

# Автоисправление
pnpm lint:fix

# Форматирование
pnpm format
```

## 📄 Лицензия

MIT License

# 🚀 Руководство по запуску всех приложений

## 📋 Быстрый старт

### 1. Проверка готовности

```bash
# Проверка портов
pnpm check:ports

# Проверка сборки
pnpm check:builds
```

### 2. Запуск всех приложений

```bash
# Автоматический запуск всех приложений
pnpm start:all
```

## 🔧 Подробные инструкции

### Подготовка к запуску

#### 1. Установка зависимостей

```bash
pnpm install
```

#### 2. Настройка переменных окружения

```bash
# Создание .env файла
cp .env.example .env

# Или автоматическое создание
node scripts/create-env.js
```

#### 3. Настройка базы данных

```bash
# Сброс и инициализация БД
./scripts/reset-db.sh

# Или вручную
pnpm --filter @gafus/prisma prisma:generate
pnpm --filter @gafus/prisma prisma:migrate:dev
```

### Сборка приложений

#### Автоматическая сборка

```bash
# Сборка всех приложений
pnpm build:all
```

#### Ручная сборка отдельных приложений

```bash
# Web приложение
pnpm --filter @gafus/web build

# Trainer Panel
pnpm --filter @gafus/trainer-panel build

# Error Dashboard
pnpm --filter @gafus/error-dashboard build

# Telegram Bot
pnpm --filter @gafus/telegram-bot build

# Bull Board
pnpm --filter @gafus/bull-board build

# Worker
pnpm --filter @gafus/worker build

# WebPush
pnpm --filter @gafus/webpush build
```

### Запуск приложений

#### Запуск всех приложений

```bash
# Автоматический запуск с проверками
pnpm start:all
```

#### Запуск отдельных приложений

```bash
# Web приложение (порт 3002)
pnpm --filter @gafus/web start

# Trainer Panel (порт 3001)
pnpm --filter @gafus/trainer-panel start

# Error Dashboard (порт 3005)
pnpm --filter @gafus/error-dashboard start

# Telegram Bot (порт 3003)
pnpm --filter @gafus/telegram-bot start

# Bull Board (порт 3004)
pnpm --filter @gafus/bull-board start

# Worker (порт 3006)
pnpm --filter @gafus/worker start

# WebPush (порт 3007)
pnpm --filter @gafus/webpush start
```

#### Запуск для разработки

```bash
# Основные приложения для разработки
pnpm dev

# Все приложения для разработки
pnpm dev:all
```

## 🌐 Доступные приложения

После успешного запуска `pnpm start:all` будут доступны:

| Приложение          | URL                   | Порт | Описание                |
| ------------------- | --------------------- | ---- | ----------------------- |
| **Web App**         | http://localhost:3002 | 3002 | Основное веб-приложение |
| **Trainer Panel**   | http://localhost:3001 | 3001 | Панель тренера          |
| **Error Dashboard** | http://localhost:3005 | 3005 | Мониторинг ошибок       |
| **Bull Board**      | http://localhost:3004 | 3004 | Мониторинг очередей     |
| **Telegram Bot**    | -                     | 3003 | Telegram бот            |
| **Worker**          | -                     | 3006 | Фоновый воркер          |
| **WebPush**         | -                     | 3007 | Push уведомления        |

## 🔍 Диагностика

### Проверка статуса приложений

#### Проверка портов

```bash
# Проверка занятости портов
lsof -i :3001
lsof -i :3002
lsof -i :3005
lsof -i :3004
```

#### Проверка процессов

```bash
# Поиск процессов Node.js
ps aux | grep node

# Поиск процессов по портам
netstat -an | grep LISTEN
```

### Логи приложений

#### Просмотр логов в реальном времени

```bash
# Логи всех приложений
pnpm start:all 2>&1 | tee logs/all-apps.log

# Логи отдельного приложения
pnpm --filter @gafus/web start 2>&1 | tee logs/web.log
```

## 🐛 Устранение неполадок

### Проблемы с портами

#### Ошибка: "Port already in use"

```bash
# Найти процесс, использующий порт
lsof -i :3002

# Остановить процесс
kill -9 <PID>

# Или остановить все процессы Node.js
pkill -f node
```

#### Ошибка: "EADDRINUSE"

```bash
# Проверка всех занятых портов
netstat -tulpn | grep LISTEN

# Очистка портов
sudo fuser -k 3001/tcp
sudo fuser -k 3002/tcp
sudo fuser -k 3005/tcp
```

### Проблемы с зависимостями

#### Ошибка: "Module not found"

```bash
# Очистка кэша
pnpm store prune

# Переустановка зависимостей
rm -rf node_modules
pnpm install

# Пересборка
pnpm build:all
```

#### Ошибка: "TypeScript compilation failed"

```bash
# Проверка типов
pnpm typecheck

# Исправление ошибок линтера
pnpm lint:fix
```

### Проблемы с базой данных

#### Ошибка: "Database connection failed"

```bash
# Проверка подключения к БД
pnpm --filter @gafus/prisma prisma studio

# Пересоздание БД
./scripts/reset-db.sh

# Проверка миграций
pnpm --filter @gafus/prisma prisma:migrate:status
```

#### Ошибка: "Prisma client not generated"

```bash
# Генерация Prisma клиента
pnpm --filter @gafus/prisma prisma:generate

# Проверка схемы
pnpm --filter @gafus/prisma prisma:validate
```

### Проблемы с Redis

#### Ошибка: "Redis connection failed"

```bash
# Проверка Redis
redis-cli ping

# Запуск Redis (если не запущен)
brew services start redis
# или
sudo systemctl start redis
```

## 📊 Мониторинг

### Проверка здоровья приложений

#### Автоматическая проверка

```bash
# Проверка всех приложений
curl -f http://localhost:3002/api/health || echo "Web App недоступен"
curl -f http://localhost:3001/api/health || echo "Trainer Panel недоступен"
curl -f http://localhost:3005/api/health || echo "Error Dashboard недоступен"
curl -f http://localhost:3004/api/health || echo "Bull Board недоступен"
```

#### Мониторинг ресурсов

```bash
# Использование памяти
ps aux | grep node | awk '{print $2, $3, $4, $11}'

# Использование CPU
top -p $(pgrep -d',' node)

# Использование диска
df -h
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
NEXTAUTH_URL="http://localhost:3002"

# Окружение
NODE_ENV="development"
```

### Порты приложений

| Приложение      | Порт | Переменная окружения |
| --------------- | ---- | -------------------- |
| Web App         | 3002 | PORT=3002            |
| Trainer Panel   | 3001 | PORT=3001            |
| Error Dashboard | 3005 | PORT=3005            |
| Telegram Bot    | 3003 | PORT=3003            |
| Bull Board      | 3004 | PORT=3004            |
| Worker          | 3006 | PORT=3006            |
| WebPush         | 3007 | PORT=3007            |

## 📝 Логи и отладка

### Включение отладочных логов

```bash
# Отладка для всех приложений
DEBUG=* pnpm start:all

# Отладка для конкретного приложения
DEBUG=* pnpm --filter @gafus/web start

# Отладка Prisma
DEBUG=prisma:* pnpm start:all
```

### Просмотр логов

```bash
# Логи в реальном времени
tail -f logs/all-apps.log

# Логи с фильтрацией
grep "ERROR" logs/all-apps.log

# Логи по времени
grep "$(date +%Y-%m-%d)" logs/all-apps.log
```

## 🎯 Оптимизация производительности

### Команды оптимизации

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

### Мониторинг производительности

```bash
# Проверка размера бандла
pnpm --filter @gafus/web analyze

# Проверка Core Web Vitals
# (требует настройки мониторинга)
```

## ✅ Чек-лист запуска

- [ ] Установлены все зависимости (`pnpm install`)
- [ ] Настроены переменные окружения (`.env`)
- [ ] Запущена база данных PostgreSQL
- [ ] Запущен Redis
- [ ] Собраны все приложения (`pnpm build:all`)
- [ ] Проверены порты (`pnpm check:ports`)
- [ ] Запущены все приложения (`pnpm start:all`)
- [ ] Проверена доступность всех сервисов

## 🆘 Получение помощи

### Полезные команды

```bash
# Справка по командам
pnpm --help

# Справка по turbo
npx turbo --help

# Проверка версий
node --version
pnpm --version
```

### Логи и отладка

```bash
# Подробные логи
pnpm start:all --verbose

# Отладка turbo
npx turbo start:all --debug

# Проверка конфигурации
pnpm check:ports
pnpm check:builds
```

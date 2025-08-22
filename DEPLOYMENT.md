# Gafus Production Deployment

## Обзор сервисов

Проект состоит из следующих сервисов:

- **Web** - основное веб-приложение (порт 3000)
- **Trainer Panel** - панель тренера (порт 3001)
- **Error Dashboard** - дашборд ошибок (порт 3005)
- **Bull Board** - мониторинг очередей (порт 3002)
- **Telegram Bot** - телеграм бот
- **Worker** - обработчик фоновых задач
- **Prisma** - управление базой данных
- **PostgreSQL** - база данных (порт 5432)
- **Redis** - кеш и очереди (порт 6379)
- **Nginx** - обратный прокси (порт 80/443)

## CI/CD Pipeline

Проект использует GitHub Actions для автоматической сборки и деплоя.

### Автоматический деплой

При пуше в `main` ветку автоматически:

1. Запускаются тесты и проверки безопасности
2. Собираются все Docker образы
3. Образы пушатся в GitHub Container Registry
4. Происходит автоматический деплой на production сервер

### Ручной деплой

Можно запустить деплой вручную через GitHub Actions:

1. Перейти в Actions → Manual Deploy
2. Выбрать окружение (production/staging)
3. Выбрать приложение для деплоя или "all"
4. Запустить workflow

## Настройка сервера

### 1. Подготовка сервера

Запустите скрипт настройки на вашем сервере:

```bash
# Скачать и запустить скрипт настройки
curl -fsSL https://raw.githubusercontent.com/asmtv1/gafus/main/scripts/setup-server.sh | bash

# Или клонировать репозиторий и запустить локально
git clone https://github.com/asmtv1/gafus.git
cd gafus
chmod +x scripts/setup-server.sh
./scripts/setup-server.sh
```

### 2. Переменные окружения настроены автоматически

BOT_TOKEN уже настроен в конфигурации. При необходимости изменить его, отредактируйте:

- `docker-compose.prod.yml`
- `scripts/setup-server.sh`

### 3. Настройка GitHub Secrets

В настройках репозитория GitHub добавьте следующие secrets:

- `SERVER_HOST` - IP адрес вашего сервера
- `SERVER_USERNAME` - имя пользователя (обычно `root`)
- `SERVER_PASSWORD` - пароль от сервера
- `SERVER_PORT` - SSH порт (обычно `22`)

## Быстрый старт

1. **Собрать все образы:**

```bash
# Web (уже собран)
docker build -f Dockerfile-web -t ghcr.io/asmtv1/gafus-web .

# Trainer Panel
docker build -f Dockerfile-trainer-panel -t trainer-panel .

# Error Dashboard
docker build -f Dockerfile-error-dashboard -t error-dashboard .

# Worker
docker build -f Dockerfile-worker -t gafus-worker .

# Bull Board
docker build -f Dockerfile-bull-board -t gafus-bull-board .

# Telegram Bot
docker build -f Dockerfile-telegram-bot -t gafus-telegram-bot .

# Prisma
docker build -f Dockerfile-prisma -t gafus-prisma .
```

2. **Запустить все сервисы:**

```bash
./start-production.sh
```

3. **Проверить статус:**

```bash
docker-compose -f docker-compose.prod.yml ps
```

## Доступ к сервисам

- **Основное приложение:** http://localhost:3000
- **Trainer Panel:** http://localhost:3001
- **Error Dashboard:** http://localhost:3005
- **Bull Board:** http://localhost:3002
- **Через Nginx:** http://localhost (основное приложение)
  - http://localhost/trainer/ (trainer panel)
  - http://localhost/errors/ (error dashboard)
  - http://localhost/queues/ (bull board)

## Управление

**Запуск:**

```bash
docker-compose -f docker-compose.prod.yml up -d
```

**Остановка:**

```bash
docker-compose -f docker-compose.prod.yml down
```

**Просмотр логов:**

```bash
# Все сервисы
docker-compose -f docker-compose.prod.yml logs -f

# Конкретный сервис
docker-compose -f docker-compose.prod.yml logs -f web
```

**Перезапуск:**

```bash
docker-compose -f docker-compose.prod.yml restart
```

## Переменные окружения

Основные переменные:

- `POSTGRES_DB=gafus`
- `POSTGRES_USER=gafus`
- `POSTGRES_PASSWORD=gafus_password`
- `REDIS_URL=redis://redis:6379`
- `DATABASE_URL=postgresql://gafus:gafus_password@postgres:5432/gafus`
- `NODE_ENV=production`
- `BOT_TOKEN=your_telegram_bot_token` (требуется для Telegram Bot)

## Мониторинг

- **Health Check:** http://localhost/health
- **Detailed Health Check:** http://localhost/health/detailed
- **Bull Board:** http://localhost/queues/ (мониторинг очередей)
- **Error Dashboard:** http://localhost/errors/ (мониторинг ошибок)

### Health Check Endpoints

- **Basic Health:** `GET /health` - проверка общего состояния
- **Detailed Health:** `GET /health/detailed` - детальная информация о сервисах
- **Docker Health:** `docker-compose ps` - статус всех контейнеров
- **Service Logs:** `docker-compose logs [service-name]` - логи конкретного сервиса

## Безопасность

- Все сервисы работают в изолированных контейнерах
- База данных доступна только внутри Docker network
- Redis доступен только внутри Docker network
- Nginx проксирует запросы к внутренним сервисам

## Масштабирование

Для масштабирования конкретного сервиса:

```bash
docker-compose -f docker-compose.prod.yml up -d --scale web=3
```

## Troubleshooting

### Проблемы с деплоем

1. **Проверить логи GitHub Actions:**
   - Перейти в Actions → CI/CD Pipeline
   - Посмотреть на ошибки в конкретном job

2. **Проверить статус сервисов на сервере:**

```bash
docker-compose -f docker-compose.prod.yml ps
docker-compose -f docker-compose.prod.yml logs
```

3. **Проверить доступность портов:**

```bash
netstat -tlnp | grep :3000
netstat -tlnp | grep :3001
netstat -tlnp | grep :3005
```

### Проблемы с базой данных

1. **Проверить подключение:**

```bash
docker exec -it gafus-postgres psql -U gafus -d gafus
```

2. **Пересоздать базу:**

```bash
docker-compose -f docker-compose.prod.yml down
docker volume rm gafus_postgres_data
docker-compose -f docker-compose.prod.yml up -d
```

### Проблемы с Redis

1. **Проверить статус:**

```bash
docker exec -it gafus-redis redis-cli ping
```

2. **Очистить кеш:**

```bash
docker exec -it gafus-redis redis-cli FLUSHALL
```

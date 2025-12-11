# Docker развертывание

## 📋 Обзор

Этот документ описывает контейнеризацию и развертывание системы GAFUS с использованием Docker и Docker Compose.

## 🐳 Структура Docker

### Основные контейнеры
```
gafus/
├── ci-cd/docker/           # Docker файлы
│   ├── Dockerfile-web-optimized
│   ├── Dockerfile-trainer-panel-optimized
│   ├── Dockerfile-error-dashboard-optimized
│   ├── Dockerfile-telegram-bot-optimized
│   ├── Dockerfile-bull-board-optimized
│   ├── Dockerfile-worker-optimized
│   └── Dockerfile-prisma-optimized
├── ci-cd/docker/
│   └── docker-compose.prod.yml
└── .dockerignore
```

## 🔧 Dockerfile для приложений

### Web App Dockerfile
```dockerfile
# ci-cd/docker/Dockerfile-web-optimized
FROM node:18-alpine AS base

# Установка зависимостей только для production
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Копирование package files
COPY package.json pnpm-lock.yaml* ./
COPY apps/web/package.json ./apps/web/
COPY packages/*/package.json ./packages/*/

# Установка pnpm и зависимостей
RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile --prod

# Сборка приложения
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Генерация Prisma клиента
RUN pnpm db:generate

# Сборка web приложения
RUN pnpm --filter @gafus/web build

# Production образ
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Копирование собранного приложения
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "apps/web/server.js"]
```

### Trainer Panel Dockerfile
```dockerfile
# ci-cd/docker/Dockerfile-trainer-panel-optimized
FROM node:18-alpine AS base

FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json pnpm-lock.yaml* ./
COPY apps/trainer-panel/package.json ./apps/trainer-panel/
COPY packages/*/package.json ./packages/*/

RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile --prod

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN pnpm db:generate
RUN pnpm --filter @gafus/trainer-panel build

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/apps/trainer-panel/public ./apps/trainer-panel/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/trainer-panel/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/trainer-panel/.next/static ./apps/trainer-panel/.next/static

USER nextjs

EXPOSE 3001

ENV PORT=3001
ENV HOSTNAME="0.0.0.0"

CMD ["node", "apps/trainer-panel/server.js"]
```

### Error Dashboard Dockerfile
```dockerfile
# ci-cd/docker/Dockerfile-error-dashboard-optimized
FROM node:18-alpine AS base

FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json pnpm-lock.yaml* ./
COPY apps/error-dashboard/package.json ./apps/error-dashboard/
COPY packages/*/package.json ./packages/*/

RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile --prod

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN pnpm db:generate
RUN pnpm --filter @gafus/error-dashboard build

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/apps/error-dashboard/public ./apps/error-dashboard/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/error-dashboard/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/error-dashboard/.next/static ./apps/error-dashboard/.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "apps/error-dashboard/server.js"]
```

### Telegram Bot Dockerfile
```dockerfile
# ci-cd/docker/Dockerfile-telegram-bot-optimized
FROM node:18-alpine AS base

FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json pnpm-lock.yaml* ./
COPY apps/telegram-bot/package.json ./apps/telegram-bot/
COPY packages/*/package.json ./packages/*/

RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile --prod

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN pnpm db:generate
RUN pnpm --filter @gafus/telegram-bot build

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/apps/telegram-bot/dist ./apps/telegram-bot/dist
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules

USER nextjs

EXPOSE 3004

CMD ["node", "apps/telegram-bot/dist/bot.js"]
```

### Worker Dockerfile
```dockerfile
# ci-cd/docker/Dockerfile-worker-optimized
FROM node:18-alpine AS base

FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json pnpm-lock.yaml* ./
COPY packages/worker/package.json ./packages/worker/
COPY packages/*/package.json ./packages/*/

RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile --prod

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN pnpm db:generate
RUN pnpm --filter @gafus/worker build

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/packages/worker/dist ./packages/worker/dist
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules

USER nextjs

CMD ["node", "packages/worker/dist/index.js"]
```

### Bull Board Dockerfile
```dockerfile
# ci-cd/docker/Dockerfile-bull-board-optimized
FROM node:18-alpine AS base

FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json pnpm-lock.yaml* ./
COPY apps/bull-board/package.json ./apps/bull-board/
COPY packages/*/package.json ./packages/*/

RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile --prod

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN pnpm db:generate
RUN pnpm --filter @gafus/bull-board build

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/apps/bull-board/dist ./apps/bull-board/dist
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules

USER nextjs

EXPOSE 3003

CMD ["node", "apps/bull-board/dist/bull-board.js"]
```

## 🚀 Docker Compose

### Production Compose
```yaml
# ci-cd/docker/docker-compose.prod.yml
version: '3.8'

services:
  # База данных
  postgres:
    image: postgres:14-alpine
    environment:
      POSTGRES_DB: gafus_production
      POSTGRES_USER: gafus_user
      POSTGRES_PASSWORD: ${DATABASE_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql
    ports:
      - "5432:5432"
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U gafus_user -d gafus_production"]
      interval: 30s
      timeout: 10s
      retries: 3

  # Redis
  redis:
    image: redis:6-alpine
    command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis_data:/data
    ports:
      - "6379:6379"
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "--raw", "incr", "ping"]
      interval: 30s
      timeout: 10s
      retries: 3

  # Web приложение
  web:
    build:
      context: ../..
      dockerfile: ci-cd/docker/Dockerfile-web-optimized
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://gafus_user:${DATABASE_PASSWORD}@postgres:5432/gafus_production
      - REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379
      - NEXTAUTH_URL=https://gafus.ru
      - NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
    ports:
      - "3002:3000"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # Trainer Panel
  trainer-panel:
    build:
      context: ../..
      dockerfile: ci-cd/docker/Dockerfile-trainer-panel-optimized
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://gafus_user:${DATABASE_PASSWORD}@postgres:5432/gafus_production
      - REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379
      - NEXTAUTH_URL=https://trainer.gafus.ru
      - NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
    ports:
      - "3001:3000"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # Error Dashboard
  error-dashboard:
    build:
      context: ../..
      dockerfile: ci-cd/docker/Dockerfile-error-dashboard-optimized
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://gafus_user:${DATABASE_PASSWORD}@postgres:5432/gafus_production
      - REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379
      - NEXTAUTH_URL=https://errors.gafus.ru
      - NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
    ports:
      - "3000:3000"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # Telegram Bot
  telegram-bot:
    build:
      context: ../..
      dockerfile: ci-cd/docker/Dockerfile-telegram-bot-optimized
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://gafus_user:${DATABASE_PASSWORD}@postgres:5432/gafus_production
      - REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379
      - TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "node", "-e", "process.exit(0)"]
      interval: 30s
      timeout: 10s
      retries: 3

  # Worker
  worker:
    build:
      context: ../..
      dockerfile: ci-cd/docker/Dockerfile-worker-optimized
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://gafus_user:${DATABASE_PASSWORD}@postgres:5432/gafus_production
      - REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped
    deploy:
      replicas: 2

  # Bull Board
  bull-board:
    build:
      context: ../..
      dockerfile: ci-cd/docker/Dockerfile-bull-board-optimized
    environment:
      - NODE_ENV=production
      - REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379
      - BULL_BOARD_USERNAME=${BULL_BOARD_USERNAME}
      - BULL_BOARD_PASSWORD=${BULL_BOARD_PASSWORD}
    ports:
      - "3003:3000"
    depends_on:
      redis:
        condition: service_healthy
    restart: unless-stopped

  # Nginx (Reverse Proxy)
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./conf.d:/etc/nginx/conf.d:ro
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - web
      - trainer-panel
      - error-dashboard
      - bull-board
    restart: unless-stopped

volumes:
  postgres_data:
    driver: local
  redis_data:
    driver: local

networks:
  default:
    driver: bridge
```

### Development Compose
```yaml
# docker-compose.dev.yml
version: '3.8'

services:
  postgres:
    image: postgres:14-alpine
    environment:
      POSTGRES_DB: gafus_dev
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
    ports:
      - "5432:5432"
    volumes:
      - postgres_dev_data:/var/lib/postgresql/data

  redis:
    image: redis:6-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_dev_data:/data

volumes:
  postgres_dev_data:
  redis_dev_data:
```

## 🔧 Nginx конфигурация

### Основной конфиг
```nginx
# ci-cd/nginx/nginx.conf
user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

events {
    worker_connections 1024;
    use epoll;
    multi_accept on;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    # Логирование
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';

    access_log /var/log/nginx/access.log main;

    # Основные настройки
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;
    client_max_body_size 10M;

    # Gzip сжатие
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types
        text/plain
        text/css
        text/xml
        text/javascript
        application/json
        application/javascript
        application/xml+rss
        application/atom+xml
        image/svg+xml;

    # Безопасность
    server_tokens off;
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=login:10m rate=5r/m;

    # Подключение конфигураций сайтов
    include /etc/nginx/conf.d/*.conf;
}
```

### Конфигурация для Web App
```nginx
# ci-cd/nginx/conf.d/web.conf
server {
    listen 80;
    server_name gafus.ru www.gafus.ru;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name gafus.ru www.gafus.ru;

    # SSL сертификаты
    ssl_certificate /etc/nginx/ssl/gafus.ru.crt;
    ssl_certificate_key /etc/nginx/ssl/gafus.ru.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512;
    ssl_prefer_server_ciphers off;

    # Проксирование к Web App
    location / {
        proxy_pass http://web:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Port $server_port;
    }

    # Статические файлы с кэшированием
    location /static/ {
        proxy_pass http://web:3000;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # API с rate limiting
    location /api/ {
        limit_req zone=api burst=20 nodelay;
        proxy_pass http://web:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Конфигурация для Trainer Panel
```nginx
# ci-cd/nginx/conf.d/trainer-panel.conf
server {
    listen 80;
    server_name trainer.gafus.ru;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name trainer.gafus.ru;

    ssl_certificate /etc/nginx/ssl/trainer.gafus.ru.crt;
    ssl_certificate_key /etc/nginx/ssl/trainer.gafus.ru.key;

    location / {
        proxy_pass http://trainer-panel:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 🚀 Развертывание

### Команды развертывания
```bash
# Сборка всех образов
docker-compose -f ci-cd/docker/docker-compose.prod.yml build

# Запуск в продакшене
docker-compose -f ci-cd/docker/docker-compose.prod.yml up -d

# Применение миграций
docker-compose -f ci-cd/docker/docker-compose.prod.yml exec postgres psql -U gafus_user -d gafus_production -f /docker-entrypoint-initdb.d/init.sql

# Просмотр логов
docker-compose -f ci-cd/docker/docker-compose.prod.yml logs -f

# Остановка сервисов
docker-compose -f ci-cd/docker/docker-compose.prod.yml down

# Обновление сервисов
docker-compose -f ci-cd/docker/docker-compose.prod.yml pull
docker-compose -f ci-cd/docker/docker-compose.prod.yml up -d
```

### Health Checks
```bash
# Проверка состояния всех сервисов
docker-compose -f ci-cd/docker/docker-compose.prod.yml ps

# Проверка здоровья базы данных
docker-compose -f ci-cd/docker/docker-compose.prod.yml exec postgres pg_isready -U gafus_user

# Проверка Redis
docker-compose -f ci-cd/docker/docker-compose.prod.yml exec redis redis-cli ping

# Проверка приложений
curl -f http://localhost:3000/api/health
curl -f http://localhost:3001/api/health
curl -f http://localhost:3002/api/health
```

## 📊 Мониторинг

### Логирование

#### Docker Compose логи
```bash
# Просмотр логов конкретного сервиса
docker-compose logs -f web
docker-compose logs -f trainer-panel
docker-compose logs -f error-dashboard

# Просмотр логов за последний час
docker-compose logs --since=1h

# Экспорт логов
docker-compose logs > logs.txt
```

#### Seq - централизованное логирование

Vector собирает логи из всех Docker контейнеров и отправляет их в Seq для централизованного хранения и анализа.

**Доступ к Seq:**
- URL: `http://localhost:5341` (или через nginx: `https://seq.gafus.ru`)
- Логи автоматически собираются и отправляются в Seq

**Настройка дашбордов в Seq:**
- См. [документацию по Seq дашбордам](./seq-dashboards.md)
- Используйте скрипт для автоматической настройки: `node scripts/setup-seq-dashboards.js`

**Проверка работы Vector:**
```bash
# Проверка статуса Vector
docker ps | grep vector

# Просмотр логов Vector
docker logs gafus-vector

# Проверка отправки логов в Seq
docker logs gafus-vector | grep -i seq
```

### Метрики
```bash
# Использование ресурсов
docker stats

# Использование дискового пространства
docker system df

# Очистка неиспользуемых ресурсов
docker system prune -a
```

---

*Docker обеспечивает надежное и масштабируемое развертывание всей экосистемы GAFUS.*

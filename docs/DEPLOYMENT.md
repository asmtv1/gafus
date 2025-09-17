# Руководство по развертыванию

## 🚀 Обзор

Данное руководство описывает процесс развертывания системы Gafus в различных окружениях: от локальной разработки до продакшн сервера. Включает в себя настройку инфраструктуры, конфигурацию сервисов и мониторинг.

## 🏗️ Архитектура развертывания

### Компоненты системы
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Load Balancer │    │   Nginx Proxy   │    │   SSL/TLS       │
│   (Optional)    │    │                 │    │   Certificates  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Web App       │    │ Trainer Panel   │    │ Error Dashboard │
│   (Port 3002)   │    │ (Port 3001)     │    │ (Port 3005)     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │   API Gateway   │
                    │   (Internal)    │
                    └─────────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   PostgreSQL    │    │     Redis       │    │  Background     │
│   Database      │    │   Cache/Queue   │    │   Workers       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 🔧 Требования к системе

### Минимальные требования
- **CPU**: 2 ядра
- **RAM**: 4 GB
- **Storage**: 20 GB SSD
- **OS**: Ubuntu 20.04+ / CentOS 8+ / Debian 11+

### Рекомендуемые требования
- **CPU**: 4+ ядра
- **RAM**: 8+ GB
- **Storage**: 50+ GB SSD
- **Network**: 100+ Mbps

### Программное обеспечение
- **Node.js**: 18.0+
- **pnpm**: 8.0+
- **Docker**: 20.0+
- **Docker Compose**: 2.0+
- **PostgreSQL**: 14.0+
- **Redis**: 6.0+
- **Nginx**: 1.18+

## 🏠 Локальное развертывание

### 1. Подготовка окружения

#### Установка Node.js и pnpm
```bash
# Установка Node.js через nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 18
nvm use 18

# Установка pnpm
npm install -g pnpm@8
```

#### Установка Docker
```bash
# Ubuntu/Debian
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Запуск Docker
sudo systemctl start docker
sudo systemctl enable docker

# Установка Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/download/v2.20.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

### 2. Клонирование и настройка

#### Клонирование репозитория
```bash
git clone <repository-url>
cd gafus
```

#### Установка зависимостей
```bash
pnpm install
```

#### Настройка переменных окружения
```bash
# Создание .env файлов
node scripts/create-env.js

# Редактирование конфигурации
cp .env.example .env
nano .env
```

#### Конфигурация .env
```env
# База данных
DATABASE_URL="postgresql://gafus:password@localhost:5432/gafus"

# Redis
REDIS_URL="redis://localhost:6379"

# NextAuth
NEXTAUTH_SECRET="your-secret-key-here"
NEXTAUTH_URL="http://localhost:3000"

# Telegram Bot
TELEGRAM_BOT_TOKEN="your-bot-token"

# Push уведомления
VAPID_PUBLIC_KEY="your-vapid-public-key"
VAPID_PRIVATE_KEY="your-vapid-private-key"

# Окружение
NODE_ENV="development"
```

### 3. Запуск сервисов

#### Запуск базы данных и Redis
```bash
# Используя Docker Compose
docker-compose up -d postgres redis

# Или локальная установка
sudo apt install postgresql redis-server
sudo systemctl start postgresql redis-server
```

#### Настройка базы данных
```bash
# Генерация Prisma клиента
pnpm db:generate

# Применение миграций
pnpm db:migrate

# Запуск seed данных
pnpm db:seed
```

#### Запуск приложений
```bash
# Запуск всех сервисов
pnpm dev:env

# Или запуск по отдельности
pnpm --filter @gafus/web dev
pnpm --filter @gafus/trainer-panel dev
pnpm --filter @gafus/telegram-bot dev
pnpm --filter @gafus/error-dashboard dev
pnpm --filter @gafus/bull-board dev
```

### 4. Проверка развертывания

#### Проверка статуса
```bash
# Проверка всех сервисов
./scripts/check-status.sh

# Проверка портов
node scripts/check-ports.js

# Тестирование запуска
node scripts/test-start.js
```

#### Доступ к приложениям
- **Web App**: http://localhost:3002
- **Trainer Panel**: http://localhost:3001
- **Error Dashboard**: http://localhost:3005
- **Bull Board**: http://localhost:3004
- **Telegram Bot**: Работает в фоне

## 🐳 Docker развертывание

### 1. Подготовка Docker образов

#### Сборка образов
```bash
# Сборка всех образов
docker-compose build

# Сборка конкретного образа
docker build -f Dockerfile-web-optimized -t gafus/web .
docker build -f Dockerfile-trainer-panel-optimized -t gafus/trainer-panel .
```

#### Оптимизация образов
```dockerfile
# Multi-stage build для оптимизации
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile

FROM node:18-alpine AS runtime
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY . .
RUN pnpm build
EXPOSE 3000
CMD ["pnpm", "start"]
```

### 2. Docker Compose конфигурация

#### docker-compose.yml
```yaml
version: '3.8'

services:
  postgres:
    image: postgres:14
    environment:
      POSTGRES_DB: gafus
      POSTGRES_USER: gafus
      POSTGRES_PASSWORD: password
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  redis:
    image: redis:6-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  web:
    build:
      context: .
      dockerfile: Dockerfile-web-optimized
    ports:
      - "3002:3002"
    environment:
      - DATABASE_URL=postgresql://gafus:password@postgres:5432/gafus
      - REDIS_URL=redis://redis:6379
    depends_on:
      - postgres
      - redis

  trainer-panel:
    build:
      context: .
      dockerfile: Dockerfile-trainer-panel-optimized
    ports:
      - "3001:3001"
    environment:
      - DATABASE_URL=postgresql://gafus:password@postgres:5432/gafus
      - REDIS_URL=redis://redis:6379
    depends_on:
      - postgres
      - redis

  error-dashboard:
    build:
      context: .
      dockerfile: Dockerfile-error-dashboard-optimized
    ports:
      - "3005:3005"
    environment:
      - DATABASE_URL=postgresql://gafus:password@postgres:5432/gafus
      - REDIS_URL=redis://redis:6379
    depends_on:
      - postgres
      - redis

  bull-board:
    build:
      context: .
      dockerfile: Dockerfile-bull-board-optimized
    ports:
      - "3004:3004"
    environment:
      - REDIS_URL=redis://redis:6379
    depends_on:
      - redis

  worker:
    build:
      context: .
      dockerfile: Dockerfile-worker-optimized
    environment:
      - DATABASE_URL=postgresql://gafus:password@postgres:5432/gafus
      - REDIS_URL=redis://redis:6379
    depends_on:
      - postgres
      - redis

volumes:
  postgres_data:
  redis_data:
```

### 3. Запуск Docker окружения

#### Запуск всех сервисов
```bash
# Запуск в фоновом режиме
docker-compose up -d

# Просмотр логов
docker-compose logs -f

# Остановка сервисов
docker-compose down
```

#### Управление сервисами
```bash
# Перезапуск конкретного сервиса
docker-compose restart web

# Масштабирование сервиса
docker-compose up -d --scale worker=3

# Обновление сервиса
docker-compose pull web
docker-compose up -d web
```

## 🌐 Продакшн развертывание

### 1. Подготовка сервера

#### Настройка сервера
```bash
# Обновление системы
sudo apt update && sudo apt upgrade -y

# Установка необходимых пакетов
sudo apt install -y curl wget git nginx certbot python3-certbot-nginx

# Создание пользователя для развертывания
sudo useradd -m -s /bin/bash gafus
sudo usermod -aG docker gafus
```

#### Установка Docker
```bash
# Установка Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Установка Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/download/v2.20.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

### 2. Настройка доменов и SSL

#### Настройка DNS
```
A    gafus.ru              -> YOUR_SERVER_IP
A    www.gafus.ru          -> YOUR_SERVER_IP
A    trainer.gafus.ru      -> YOUR_SERVER_IP
A    errors.gafus.ru       -> YOUR_SERVER_IP
A    admin.gafus.ru        -> YOUR_SERVER_IP
```

#### Получение SSL сертификатов
```bash
# Получение сертификатов Let's Encrypt
sudo certbot --nginx -d gafus.ru -d www.gafus.ru
sudo certbot --nginx -d trainer.gafus.ru
sudo certbot --nginx -d errors.gafus.ru
sudo certbot --nginx -d admin.gafus.ru

# Автоматическое обновление
sudo crontab -e
# Добавить: 0 12 * * * /usr/bin/certbot renew --quiet
```

### 3. Конфигурация Nginx

#### Основная конфигурация
```nginx
# /etc/ci-cd/nginx/sites-available/gafus.ru
server {
    listen 80;
    server_name gafus.ru www.gafus.ru;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name gafus.ru www.gafus.ru;
    
    ssl_certificate /etc/letsencrypt/live/gafus.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/gafus.ru/privkey.pem;
    
    # SSL настройки
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    
    # Основное приложение
    location / {
        proxy_pass http://localhost:3002;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # Статические файлы
    location /static/ {
        alias /var/www/gafus/web/static/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    
    # Gzip сжатие
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;
}
```

#### Конфигурация для панели тренера
```nginx
# /etc/ci-cd/nginx/sites-available/trainer.gafus.ru
server {
    listen 443 ssl http2;
    server_name trainer.gafus.ru;
    
    ssl_certificate /etc/letsencrypt/live/trainer.gafus.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/trainer.gafus.ru/privkey.pem;
    
    # Базовая аутентификация
    auth_basic "Trainer Panel";
    auth_basic_user_file /etc/ci-cd/nginx/.htpasswd;
    
    location / {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 4. Развертывание приложения

#### Клонирование и настройка
```bash
# Переключение на пользователя gafus
sudo su - gafus

# Клонирование репозитория
git clone <repository-url> /home/gafus/gafus
cd /home/gafus/gafus

# Установка зависимостей
pnpm install

# Настройка переменных окружения
cp .env.production .env
nano .env
```

#### Продакшн конфигурация
```env
# .env.production
NODE_ENV=production
DATABASE_URL="postgresql://gafus:secure_password@localhost:5432/gafus"
REDIS_URL="redis://localhost:6379"
NEXTAUTH_SECRET="your-production-secret"
NEXTAUTH_URL="https://gafus.ru"
TELEGRAM_BOT_TOKEN="your-bot-token"
VAPID_PUBLIC_KEY="your-vapid-public-key"
VAPID_PRIVATE_KEY="your-vapid-private-key"
```

#### Сборка и запуск
```bash
# Сборка приложений
pnpm build

# Генерация Prisma клиента
pnpm db:generate

# Применение миграций
pnpm db:migrate:deploy

# Запуск seed данных
pnpm db:seed

# Запуск приложений
pnpm start
```

### 5. Настройка systemd сервисов

#### Сервис для веб-приложения
```ini
# /etc/systemd/system/gafus-web.service
[Unit]
Description=Gafus Web Application
After=network.target postgresql.service redis.service

[Service]
Type=simple
User=gafus
WorkingDirectory=/home/gafus/gafus
ExecStart=/usr/bin/pnpm start --filter @gafus/web
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

#### Запуск сервисов
```bash
# Перезагрузка systemd
sudo systemctl daemon-reload

# Запуск сервисов
sudo systemctl enable gafus-web
sudo systemctl start gafus-web

# Проверка статуса
sudo systemctl status gafus-web
```

## 🔄 CI/CD развертывание

### 1. GitHub Actions

#### Конфигурация CI/CD
```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          
      - name: Install pnpm
        run: npm install -g pnpm
        
      - name: Install dependencies
        run: pnpm install
        
      - name: Build applications
        run: pnpm build
        
      - name: Run tests
        run: pnpm test
        
      - name: Deploy to server
        uses: appleboy/ssh-action@v0.1.5
        with:
          host: ${{ secrets.HOST }}
          username: ${{ secrets.USERNAME }}
          key: ${{ secrets.SSH_KEY }}
          script: |
            cd /home/gafus/gafus
            git pull origin main
            pnpm install
            pnpm build
            pnpm db:migrate:deploy
            sudo systemctl restart gafus-web
            sudo systemctl restart gafus-trainer-panel
            sudo systemctl restart gafus-error-dashboard
```

### 2. Автоматическое развертывание

#### Скрипт развертывания
```bash
#!/bin/bash
# scripts/deploy.sh

set -e

echo "🚀 Starting deployment..."

# Обновление кода
git pull origin main

# Установка зависимостей
pnpm install

# Сборка приложений
pnpm build

# Применение миграций
pnpm db:migrate:deploy

# Перезапуск сервисов
sudo systemctl restart gafus-web
sudo systemctl restart gafus-trainer-panel
sudo systemctl restart gafus-error-dashboard
sudo systemctl restart gafus-worker

# Проверка статуса
./scripts/check-status.sh

echo "✅ Deployment completed successfully!"
```

## 📊 Мониторинг и логирование

### 1. Настройка логирования

#### Конфигурация Winston
```typescript
// config/logger.ts
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

export default logger;
```

### 2. Мониторинг системы

#### Health checks
```typescript
// health-check.ts
import { prisma } from '@gafus/prisma';
import { createClient } from 'redis';

export async function healthCheck() {
  const checks = {
    database: await checkDatabase(),
    redis: await checkRedis(),
    memory: await checkMemory(),
    disk: await checkDisk()
  };
  
  const isHealthy = Object.values(checks).every(check => check.status === 'ok');
  
  return {
    status: isHealthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    checks
  };
}

async function checkDatabase() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', responseTime: Date.now() };
  } catch (error) {
    return { status: 'error', error: error.message };
  }
}
```

### 3. Алерты и уведомления

#### Настройка алертов
```bash
# Скрипт проверки здоровья
#!/bin/bash
# scripts/health-monitor.sh

HEALTH_URL="https://gafus.ru/api/health"
WEBHOOK_URL="https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK"

response=$(curl -s -o /dev/null -w "%{http_code}" $HEALTH_URL)

if [ $response -ne 200 ]; then
  curl -X POST -H 'Content-type: application/json' \
    --data '{"text":"🚨 Gafus health check failed! Status: '$response'"}' \
    $WEBHOOK_URL
fi
```

## 🔒 Безопасность

### 1. Настройка файрвола

#### UFW конфигурация
```bash
# Включение UFW
sudo ufw enable

# Разрешение SSH
sudo ufw allow ssh

# Разрешение HTTP/HTTPS
sudo ufw allow 80
sudo ufw allow 443

# Блокировка всех остальных портов
sudo ufw default deny incoming
sudo ufw default allow outgoing
```

### 2. Настройка SSL

#### Дополнительные SSL настройки
```nginx
# Дополнительные SSL настройки в Nginx
ssl_session_cache shared:SSL:10m;
ssl_session_timeout 10m;
ssl_stapling on;
ssl_stapling_verify on;

# HSTS
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

# Security headers
add_header X-Frame-Options DENY;
add_header X-Content-Type-Options nosniff;
add_header X-XSS-Protection "1; mode=block";
```

### 3. Резервное копирование

#### Автоматическое резервное копирование
```bash
#!/bin/bash
# scripts/backup.sh

BACKUP_DIR="/var/backups/gafus"
DATE=$(date +%Y%m%d_%H%M%S)

# Создание резервной копии базы данных
pg_dump gafus > $BACKUP_DIR/database_$DATE.sql

# Создание резервной копии файлов
tar -czf $BACKUP_DIR/files_$DATE.tar.gz /home/gafus/gafus

# Удаление старых бэкапов (старше 30 дней)
find $BACKUP_DIR -name "*.sql" -mtime +30 -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +30 -delete

echo "Backup completed: $DATE"
```

## 🚨 Устранение неполадок

### 1. Частые проблемы

#### Проблема: Приложение не запускается
```bash
# Проверка логов
sudo journalctl -u gafus-web -f

# Проверка портов
netstat -tlnp | grep :3002

# Проверка переменных окружения
env | grep NODE_ENV
```

#### Проблема: База данных недоступна
```bash
# Проверка статуса PostgreSQL
sudo systemctl status postgresql

# Проверка подключения
psql -h localhost -U gafus -d gafus

# Проверка миграций
pnpm db:migrate:status
```

#### Проблема: Redis недоступен
```bash
# Проверка статуса Redis
sudo systemctl status redis

# Проверка подключения
redis-cli ping

# Проверка логов Redis
sudo tail -f /var/log/redis/redis-server.log
```

### 2. Восстановление после сбоя

#### Восстановление базы данных
```bash
# Остановка приложений
sudo systemctl stop gafus-web gafus-trainer-panel

# Восстановление из бэкапа
psql -h localhost -U gafus -d gafus < /var/backups/gafus/database_latest.sql

# Применение миграций
pnpm db:migrate:deploy

# Запуск приложений
sudo systemctl start gafus-web gafus-trainer-panel
```

#### Восстановление файлов
```bash
# Остановка приложений
sudo systemctl stop gafus-web gafus-trainer-panel

# Восстановление файлов
tar -xzf /var/backups/gafus/files_latest.tar.gz -C /

# Перезапуск приложений
sudo systemctl start gafus-web gafus-trainer-panel
```

## 📈 Масштабирование

### 1. Горизонтальное масштабирование

#### Load Balancer конфигурация
```nginx
# Конфигурация Nginx для балансировки нагрузки
upstream gafus_web {
    server 127.0.0.1:3002;
    server 127.0.0.1:3003;
    server 127.0.0.1:3004;
}

server {
    listen 443 ssl http2;
    server_name gafus.ru;
    
    location / {
        proxy_pass http://gafus_web;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 2. Вертикальное масштабирование

#### Увеличение ресурсов
```bash
# Увеличение лимитов памяти для Node.js
export NODE_OPTIONS="--max-old-space-size=4096"

# Настройка PostgreSQL
# postgresql.conf
shared_buffers = 256MB
effective_cache_size = 1GB
work_mem = 4MB
maintenance_work_mem = 64MB
```

## 📚 Дополнительные ресурсы

### Полезные команды
```bash
# Мониторинг системы
htop
iotop
nethogs

# Мониторинг Docker
docker stats
docker-compose logs -f

# Мониторинг Nginx
tail -f /var/log/ci-cd/nginx/access.log
tail -f /var/log/ci-cd/nginx/error.log

# Мониторинг PostgreSQL
sudo -u postgres psql -c "SELECT * FROM pg_stat_activity;"
```

### Полезные ссылки
- [Next.js Deployment](https://nextjs.org/docs/deployment)
- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)
- [Nginx Configuration](https://nginx.org/en/docs/)
- [PostgreSQL Administration](https://www.postgresql.org/docs/current/admin.html)
- [Redis Administration](https://redis.io/docs/management/)

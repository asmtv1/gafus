# Руководство по решению проблем

## 📋 Обзор

Этот документ содержит решения для наиболее распространенных проблем, возникающих при разработке и развертывании системы GAFUS.

## 🚨 Критические проблемы

### База данных недоступна

**Симптомы:**

- Ошибки подключения к PostgreSQL
- Приложения не запускаются
- Ошибки Prisma

**Решения:**

```bash
# Проверка статуса PostgreSQL
sudo systemctl status postgresql

# Перезапуск PostgreSQL
sudo systemctl restart postgresql

# Проверка подключения
psql -h localhost -U postgres -d gafus

# Проверка переменной DATABASE_URL
echo $DATABASE_URL
```

### Redis недоступен

**Симптомы:**

- Ошибки подключения к Redis
- Очереди не работают
- Кэширование не функционирует

**Решения:**

```bash
# Проверка статуса Redis
sudo systemctl status redis

# Перезапуск Redis
sudo systemctl restart redis

# Проверка подключения
redis-cli ping

# Проверка переменной REDIS_URL
echo $REDIS_URL
```

### Проблемы с аутентификацией

**Симптомы:**

- Пользователи не могут войти в систему
- Ошибки JWT токенов
- Сессии не сохраняются

**Решения:**

```bash
# Проверка NEXTAUTH_SECRET
echo $NEXTAUTH_SECRET

# Очистка cookies браузера
# Проверка настроек домена в NEXTAUTH_URL

# Регенерация секретного ключа
openssl rand -base64 32
```

## 🔧 Проблемы разработки

### Ошибки сборки

**Симптомы:**

- `pnpm build` завершается с ошибкой
- TypeScript ошибки
- Ошибки линтера

**Решения:**

```bash
# Очистка и переустановка зависимостей
rm -rf node_modules
rm pnpm-lock.yaml
pnpm install

# Проверка типов
pnpm typecheck:all

# Исправление ошибок линтера
pnpm lint:fix

# Очистка кэша
pnpm store prune
```

### Проблемы с портами

**Симптомы:**

- Приложения не могут запуститься
- Ошибки "Port already in use"
- Конфликты портов

**Решения:**

```bash
# Проверка занятых портов
lsof -i :3000
lsof -i :3001
lsof -i :3002
lsof -i :3003

# Остановка процессов
kill -9 <PID>

# Использование других портов
PORT=3004 pnpm dev
```

### Проблемы с Prisma

**Симптомы:**

- Ошибки миграций
- Проблемы с генерацией клиента
- Ошибки схемы базы данных

**Решения:**

```bash
# Перегенерация Prisma клиента
npx prisma generate

# Сброс базы данных (только для разработки)
npx prisma migrate reset

# Применение миграций
npx prisma migrate deploy

# Просмотр базы данных
npx prisma studio

# Проверка статуса миграций
npx prisma migrate status
```

## 🌐 Проблемы сети

### Server Actions 404/503

**Симптомы:**

- `POST https://gafus.ru/courses 404 (Not Found)`
- `UnrecognizedActionError: Server Action "..." was not found`
- Приложение падает в офлайн без причины

**Решения:**

```bash
# Очистка кеша билда
cd apps/web
pnpm clean

# Сборка с чистым кешем
pnpm build:clean

# Проверка переменных окружения
echo $NEXTAUTH_SECRET
```

📖 **Подробная документация:** [server-actions-404.md](./server-actions-404.md)

### CORS ошибки

**Симптомы:**

- Ошибки "CORS policy" в браузере
- API запросы блокируются
- Проблемы с preflight запросами

**Решения:**

```typescript
// next.config.ts
const nextConfig = {
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, PUT, DELETE, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization" },
        ],
      },
    ];
  },
};
```

### Проблемы с SSL сертификатами

**Симптомы:**

- Ошибки "SSL certificate"
- Небезопасные соединения
- Проблемы с HTTPS

**Решения:**

```bash
# Проверка сертификата
openssl x509 -in certificate.crt -text -noout

# Обновление сертификата
# Использование Let's Encrypt
certbot --nginx -d yourdomain.com

# Проверка конфигурации Nginx
nginx -t
```

## 📱 Проблемы с приложениями

### Web App не загружается

**Симптомы:**

- Белая страница
- Ошибки JavaScript
- Проблемы с роутингом

**Решения:**

```bash
# Проверка логов
pnpm --filter @gafus/web dev 2>&1 | tee web.log

# Проверка сборки
pnpm --filter @gafus/web build

# Очистка кэша Next.js
rm -rf apps/web/.next

# Проверка переменных окружения
cat .env
```

### Trainer Panel недоступен

**Симптомы:**

- Ошибки авторизации
- Проблемы с ролями
- Не загружаются данные

**Решения:**

```bash
# Проверка middleware
cat apps/trainer-panel/src/middleware.ts

# Проверка ролей пользователя
# В базе данных проверить поле role

# Проверка JWT токена
# Расшифровать токен и проверить роль
```

### Telegram Bot не отвечает

**Симптомы:**

- Бот не реагирует на команды
- Ошибки webhook
- Проблемы с отправкой сообщений

**Решения:**

```bash
# Ранее: отдельный пакет @gafus/telegram-bot. С марта 2026 приложение удалено из репозитория.
# Сброс пароля / смена телефона через Telegram — заглушки; см. docs/deployment/configuration.md (раздел Telegram legacy).
```

## 🐳 Проблемы Docker

### Контейнеры не запускаются

**Симптомы:**

- Docker Compose завершается с ошибкой
- Контейнеры постоянно перезапускаются
- Проблемы с образами

**Решения:**

```bash
# Проверка логов
docker-compose logs

# Пересборка образов
docker-compose build --no-cache

# Очистка Docker
docker system prune -a

# Проверка переменных окружения
docker-compose config
```

### Проблемы с volumes

**Симптомы:**

- Данные не сохраняются
- Ошибки доступа к файлам
- Проблемы с правами

**Решения:**

```bash
# Проверка volumes
docker volume ls

# Проверка прав доступа
ls -la /var/lib/docker/volumes/

# Создание volume заново
docker volume rm volume_name
docker volume create volume_name
```

## 📊 Проблемы производительности

### Медленная загрузка страниц

**Симптомы:**

- Долгая загрузка приложений
- Таймауты запросов
- Высокое использование CPU

**Решения:**

```bash
# Анализ bundle size
pnpm analyze:web

# Проверка производительности
lighthouse https://yourdomain.com

# Мониторинг ресурсов
htop
docker stats
```

### Проблемы с базой данных

**Симптомы:**

- Медленные запросы
- Высокое использование памяти
- Блокировки запросов

**Решения:**

```bash
# Проверка активных соединений
SELECT * FROM pg_stat_activity;

# Анализ медленных запросов
SELECT query, mean_time, calls
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;

# Проверка индексов
SELECT schemaname, tablename, indexname, idx_scan
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC;
```

## 🔍 Диагностика

### Логирование

```bash
# Включение подробных логов
export DEBUG=*
export LOG_LEVEL=debug

# Просмотр логов в реальном времени
tail -f logs/application.log

# Поиск ошибок в логах
grep -i error logs/application.log
grep -i warning logs/application.log
```

### Мониторинг системы

```bash
# Использование диска
df -h

# Использование памяти
free -h

# Активные процессы
ps aux | grep node

# Сетевые соединения
netstat -tulpn | grep :300
```

### Проверка зависимостей

```bash
# Проверка устаревших пакетов
pnpm outdated

# Проверка уязвимостей
pnpm audit

# Обновление пакетов
pnpm update
```

## 📞 Получение помощи

### Сбор информации для поддержки

```bash
# Информация о системе
uname -a
node --version
pnpm --version
docker --version

# Информация о проекте
git log --oneline -10
git status

# Конфигурация окружения (без секретов)
env | grep -E "(NODE_ENV|PORT|DATABASE|REDIS)" | grep -v -E "(PASSWORD|SECRET|TOKEN)"
```

### Полезные ресурсы

- [Next.js документация](https://nextjs.org/docs)
- [Prisma документация](https://www.prisma.io/docs)
- [Docker документация](https://docs.docker.com/)
- [PostgreSQL документация](https://www.postgresql.org/docs/)

---

_Это руководство поможет решить большинство проблем, возникающих при работе с системой GAFUS._

# Admin Panel

Панель администратора для управления системой Gafus.

## Обзор

Admin Panel - это веб-приложение на Next.js 15 для управления системой Gafus. Доступ к панели имеют только администраторы и модераторы.

## Технологический стек

- **Framework**: Next.js 15 (App Router)
- **UI**: Material-UI (MUI)
- **Authentication**: NextAuth.js
- **Styling**: Tailwind CSS
- **TypeScript**: 5.8+

## Функциональность

- **Пользователи** (`/main-panel/users`) — список пользователей, редактирование (имя, телефон, роль, пароль, статус подтверждения телефона `isConfirmed`), удаление
- **Администрирование** (`/main-panel/admin`) — кэш, хранилище
- **Push-рассылка** (`/main-panel/broadcasts`) — только ADMIN
- **Re-engagement** (`/main-panel/reengagement`) — только ADMIN
- **Стата по презентации** (`/main-panel/presentation-stats`) — ADMIN, MODERATOR
- **Покупки курсов** (`/main-panel/purchases`) — кто купил, когда, сумма, статус, ID платежа/ЮKassa (ADMIN, MODERATOR)

## Авторизация

### Роли

Доступ к панели имеют только следующие роли:

- **ADMIN** - полный доступ
- **MODERATOR** - модераторский доступ

### Middleware

Middleware проверяет:

1. Наличие валидной сессии NextAuth
2. Роль пользователя (ADMIN или MODERATOR)
3. Редирект на `/login` при отсутствии доступа

```typescript
// src/middleware.ts
const ALLOWED_ROLES = ["ADMIN", "MODERATOR"];
```

### Публичные маршруты

- `/login` - страница входа
- `/api/*` - API маршруты (собственная авторизация)
- Статические файлы (favicon, manifest, и т.д.)

## Архитектура

Admin Panel — **тонкий слой** поверх `@gafus/core`. Бизнес-логика и доступ к БД находятся в core; приложение отвечает за авторизацию, Zod-валидацию и инвалидацию кэша Next.js. **Prisma не используется напрямую** в admin-panel — доступ к данным идёт через `@gafus/core`.

Подробнее: [docs/architecture/admin-panel-layers.md](../architecture/admin-panel-layers.md)

## Структура проекта

```
apps/admin-panel/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/
│   │   │   │   └── route.ts        # NextAuth API route
│   │   │   └── csrf-token/
│   │   │       └── route.ts        # CSRF token endpoint
│   │   ├── (main)/main-panel/      # Страницы админ-панели
│   │   │   ├── admin/              # Хранилище, кэш
│   │   │   ├── broadcasts/         # Push-рассылка
│   │   │   ├── purchases/          # Покупки
│   │   │   ├── reengagement/       # Re-engagement метрики
│   │   │   ├── presentation-stats/ # Статистика презентации
│   │   │   └── users/              # Пользователи
│   │   ├── login/
│   │   │   └── page.tsx            # Страница входа
│   │   ├── layout.tsx              # Root layout
│   │   ├── page.tsx                # Главная страница
│   │   ├── not-found.tsx           # 404 страница
│   │   └── globals.css             # Глобальные стили
│   ├── features/
│   │   ├── auth/                   # Компоненты входа
│   │   ├── admin/                  # getStorageStats (→ adminStorage)
│   │   ├── broadcasts/             # sendBroadcastPush (→ adminBroadcast)
│   │   ├── purchases/              # getAllPurchases (→ adminPurchase)
│   │   ├── reengagement/           # getReengagementMetrics (→ adminReengagement)
│   │   ├── presentation/           # getPresentationStats (→ adminPresentation)
│   │   └── users/                  # getAllUsers, updateUser, deleteUser (→ adminUser)
│   ├── shared/
│   │   ├── lib/actions/            # invalidateAllCache, invalidateCoursesCache
│   │   └── providers/
│   │       └── QueryProvider.tsx   # React Query provider
│   └── middleware.ts               # Next.js middleware
├── package.json
├── next.config.ts
├── tsconfig.json
├── tailwind.config.js
└── postcss.config.js
```

## Конфигурация

### Environment Variables

```bash
# Database
DATABASE_URL=postgresql://...

# Redis
REDIS_URL=redis://...

# NextAuth
NEXTAUTH_SECRET=your-secret-key
NEXTAUTH_URL=https://admin.gafus.ru
AUTH_COOKIE_DOMAIN=.gafus.ru

# Node
NODE_ENV=production
PORT=3006

# Logging
DISABLE_CONSOLE_LOGGING=false

# CSRF
CSRF_STRICT=false
```

### Порты

- **Development**: 3006
- **Production**: 3006 (внутри Docker)
- **Public URL**: https://admin.gafus.ru

## Разработка

### Установка зависимостей

```bash
pnpm install
```

### Запуск в режиме разработки

```bash
# Из корня монорепо
pnpm --filter @gafus/admin-panel dev

# Или напрямую из директории
cd apps/admin-panel
pnpm dev
```

Приложение будет доступно на http://localhost:3006

### Сборка

```bash
pnpm --filter @gafus/admin-panel build
```

### Запуск production версии

```bash
pnpm --filter @gafus/admin-panel start
```

## Deployment

### Docker

Образ собирается с помощью `Dockerfile-admin-panel-optimized`:

```bash
docker build -f ci-cd/docker/Dockerfile-admin-panel-optimized -t gafus-admin-panel .
```

### Docker Compose

Сервис настроен в `docker-compose.prod.yml`:

```yaml
admin-panel:
  image: ghcr.io/asmtv1/gafus-admin-panel:latest
  container_name: gafus-admin-panel
  environment:
    - NODE_ENV=production
    - PORT=3006
    - DATABASE_URL=${DATABASE_URL}
    - REDIS_URL=${REDIS_URL}
    - NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
    - NEXTAUTH_URL=${ADMIN_PANEL_URL:-https://admin.gafus.ru}
    - AUTH_COOKIE_DOMAIN=${AUTH_COOKIE_DOMAIN:-.gafus.ru}
  restart: unless-stopped
  depends_on:
    - postgres
    - redis
```

### Nginx

Поддомен `admin.gafus.ru` настроен в `ci-cd/nginx/conf.d/gafus.ru.conf`:

```nginx
server {
    listen 443 ssl;
    http2 on;
    server_name admin.gafus.ru;

    location / {
        proxy_pass http://gafus-admin-panel:3006/;
        # ... proxy settings
    }
}
```

## Безопасность

### Middleware защита

- Проверка сессии на всех защищённых маршрутах
- Проверка роли пользователя (ADMIN/MODERATOR)
- Автоматический редирект на страницу входа

### Security headers

Настроены в Nginx:

- `Strict-Transport-Security`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Content-Security-Policy`

### CSRF Protection

Интегрирована защита от CSRF атак через `@gafus/csrf` пакет.

## Зависимости

### Workspace пакеты

- `@gafus/auth` — авторизация и сессии
- `@gafus/core` — бизнес-логика (adminUser, adminPurchase, adminReengagement, adminPresentation, adminStorage, adminBroadcast)
- `@gafus/logger` — логирование
- `@gafus/csrf` — CSRF защита
- `@gafus/error-handling` — обработка ошибок
- `@gafus/react-query` — React Query конфигурация
- `@gafus/reengagement` — ручной запуск re-engagement (triggerScheduler)
- `@gafus/types` — типы TypeScript
- `@gafus/ui-components` — общие UI компоненты
- `@gafus/webpush` — push-уведомления (транзитивно через core)

**Примечание:** `@gafus/prisma` не используется напрямую — доступ к БД через сервисы `@gafus/core`.

### Внешние пакеты

- `next` — Next.js фреймворк
- `next-auth` — авторизация
- `@mui/material` — UI компоненты
- `@tanstack/react-query` — управление state
- `react` / `react-dom` — React библиотеки

## Логирование

Использует `createErrorDashboardLogger` из `@gafus/logger`:

```typescript
import { createErrorDashboardLogger } from "@gafus/logger";

const logger = createErrorDashboardLogger("admin-panel-middleware");

logger.info("User authenticated", { userId, role });
logger.warn("Access denied", { userId, requiredRole });
logger.error("Authentication failed", error);
```

## Мониторинг

- Логи доступны через Error Dashboard (monitor.gafus.ru)
- Метрики Next.js доступны в runtime
- Health checks через Docker healthcheck

## Roadmap

Будущая функциональность (в разработке):

- Управление курсами и тренировками
- Модерация контента
- Статистика и аналитика
- Управление уведомлениями
- Системные настройки

## Troubleshooting

### Проблемы с авторизацией

1. Проверить `NEXTAUTH_SECRET` в переменных окружения
2. Проверить `AUTH_COOKIE_DOMAIN` (должен быть `.gafus.ru`)
3. Убедиться что роль пользователя `ADMIN` или `MODERATOR`
4. Проверить логи middleware

### Ошибки при сборке

1. Собрать core: `pnpm --filter @gafus/core build`
2. Проверить зависимости workspace пакетов
3. Очистить `.next` директорию и пересобрать

### Проблемы с Docker

1. Проверить переменные окружения в docker-compose
2. Убедиться что БД и Redis доступны
3. Проверить логи контейнера: `docker logs gafus-admin-panel`

## См. также

- [Архитектура проекта](../architecture/README.md)
- [NextAuth конфигурация](../packages/auth.md)
- [Deployment руководство](../deployment/docker.md)
- [Error Dashboard](./error-dashboard.md)

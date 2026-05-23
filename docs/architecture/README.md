# Архитектура GAFUS

## Структура монорепозитория

```text
apps/
  web/            Next.js пользовательское приложение
  mobile/         Expo Router приложение
  trainer-panel/  Next.js панель тренера
  admin-panel/    Next.js админ-панель
  api/            Hono REST API v1
  bull-board/     Express/Bull Board
packages/
  core/           бизнес-сервисы
  prisma/         Prisma client/schema/migrations
  auth/           auth helpers
  queues/         BullMQ queues
  worker/         BullMQ workers и cron
  webpush/        push providers
  ...             остальные shared пакеты
```

Рабочие области задаются в `pnpm-workspace.yaml`: `apps/*`, `packages/*`. Turbo-задачи описаны в `turbo.json`; `build` и `dev` зависят от `prisma:generate`.

## Слои

```text
UI / clients
  web, mobile, trainer-panel, admin-panel
        |
Transport
  Next.js Server Actions / Route Handlers, Hono REST API
        |
Domain
  @gafus/core services + профильные shared packages
        |
Infrastructure
  @gafus/prisma, @gafus/queues, @gafus/cdn-upload, @gafus/webpush, @gafus/mailer
        |
External systems
  PostgreSQL, Redis, S3-compatible storage, YooKassa, Apple, VK ID, Push providers
```

Правило для новых изменений: бизнес-правила помещать в `@gafus/core` или профильный пакет, а приложения оставлять адаптерами ввода/вывода.

## Приложения и порты

| App                  | Локальный порт из скрипта | Публичная роль                         |
| -------------------- | ------------------------- | -------------------------------------- |
| `apps/web`           | `3002`                    | `gafus.ru`, PWA                        |
| `apps/trainer-panel` | `3001`                    | trainer subdomain/panel                |
| `apps/admin-panel`   | `3006`                    | admin subdomain/panel                  |
| `apps/api`           | `API_PORT` или `3001`     | `api.gafus.ru`                         |
| `apps/bull-board`    | `3004`                    | `/admin/queues`, `/metrics`, `/health` |
| `apps/mobile`        | Expo dev server           | native app                             |

`apps/api` и `apps/trainer-panel` конфликтуют на `3001`, если запускать оба с дефолтными командами.

## API и transport

- `apps/api` - единственный standalone REST API. Базовый путь: `/api/v1`.
- `apps/web`, `apps/trainer-panel`, `apps/admin-panel` используют Next.js App Router, Server Components, Server Actions и отдельные Route Handlers для JSON/health/csrf/special endpoints.
- Mobile ходит в `apps/api` через `NEXT_PUBLIC_API_URL`/runtime config.
- Web/panels для server-side операций обычно вызывают core напрямую.

## Очереди и воркеры

`@gafus/queues` экспортирует BullMQ очереди:

- push
- reengagement
- video-transcoding
- consultation mail/reminder/SLA
- consent-log-cleanup
- pet-prevention-reminder

`@gafus/worker` запускает обработчики и cron schedules. `apps/bull-board` сейчас подключает к UI и Prometheus metrics три очереди: `push`, `exam-cleanup`, `reengagement`. Остальные очереди существуют в пакете и используются воркерами/приложениями, но не все выведены в Bull Board UI.

## Auth и безопасность

- Web/panels: NextAuth.js v4 с JWT/session helpers из `@gafus/auth`.
- API v1: Bearer JWT через `jose`, access/refresh tokens, middleware `apps/api/src/middleware/auth.ts`.
- CSRF для Next.js mutating endpoints/actions через `@gafus/csrf`.
- Rate limiting в Hono API через `hono-rate-limiter` и Redis.
- Cookie consent хранится в `localStorage` ключе `gafus:cookieConsent:v1`.
- Секреты и env описаны в [deployment/configuration.md](../deployment/configuration.md).

## Данные

Основные домены хранятся в PostgreSQL через Prisma:

- users/auth/roles
- pets/documents/prevention
- courses/training days/steps
- progress/exams/achievements
- articles/reviews/favorites
- consultations
- payments/subscriptions
- push subscriptions/devices
- consent logs

Схема и миграции: `packages/prisma/prisma/schema.prisma`, `packages/prisma/migrations/`.

## Наблюдаемость

- `@gafus/logger` - Pino-based structured logs.
- Tracer - client/server error reporting where enabled by env.
- `apps/bull-board` - `/metrics` для BullMQ.
- `packages/worker/src/health-server.ts` - worker health endpoint.
- Docker monitoring configs - `ci-cd/docker/prometheus`, `grafana`, `blackbox`.

## Дополнительная документация

- [Обзор слоёв core](./overview.md)
- [Поток данных](./data-flow.md)
- [Admin Panel layers](./admin-panel-layers.md)
- [Формат идентификаторов](./identifiers.md)
- [Система кэширования](./caching-system.md)
- [Управление env](./ENV_MANAGEMENT.md)
- [Архитектура логирования](./logging-architecture.md)
- [HLS-защита видео](./hls-video-protection.md)

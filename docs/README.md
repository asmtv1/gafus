# Документация проекта GAFUS

GAFUS - pnpm/Turbo монорепозиторий для обучения владельцев питомцев: web/PWA, mobile Expo, панели тренера и администратора, standalone REST API, очереди и воркеры.

Актуальная опорная модель проекта:

- `apps/web` - пользовательское Next.js-приложение, PWA, Server Actions и web API routes.
- `apps/mobile` - Expo Router приложение для iOS/Android.
- `apps/trainer-panel` - Next.js панель тренера и контент-менеджмента.
- `apps/admin-panel` - Next.js админ-панель.
- `apps/api` - Hono REST API v1 для mobile и внешних клиентов.
- `apps/bull-board` - Express/Bull Board для очередей.
- `packages/*` - общая бизнес-логика, типы, Prisma, очереди, воркеры, auth, analytics, push, mail и вспомогательные библиотеки.

## С чего начинать агенту

1. Прочитать этот файл, [обзор](./overview/README.md), [архитектуру](./architecture/README.md) и [стек](./tech-stack/README.md).
2. Для изменения в конкретном приложении открыть документ из `docs/apps/`.
3. Для изменения бизнес-логики сначала проверить `@gafus/core`, затем профильный пакет из `docs/packages/`.
4. Для REST API сверяться с [apps/api](./apps/api.md) и [API v1](./api/v1-routes.md).
5. Для env/deploy сверяться с [конфигурацией](./deployment/configuration.md) и [Docker](./deployment/docker.md).

## Разработка

- [Настройка окружения](./development/setup.md)
- [Тестирование](./testing/TESTING.md)
- [Troubleshooting](./troubleshooting/README.md)

Базовые команды:

```bash
pnpm install
pnpm setup:env
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Локальные порты по скриптам:

| Сервис        | Команда                                  | Порт                    |
| ------------- | ---------------------------------------- | ----------------------- |
| API           | `pnpm --filter @gafus/api dev`           | `3001` через `API_PORT` |
| Trainer Panel | `pnpm --filter @gafus/trainer-panel dev` | `3001`                  |
| Web           | `pnpm --filter @gafus/web dev`           | `3002`                  |
| Bull Board    | `pnpm --filter @gafus/bull-board dev`    | `3004`                  |
| Admin Panel   | `pnpm --filter @gafus/admin-panel dev`   | `3006`                  |
| Mobile        | `pnpm --filter @gafus/mobile start`      | Expo                    |

API и trainer-panel используют один локальный порт по умолчанию. Не запускайте их одновременно без переопределения порта.

## Обзор и архитектура

- [Обзор проекта](./overview/README.md)
- [Архитектура](./architecture/README.md)
- [Технологический стек](./tech-stack/README.md)
- [Поток данных](./architecture/data-flow.md)
- [Управление переменными окружения](./architecture/ENV_MANAGEMENT.md)
- [Идентификаторы](./architecture/identifiers.md)
- [Система кеширования](./architecture/caching-system.md)
- [Архитектура логирования](./architecture/logging-architecture.md)

## Приложения

- [Web](./apps/web.md)
- [Mobile (Expo/React Native)](./apps/mobile-rn.md)
- [Trainer Panel](./apps/trainer-panel.md)
- [Admin Panel](./apps/admin-panel.md)
- [API service](./apps/api.md)
- [Bull Board](./apps/bull-board.md)

В репозитории больше нет `apps/telegram-bot`; Telegram-сбросы в auth сейчас описаны как legacy-заглушки в API/auth-доках.

## Пакеты

- [@gafus/core](./packages/core.md) - бизнес-логика и сервисы доменов.
- [@gafus/prisma](./packages/prisma.md) - Prisma Client, schema, migrations, seed.
- [@gafus/types](./packages/types.md) - общие TypeScript-типы.
- [@gafus/auth](./packages/auth.md) - NextAuth/JWT helpers, password reset helpers.
- [@gafus/csrf](./packages/csrf.md) - CSRF middleware/client helpers.
- [@gafus/error-handling](./packages/error-handling.md) - Error Boundary и client reporting.
- [@gafus/logger](./packages/logger.md) - Pino/tracer-compatible logging.
- [@gafus/analytics](./packages/analytics.md) - web/mobile analytics adapters.
- [@gafus/react-query](./packages/react-query.md) - QueryClient и hooks.
- [@gafus/ui-components](./packages/ui-components.md) - shared React UI.
- [@gafus/metadata](./packages/metadata.md) - SEO metadata/json-ld.
- [@gafus/cdn-upload](./packages/cdn-upload.md) - S3/Yandex Object Storage upload.
- [@gafus/queues](./packages/queues.md) - BullMQ queue instances.
- [@gafus/worker](./packages/worker.md) - фоновые воркеры и cron schedules.
- [@gafus/webpush](./packages/webpush.md) - Web Push, Expo Push, RuStore Push.
- [@gafus/statistics](./packages/statistics.md) - статистика курсов и прогресса.
- [@gafus/consultation-shared](./packages/consultation-shared.md) - общие типы/форматтеры консультаций.
- [@gafus/mailer](./packages/mailer.md) - SMTP transactional mail.
- [@gafus/reengagement](./packages/reengagement.md) - кампании возврата пользователей.
- [@gafus/video-access](./packages/video-access.md) - подписанные токены доступа к видео.

## API

- [Обзор API](./api/README.md)
- [API Routes v1](./api/v1-routes.md)

## Фичи

- [Cookie consent](./features/cookie-consent.md)
- [Удаление аккаунта](./features/account-deletion.md)
- [VK auth](./features/vk-auth.md)
- [Rustore push](./features/rustore-push.md)
- [Pet prevention](./features/pet-prevention.md)
- [Shared Day Progress](./features/shared-day-progress.md)
- [Мини-гайд](./features/guide-course-type.md)
- [Apple IAP](./payments/apple-iap.md)
- [ЮKassa](./payments/yookassa.md)

## Развёртывание и мониторинг

- [Конфигурация](./deployment/configuration.md)
- [Docker](./deployment/docker.md)
- [Логи контейнеров](./deployment/container-logs.md)
- [Секреты API](./deployment/api-secrets.md)
- [Мониторинг](./monitoring/README.md)
- [Yandex Monitoring](./monitoring/yandex-monitoring.md)
- [Prometheus-запросы](./monitoring/PROMETHEUS_QUERIES.md)

## Юридическое

- [Публичная оферта](./legal/public-offer-full.md)
- [Клаузулы оферты](./legal/oferta-clauses.md)
- [Версии документов](./legal/document-versions.md)
- [Соответствие оферте при оплате](./payments/oferta-compliance.md)

_Обновлено: май 2026_

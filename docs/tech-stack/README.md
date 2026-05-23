# Технологический стек GAFUS

Документ фиксирует текущий стек по `package.json` в корне, `apps/*` и `packages/*`.

## Runtime и monorepo

- Node.js 20.x как целевая runtime версия.
- pnpm `10.12.4`.
- Turbo `2.5.4`.
- TypeScript `5.8.3` в web/panels/packages и `~5.9.3` в mobile.
- ESLint 9, Prettier 3.
- Vitest 4 для unit/integration тестов.

## Web и панели

- Next.js `15.5.x` App Router.
- React `19.2.1` в web/trainer/admin пакетах.
- NextAuth.js `4.24.11`.
- Material UI `7.1.0`, MUI X Data Grid/Date Pickers `7.8.0`.
- TanStack Query `5.85.9`.
- Zustand `5.0.7`.
- React Hook Form `7.58.1` в web/trainer, `7.54.2` в admin.
- CSS Modules/global CSS. Tailwind config в репозитории сейчас отсутствует, поэтому Tailwind не считается текущей базовой технологией проекта.

## Mobile

- Expo `54.0.34`.
- Expo Router `~6.0.21`.
- React `19.1.0`.
- React Native `0.81.5`.
- React Native Paper `^5.12.5`.
- FlashList `^2.0.2`.
- Expo IAP, Notifications, Updates, Secure Store, File System, Image Picker, Video.
- RuStore Push через `react-native-rustore-push`.
- AppMetrica через `@appmetrica/react-native-analytics`.

## API/backend

- `apps/api`: Hono `^4.11.4`, `@hono/node-server`, `@hono/zod-validator`.
- JWT: `jose` для API, NextAuth для web/panels.
- Validation: Zod 3.
- Build API: `tsup`.
- `apps/bull-board`: Express 5 + `@bull-board/*`.

## Data и async

- PostgreSQL.
- Prisma `6.10.1`.
- Redis через `ioredis`.
- BullMQ `5.2.0`.
- Background jobs в `@gafus/worker`.

## Shared packages

- `@gafus/core` - доменная бизнес-логика.
- `@gafus/prisma` - Prisma client/schema/migrations.
- `@gafus/queues` - BullMQ queue instances.
- `@gafus/webpush` - Web Push, Expo Push, RuStore Push.
- `@gafus/cdn-upload` - S3-compatible object storage upload.
- `@gafus/mailer` - transactional SMTP mail через Nodemailer 7.
- `@gafus/analytics` - web/mobile analytics adapters.
- `@gafus/video-access` - signed JWT access for protected video.
- `@gafus/consultation-shared` - shared consultation presentation/formatting helpers.

## Интеграции

- VK ID auth.
- YooKassa payments.
- Apple IAP / app subscription verification.
- S3-compatible Object Storage / CDN.
- Web Push VAPID.
- Expo Push.
- RuStore Push.
- SMTP/Postfix transactional email.
- Yandex Telemost for consultations where configured.
- Yandex Metrica/AppMetrica analytics.
- PostHog web analytics adapter exists in `@gafus/analytics`.

Telegram Bot API не является активным приложением монорепы. Упоминания Telegram в auth относятся к legacy password/phone reset helpers и не должны трактоваться как существующий сервис.

## DevOps и monitoring

- Docker multi-stage images в `ci-cd/docker`.
- Production compose: `ci-cd/docker/docker-compose.prod.yml`.
- Local compose: `ci-cd/docker/docker-compose.local.yml`.
- Nginx config в `ci-cd/nginx`.
- Prometheus/Grafana/Blackbox configs в `ci-cd/docker`.
- Pino logs через `@gafus/logger`.
- Tracer включается env-переменными.

## Проверки

Основные repo-level команды:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Для точечной проверки используйте `pnpm --filter <package> <script>`.

# GAFUS Refactor

Монорепозиторий приложения GAFUS. Актуальная архитектура: React/Vite Web, Admin и Trainer, Hono API, Expo/React Native Mobile, Prisma/PostgreSQL, Redis/BullMQ, отдельные медиаобработчики Cloud.ru. Next.js не является целевой платформой.

**Техническая документация:** [docs/README.md](docs/README.md) — архитектура, API, Prisma, медиа, разработка, QA и release gates.

## Требования

Node.js 24 в CI (локально 20.19+ либо 22.12+), pnpm 10.12.4, PostgreSQL/Redis для интеграционного окружения; Docker нужен для локальной верификации образов `linux/amd64`. Секреты и конфигурации окружений не входят в Git.

## Рабочие каталоги

- `apps/web-vite` — основное SPA и «Моменты».
- `apps/admin-panel/src/admin-live` — административное SPA.
- `apps/trainer-panel/src/trainer-vite` — панель тренера.
- `apps/api` — Hono API, бизнес-маршруты и авторизация.
- `apps/mobile` — Expo/Android/iOS.
- `apps/bull-board`, `packages/worker` — очереди, панель фоновых заданий и обработчики.
- `apps/feed-cloud`, `apps/gallery-cloud` — обработка медиа.
- `packages/*` — переиспользуемый код, Prisma, авторизация, хранение, очереди.

## Проверка

```sh
pnpm install --frozen-lockfile
pnpm --filter @gafus/prisma db:generate
pnpm -r --if-present run typecheck
pnpm --filter @gafus/web-vite test
pnpm --filter @gafus/web-vite build
pnpm --filter @gafus/admin-panel build
pnpm --filter @gafus/trainer-panel build
pnpm --filter @gafus/api build
```

Локально Web: `pnpm --filter @gafus/web-vite dev`. API/Redis/PostgreSQL запускать только с явно изолированными локальными настройками, не используя боевые данные. Ни одна команда этой документации не выполняет production-деплой.

См. [архитектуру](docs/ARCHITECTURE.md), [разработку](docs/DEVELOPMENT.md), [деплой](docs/DEPLOYMENT.md), [инфраструктуру](docs/INFRASTRUCTURE.md).

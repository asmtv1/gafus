# Workspaces и команды

> Сгенерировано 2026-10-29 из исходников. Обновить: `python3 scripts/docs/generate_reference.py`. Инвентаризация не равна PASS тестов. Значения секретов не читаются.

| Путь | Имя пакета | Скрипты |
|---|---|---|
| [`apps/admin-panel`](../../apps/admin-panel) | `@gafus/admin-panel` | `build`, `dev`, `start`, `typecheck`, `lint`, `test` |
| [`apps/api`](../../apps/api) | `@gafus/api` | `build`, `dev`, `start`, `test`, `test:watch`, `typecheck`, `test:realpg:isolated` |
| [`apps/bull-board`](../../apps/bull-board) | `@gafus/bull-board` | `build`, `dev`, `start`, `typecheck` |
| [`apps/feed-cloud`](../../apps/feed-cloud) | `@gafus/feed-cloud-runtime` | `build`, `build:chat2-job`, `build:questions-photo-job`, `typecheck`, `start`, `package:origin` |
| [`apps/gallery-cloud`](../../apps/gallery-cloud) | `@gafus/gallery-cloud` | `build`, `package:linux`, `typecheck`, `test`, `benchmark`, `smoke` |
| [`apps/mobile`](../../apps/mobile) | `@gafus/mobile` | `android`, `android:release`, `postinstall`, `ios`, `ios:release`, `lint`, `lint:fix`, `start`, `test`, `tracer:sourcemaps`, `typecheck`, `update:ota:preview`, `update:ota:production`, `web` |
| [`apps/trainer-panel`](../../apps/trainer-panel) | `@gafus/trainer-panel` | `build`, `dev`, `start`, `typecheck`, `lint`, `test` |
| [`apps/web-vite`](../../apps/web-vite) | `@gafus/web-vite` | `dev`, `build`, `typecheck`, `lint`, `test`, `test:preview`, `test:visual`, `test:visual:update` |
| [`packages/analytics`](../../packages/analytics) | `@gafus/analytics` | `build`, `clean`, `test`, `test:watch`, `typecheck` |
| [`packages/auth`](../../packages/auth) | `@gafus/auth` | `build`, `clean`, `test`, `test:coverage`, `test:watch`, `typecheck` |
| [`packages/cdn-upload`](../../packages/cdn-upload) | `@gafus/cdn-upload` | `build`, `lint`, `lint:fix` |
| [`packages/chat-media-quality`](../../packages/chat-media-quality) | `@gafus/chat-media-quality` | `build`, `typecheck` |
| [`packages/chat-server`](../../packages/chat-server) | `@gafus/chat-server` | `build`, `test`, `typecheck` |
| [`packages/consultation-shared`](../../packages/consultation-shared) | `@gafus/consultation-shared` | `build`, `clean`, `test`, `typecheck` |
| [`packages/core`](../../packages/core) | `@gafus/core` | `build`, `clean`, `dev`, `lint`, `lint:fix`, `test`, `test:coverage`, `test:watch`, `typecheck` |
| [`packages/csrf`](../../packages/csrf) | `@gafus/csrf` | `build`, `clean`, `test`, `test:coverage`, `test:watch`, `typecheck` |
| [`packages/error-handling`](../../packages/error-handling) | `@gafus/error-handling` | `build`, `clean`, `typecheck` |
| [`packages/feed-cloud`](../../packages/feed-cloud) | `@gafus/feed-cloud` | `build`, `typecheck` |
| [`packages/feed-server`](../../packages/feed-server) | `@gafus/feed-server` | `build`, `typecheck` |
| [`packages/feed-storage`](../../packages/feed-storage) | `@gafus/feed-storage` | `build`, `typecheck` |
| [`packages/gallery-server`](../../packages/gallery-server) | `@gafus/gallery-server` | `build`, `typecheck`, `test` |
| [`packages/gallery-storage`](../../packages/gallery-storage) | `@gafus/gallery-storage` | `build`, `typecheck`, `test` |
| [`packages/logger`](../../packages/logger) | `@gafus/logger` | `build`, `clean`, `dev` |
| [`packages/mailer`](../../packages/mailer) | `@gafus/mailer` | `build`, `clean`, `dev`, `test` |
| [`packages/npd`](../../packages/npd) | `@gafus/npd` | `build`, `clean`, `test`, `typecheck` |
| [`packages/prisma`](../../packages/prisma) | `@gafus/prisma` | `build`, `clean`, `typecheck`, `db:generate`, `db:migrate`, `db:migrate:deploy`, `db:push`, `db:seed`, `db:studio`, `prisma:generate` |
| [`packages/questions-server`](../../packages/questions-server) | `@gafus/questions-server` | `build`, `test`, `typecheck` |
| [`packages/queues`](../../packages/queues) | `@gafus/queues` | `build`, `clean`, `typecheck` |
| [`packages/react-query`](../../packages/react-query) | `@gafus/react-query` | `build`, `clean`, `typecheck` |
| [`packages/reengagement`](../../packages/reengagement) | `@gafus/reengagement` | `build`, `clean`, `dev`, `test`, `test:coverage`, `test:watch` |
| [`packages/statistics`](../../packages/statistics) | `@gafus/statistics` | `build`, `clean`, `dev` |
| [`packages/types`](../../packages/types) | `@gafus/types` | `build`, `clean`, `test`, `typecheck` |
| [`packages/ui-components`](../../packages/ui-components) | `@gafus/ui-components` | `prebuild`, `build`, `clean`, `dev`, `typecheck` |
| [`packages/video-access`](../../packages/video-access) | `@gafus/video-access` | `build`, `clean`, `test`, `test:coverage`, `test:watch` |
| [`packages/webpush`](../../packages/webpush) | `@gafus/webpush` | `build`, `clean`, `test`, `typecheck` |
| [`packages/worker`](../../packages/worker) | `@gafus/worker` | `prebuild`, `build`, `clean`, `dev`, `dev:env`, `start`, `start:dev`, `start:watch`, `npd:bootstrap`, `npd:cutover`, `test`, `test:coverage`, `test:watch`, `typecheck`, `smart-ml:promote`, `smart-ml:train`, `smart-feed:sql-smoke`, `smart-feed:redis-smoke`, `smart-experiment:report`, `profit:sync` |

## Корневые команды

| Команда | Реализация |
|---|---|
| `pnpm build` | `turbo run build` |
| `pnpm build:all` | `pnpm --filter @gafus/prisma db:generate && pnpm -r --if-present run build` |
| `pnpm build:ci` | `./scripts/build-local.sh` |
| `pnpm build:packages` | `pnpm --filter "./packages/**" run build` |
| `pnpm check:builds` | `node scripts/check-builds.js` |
| `pnpm clean` | `turbo run clean` |
| `pnpm clean:all` | `pnpm -r run clean` |
| `pnpm clean:cache` | `bash scripts/clean-cache.sh` |
| `pnpm dev` | `turbo run dev` |
| `pnpm format` | `prettier --cache --write .` |
| `pnpm format:check` | `prettier --check .` |
| `pnpm preinstall` | `only-allow pnpm` |
| `pnpm lint` | `turbo run lint` |
| `pnpm lint:all` | `pnpm -r run lint` |
| `pnpm lint:fix` | `turbo run lint:fix` |
| `pnpm posthog:hobby` | `bash docker/posthog/up.sh` |
| `pnpm posthog:hobby:down` | `bash docker/posthog/down.sh` |
| `pnpm start` | `pnpm --filter @gafus/web-vite dev` |
| `pnpm start:worker:watch:simple` | `nodemon` |
| `pnpm test` | `turbo run test` |
| `pnpm test:all` | `turbo run test` |
| `pnpm test:api` | `pnpm --filter @gafus/api test` |
| `pnpm test:apps` | `pnpm --filter @gafus/api test && pnpm --filter @gafus/web-vite test && pnpm --filter @gafus/mobile test` |
| `pnpm test:cloudru-media` | `node infra/cloudru/s3-cors.test.mjs && node infra/cloudru/media-manifests.test.mjs && node infra/cloudru/cdn-edge-smoke.test.mjs && node infra/cloudru/cdn-stability.test.mjs && node infra/cloudru/cdn-edge-degradation.test.mjs && node infra/cloudru/yc-cdn-cli.test.mjs && node infra/cloudru/migrate-legacy-media.test.mjs && node infra/cloudru/multipart-smoke.test.mjs && node infra/cloudru/production-release.test.mjs` |
| `pnpm test:coverage` | `turbo run test:coverage` |
| `pnpm test:mobile` | `pnpm --filter @gafus/mobile test` |
| `pnpm test:watch` | `turbo run test:watch` |
| `pnpm test:web` | `pnpm --filter @gafus/web-vite test` |
| `pnpm typecheck` | `turbo run typecheck` |
| `pnpm typecheck:all` | `pnpm -r run typecheck` |
| `pnpm db:generate` | `pnpm --filter @gafus/prisma db:generate` |
| `pnpm check:web-core-boundary` | `node scripts/check-web-core-boundary.mjs` |

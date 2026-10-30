# CI/CD, Docker и скрипты

> Сгенерировано 2026-10-29 из исходников. Обновить: `python3 scripts/docs/generate_reference.py`. Инвентаризация не равна PASS тестов. Значения секретов не читаются.

## Github Actions

- [`.github/workflows/beget-final-readonly-smoke.yml`](../../.github/workflows/beget-final-readonly-smoke.yml)
- [`.github/workflows/beget-synthetic-acceptance.yml`](../../.github/workflows/beget-synthetic-acceptance.yml)
- [`.github/workflows/build-single-container.yml`](../../.github/workflows/build-single-container.yml)
- [`.github/workflows/ci-cd.yml`](../../.github/workflows/ci-cd.yml)
- [`.github/workflows/cloudru-media-images.yml`](../../.github/workflows/cloudru-media-images.yml)
- [`.github/workflows/daily-backup.yml`](../../.github/workflows/daily-backup.yml)
- [`.github/workflows/deploy-only.yml`](../../.github/workflows/deploy-only.yml)
- [`.github/workflows/production-deploy-reusable.yml`](../../.github/workflows/production-deploy-reusable.yml)
- [`.github/workflows/refactor-browser-boundary.yml`](../../.github/workflows/refactor-browser-boundary.yml)
- [`.github/workflows/refactor-vite-release.yml`](../../.github/workflows/refactor-vite-release.yml)

## Root scripts

- [`scripts/README.md`](../../scripts/README.md)
- [`scripts/apply-migration.sh`](../../scripts/apply-migration.sh)
- [`scripts/apply-yc-monitoring-importer-patch.py`](../../scripts/apply-yc-monitoring-importer-patch.py)
- [`scripts/architecture-workspace-cycles.json`](../../scripts/architecture-workspace-cycles.json)
- [`scripts/build-local.sh`](../../scripts/build-local.sh)
- [`scripts/check-app-prisma-boundary.mjs`](../../scripts/check-app-prisma-boundary.mjs)
- [`scripts/check-builds.js`](../../scripts/check-builds.js)
- [`scripts/check-community-chat-live.mjs`](../../scripts/check-community-chat-live.mjs)
- [`scripts/check-cynologist-chat-live.mjs`](../../scripts/check-cynologist-chat-live.mjs)
- [`scripts/check-domain-package-prisma-boundary.mjs`](../../scripts/check-domain-package-prisma-boundary.mjs)
- [`scripts/check-mobile-core-boundary.mjs`](../../scripts/check-mobile-core-boundary.mjs)
- [`scripts/check-tracer-env.sh`](../../scripts/check-tracer-env.sh)
- [`scripts/check-web-core-boundary.mjs`](../../scripts/check-web-core-boundary.mjs)
- [`scripts/check-worker-prisma-boundary.mjs`](../../scripts/check-worker-prisma-boundary.mjs)
- [`scripts/check-workspace-graph.mjs`](../../scripts/check-workspace-graph.mjs)
- [`scripts/clean-cache.sh`](../../scripts/clean-cache.sh)
- [`scripts/clean.sh`](../../scripts/clean.sh)
- [`scripts/configure-cynologist-chat-stream.mjs`](../../scripts/configure-cynologist-chat-stream.mjs)
- [`scripts/deploy-general-dashboard.py`](../../scripts/deploy-general-dashboard.py)
- [`scripts/env-loader.js`](../../scripts/env-loader.js)
- [`scripts/eslint-rules.js`](../../scripts/eslint-rules.js)
- [`scripts/fix-petname-placeholder.sh`](../../scripts/fix-petname-placeholder.sh)
- [`scripts/fix-petname-placeholder.sql`](../../scripts/fix-petname-placeholder.sql)
- [`scripts/import-dashboards-to-yandex.sh`](../../scripts/import-dashboards-to-yandex.sh)
- [`scripts/migrate-guides-to-articles.ts`](../../scripts/migrate-guides-to-articles.ts)
- [`scripts/normalize-yandex-monitoring-dashboard.py`](../../scripts/normalize-yandex-monitoring-dashboard.py)
- [`scripts/reset-db.sh`](../../scripts/reset-db.sh)
- [`scripts/restore-from-backup.sh`](../../scripts/restore-from-backup.sh)
- [`scripts/start-local-chat-api.mjs`](../../scripts/start-local-chat-api.mjs)
- [`scripts/sync-metrics-to-yandex-native.py`](../../scripts/sync-metrics-to-yandex-native.py)
- [`scripts/test-api-auth.sh`](../../scripts/test-api-auth.sh)
- [`scripts/test-sw-offline.js`](../../scripts/test-sw-offline.js)
- [`scripts/yandex-monitoring-proto-json.py`](../../scripts/yandex-monitoring-proto-json.py)

## Инфраструктурные разделы

- [`infra/cloudru`](../../infra/cloudru)
- [`infra/feed`](../../infra/feed)
- [`infra/gallery`](../../infra/gallery)
- [`infra/chat2`](../../infra/chat2)
- [`docker`](../../docker)
- [`ci-cd`](../../ci-cd)
- [`scripts/qa`](../../scripts/qa)
- [`scripts/refactor`](../../scripts/refactor)

Production deploy, database migrations и production data writes не входят в инвентаризацию и локальные проверки.

# Агент 1 → агент 2: перенос payment transitions из Core

**Состояние:** 12.11.2026; `main` HEAD `0dcd18c13c8d`; локальное незакоммиченное дерево. **Merge/commit/push/deploy не выполнялись.**

**Реестр:** `Core → server` **41 → 40**, в этой группе устранено **1**, добавлено **0**. Замороженный `docs/audit/core-server-facade-baseline.json` этим агентом не редактировался. Ещё 40 обратных зависимостей остаются; общий план не принят и не завершён.

## Изменения и контрольные суммы

Контрольная точка `before` — точные байты **уже изменённого рабочего дерева перед этой пачкой**, не Git HEAD. Все эти файлы сохранены в `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/payment-composition-prechange`; созданных файлов в ней нет. Это защищает изменения параллельных агентов. `D` означает прежний исходник удалён из Core, его содержимое перенесено в серверную область.

| Статус | Путь | SHA-256 до (12 символов) | SHA-256 после (12 символов) | Назначение |
|---|---|---|---|---|
| M | `packages/core/src/services/appSubscription/paymentService.ts` | `3febc1395d96` | `19ca950044f6` | Retired runtime Core factory; no provider/SQL adapter import. |
| M | `packages/core/src/services/appSubscription/index.ts` | `363a33f95258` | `356953d2cf4e` | Removed payment transition reexports; domain contracts and promo policy remain. |
| M | `packages/core/src/services/appSubscription/__tests__/paymentService.test.ts` | `b4ec75e6c92f` | `ad813c73d46b` | 50 payment invariants now instantiate the exact server factory via test-only ports. |
| M | `packages/core/src/services/appSubscription/__tests__/paymentService.realpg.archqa.test.ts` | `e1955f232617` | `3faf9850fb89` | Disposable-PG acceptance uses server factory, retains strict opt-in guard. |
| D | `packages/core/src/services/appSubscription/appleJws.archqa.acceptance.ts` | `a61195652600` | `—` | Moved synthetic JWS acceptance out of Core production source. |
| A | `packages/subscription-payment-server/src/appleJws.archqa.acceptance.ts` | `—` | `4103ce29a665` | Retains synthetic JWS/CA verification and untrusted-chain rejection; test-only ports. |
| A | `packages/subscription-payment-server/src/appleJws.archqa.acceptance.test.ts` | `—` | `ded3f87dd10a` | Registers JWS acceptance with server package Vitest. |
| A | `apps/api/src/modules/app-subscription/composition/payment-transitions.ts` | `—` | `756db331dac5` | Binds server payment factory to Core promo-policy ports once for API. |
| M | `apps/api/src/routes/v1/app-subscription.ts` | `a15b57509ecd` | `17c67d024170` | Checkout/cancel/Apple handlers now use API composition; offer/access still Core. |
| M | `apps/api/src/routes/v1/payment-provider-webhooks.ts` | `228feae96c8e` | `2181fa0c1bf6` | Provider IP/signature route now uses shared API payment composition. |
| M | `apps/api/src/routes/v1/app-subscription.route.test.ts` | `e1bb9941c2be` | `8217a2e9b078` | Split domain Core mock from provider composition; no stale Core payment exports. |
| M | `apps/api/src/routes/v1/payment-provider-webhooks.test.ts` | `b139b493c972` | `d89852540739` | Mocks payment composition instead of Core reexport. |
| M | `apps/api/src/routes/v1/admin-users.ts` | `d6e3718aea67` | `096d6820490e` | Admin cancellation uses the same API payment composition. |
| M | `apps/api/src/routes/v1/admin-users.test.ts` | `c2ab3158c64a` | `0db0794e379d` | Admin mutation test mocks payment composition. |
| A | `packages/worker/src/composition/app-subscription-payment.ts` | `—` | `0283325a2e07` | Binds independent worker-process server payment factory to identical Core promo ports. |
| M | `packages/worker/src/cron-scheduler.ts` | `3a121f97da08` | `44e38f79fd93` | Payment reconcile jobs invoke Worker composition rather than Core factory. |
| M | `packages/worker/src/cron-scheduler.test.ts` | `666ca3d5765a` | `ac3ef75d316c` | Cron payment mocks target Worker composition. |
| M | `packages/worker/src/g1-consultation-outbox-core-cron-crossmodule.mock.test.ts` | `8a5cdaac9668` | `9659a9ee16f8` | Cross-module cron source mocks target Worker composition. |

**Полные 64-символьные SHA-256 каждого файла до/после** — в одноимённом JSON-манифесте `gafus-agent-1-to-agent-2-payment-composition-20261112.json`. Не использовать `git add -A`, `git reset`, rebase, merge или общую фиксацию дерева без отдельной координации с другими агентами.

## Проверки, подтверждённые локально

| Проверка | Результат | Журнал |
|---|---|---|
| `pnpm check:core-boundaries` | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-payment-final-boundaries.log` |
| `node scripts/check-workspace-graph.mjs` | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-payment-final-workspace-graph.log` |
| `pnpm --filter @gafus/subscription-payment-server typecheck` | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-payment-final-server-ts.log` |
| `pnpm --filter @gafus/core typecheck` | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-payment-final-core-ts.log` |
| `pnpm --filter @gafus/api typecheck` | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-payment-final-api-ts.log` |
| `pnpm --filter @gafus/worker typecheck` | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-payment-final-worker-ts.log` |
| `pnpm --filter @gafus/core build` | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-payment-core-build.log` |
| `pnpm --filter @gafus/core exec vitest run src/services/appSubscription/__tests__/paymentService.test.ts --config vitest.config.ts` | PASS, 50 tests | `/tmp/a1-pmt-core-tests.log` |
| `pnpm --filter @gafus/api exec vitest run src/routes/v1/app-subscription.route.test.ts src/routes/v1/payment-provider-webhooks.test.ts src/routes/v1/admin-users.test.ts src/modules/architecture/dependency-architecture.test.ts --config vitest.config.ts` | PASS, 134 tests | `/tmp/a1-payment-api-architecture-final.log` |
| `pnpm --filter @gafus/worker exec vitest run src/cron-scheduler.test.ts src/g1-consultation-outbox-core-cron-crossmodule.mock.test.ts --config vitest.config.ts` | PASS, 13 tests | `/tmp/a1-payment-worker-cron-tests.log` |
| `pnpm --filter @gafus/subscription-payment-server test` | PASS, 5 tests | `/tmp/a1-pmt-server-synthetic-tests.log` |
| `node scripts/check-core-server-facades.mjs` | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-payment-final-facades.log` |

Стандартные Core/API/Worker suites в полном объёме, `architecture-final-regression.sh` (33 этапа), `architecture-chaos-local.sh` (5 этапов) **после этой пачки не запускались**; адресные и строгие архитектурные проверки подтверждены отдельно. Ни одной реальной внешней транзакции или HTTP-вызова провайдера не выполнялось. Только синтетическая Apple JWS/CA проверка.

## Непройденные внешние и интеграционные приёмки — точные блокеры

- **ARCHQA_REALPG** — Dedicated disposable local PostgreSQL current schema, loopback DATABASE_URL, GAFUS_ARCHQA_REALPG=1, GAFUS_ARCHQA_DB_NAME matching archqa_schema_<12 hex>; no live production database; execute guarded paymentService.realpg.archqa.test.ts concurrency/rollback.
- **PROVIDER_YOOKASSA_TEST** — Approved isolated YooKassa test-shop credentials, protected callback endpoint behind trusted proxy, test-provider signature/IP and synthetic/non-real charge to validate webhook/reconciliation paths.
- **PROVIDER_APPLE_SANDBOX** — Approved Apple App Store Connect sandbox signing/notification configuration, valid test app bundle and signed sandbox transaction, whitelisted staged callback and App Store Server API credentials. Synthetic JWS CA tests already passed locally; external sandbox not tested.
- **INTEGRATED_CANDIDATE** — All agent streams finalized, integrated candidate and sufficient disk reserve (recommended at least 12 GiB); then complete 33-stage regression and 5-stage chaos, all client/worker/panel checks, before any baseline ratchet or release.

## Правило интеграции для агента 2

1. В первую очередь сравнить SHA-256 всех 18 путей из JSON с текущим деревом: если путь изменился ещё раз, разрешить конфликт содержательно, не заменять вслепую.
2. Объединять в одной группе: Core index + удалённый payment facade, API/Worker composition, три Hono-маршрута и Worker cron, переподключённые тесты, перенесённую Apple JWS приёмку. По одному файлу без второго конца порта не переносить.
3. Нельзя возвращать импорт `@gafus/subscription-payment-server/service` из `packages/core/src/**`; единственные реальные фабрики теперь в API и Worker composition.
4. После интеграции перепроверить реестр, типизацию и целевые тесты; замороженный ratchet не изменять до всей интеграционной/chaos приёмки. Не делать production deploy без отдельного разрешения.
5. Предыдущие отдельные отчёты агента 1: `docs/audit/gafus-agent-1-20261112-batch-consultation-course.md`, `docs/audit/gafus-agent-1-20261111-verified-progress.md`.

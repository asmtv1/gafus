# Агент 1 → агент 2: feature flags + subscription access через Core Ports

**Состояние:** 12.11.2026, ветка `main`, HEAD `0dcd18c13c8d`. Никакого merge, commit, push, deploy или изменения production не выполнялось.

## Результат и объём

- Кластер L feature flags: **39 → 38** обратных импортов. Чистый Core runtime contract, обязательная fail-closed API composition, актуальные server flags/OTA/review policy сохранены.
- Следующий кластер H subscription access: **38 → 37**. Core больше не реэкспортирует `subscription-read-server`; API composition делегирует owner-scoped DB статус и права кинолога существующему адаптеру.
- Сканер с frozen baseline 41: **37 remaining / 4 resolved / 0 new**. Исторически 142 → 37, устранено 105. Исходный `docs/audit/core-server-facade-baseline.json` НЕ менялся.
- `@gafus/feature-flags-server` и `@gafus/subscription-read-server` переведены из Core runtime dependencies в devDependencies для тестов. Lockfile проверен frozen+offline. Общие error-конструкторы mobile release теперь в `@gafus/types`, `instanceof` между Core/server сохраняется.
- Привязка обоих портов — первые два import в `apps/api/src/app.ts`. Другой service process должен самостоятельно составить порт до использования; при отсутствии binding вместо потенциального bypass возникает ошибка.

## Передаваемые файлы с SHA-256

**Основа `до` — реальные байты общего незакоммиченного дерева перед конкретной группой, не Git HEAD.** Поскольку файлы A2/A3 могут изменяться параллельно, сверять **полные** `sha256_before` и `sha256_after` в JSON. Не копировать без слияния изменённые `apps/api/src/app.ts`, Core/package.json, pnpm-lock, types/index или исходники чужих агентов.

| Статус | Группа | Файл | До SHA-256 | После SHA-256 |
|---|---|---|---|---|
| M | shared_composition_or_guard | `apps/api/src/app.ts` | `5a43f689d75b` | `0cccaf1fdfb5` |
| A | feature_flags | `apps/api/src/modules/app-feature-flags/composition/install-core-flags.contract.test.ts` | `—` | `b03fed2c2f05` |
| A | feature_flags | `apps/api/src/modules/app-feature-flags/composition/install-core-flags.ts` | `—` | `a8c69b5fb84e` |
| A | subscription_access | `apps/api/src/modules/app-subscription/composition/install-core-subscription-access.contract.test.ts` | `—` | `a8881b27212c` |
| A | subscription_access | `apps/api/src/modules/app-subscription/composition/install-core-subscription-access.ts` | `—` | `bae598ee1b95` |
| M | compatibility_with_existing_a2_payment_composition | `apps/api/src/routes/v1/g1-subscription-readonly.contract.test.ts` | `20f9c78405c2` | `2e81891d858e` |
| M | shared_composition_or_guard | `docs/audit/core-server-adapter-risk-inventory-20261111.md` | `db3557d6d795` | `6a03dd8ae9cc` |
| M | shared_composition_or_guard | `docs/audit/core-server-bulk-progress-20261111.md` | `899de9459a8d` | `74ef2ce1ec72` |
| M | shared_composition_or_guard | `packages/core/package.json` | `2186ed8b5351` | `145379e3172e` |
| A | feature_flags | `packages/core/src/services/appFeatureFlags/appFeatureFlagsPort.test.ts` | `—` | `29cb2a4819ba` |
| M | feature_flags | `packages/core/src/services/appFeatureFlags/appFeatureFlagsService.ts` | `8de99d7fb986` | `9c7fbd235020` |
| M | feature_flags | `packages/core/src/services/appFeatureFlags/index.ts` | `249465b71cff` | `c123bc8224a8` |
| M | subscription_access | `packages/core/src/services/appSubscription/__tests__/accessService.facade.g1.test.ts` | `599dc9faef41` | `9b72a7109906` |
| M | subscription_access | `packages/core/src/services/appSubscription/__tests__/accessService.readBaseline.g1.test.ts` | `582e37920f4a` | `98c74ff0cb8f` |
| M | subscription_access | `packages/core/src/services/appSubscription/__tests__/accessService.test.ts` | `e9495f2bed37` | `88f8235029ea` |
| M | subscription_access | `packages/core/src/services/appSubscription/__tests__/cynologistEntitlements.test.ts` | `cdc4a1b84d16` | `350bfab01b6a` |
| A | subscription_access | `packages/core/src/services/appSubscription/accessPort.test.ts` | `—` | `ce887f931f5c` |
| M | subscription_access | `packages/core/src/services/appSubscription/accessService.ts` | `267e13915d91` | `0a9bbf842ac9` |
| M | subscription_access | `packages/core/src/services/appSubscription/g1-achievements-snapshot-access-source.test.ts` | `f6f5734dcfad` | `4b6fbd0baa3e` |
| M | subscription_access | `packages/core/src/services/consultation/bookingService.test.ts` | `c0765476e716` | `8cb7f7fd2df8` |
| M | feature_flags | `packages/feature-flags-server/package.json` | `8997fc767d1b` | `a750b637068c` |
| M | feature_flags | `packages/feature-flags-server/src/appFeatureFlagsService.ts` | `ae46d3a75fb7` | `e2e428e7da75` |
| A | feature_flags | `packages/types/src/contracts/mobileReleaseErrors.ts` | `—` | `33902af423bd` |
| M | feature_flags | `packages/types/src/index.ts` | `bf98e16bdb61` | `a78c60d0e363` |
| M | shared_composition_or_guard | `pnpm-lock.yaml` | `75bbecbb0065` | `f131a5960bff` |
| M | shared_composition_or_guard | `scripts/check-core-server-boundary.mjs` | `e905f3d41e52` | `c4a4f84c9f14` |

**Всего:** 26 файлов; 19 обновлено, 7 добавлено. Исходное состояние существовавших файлов сохранено в директориях: `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/feature-flags-port-prechange` и `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/subscription-access-port-prechange`.

## Локальная приёмка

| Этап | Результат | Квитанция |
|---|---|---|
| Core and feature flag pure port policy | PASS — 2058 tests, 136 skip | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-two-ports-core-final.log` |
| API routes, composition and app integration | PASS — 2741 tests, 266 skip | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-two-ports-api-full-shared-errors.log` |
| Shared types | PASS — 89 tests | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-two-ports-types-tests.log` |
| Core subscription port, monetary and wallet rights | PASS — 35 tests | `/tmp/a1-subscription-core-tests.log` |
| Core owner locks, read source, consultation mocks | PASS — 51 tests | `/tmp/a1-subscription-test-rewire.log` |
| API subscription route and strict architecture | PASS — 186 tests | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-subscription-api-target.log` |
| API feature flags, training and architecture | PASS — 194 tests | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-flags-api-target-tests.log` |
| Core mobile flags, release profiles and shared errors | PASS — 6 tests | `/tmp/a1-flags-parity-test.log` |
| Strict boundaries, regressions and port composition | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-two-ports-boundary-final.log` |
| API TypeScript typecheck | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-two-ports-api-types-final.log` |
| Core TypeScript typecheck | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-ports-core-types-shared.log` |
| Feature-flags server TypeScript typecheck | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-two-ports-flags-server-types-final.log` |
| Worker TypeScript typecheck | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-ports-worker-ts.log` |
| Workspace DAG no cycles | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-ports-graph-shared.log` |
| Offline frozen lockfile | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-two-ports-frozen-lock-final.log` |
| Types production build | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-ports-types-build.log` |
| Feature-flag server production build | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-ports-flag-server-build.log` |
| Core production build | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-ports-core-build-shared.log` |

**Не заменять полноту интеграционного плана:** эти локальные результаты относятся к 2 группам, не подтверждают 33-stage финальную и 5-stage chaos на общем кандидате. Внешние сервисы и реальная PROD-инфраструктура не трогались.

## Требуемые доступы и открытые гейты

- **MULTI_AGENT_INTEGRATION** — A2/A3 streams finalized and explicit release candidate. Shared files apps/api/src/app.ts, packages/core/package.json, pnpm-lock.yaml, packages/types/src/index.ts, scripts/check-core-server-boundary.mjs and prior A2 payment compatibility test require semantic conflict resolution against before/after SHA-256. No git add -A/reset/rebase/merge/push without coordination.
- **POSTGRES_SUBSCRIPTION_REAL_PG** — Dedicated disposable current-schema PostgreSQL with sandbox rows for owner A/B, PARTNER role revocation, active/expired/trial/paid three-month overlaps, concurrent updates and provider failure. Run attached real-PG gates under explicit safe credentials; no production DB.
- **IOS_REVIEW_RELEASE** — Approved staging iOS 1.7.3 review/released configuration and mobile client sandbox; verify exact iOS version profile, feature flags for promo/card/rewarded ads, OTA and rollback. No App Store production writes.
- **WORKER_BOOTSTRAP_GUARD** — Worker currently has no direct feature-flag/subscription access reader call sites; if new Worker paths call these Core compatibility ports, add its own composition before starting jobs and test it. Current unbound state intentionally fails closed.
- **FULL_ARCH_FINAL** — All remaining 37 Core→server edges removed through safe ports and full A1/A2/A3 integrated candidate, 33-stage architecture-final-regression, 5-stage chaos, full Worker/Web/Mobile/trainer/admin and PG/Redis gates. Ratchet baseline remains frozen at 41 until all required checks pass.

## Порядок интеграции для агента 2

1. Прочитать JSON, сверить SHA-256 каждого пути. Если хотя бы один `sha256_after` не совпадает с рабочим деревом — выяснить параллельную правку, не перезаписывать.
2. Порты, process installer, две композиции, общие error constructors, manifest/core package/lock и тесты переносить логическими группами, не частичным cherry-pick одного файла.
3. Зафиксировать конкретные негативные проверки: отсутствие port binding запрещает доступ; смена процесса/двойная конфигурация запрещена; owner/period проверяются только SQL read adapter; iOS review профиль не подменяет released.
4. Не повышать frozen baseline 41 до общего прохождения всех интеграционных гейтов. Ни Merge, ни Push выполнены A1 не были.

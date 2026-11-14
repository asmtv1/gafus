# GAFUS: точная пофайловая матрица интеграции A1/A3/A2

Источник: `gafus-agents-integration-triage-20261112.json` от `2026-11-12T00:30:02.829457+00:00`; исходный inventory `2026-11-12T00:29:54.539726+00:00`. Файловое содержимое проверено SHA-256; общее основание A1 и A3 `0dcd18c13`. **Ни один патч не применялся.**

### Правила чтения

- **АВТО** означает совпадение полного файла или доказанное соответствие финальной SHA A3 в текущем общем A1. Это *решение по выбору источника для будущего переноса*, а не выполненное слияние и не автоматическое принятие поведения.
- **РУЧНО** — потенциальный трёхсторонний конфликт или новые файлы с различным содержимым; источник ниже — рекомендованная сторона, но требуется просмотр hunks и обязательный тест.
- Исходно было **99** отличающихся файлов, при следующем снимке 101, сейчас **108**. A1 продолжает работать; более ранние расхождения не считаются закрытыми без SHA-проверки. Из новых документальных различий — `docs/audit/core-server-bulk-progress-20261111.md` и `docs/audit/core-server-facade-baseline.json`. Ниже все различия **текущего** снимка + 5 delete-vs-present.
- Вне матрицы ещё **1324 побайтно совпадающих путей** и **206 одинаковых удалений** — кандидаты автоматического совпадения, но должны пройти общий QA. У 16 путей A2 отдельный приоритетный разбор.

## Первая очередь: 16 пересечений с четырьмя A2-коммитами

| Приоритет | Файл | Три стороны | Рекомендуемый источник/действие | Обязательная проверка |
|---|---|---|---|---|
| P0 | `apps/api/src/lib/operation-observability.ts` | `A1_A3_MATCH_A2_DIFF` | A2 runtime telemetry + A1 API composition | Reconcile HTTP operationId, route labels, private /internal/metrics, real PG pool wait, no secrets |
| P0 | `ci-cd/docker/prometheus/config.alloy` | `A1_A3_MATCH_A2_DIFF` | A2 low-cardinality allowlist + existing monitoring | Metrics target/auth, separate media/outbox scrape, source freshness, no secret in config |
| P0 | `ci-cd/docker/prometheus/gafus-alerts.yml` | `A1_A3_MATCH_A2_DIFF` | A2 alert rules + existing production rules | Alert counts, no duplicate groups, 360p stuck and DLQ firing/resolved, route only test recipient |
| P0 | `packages/logger/src/serverTelemetry.ts` | `A1_A3_MATCH_A2_DIFF` | A2 telemetry + A1 logging hooks | Span parent/child, sanitized JSON, no payload/SQL/tokens, OTLP failure nonblocking |
| P0 | `packages/prisma/schema.prisma` | `A1_A3_MATCH_A2_DIFF` | A1 Prisma model + A2 metrics hunk | Prisma previewFeatures metrics, preserve A3 outbox schema, generate, typecheck, migration safety |
| P0 | `pnpm-lock.yaml` | `REGENERATE_NO_DIRECT_COPY` | regenerate after package manifests agreed | Never select full source. One lock resolution; frozen install after approval |
| P1 | `apps/api/src/lib/operation-observability.test.ts` | `AUTO_IDENTICAL_A1_A3_A2_COMMITTED` | identical if SHA matches; otherwise combine asserts | API operation contract tests, auth and label cardinality |
| P1 | `ci-cd/docker/grafana/dashboards/gafus-api-latency.json` | `A1_A3_MATCH_A2_DIFF` | A2 latency dashboard with A1 API metrics | Validate JSON/data sources; HTTP p95/p99 and Prisma pool wait |
| P1 | `ci-cd/docker/grafana/dashboards/gafus-media-chat.json` | `AUTO_IDENTICAL_A1_A3_A2_COMMITTED` | A2 media/chat dashboards + A3 job metrics | Panels source, 360p, outbox, DLQ; no unbounded labels |
| P1 | `ci-cd/docker/grafana/dashboards/gafus-operations-reliability.json` | `AUTO_IDENTICAL_A1_A3_A2_COMMITTED` | A2 operation view + A3 outbox transitions | Rate/drain/DLQ and service health, no phantom metrics |
| P1 | `ci-cd/docker/prometheus/gafus-alerts.promtool.test.yml` | `AUTO_IDENTICAL_A1_A3_A2_COMMITTED` | A2 + existing promtool fixtures | Official promtool test rules; Alertmanager isolated webhook |
| P1 | `ci-cd/docker/prometheus/health-monitoring.contract.test.mjs` | `A1_A3_MATCH_A2_DIFF` | A2 monitoring contract + existing checks | Node contract; Prometheus syntax, scrape and labels |
| P1 | `packages/logger/package.json` | `AUTO_IDENTICAL_A1_A3_A2_COMMITTED` | identical if SHA matches A1/A2; otherwise review | OTel dependency versions, frozen lockfile, logger build |
| P1 | `scripts/qa/otel-local-collector.test.mjs` | `A1_A3_MATCH_A2_DIFF` | A2 OTLP fixture | Traceparent/operationId, collector down fail open |
| P1 | `scripts/qa/prometheus-alertmanager-isolated.sh` | `A1_A3_MATCH_A2_DIFF` | A2 local alert harness | Actual Prometheus/Alertmanager if installed; no production webhook |
| P2 | `docs/audit/gafus-agent-2-observability-20261111.md` | `A1_A3_MATCH_A2_DIFF` | A2 source, retain A1/A3 historical observations | Check run evidence and PENDING, do not promote local to staging |

## Новая платёжная группа A1: 18 файлов, до финального архитектурного реестра

Источник: `gafus-agent-1-to-agent-2-payment-composition-20261112.json`, SHA-256 `87d0fbedf7ab2692637cbeed6fcf819b865f23c70f92094e4f5dd905a728a362`, снимок `2026-11-12T00:10:52.549733+00:00`. Все **18/18 текущих after-SHA** сверены; удалённый Core Apple JWS отсутствует. **Прямые пересечения с P0 A2: 0; с полными 16 A2: 0; с финальными 39 A3: 0.** Риски косвенные: Prisma generator, lockfile, telemetry, Worker cron, admin ACL.

| Статус | Файл A1 | Источник | Требуемая адресная проверка |
|---|---|---|---|
| `M` | `packages/core/src/services/appSubscription/paymentService.ts` | A1/payment-manifest | CORE_ARCH; CORE |
| `M` | `packages/core/src/services/appSubscription/index.ts` | A1/payment-manifest | CORE_ARCH; CORE |
| `M` | `packages/core/src/services/appSubscription/__tests__/paymentService.test.ts` | A1/payment-manifest | CORE_ARCH; CORE |
| `M` | `packages/core/src/services/appSubscription/__tests__/paymentService.realpg.archqa.test.ts` | A1/payment-manifest | CORE_ARCH; CORE |
| `D` | `packages/core/src/services/appSubscription/appleJws.archqa.acceptance.ts` | A1/payment-manifest | CORE_ARCH; CORE |
| `A` | `packages/subscription-payment-server/src/appleJws.archqa.acceptance.ts` | A1/payment-manifest | SERVER; CORE_ARCH |
| `A` | `packages/subscription-payment-server/src/appleJws.archqa.acceptance.test.ts` | A1/payment-manifest | SERVER; CORE_ARCH |
| `A` | `apps/api/src/modules/app-subscription/composition/payment-transitions.ts` | A1/payment-manifest | API_TYPES; API; CORE_ARCH |
| `M` | `apps/api/src/routes/v1/app-subscription.ts` | A1/payment-manifest | API_TYPES; API |
| `M` | `apps/api/src/routes/v1/payment-provider-webhooks.ts` | A1/payment-manifest | API_TYPES; API |
| `M` | `apps/api/src/routes/v1/app-subscription.route.test.ts` | A1/payment-manifest | API_TYPES; API |
| `M` | `apps/api/src/routes/v1/payment-provider-webhooks.test.ts` | A1/payment-manifest | API_TYPES; API |
| `M` | `apps/api/src/routes/v1/admin-users.ts` | A1/payment-manifest | API_TYPES; API |
| `M` | `apps/api/src/routes/v1/admin-users.test.ts` | A1/payment-manifest | API_TYPES; API |
| `A` | `packages/worker/src/composition/app-subscription-payment.ts` | A1/payment-manifest with A3 Worker review | WORKER_TYPES; WORKER; A3 |
| `M` | `packages/worker/src/cron-scheduler.ts` | A1/payment-manifest with A3 Worker review | WORKER_TYPES; WORKER; A3 |
| `M` | `packages/worker/src/cron-scheduler.test.ts` | A1/payment-manifest with A3 Worker review | WORKER_TYPES; WORKER; A3 |
| `M` | `packages/worker/src/g1-consultation-outbox-core-cron-crossmodule.mock.test.ts` | A1/payment-manifest with A3 Worker review | WORKER_TYPES; WORKER; A3 |

**Важно:** четыре новых файла и одно удаление — часть одного связанного переноса. A3 старый worktree отличается от всех 18 платёжных файлов, но финальный manifest A3 не объявляет владельцем ни одного из них. А1 — единственный подтверждённый источник новой платёжной композиции. `before` SHA есть в резервном манифесте для 11 файлов; отсутствуют записи резервного манифеста для трёх исходных файлов (удалённый Apple JWS и два admin-users). Это не ставит под сомнение проверенные **18 after-SHA**, но восстановление именно этих before-файлов по данной резервной квитанции не доказано.
**Уточнение P0 Prisma на проверенном текущем коде:** A2 **committed** schema отличается от A1 не только `previewFeatures=["metrics"]`: в A1 есть отсутствующая в A2 committed модель `QuestionLegacyPhotoDeletion` и новые поля `Chat2OutboxEvent` (claimToken String?, operationId String?, traceId String?, lastErrorCode String?, deadLetteredAt DateTime?). В A2 **working tree** схема совпадает с A1 плюс `metrics`, но это незакоммиченный соседний overlay, не источник для слепого переноса. Сохранить **все** A1 модели/поля/index и добавить **только** metrics feature из A2, затем проверить Prisma generate, Chat2 lease/fencing/DB и payment.
**P0 lockfile:** A1 и A2 committed различаются; A1 содержит `@gafus/subscription-payment-server` и ссылки на expo-modules-core, react-native-reanimated, compressor patches (их файлы существуют). После согласования всех package manifests нужна единая регенерация lock, а не копирование старого A2.

### Восемь косвенных точек интеграции с A2/A3

| Приоритет | Связанный файл | Решение | Минимальные группы QA |
|---|---|---|---|
| P0 | `packages/prisma/schema.prisma` | Keep A1 complete models and add A2 previewFeatures=["metrics"] in generator only; no schema reset/migration solely for telemetry flag | SCHEMA; CORE_ARCH; API_TYPES; WORKER_TYPES; A2 |
| P0 | `pnpm-lock.yaml` | Never copy A2 lockfile over A1. After owner package.json consensus regenerate lockfile once, verify Expo/RN patch references, then frozen install | LOCK; CORE_ARCH; API_TYPES; WORKER_TYPES |
| P0 | `apps/api/src/lib/operation-observability.ts` | Keep A1 payment routes; A2 trace adapter/metrics composed at app boundary, never log tokens/payment credentials | API; API_TYPES; A2 |
| P0 | `packages/logger/src/serverTelemetry.ts` | Combine A1 domain errors and A2 safe JSON trace spans without raw payment payloads | API; WORKER; A2 |
| P0 | `ci-cd/docker/prometheus/config.alloy` | Keep A2 label allowlist and authenticated scrape; no direct payment-specific scrape claimed | A2 |
| P0 | `ci-cd/docker/prometheus/gafus-alerts.yml` | Preserve A2 alert rules; verify no missing Worker metrics; test recipient actual alert remains staging PENDING | WORKER; A2 |
| P1 | `packages/worker/tsconfig.json` | Keep current shared A1 tsconfig; A3 final SHA matches it; do not copy older A3 worktree file | WORKER_TYPES; WORKER; A3 |
| P1 | `apps/api/src/routes/v1/admin-media.ts` | Keep A3 DLQ GET/POST and A1 payment admin-users cancellation; verify both role scopes | API; A3 |

Полные команды QA (на **каждый** платёжный путь), точные SHA и missing-before-backup: `gafus-agents-integration-payment-overlay-20261112.json` и `.tsv`. Платёжная группа проверена адресно (Core 50, API 134, Worker 13, server 5), **но после неё не запускалась единая 33/5 регрессия**, а provider sandbox и isolated real PG payment concurrency ещё PENDING.


## A1 после двух новых кластеров — 37 оставшихся зависимостей (до финального реестра)

Дополнительный машинный регистр: `gafus-agents-integration-a1-r37-coverage-20261112.json`, полная пофайловая матрица `gafus-agents-integration-a1-r37-matrix-20261112.tsv` (49 уникальных файлов + 6 companion-manifest documents). **Предыдущая интеграционная матрица A1/A3 не заменяется**: она отражает отдельный frozen снимок.

- **37 remaining**: frozen 41, 4 resolved, 0 new forbidden. Манифесты: payment 18, reminder 7, feature flags/subscription 26 = 51 записи / 49 уникальных путей; 2 audit-файла менялись в двух последовательных группах.
- **SHA_REQUIRED:** 46; **REGENERATE_APPROVED_LOCK:** 1; **EXCLUDE_AUDIT_ONLY:** 2 файлов из манифестов и 6 companion-manifest docs с отдельными исходными SHA.
- Новые пути после предыдущего frozen inventory: 19; **unaccounted: 0**.
- Пересечения с 6 P0 A2: **pnpm-lock.yaml**. Прямые совпадения с A3 final-39: **0**.
- **Важные косвенные/ручные:** `apps/api/src/app.ts` (порядок install flags + subscription access перед route imports, сохранять A2 instrumentation), `packages/core/package.json`, `packages/types/src/index.ts`, `scripts/check-core-server-boundary.mjs`. Для lockfile — ручная регенерация после всех package manifests; нельзя брать committed A2 lock или нарушать Expo/RN patches.

| Файл A1 | Статус переноса | SHA/удаление | A2 P0 | A3 final |
|---|---|---|---|---|
| `apps/api/src/app.ts` | `SHA_REQUIRED` | `0cccaf1fdfb5bf4b` | нет | нет |
| `apps/api/src/modules/app-feature-flags/composition/install-core-flags.contract.test.ts` | `SHA_REQUIRED` | `b03fed2c2f057a3c` | нет | нет |
| `apps/api/src/modules/app-feature-flags/composition/install-core-flags.ts` | `SHA_REQUIRED` | `a8c69b5fb84e2817` | нет | нет |
| `apps/api/src/modules/app-subscription/composition/install-core-subscription-access.contract.test.ts` | `SHA_REQUIRED` | `a8881b27212c138d` | нет | нет |
| `apps/api/src/modules/app-subscription/composition/install-core-subscription-access.ts` | `SHA_REQUIRED` | `bae598ee1b95691c` | нет | нет |
| `apps/api/src/modules/app-subscription/composition/payment-transitions.ts` | `SHA_REQUIRED` | `756db331dac5c8c1` | нет | нет |
| `apps/api/src/modules/reminders/composition/create-receipt-review.ts` | `SHA_REQUIRED` | `94da00991d2c2e22` | нет | нет |
| `apps/api/src/routes/v1/admin-users.test.ts` | `SHA_REQUIRED` | `0db0794e379dd397` | нет | нет |
| `apps/api/src/routes/v1/admin-users.ts` | `SHA_REQUIRED` | `096d6820490e5d11` | нет | нет |
| `apps/api/src/routes/v1/app-subscription.route.test.ts` | `SHA_REQUIRED` | `8217a2e9b078bbd2` | нет | нет |
| `apps/api/src/routes/v1/app-subscription.ts` | `SHA_REQUIRED` | `17c67d024170c2ad` | нет | нет |
| `apps/api/src/routes/v1/g1-reminder-create-lookup.review.test.ts` | `SHA_REQUIRED` | `4dc6b659b3cd90d5` | нет | нет |
| `apps/api/src/routes/v1/g1-reminder-create-lookup.review.ts` | `SHA_REQUIRED` | `55b197d4d3a7b999` | нет | нет |
| `apps/api/src/routes/v1/g1-subscription-readonly.contract.test.ts` | `SHA_REQUIRED` | `2e81891d858e01cb` | нет | нет |
| `apps/api/src/routes/v1/payment-provider-webhooks.test.ts` | `SHA_REQUIRED` | `d8985254073965e6` | нет | нет |
| `apps/api/src/routes/v1/payment-provider-webhooks.ts` | `SHA_REQUIRED` | `2181fa0c1bf69567` | нет | нет |
| `docs/audit/core-server-adapter-risk-inventory-20261111.md` | `EXCLUDE_AUDIT_ONLY` | `6a03dd8ae9ccb6b0` | нет | нет |
| `docs/audit/core-server-bulk-progress-20261111.md` | `EXCLUDE_AUDIT_ONLY` | `74ef2ce1ec72353e` | нет | нет |
| `packages/core/package.json` | `SHA_REQUIRED` | `145379e3172ebc1d` | нет | нет |
| `packages/core/src/services/appFeatureFlags/appFeatureFlagsPort.test.ts` | `SHA_REQUIRED` | `29cb2a4819ba1117` | нет | нет |
| `packages/core/src/services/appFeatureFlags/appFeatureFlagsService.ts` | `SHA_REQUIRED` | `9c7fbd2350208918` | нет | нет |
| `packages/core/src/services/appFeatureFlags/index.ts` | `SHA_REQUIRED` | `c123bc8224a8b185` | нет | нет |
| `packages/core/src/services/appSubscription/__tests__/accessService.facade.g1.test.ts` | `SHA_REQUIRED` | `9b72a710990682e7` | нет | нет |
| `packages/core/src/services/appSubscription/__tests__/accessService.readBaseline.g1.test.ts` | `SHA_REQUIRED` | `98c74ff0cb8f049b` | нет | нет |
| `packages/core/src/services/appSubscription/__tests__/accessService.test.ts` | `SHA_REQUIRED` | `88f8235029ea33c1` | нет | нет |
| `packages/core/src/services/appSubscription/__tests__/cynologistEntitlements.test.ts` | `SHA_REQUIRED` | `350bfab01b6a5f6a` | нет | нет |
| `packages/core/src/services/appSubscription/__tests__/paymentService.realpg.archqa.test.ts` | `SHA_REQUIRED` | `3faf9850fb89adf7` | нет | нет |
| `packages/core/src/services/appSubscription/__tests__/paymentService.test.ts` | `SHA_REQUIRED` | `ad813c73d46b0ee9` | нет | нет |
| `packages/core/src/services/appSubscription/accessPort.test.ts` | `SHA_REQUIRED` | `ce887f931f5c7feb` | нет | нет |
| `packages/core/src/services/appSubscription/accessService.ts` | `SHA_REQUIRED` | `0a9bbf842ac94e91` | нет | нет |
| `packages/core/src/services/appSubscription/appleJws.archqa.acceptance.ts` | `SHA_REQUIRED` | `ABSENT` | нет | нет |
| `packages/core/src/services/appSubscription/g1-achievements-snapshot-access-source.test.ts` | `SHA_REQUIRED` | `4b6fbd0baa3ece8d` | нет | нет |
| `packages/core/src/services/appSubscription/index.ts` | `SHA_REQUIRED` | `356953d2cf4ed339` | нет | нет |
| `packages/core/src/services/appSubscription/paymentService.ts` | `SHA_REQUIRED` | `19ca950044f69f46` | нет | нет |
| `packages/core/src/services/consultation/bookingService.test.ts` | `SHA_REQUIRED` | `8cb7f7fd2df8fd50` | нет | нет |
| `packages/core/src/services/reminders/g1ReminderCreateIdempotency.review.test.ts` | `SHA_REQUIRED` | `f175ddfef0163fa9` | нет | нет |
| `packages/core/src/services/reminders/g1ReminderCreateIdempotency.review.ts` | `SHA_REQUIRED` | `073fff926ff6754e` | нет | нет |
| `packages/feature-flags-server/package.json` | `SHA_REQUIRED` | `a750b637068c625d` | нет | нет |
| `packages/feature-flags-server/src/appFeatureFlagsService.ts` | `SHA_REQUIRED` | `e2e428e7da75b097` | нет | нет |
| `packages/subscription-payment-server/src/appleJws.archqa.acceptance.test.ts` | `SHA_REQUIRED` | `ded3f87dd10a7493` | нет | нет |
| `packages/subscription-payment-server/src/appleJws.archqa.acceptance.ts` | `SHA_REQUIRED` | `4103ce29a6656c64` | нет | нет |
| `packages/types/src/contracts/mobileReleaseErrors.ts` | `SHA_REQUIRED` | `33902af423bd13d1` | нет | нет |
| `packages/types/src/index.ts` | `SHA_REQUIRED` | `a78c60d0e3634d2d` | нет | нет |
| `packages/worker/src/composition/app-subscription-payment.ts` | `SHA_REQUIRED` | `0283325a2e079dbb` | нет | нет |
| `packages/worker/src/cron-scheduler.test.ts` | `SHA_REQUIRED` | `ac3ef75d316c8448` | нет | нет |
| `packages/worker/src/cron-scheduler.ts` | `SHA_REQUIRED` | `44e38f79fd9382cc` | нет | нет |
| `packages/worker/src/g1-consultation-outbox-core-cron-crossmodule.mock.test.ts` | `SHA_REQUIRED` | `9659a9ee16f87094` | нет | нет |
| `pnpm-lock.yaml` | `REGENERATE_APPROVED_LOCK` | `f131a5960bfffbb2` | да | нет |
| `scripts/check-core-server-boundary.mjs` | `SHA_REQUIRED` | `c4a4f84c9f14d5d2` | нет | нет |
| `docs/audit/gafus-agent-1-to-agent-2-payment-composition-20261112.md` | `EXCLUDE_AUDIT_ONLY` | `7eac6efdfa51cc11` | нет | нет |
| `docs/audit/gafus-agent-1-to-agent-2-payment-composition-20261112.json` | `EXCLUDE_AUDIT_ONLY` | `87d0fbedf7ab2692` | нет | нет |
| `docs/audit/gafus-agent-1-to-agent-2-reminder-review-ports-20261112.md` | `EXCLUDE_AUDIT_ONLY` | `952bc9f068920529` | нет | нет |
| `docs/audit/gafus-agent-1-to-agent-2-reminder-review-ports-20261112.json` | `EXCLUDE_AUDIT_ONLY` | `44405745affa7196` | нет | нет |
| `docs/audit/gafus-agent-1-to-agent-2-featureflags-subscription-ports-20261112.md` | `EXCLUDE_AUDIT_ONLY` | `f5ab4ab0012ddc2d` | нет | нет |
| `docs/audit/gafus-agent-1-to-agent-2-featureflags-subscription-ports-20261112.json` | `EXCLUDE_AUDIT_ONLY` | `f3f19b3543366102` | нет | нет |

Принцип приёмки: каждый новый A1 путь должен иметь SHA в последнем манифесте или явный audit-only exclusion; источники и поле `newlyDirtyPaths` сравниваются механически. **Прежний payment-only preflight не достаточен:** нужен `gafus-agents-integration-preflight-policy-20261112-r37.json`, который требует ещё 7+26 записи и блокирует любую интеграцию без окончательного A1 реестра.


**P0 решение:** сначала `schema.prisma`, `pnpm-lock.yaml`, API operation-observability, logger telemetry, Prometheus config и alerts; это нельзя разрешать выбором `ours/theirs` для файла целиком. Для `pnpm-lock.yaml` пересчитать от согласованного набора package manifests, не копировать A1/A3/A2 слепо.

## 5 delete-vs-present: выбрать A1-архитектурную границу, но проверить контракт

| Приоритет | Файл | Состояние сторон | Рекомендуемый источник | Проверка |
|---|---|---|---|---|
| P0 | `packages/core/src/services/accountCleanup/index.ts` | A1 есть, A3 отсутствует | A1-keep-until-entrypoint-verified | pnpm check:core-boundaries; pnpm --filter @gafus/core typecheck; pnpm --filter @gafus/api typecheck; targeted owner/ACL/rollback test |
| P0 | `packages/core/src/services/consultation/bookingService.ts` | A1 отсутствует, A3 есть | A1-deletion-with-port-verification | pnpm check:core-boundaries; pnpm --filter @gafus/core typecheck; pnpm --filter @gafus/api typecheck; targeted owner/ACL/rollback test |
| P0 | `packages/core/src/services/consultation/slotService.ts` | A1 отсутствует, A3 есть | A1-deletion-with-port-verification | pnpm check:core-boundaries; pnpm --filter @gafus/core typecheck; pnpm --filter @gafus/api typecheck; targeted owner/ACL/rollback test |
| P0 | `packages/core/src/services/dailyCourse/dailyCourseService.ts` | A1 отсутствует, A3 есть | A1-deletion-with-port-verification | pnpm check:core-boundaries; pnpm --filter @gafus/core typecheck; pnpm --filter @gafus/api typecheck; targeted owner/ACL/rollback test |
| P0 | `packages/core/src/services/user/userProgressService.ts` | A1 отсутствует, A3 есть | A1-deletion-with-port-verification | pnpm check:core-boundaries; pnpm --filter @gafus/core typecheck; pnpm --filter @gafus/api typecheck; targeted owner/ACL/rollback test |

## 108 различных файлов: полный перечень с категорией/источником/проверкой

| Приоритет | Категория | Файл | Решение | Рекомендуемый источник | Проверка после переноса |
|---|---|---|---|---|---|
| P0 | `consultation/transactions` | `apps/api/src/modules/consultations/application/list-cynologists.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-hunk-review` | Core bookingService + slotService + moderator deny tests; API consultations mounted; isolated PG transaction/CAS |
| P0 | `consultation/transactions` | `apps/api/src/modules/consultations/composition/catalog-schedule.ts` | РУЧНО: оба файла появились без базового Git-объекта | `A1-baseline-with-A3-hunk-review` | Core bookingService + slotService + moderator deny tests; API consultations mounted; isolated PG transaction/CAS |
| P0 | `consultation/transactions` | `apps/api/src/modules/consultations/composition/list-cynologists.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-hunk-review` | Core bookingService + slotService + moderator deny tests; API consultations mounted; isolated PG transaction/CAS |
| P0 | `consultation/transactions` | `apps/api/src/routes/v1/admin-consultation-schedules.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-hunk-review` | Core bookingService + slotService + moderator deny tests; API consultations mounted; isolated PG transaction/CAS |
| P0 | `consultation/transactions` | `apps/api/src/routes/v1/consultations.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-hunk-review` | Core bookingService + slotService + moderator deny tests; API consultations mounted; isolated PG transaction/CAS |
| P0 | `consultation/transactions` | `packages/consultation-server/package.json` | АВТО: A1 совпадает с финальной SHA A3; не копировать старый A3 | `A1-with-verified-A3-final-file` | Core bookingService + slotService + moderator deny tests; API consultations mounted; isolated PG transaction/CAS |
| P0 | `consultation/transactions` | `packages/consultation-write-server/src/service.ts` | РУЧНО: оба файла появились без базового Git-объекта | `A1-baseline-with-A3-hunk-review` | Core bookingService + slotService + moderator deny tests; API consultations mounted; isolated PG transaction/CAS |
| P0 | `consultation/transactions` | `packages/core/src/services/consultation/bookingEligibility.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-hunk-review` | Core bookingService + slotService + moderator deny tests; API consultations mounted; isolated PG transaction/CAS |
| P0 | `consultation/transactions` | `packages/core/src/services/consultation/index.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-hunk-review` | Core bookingService + slotService + moderator deny tests; API consultations mounted; isolated PG transaction/CAS |
| P0 | `consultation/transactions` | `packages/core/src/services/consultation/types.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-hunk-review` | Core bookingService + slotService + moderator deny tests; API consultations mounted; isolated PG transaction/CAS |
| P0 | `consultation/transactions` | `scripts/qa/consultation-eligibility-isolated-pg.smoke.ts` | РУЧНО: оба файла появились без базового Git-объекта | `A1-baseline-with-A3-hunk-review` | Core bookingService + slotService + moderator deny tests; API consultations mounted; isolated PG transaction/CAS |
| P0 | `courses/progress` | `apps/api/src/modules/learner-daily/composition/day-and-step-commands.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-hunk-review` | Core dailyCourse/userCourse/userProgress + course-progress-server + API mounted/isolated PG |
| P0 | `courses/progress` | `apps/api/src/modules/learner-daily/composition/read-today-daily-course.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-hunk-review` | Core dailyCourse/userCourse/userProgress + course-progress-server + API mounted/isolated PG |
| P0 | `courses/progress` | `packages/core/src/services/dailyCourse/dailyCourseCleanupScope.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-hunk-review` | Core dailyCourse/userCourse/userProgress + course-progress-server + API mounted/isolated PG |
| P0 | `courses/progress` | `packages/course-progress-server/package.json` | РУЧНО: оба файла появились без базового Git-объекта | `A1-baseline-with-A3-hunk-review` | Core dailyCourse/userCourse/userProgress + course-progress-server + API mounted/isolated PG |
| P0 | `courses/progress` | `packages/course-progress-server/src/index.ts` | РУЧНО: оба файла появились без базового Git-объекта | `A1-baseline-with-A3-hunk-review` | Core dailyCourse/userCourse/userProgress + course-progress-server + API mounted/isolated PG |
| P0 | `dependency/schema` | `pnpm-lock.yaml` | РУЧНО: пересечение базовых hunks или критичный контракт | `regenerate-after-consensus` | pnpm install --frozen-lockfile; pnpm check:core-boundaries; pnpm typecheck |
| P0 | `security/boundaries` | `apps/api/src/middleware/error-handler.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-hunk-review` | pnpm check:core-boundaries; API dependency-architecture; error-handler tests; owner deny before SQL |
| P0 | `security/boundaries` | `scripts/check-architecture-layers.mjs` | РУЧНО: оба файла появились без базового Git-объекта | `A1-baseline-with-A3-hunk-review` | pnpm check:core-boundaries; API dependency-architecture; error-handler tests; owner deny before SQL |
| P0 | `security/boundaries` | `scripts/check-architecture-layers.test.mjs` | РУЧНО: оба файла появились без базового Git-объекта | `A1-baseline-with-A3-hunk-review` | pnpm check:core-boundaries; API dependency-architecture; error-handler tests; owner deny before SQL |
| P0 | `security/boundaries` | `scripts/check-core-server-facades.mjs` | РУЧНО: оба файла появились без базового Git-объекта | `A1-baseline-with-A3-hunk-review` | pnpm check:core-boundaries; API dependency-architecture; error-handler tests; owner deny before SQL |
| P0 | `security/boundaries` | `scripts/check-core-server-facades.test.mjs` | РУЧНО: оба файла появились без базового Git-объекта | `A1-baseline-with-A3-hunk-review` | pnpm check:core-boundaries; API dependency-architecture; error-handler tests; owner deny before SQL |
| P0 | `shared-contracts` | `packages/types/src/index.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-hunk-review` | pnpm --filter @gafus/types build; affected Core/API/Worker typecheck; DTO contract tests |
| P0 | `worker/cron` | `packages/worker/src/cron-scheduler.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A3-worker-with-A1-contract-review` | pnpm --filter @gafus/worker typecheck; cron/consultation reminder tests; A3 PG/Redis outbox |
| P0 | `worker/cron` | `packages/worker/tsconfig.json` | АВТО: A1 совпадает с финальной SHA A3; не копировать старый A3 | `A1-with-verified-A3-final-file` | pnpm --filter @gafus/worker typecheck; pnpm check:core-boundaries; consultation reminder/cron tests |
| P1 | `admin/routes` | `apps/api/src/routes/v1/admin-analytics.test.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-review` | pnpm --filter @gafus/api typecheck; admin mounted route/ACL real PG; admin-panel tests |
| P1 | `admin/routes` | `apps/api/src/routes/v1/admin-analytics.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-review` | pnpm --filter @gafus/api typecheck; admin mounted route/ACL real PG; admin-panel tests |
| P1 | `admin/routes` | `apps/api/src/routes/v1/admin-broadcasts.test.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-review` | pnpm --filter @gafus/api typecheck; admin mounted route/ACL real PG; admin-panel tests |
| P1 | `admin/routes` | `apps/api/src/routes/v1/admin-broadcasts.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-review` | pnpm --filter @gafus/api typecheck; admin mounted route/ACL real PG; admin-panel tests |
| P1 | `admin/routes` | `apps/api/src/routes/v1/admin-cache.test.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-review` | pnpm --filter @gafus/api typecheck; admin mounted route/ACL real PG; admin-panel tests |
| P1 | `admin/routes` | `apps/api/src/routes/v1/admin-cache.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-review` | pnpm --filter @gafus/api typecheck; admin mounted route/ACL real PG; admin-panel tests |
| P1 | `admin/routes` | `apps/api/src/routes/v1/admin-feature-flags.test.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-review` | pnpm --filter @gafus/api typecheck; admin mounted route/ACL real PG; admin-panel tests |
| P1 | `admin/routes` | `apps/api/src/routes/v1/admin-feature-flags.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-review` | pnpm --filter @gafus/api typecheck; admin mounted route/ACL real PG; admin-panel tests |
| P1 | `admin/routes` | `apps/api/src/routes/v1/admin-mail.test.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-review` | pnpm --filter @gafus/api typecheck; admin mounted route/ACL real PG; admin-panel tests |
| P1 | `admin/routes` | `apps/api/src/routes/v1/admin-mail.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-review` | pnpm --filter @gafus/api typecheck; admin mounted route/ACL real PG; admin-panel tests |
| P1 | `admin/routes` | `apps/api/src/routes/v1/admin-profit.test.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-review` | pnpm --filter @gafus/api typecheck; admin mounted route/ACL real PG; admin-panel tests |
| P1 | `admin/routes` | `apps/api/src/routes/v1/admin-profit.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-review` | pnpm --filter @gafus/api typecheck; admin mounted route/ACL real PG; admin-panel tests |
| P1 | `admin/routes` | `apps/api/src/routes/v1/admin-settings.test.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-review` | pnpm --filter @gafus/api typecheck; admin mounted route/ACL real PG; admin-panel tests |
| P1 | `admin/routes` | `apps/api/src/routes/v1/admin-settings.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-review` | pnpm --filter @gafus/api typecheck; admin mounted route/ACL real PG; admin-panel tests |
| P1 | `admin/routes` | `apps/api/src/routes/v1/admin-subscriptions.test.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-review` | pnpm --filter @gafus/api typecheck; admin mounted route/ACL real PG; admin-panel tests |
| P1 | `admin/routes` | `apps/api/src/routes/v1/admin-subscriptions.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-review` | pnpm --filter @gafus/api typecheck; admin mounted route/ACL real PG; admin-panel tests |
| P1 | `admin/routes` | `apps/api/src/routes/v1/admin-users.test.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-review` | pnpm --filter @gafus/api typecheck; admin mounted route/ACL real PG; admin-panel tests |
| P1 | `admin/routes` | `apps/api/src/routes/v1/admin-users.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-review` | pnpm --filter @gafus/api typecheck; admin mounted route/ACL real PG; admin-panel tests |
| P1 | `api/ports` | `apps/api/src/modules/operation-read-spans-extra.contract.test.ts` | РУЧНО: оба файла появились без базового Git-объекта | `A1-baseline-with-A3-hunk-review` | affected package typecheck/build + targeted test; final 33/5/18 on one candidate |
| P1 | `api/ports` | `apps/api/src/modules/operation-read-spans.contract.test.ts` | РУЧНО: оба файла появились без базового Git-объекта | `A1-baseline-with-A3-hunk-review` | affected package typecheck/build + targeted test; final 33/5/18 on one candidate |
| P1 | `api/ports` | `apps/api/src/modules/operation-write-spans.contract.test.ts` | РУЧНО: оба файла появились без базового Git-объекта | `A1-baseline-with-A3-hunk-review` | affected package typecheck/build + targeted test; final 33/5/18 on one candidate |
| P1 | `api/ports` | `apps/api/src/modules/trainer-daily/composition/read-trainer-daily.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-hunk-review` | affected package typecheck/build + targeted test; final 33/5/18 on one candidate |
| P1 | `api/ports` | `apps/api/src/routes/v1/app-subscription.route.test.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-hunk-review` | affected package typecheck/build + targeted test; final 33/5/18 on one candidate |
| P1 | `api/ports` | `apps/api/src/routes/v1/app-subscription.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-hunk-review` | affected package typecheck/build + targeted test; final 33/5/18 on one candidate |
| P1 | `api/ports` | `apps/api/src/routes/v1/exam.read-result.application.contract.test.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-hunk-review` | affected package typecheck/build + targeted test; final 33/5/18 on one candidate |
| P1 | `api/ports` | `apps/api/src/routes/v1/exam.route.test.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-hunk-review` | affected package typecheck/build + targeted test; final 33/5/18 on one candidate |
| P1 | `api/ports` | `apps/api/src/routes/v1/exam.submit-application.contract.test.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-hunk-review` | affected package typecheck/build + targeted test; final 33/5/18 on one candidate |
| P1 | `api/ports` | `apps/api/src/routes/v1/exam.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-hunk-review` | affected package typecheck/build + targeted test; final 33/5/18 on one candidate |
| P1 | `api/ports` | `apps/api/src/routes/v1/g1-ag3-offline-progress-prevention.contract.test.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-hunk-review` | affected package typecheck/build + targeted test; final 33/5/18 on one candidate |
| P1 | `api/ports` | `apps/api/src/routes/v1/g1-diary-get-real-pg.mounted.test.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-hunk-review` | affected package typecheck/build + targeted test; final 33/5/18 on one candidate |
| P1 | `api/ports` | `apps/api/src/routes/v1/g1-exam-private-contract.test.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-hunk-review` | affected package typecheck/build + targeted test; final 33/5/18 on one candidate |
| P1 | `api/ports` | `apps/api/src/routes/v1/g1-off021-postcommit-ack-boundary.test.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-hunk-review` | affected package typecheck/build + targeted test; final 33/5/18 on one candidate |
| P1 | `api/ports` | `apps/api/src/routes/v1/g1-panel-staff-dto.contract.test.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-hunk-review` | affected package typecheck/build + targeted test; final 33/5/18 on one candidate |
| P1 | `api/ports` | `apps/api/src/routes/v1/g1-reminder-create-lookup.review.test.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-hunk-review` | affected package typecheck/build + targeted test; final 33/5/18 on one candidate |
| P1 | `api/ports` | `apps/api/src/routes/v1/g1-survey-private-contract.test.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-hunk-review` | affected package typecheck/build + targeted test; final 33/5/18 on one candidate |
| P1 | `api/ports` | `apps/api/src/routes/v1/training.route.test.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-hunk-review` | affected package typecheck/build + targeted test; final 33/5/18 on one candidate |
| P1 | `api/ports` | `apps/api/src/routes/v1/training.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-hunk-review` | affected package typecheck/build + targeted test; final 33/5/18 on one candidate |
| P1 | `api/ports` | `apps/api/src/routes/v1/training.validation.test.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-hunk-review` | affected package typecheck/build + targeted test; final 33/5/18 on one candidate |
| P1 | `api/ports` | `apps/api/src/routes/v1/user.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-hunk-review` | affected package typecheck/build + targeted test; final 33/5/18 on one candidate |
| P1 | `api/ports` | `apps/api/vitest.config.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-hunk-review` | affected package typecheck/build + targeted test; final 33/5/18 on one candidate |
| P1 | `consultation/transactions` | `apps/api/src/routes/v1/admin-consultation-schedules.test.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-hunk-review` | Core bookingService + slotService + moderator deny tests; API consultations mounted; isolated PG transaction/CAS |
| P1 | `consultation/transactions` | `apps/api/src/routes/v1/consultations.route.test.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-hunk-review` | Core bookingService + slotService + moderator deny tests; API consultations mounted; isolated PG transaction/CAS |
| P1 | `consultation/transactions` | `apps/api/src/routes/v1/g1-ag1-001-consultation-catalog.actual-core.mounted.test.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-hunk-review` | Core bookingService + slotService + moderator deny tests; API consultations mounted; isolated PG transaction/CAS |
| P1 | `consultation/transactions` | `apps/api/src/routes/v1/g1-consultations.contract.test.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-hunk-review` | Core bookingService + slotService + moderator deny tests; API consultations mounted; isolated PG transaction/CAS |
| P1 | `consultation/transactions` | `apps/api/src/routes/v1/g1-p0-ag2-consultations.contract.test.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-hunk-review` | Core bookingService + slotService + moderator deny tests; API consultations mounted; isolated PG transaction/CAS |
| P1 | `consultation/transactions` | `packages/core/src/services/consultation/admin5ScheduleRealPG.integration.test.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-hunk-review` | Core bookingService + slotService + moderator deny tests; API consultations mounted; isolated PG transaction/CAS |
| P1 | `consultation/transactions` | `packages/core/src/services/consultation/bookingLimits.integration.test.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-hunk-review` | Core bookingService + slotService + moderator deny tests; API consultations mounted; isolated PG transaction/CAS |
| P1 | `consultation/transactions` | `packages/core/src/services/consultation/bookingService.test.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-hunk-review` | Core bookingService + slotService + moderator deny tests; API consultations mounted; isolated PG transaction/CAS |
| P1 | `consultation/transactions` | `packages/core/src/services/consultation/g1-consultation-mail-enqueue-recovery.test.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-hunk-review` | Core bookingService + slotService + moderator deny tests; API consultations mounted; isolated PG transaction/CAS |
| P1 | `consultation/transactions` | `packages/core/src/services/consultation/g1-moderator-core-deny.test.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-hunk-review` | Core bookingService + slotService + moderator deny tests; API consultations mounted; isolated PG transaction/CAS |
| P1 | `consultation/transactions` | `packages/core/src/services/consultation/g1BookingRealPG.integration.test.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-hunk-review` | Core bookingService + slotService + moderator deny tests; API consultations mounted; isolated PG transaction/CAS |
| P1 | `consultation/transactions` | `packages/core/src/services/consultation/trainerTransitionsWorkRealPg20261027.test.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-hunk-review` | Core bookingService + slotService + moderator deny tests; API consultations mounted; isolated PG transaction/CAS |
| P1 | `consultation/transactions` | `packages/worker/src/g1-consultation-outbox-core-cron-crossmodule.mock.test.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-hunk-review` | Core bookingService + slotService + moderator deny tests; API consultations mounted; isolated PG transaction/CAS |
| P1 | `core/policy` | `packages/core/src/services/accountCleanup/enqueue.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-hunk-review` | affected package typecheck/build + targeted test; final 33/5/18 on one candidate |
| P1 | `core/policy` | `packages/core/src/services/adminUser/adminUserService.test.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-hunk-review` | affected package typecheck/build + targeted test; final 33/5/18 on one candidate |
| P1 | `core/policy` | `packages/core/src/services/adminUser/adminUserService.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-hunk-review` | affected package typecheck/build + targeted test; final 33/5/18 on one candidate |
| P1 | `core/policy` | `packages/core/src/services/appSubscription/__tests__/paymentService.test.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-hunk-review` | affected package typecheck/build + targeted test; final 33/5/18 on one candidate |
| P1 | `core/policy` | `packages/core/src/services/appSubscription/index.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-hunk-review` | affected package typecheck/build + targeted test; final 33/5/18 on one candidate |
| P1 | `core/policy` | `packages/core/src/services/appSubscription/paymentService.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-hunk-review` | affected package typecheck/build + targeted test; final 33/5/18 on one candidate |
| P1 | `core/policy` | `packages/core/src/services/course/index.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-hunk-review` | affected package typecheck/build + targeted test; final 33/5/18 on one candidate |
| P1 | `core/policy` | `packages/core/src/services/feed/index.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-hunk-review` | affected package typecheck/build + targeted test; final 33/5/18 on one candidate |
| P1 | `core/policy` | `packages/core/src/services/gafus/g1-offline-training-reward-boundary.test.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-hunk-review` | affected package typecheck/build + targeted test; final 33/5/18 on one candidate |
| P1 | `core/policy` | `packages/core/src/services/gafus/types.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-hunk-review` | affected package typecheck/build + targeted test; final 33/5/18 on one candidate |
| P1 | `core/policy` | `packages/core/src/services/gafus/walletService.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-hunk-review` | affected package typecheck/build + targeted test; final 33/5/18 on one candidate |
| P1 | `core/policy` | `packages/core/src/services/reminders/g1ReminderCreateIdempotency.review.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-hunk-review` | affected package typecheck/build + targeted test; final 33/5/18 on one candidate |
| P1 | `core/policy` | `packages/core/src/services/rewardedCredits/accessService.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-hunk-review` | affected package typecheck/build + targeted test; final 33/5/18 on one candidate |
| P1 | `core/policy` | `packages/core/src/services/rewardedCredits/gafusInterop.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-hunk-review` | affected package typecheck/build + targeted test; final 33/5/18 on one candidate |
| P1 | `core/policy` | `packages/core/src/services/trainerCourse/index.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-hunk-review` | affected package typecheck/build + targeted test; final 33/5/18 on one candidate |
| P1 | `core/policy` | `packages/core/src/services/trainerCourse/trainerCourseNameOnlyService.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-hunk-review` | affected package typecheck/build + targeted test; final 33/5/18 on one candidate |
| P1 | `core/policy` | `packages/core/src/services/user/deleteUserAccount.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-hunk-review` | affected package typecheck/build + targeted test; final 33/5/18 on one candidate |
| P1 | `core/policy` | `packages/core/src/services/user/index.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-hunk-review` | affected package typecheck/build + targeted test; final 33/5/18 on one candidate |
| P1 | `core/policy` | `packages/core/src/services/user/userCourseService.ports.test.ts` | РУЧНО: оба файла появились без базового Git-объекта | `A1-baseline-with-A3-hunk-review` | affected package typecheck/build + targeted test; final 33/5/18 on one candidate |
| P1 | `core/policy` | `packages/core/src/services/user/userCourseService.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-hunk-review` | affected package typecheck/build + targeted test; final 33/5/18 on one candidate |
| P1 | `package/exports` | `packages/core/package.json` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-review` | affected package typecheck/build + targeted test; final 33/5/18 on one candidate |
| P1 | `security/boundaries` | `apps/api/src/modules/architecture/dependency-architecture.test.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-hunk-review` | pnpm check:core-boundaries; API dependency-architecture; error-handler tests; owner deny before SQL |
| P1 | `security/boundaries` | `apps/api/src/routes/v1/g1-moderator-staff-policy.route.test.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A1-baseline-with-A3-hunk-review` | pnpm check:core-boundaries; API dependency-architecture; error-handler tests; owner deny before SQL |
| P1 | `worker/cron` | `packages/worker/src/cron-scheduler.test.ts` | РУЧНО: пересечение базовых hunks или критичный контракт | `A3-worker-with-A1-contract-review` | pnpm --filter @gafus/worker typecheck; cron/consultation reminder tests; A3 PG/Redis outbox |
| P2 | `audit/evidence` | `docs/audit/core-server-adapter-risk-inventory-20261111.md` | РУЧНО: оба файла появились без базового Git-объекта | `A1-evidence-source` | verify SHA/run IDs, no unsupported PASS; baseline lock and frozen risk inventory |
| P2 | `audit/evidence` | `docs/audit/core-server-bulk-progress-20261111.md` | РУЧНО: оба файла появились без базового Git-объекта | `A1-evidence-source` | verify SHA/run IDs, no unsupported PASS; baseline lock and frozen risk inventory |
| P2 | `audit/evidence` | `docs/audit/core-server-facade-baseline.json` | РУЧНО: оба файла появились без базового Git-объекта | `A1-evidence-source` | verify SHA/run IDs, no unsupported PASS; baseline lock and frozen risk inventory |
| P2 | `audit/evidence` | `docs/audit/gafus-agent-3-implementation-receipt-20261111.md` | АВТО: A1 совпадает с финальной SHA A3; не копировать старый A3 | `A1-with-verified-A3-final-file` | verify SHA/run IDs, no unsupported PASS; baseline lock and frozen risk inventory |
| P2 | `qa/scripts` | `scripts/qa/account-cleanup-snapshot-isolated-pg.smoke.ts` | АВТО: A1 совпадает с финальной SHA A3; не копировать старый A3 | `A1-with-verified-A3-final-file` | bash scripts/qa/account-cleanup-snapshot-isolated-pg.sh; owner rollback/lease/foreign scope |
| P2 | `qa/scripts` | `scripts/qa/web-vite-chunked-regression.mjs` | РУЧНО: оба файла появились без базового Git-объекта | `A1-baseline-with-A3-review` | bash -n (shell) / node --check (JS); affected isolated smoke; no external resources |

## Окончательное условие принятия

Эта матрица — **проект для будущего разрешённого локального объединения**. После появления финального манифеста агента 1 повторить `python3 scripts/qa/architecture-integration-inventory.py` и `python3 scripts/qa/architecture-integration-triage.py`, проверить `sourceSnapshotConsistentWithInventory=true`, затем повторно сгенерировать матрицу. Сохранять A1 ACL/ports/transactions, A3 worker/outbox/fencing и A2 метрики. До подтверждения внешних проверок Cloud.ru/Beget/OTLP/Alertmanager/нагрузка остаются `PENDING`.


## P0 pnpm-lock.yaml — решение без перезаписи файла

Запрещён whole-file overwrite A1 lock устаревшим committed A2 (`8bd2ad9028d5361daefa25846e2ac402287270d7fa161c8396a77c170f30ef0c`). В минимальной изолированной копии всех 70 workspace manifests + patches регенерация `pnpm@10.12.4 --lockfile-only --offline --ignore-scripts` дала SHA `f131a5960bfffbb2dd894d23ee1e0820884fce6188798ba989eab7743e48524e` — **точное совпадение с A1 snapshot**, 0 diff. Сохранены все A2 logger OTLP 5 и A1 Android/Expo/RN patches. 1292 declarative checks PASS, Prisma schema validate + `metrics`, local OTLP 12 PASS, workspace graph 69/0. Новый provisional policy `gafus-agents-integration-preflight-policy-20261112-r37-lock-verified.json` с закреплённым evidence SHA, **approvedCandidateSha256 всё ещё пуст**. Полный логический план в `gafus-agents-integration-lockfile-r37-20261112.md`.


## A1 recovery checkpoint: 17 remaining — 12.11.2026, 09:58

Последний подтверждённый **промежуточный** реестр: **41 → 17**, устранено 24, new forbidden 0; 23 A1 source-манифеста / 276 file entries / **183 уникальных paths**, включая recovery AG4 review порт 16 файлов (16/16 SHA совпали). Новый источник истины по матрице: `docs/audit/gafus-agents-integration-a1-r17-matrix-20261112.tsv` и визуальная пофайловая `docs/audit/gafus-agents-integration-a1-r17-matrix-20261112.md`. Полный versioned coverage: `docs/audit/gafus-agents-integration-a1-r17-coverage-20261112.json`, исходный checkpoint `gafus-agent-1-recovery-verified-checkpoint-20261112.md`.

Статусы по 183 source paths: **180 exact SHA**, **1 `REGENERATE_APPROVED_LOCK`** (`pnpm-lock.yaml`), **2 audit-only excluded**; ещё **47 companion audit JSON/Markdown/recovery note** с закреплёнными SHA исключены из runtime. Пересечения с четырьмя committed A2, 39 путей: **только `pnpm-lock.yaml`**; с A3 final-39 **0**. Общие `apps/api/src/app.ts`, `scripts/check-core-server-boundary.mjs`, Core/types package manifests по-прежнему ручной semantic reconciliation; A2 telemetry и A3 Worker/Prisma contract должны сохраняться при финальном merge.

**Preflight актуален:** `docs/audit/gafus-agents-integration-preflight-policy-20261112-r17.json` — source SHA всех 23 manifests и 183 файлов, source git dirty-path-set SHA, 47 companion SHA, P0 A2, A3 final39, protected Prisma metrics, stale A2 lock guard; `readyForIntegration=false`, final architecture SHA и approved combined lock SHA отсутствуют. После закрепления snapshot A1 уже перешёл к следующему offline-video кластеру: новые незаманифестированные файлы делают текущий live source-git-set контроль FAIL (правильно), хотя 183/183 зафиксированных SHA остаются PASS. **Нельзя объявлять весь A1 GREEN/merge-ready до нового полного финального receipt.**

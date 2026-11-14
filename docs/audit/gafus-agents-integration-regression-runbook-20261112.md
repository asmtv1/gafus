# GAFUS — точные команды будущей единой локальной регрессии

**Применять только после отдельного разрешения на создание/наполнение изолированного интеграционного worktree, после A1 final manifest, фиксации исходного набора файлов и проверки ≥15 GiB свободного места.** Пока нельзя переносить файлы, делать commit/merge/push и запускать forced build в общем активно меняющемся `main`. Ни один приведённый ниже полный прогон здесь не запускался. Все команды используют локальный McpGo-Terminal1 и не обращаются к production.

## 0. Подготовка: один отдельный интеграционный каталог

Не использовать `gafus-refactor` (`main`), `gafus-agent3-worker` или `gafus-agent2-observability` как финальную мишень сборки. **Путь `INTEGRATION_DIR` определить только после разрешения; этот документ не создаёт ветку/каталог.** Новые идентификаторы прогонов не должны повторять старые, чтобы не перезаписать квитанции.

```bash
export INTEGRATION_DIR=/ABSOLUTE/PATH/TO/APPROVED/INTEGRATION/WORKTREE
cd "$INTEGRATION_DIR"
pwd -P
git branch --show-current
git rev-parse HEAD
git status --short
# Здесь убедиться, что source fingerprint отражает СОГЛАСОВАННЫЙ пакет A1+A3+A2.
df -h .
```

До frozen candidate повторить сканирование A1/A3/A2 **в отдельном каталоге агента 2** (это только чтение исходников и запись локальных JSON/Markdown):

```bash
cd /Users/asmtv1/Desktop/gafus-agent2-observability
python3 scripts/qa/architecture-integration-inventory.py
python3 scripts/qa/architecture-integration-triage.py
python3 scripts/qa/architecture-integration-render.py
# Проверить флаг sourceSnapshotConsistentWithInventory=true.
```

## 1. Structural gates + targeted проверки после ОДНОЙ логической пачки правок

Исполнять в **утверждённом отдельном интеграционном worktree**, не между каждой парой hunks:

```bash
cd "$INTEGRATION_DIR"
git diff --check -- . ':!patches/react-native-compressor@1.16.0.patch'
pnpm check:core-boundaries
node scripts/check-workspace-graph.mjs
node --test ci-cd/scripts/release-graph.contract.test.mjs ci-cd/scripts/workspace-dependency-graph.contract.test.mjs
pnpm --filter @gafus/prisma prisma:generate
pnpm --filter @gafus/prisma typecheck
pnpm --filter @gafus/logger build
pnpm --filter @gafus/core typecheck
pnpm --filter @gafus/api typecheck
pnpm --filter @gafus/worker typecheck
pnpm --filter @gafus/core exec vitest run \
  src/services/consultation/bookingService.test.ts \
  src/services/consultation/slotService.test.ts \
  src/services/consultation/g1-moderator-core-deny.test.ts --reporter=dot
pnpm --filter @gafus/api exec vitest run \
  src/modules/architecture/dependency-architecture.test.ts --reporter=dot
pnpm --filter @gafus/web-vite exec vitest run \
  src/shared/auth/PrincipalIsolation.test.tsx \
  src/shared/auth/VkConsentWeb.test.tsx --reporter=dot
```

Если в этих gates FAIL (особенно consultation error class identity/rollback, Core→server ratchet, Web Suspense), сначала править соответствующий port/composition/тест на текущем snapshot; **не запускать полный 40-минутный прогон на заведомо красном кандидате.** Не расширять baseline исключениями.

## 2. Сквозной локальный acceptance одного frozen source snapshot

Удобный shell runner `scripts/qa/architecture-integration-regression.sh` выполняет все следующие локальные блоки по порядку: structural/typecheck/targeted, A2 12 gates, A3 16 media gates, A2 2 API + 2 Worker/PG/Redis real local, затем **одну** 33-stage и **одну** 5-chaos suite; записывает результаты и проверяет, что source fingerprint не изменился. Он **отказывается работать** в рабочих каталогах трёх агентов, с DB/Redis URL из env, без `GAFUS_INTEGRATION_TESTS_APPROVED=1`, при диске ниже выбранного резерва и при повторном RUN_ID.

```bash
cd "$INTEGRATION_DIR"
export GAFUS_INTEGRATION_TESTS_APPROVED=1
export GAFUS_MIN_FREE_GIB=15
bash scripts/qa/architecture-integration-regression.sh int-20261112-r1
```

Эквивалентные тяжёлые команды для адресного запуска и проверки логов (не запускать вторично, если уже выполнены runner-ом):

```bash
A2_OBS_WITH_DB_RESTORE=1 A2_OBS_WITH_OTEL_BENCH=1 bash scripts/qa/observability-agent2-local-gates.sh
bash scripts/qa/observability-real-multi-instance-isolated.sh
bash scripts/qa/a3-jobs-media-isolated-acceptance.sh a3-int-20261112-r1
bash scripts/qa/architecture-final-regression.sh int-20261112-r1
bash scripts/qa/architecture-chaos-local.sh int-20261112-r1
```

Проверить **реальные exit codes**, а не строки `START`:

```bash
cat "$HOME/Library/Logs/gafus-refactor-regression/int-20261112-r1/results.tsv"
cat "$HOME/Library/Logs/gafus-refactor-regression/int-20261112-r1/chaos-results.tsv"
cat "$HOME/Library/Logs/gafus-refactor-regression/int-20261112-r1/integration-final-results.tsv"
```

Обязательный итог: 33/33, 5/5, A3 16/16, A2 12/12 на **одном устойчивом наборе файлов**; для 18 сценариев отдельно дать таблицу evidence и непустые ссылки на source SHA, test IDs и логи. `SKIP_LOW_DISK`, таймаут, отсутствие Web chunk, fails API/Core или свежий source fingerprint mismatch исключают финальный PASS.

## 3. Производительность и Cloud.ru/CDN — отдельные приёмки

- Предыдущие пиковые дельты p95 на локальном Mac: **−7,99%, +47,37% (FAIL), +16,49%**. Локальный `/ready` two-instance **не сравнивает old/new релиз**, не нагружает настоящие Chat ACL и 360p, и **не подтверждает** порог +20% на выделенном стенде. Runner намеренно записывает локальный load FAIL и продолжает функциональные gates, но возвращает **ненулевой финальный код**, а не ложный PASS.
- Official `promtool test rules` новых fixtures и Alertmanager firing/resolved c реальным тестовым получателем, searchable deployed OTLP и исторические operationId, настоящий Cloud.ru dedicated-test 360p, nonprod Beget CDN ACL/Range/403/404/307, два кандидата для A/B, 10→25→50→100% staging canary/rollback и RPO/RTO на восстановленном стенде — **PENDING до подтверждённого доступа и отдельного разрешения**. Не запускать `--run` против prod Cloud.ru/Beget service IDs.
- Даже зелёная общая локальная регрессия означает только **`LOCAL_ACCEPTED / STAGING_PENDING`**, не разрешение на deploy или merge в `main`.

## 4. Этап завершения A1

`core-server-bulk-v24/results.tsv` к моменту новой сверки показывает **33/33 PASS** (последняя запись 12.11, 03:42), но **финального манифеста текущей группы с source fingerprint и обновлённым Core→server ratchet ещё не обнаружено**. Это ограничение продолжает действовать: не объявлять A1 завершённым по одному `results.tsv`. Финальный манифест → повторный inventory → обновление матрицы → только после отдельного разрешения будущая интеграция.

## 5. Платёжная группа A1 (18 файлов): порядок переноса и точные проверки

**Промежуточный манифест, не финальный A1:** `docs/audit/gafus-agent-1-to-agent-2-payment-composition-20261112.json` (в общем каталоге A1), из которого в A2 построен `docs/audit/gafus-agents-integration-payment-overlay-20261112.json` и TSV. На момент сканирования все 18 итоговых SHA совпадают с A1; 13 M, 4 A, 1 D. Это **не разрешение переносить файлы сейчас**. У 18 файлов **0 прямых пересечений** с P0/всеми 16 committed A2 и с 39 файлами финального handoff A3. Но у группы **8 косвенных точек совместимости** — 6 P0 A2 и 2 A3 shared files; каждую проверять отдельно.

### Только после завершения полного архитектурного реестра A1 и разрешения на локальную интеграцию

1. **Источники + SHA.** Проверить свежую идентичность каждого из 18 путей манифесту; если хотя бы один изменился, новая сверка owner diff обязательна. Prechange backup manifest содержит 11 проверенных SHA; до-снимки `appleJws.archqa.acceptance.ts`, `admin-users.ts`, `admin-users.test.ts` в его перечне отсутствуют. Не считать их полным verified rollback исходной пачки.
2. **Core/Server атомарно.** Сохранить удаление `packages/core/src/services/appSubscription/appleJws.archqa.acceptance.ts`; перестроить `paymentService.ts` и `index.ts` как domain-only без runtime server import; добавить Apple JWS/CA fixture+test в `subscription-payment-server`; вместе перенести Core unit/realpg fixtures и серверный test-only entrypoint. Не расширять Core→server ratchet. Контроль `pnpm check:core-boundaries`, `node scripts/check-core-server-facades.mjs`, Core **50** и сервер JWS **5** тестов.
3. **API composition + все Hono вызовы.** Добавить `apps/api/src/modules/app-subscription/composition/payment-transitions.ts` и обновить `app-subscription.ts`, `payment-provider-webhooks.ts`, `admin-users.ts` с их тестами. Сохранить webhook IP/signature проверку и идемпотентность receipt, роль администратора и owner ACL, Apple receipt/JWS sandbox separation. Тесты API/архитектуры **134**.
4. **Worker composition + cron.** Добавить `packages/worker/src/composition/app-subscription-payment.ts`, только затем перенести платежные вызовы из `cron-scheduler.ts` и обе cron suite. **Не перетирать A3** `packages/worker/tsconfig.json`: A3 final shared SHA уже совпадает с общим A1, включая mapping `@gafus/consultation-server/booking-application`. Не терять consultation reminder/Email outbox и A3 Worker lease/retry/DLQ. Worker cron **13**, A3 media **16** тестов, затем typecheck Worker.
5. **P0 A2 `schema.prisma` — после согласования всех моделей Core/Worker, перед `prisma:generate`.** Содержимое текущей схемы A1 (AppSubscription, Payment, Promo, Event, Refund, `QuestionLegacyPhotoDeletion`, `Chat2OutboxEvent` и другие модели) — **единственный модельный источник**. **Важное уточнение:** diff A1 против **committed** A2 содержит не только `previewFeatures = ["metrics"]`: в A2 committed отсутствует модель `QuestionLegacyPhotoDeletion` и пять полей Chat2 outbox: `claimToken`, `operationId`, `traceId`, `lastErrorCode`, `deadLetteredAt` (включая индекс по deadLetteredAt). При этом незафиксированный A2 *working tree* уже содержит A1 схему плюс metrics — **не** брать это как цельный источник. Сохранить все A1 модели, поля, индексы и миграции, добавить только `previewFeatures=["metrics"]` из A2, проверить отсутствие деструктивных DDL и совместимость старого/нового кода. Генерация/проверка Prisma — адресно, затем A2 настоящие pool-wait метрики на isolated PG.
6. **P0 A2 `pnpm-lock.yaml` — ПОСЛЕ всех `package.json`, patch-файлов и workspace exports, ПЕРЕД комплексной сборкой.** Источник — **перегенерация по окончательным зависимостям**, не lock от A1 и не lock от A2 целиком. Сравнение A1 vs A2 показывает, что в A2 старее: отсутствуют ссылки на `expo-modules-core@55.0.27`, `react-native-reanimated@4.2.1` и многие новые workspace-пакеты. В A1 существуют соответствующие `patches/*` и есть `@gafus/subscription-payment-server` workspace import. Сохранить эти записи, а также A2 зависимость OTel/logger и согласовать приёмку patch hashes. `pnpm install --lockfile-only --ignore-scripts` только в **разрешённом integration worktree**, затем `pnpm install --frozen-lockfile` как контроль. Старый RN compressor patch имеет известный намеренный whitespace в диффе — не переписывать его автоматически.
7. **Оставшиеся P0 A2 (operation-observability/serverTelemetry/Alloy/alerts)** — интегрировать после API и Worker: проверка trace correlation `operationId` между payment API/Worker, fail-open OTLP, **без логирования Apple JWS/YooKassa секретов и payment payload**. Alloy labels только ограниченные; DLQ/360p alerting не менять из-за платёжного cron. A2 12 локальных gates; настоящий alert recipient/Cloud/CDN остаётся PENDING.
8. **Проверка одной логической пачки, а не полный regression по одному файлу.** После завершения портов и composition выполнить команды ниже, затем на замороженном общем SHA — **один** 33-gate и **один** 5-chaos прогон и отдельную матрицу 18 сценариев. Платёжные провайдеры YooKassa/Apple sandbox и guarded real-PG payment concurrency/rollback — отдельно после безопасного nonprod approval.

### Адресные команды A1 payment (будущий утверждённый integration worktree)

```bash
cd "$INTEGRATION_DIR"
pnpm check:core-boundaries
node scripts/check-core-server-facades.mjs
node scripts/check-workspace-graph.mjs
pnpm --filter @gafus/subscription-payment-server typecheck
pnpm --filter @gafus/core typecheck
pnpm --filter @gafus/api typecheck
pnpm --filter @gafus/worker typecheck
pnpm --filter @gafus/core exec vitest run src/services/appSubscription/__tests__/paymentService.test.ts --config vitest.config.ts
pnpm --filter @gafus/subscription-payment-server test
pnpm --filter @gafus/api exec vitest run src/routes/v1/app-subscription.route.test.ts src/routes/v1/payment-provider-webhooks.test.ts src/routes/v1/admin-users.test.ts src/modules/architecture/dependency-architecture.test.ts --config vitest.config.ts
pnpm --filter @gafus/worker exec vitest run src/cron-scheduler.test.ts src/g1-consultation-outbox-core-cron-crossmodule.mock.test.ts --config vitest.config.ts
```

**Prisma P0:** после согласования моделей, перед запуском пакетов:

```bash
cd "$INTEGRATION_DIR"
grep -n 'previewFeatures = \["metrics"\]' packages/prisma/schema.prisma
grep -nE '^model AppSubscription|^model AppSubscriptionPayment|^model AppSubscriptionPromoCode|^model AppSubscriptionFinanceRefund' packages/prisma/schema.prisma
pnpm --filter @gafus/prisma prisma:generate
pnpm --filter @gafus/prisma typecheck
node --test ci-cd/docker/prometheus/health-monitoring.contract.test.mjs
# На выделенной одноразовой PostgreSQL: Chat2 outbox lease/fencing, Questions legacy
# photo cleanup, payment transaction/rollback, A2 real Prisma pool wait.
# Ресурсные DB/metrics проверки запускать только по правилам изолированного A2 local gates.
```

**Lockfile P0:** после подтверждённого состава final manifests и пакетов, **только после отдельного разрешения на изменение интеграционного каталога**:

```bash
cd "$INTEGRATION_DIR"
for p in patches/expo-modules-core@55.0.27.patch patches/react-native-reanimated@4.2.1.patch patches/react-native-compressor@1.16.0.patch; do test -f "$p" || exit 2; done
pnpm install --lockfile-only --ignore-scripts
pnpm install --frozen-lockfile
node scripts/check-workspace-graph.mjs
pnpm --filter @gafus/subscription-payment-server typecheck
pnpm --filter @gafus/api typecheck
pnpm --filter @gafus/worker typecheck
```

Отдельная пофайловая справка `gafus-agents-integration-payment-overlay-20261112.tsv` имеет **18 строк**, каждую со своими `minimum_commands`, `source`, SHA после, статусом удаления/добавления и косвенным уровнем совместимости. CLI для её обновления (сравнение только, не перенос):

```bash
cd /Users/asmtv1/Desktop/gafus-agent2-observability
python3 scripts/qa/architecture-integration-inventory.py
python3 scripts/qa/architecture-integration-triage.py
python3 scripts/qa/architecture-integration-payment.py
python3 scripts/qa/architecture-integration-render.py
```

Пока A1 не закончит полный реестр, **эти команды только обновляют handoff**. Положительные числа `50/134/13/5` относятся к исходной A1 платёжной пачке; все 33/5 после неё, real-PG concurrency, тестовые YooKassa/Apple credentials и release A/B **ещё не подтверждены**.

## 6. Обязательный механический preflight до полной локальной регрессии

Перед первым `pnpm`, Prisma generate, Turbo build или запуском общей 33/5-suite (только **в отдельно разрешённом кандидате**):

```bash
node scripts/qa/architecture-integration-preflight.mjs \
  --policy "$INTEGRATION_DIR/docs/audit/gafus-agents-integration-preflight-policy-20261112.json" \
  --candidate "$INTEGRATION_DIR"
```

В предварительно подготовленном runner `scripts/qa/architecture-integration-regression.sh` этот preflight теперь **первый gate**. Без pinned финального архитектурного реестра A1 и одобренного SHA итогового `pnpm-lock.yaml` он возвращает `BLOCKED` (код 2), не допуская принудительную сборку. На временной копии с искусственными fixtures выполнены 17 положительных/отрицательных сценариев, 17 PASS; их результаты не являются реальной интеграционной регрессией.

Подробное описание, исключение устаревшего committed A2 lock, SHA файлов, моделей Prisma, AppSubscription и Chat2 outbox — `docs/audit/gafus-agents-integration-preflight-20261112.md`. Обновлять политику только по отдельно утверждённому финальному манифесту A1 и новой копии, не изменяя активные рабочие деревья.

## 7. Последние A1 кластеры: reminder-review (39) → feature flags (38) → subscription-access (37)

**Манифесты в общем A1:** `gafus-agent-1-to-agent-2-reminder-review-ports-20261112.json` (7 записей) и `gafus-agent-1-to-agent-2-featureflags-subscription-ports-20261112.json` (26 записей). Все 49 уникальных путей трёх A1-групп учтены в новом `gafus-agents-integration-a1-r37-coverage-20261112.json` и TSV. Прежние 41→40 payment и 40→39 reminder, затем 39→38 flags и 38→37 subscription access: **4 resolved, 0 new**, финальный реестр **не завершён**.

Перед общей регрессией нужен read-only mechanical r37 preflight, а не старый payment-only:

```bash
node scripts/qa/architecture-integration-preflight.mjs \
  --policy "$INTEGRATION_DIR/docs/audit/gafus-agents-integration-preflight-policy-20261112-r37.json" \
  --candidate "$INTEGRATION_DIR"
```

Далее, **только в будущем разрешённом, фиксированном integration candidate**, выполнить локально целевые проверки в одной логической пачке, не после каждого файла:

```bash
cd "$INTEGRATION_DIR"
pnpm check:core-boundaries
node scripts/check-core-server-facades.mjs
node scripts/check-workspace-graph.mjs
pnpm --filter @gafus/types build
pnpm --filter @gafus/feature-flags-server typecheck
pnpm --filter @gafus/core typecheck
pnpm --filter @gafus/api typecheck
pnpm --filter @gafus/worker typecheck
pnpm --filter @gafus/core exec vitest run \
  src/services/appFeatureFlags/appFeatureFlagsPort.test.ts --config vitest.config.ts
pnpm --filter @gafus/core exec vitest run \
  src/services/appSubscription/accessPort.test.ts \
  src/services/appSubscription/g1-achievements-snapshot-access-source.test.ts \
  src/services/rewardedCredits/accessService.test.ts \
  src/services/rewardedCredits/walletService.test.ts --config vitest.config.ts
pnpm --filter @gafus/api exec vitest run \
  src/modules/app-subscription/composition/install-core-subscription-access.contract.test.ts \
  src/routes/v1/g1-subscription-readonly.contract.test.ts \
  src/routes/v1/app-subscription.route.test.ts \
  src/routes/v1/training.route.test.ts \
  src/modules/architecture/dependency-architecture.test.ts --config vitest.config.ts
pnpm --filter @gafus/api exec vitest run \
  src/routes/v1/admin-feature-flags.test.ts \
  src/routes/v1/app-subscription.route.test.ts \
  src/routes/v1/training.route.test.ts \
  src/modules/architecture/dependency-architecture.test.ts --config vitest.config.ts
```

Отдельные минимальные проверки совместимости: installer flags и installer subscription access должны выполняться до первого `app.ts` route import; отсутствие настройки Core port fail-closed (никаких платных разрешений); API admin flags сохраняют iOS review/OTA/promos; общие ошибки `MobileReleaseControlConflictError`/`RetiredRewardedAdsReadOnlyError` имеют единый constructor между Core/server и Types. `pnpm-lock.yaml` — только после объединения `package.json`, Expo/RN patches и A2 logging telemetry, затем `pnpm install --frozen-lockfile`. Для reminder-review обязателен owner-scoped receipt/idempotency и **не монтировать review-only Hono route** без отдельного разрешения.

Локальные A1 исходные подтверждения: core 2058 PASS / 136 skip, API 2741 PASS / 266 skip, Types 89 PASS; адресные flags/subscription suites PASS, frozen+offline lock PASS **в дереве A1**, но не на общем кандидате. PostgreSQL subscription owner/period/revocation, реальный AG1 receipt PG, iOS review и полный 33-stage + 5-chaos/18 acceptance остаются PENDING.

## 8. A1/A2 pnpm-lock reconciliation rehearsal (provisional SHA, NO merge)

Safe method: copy all 70 workspace `package.json` (root+69), `pnpm-workspace.yaml`, `.npmrc`, 7 active patches, A1 lock, Prisma schema and graph scripts into **new isolated Logs** candidate. Preserve A1 as full dependency source, because the snapshot already contains five A2 OpenTelemetry logger dependencies and their exact pinned resolutions. Run only `pnpm install --lockfile-only --offline --ignore-scripts`, then frozen lock-only; NEVER substitute A2's older complete lockfile. Verify 70 importer keys, every workspace `@gafus` link, A1 payment-server API+Worker, all 7 patch bytes against lock hashes, A2 OTel pinned specifiers, schema `previewFeatures=["metrics"]` and Chat2 models, isolated workspace DAG and local OTLP privacy tests.

**Reproduced twice with 0-byte diff to A1 source. Current expected candidate lock SHA:** `f131a5960bfffbb2dd894d23ee1e0820884fce6188798ba989eab7743e48524e`; stale A2 SHA `8bd2ad9028d5361daefa25846e2ac402287270d7fa161c8396a77c170f30ef0c` forbidden. Full instructions and logs in `docs/audit/gafus-agents-integration-lockfile-r37-20261112.md`.

Prepared policy: `docs/audit/gafus-agents-integration-preflight-policy-20261112-r37-lock-verified.json`, with signed exact **provisional** evidence SHA. `approvedCandidateSha256=[]` and no final A1 registry; **still blocked** until manually revised with final combined manifest/lock verification. The earlier r37 source check now correctly reports new A1 cluster divergence; do not backfill old hashes or turn it green without the final A1 manifest.

## 9. Четыре committed A2: transfer/rollback choreography prepared, NOT executed

Последовательность source SHA строго: `751a435ec5096211b4325d80821cdfff271edd8d`, `b05ca9c4e1c767fd4f10ea55531048f434a52527`, `fbd89d62a977726828d4df132db5a848cb96c851`, `bd93aef2234e228191c1e112655d0c5c1b2a711e`. 39 уникальных путей, 56 commit-file edits, 6 P0, ноль прямых A3 final paths. `git apply --check` на read-only копии **не проходит** из-за overlap, перенос без разрешения конфликтов запрещён. Для будущей разрешённой clean integration branch есть сохранённые команды `cherry-pick --no-commit` по одному, owner reconciliation, локальные проверки Prisma/OTLP/workspace/lock и безопасные условные rollback/abort/revert в `docs/audit/gafus-a2-four-commits-transfer-runbook-20261112.md`. После финального A1 обязательно обновить SHA/source map, подтвердить preflight, только затем перенос и единый 33/5/18. Ни branch, ни merge, ни commit, ни push, ни deploy сейчас не делались.


## 10. Обновлённый preflight для A1 17 / recovery AG4

После interim A1 17-edge recovered AG4 добавлена политика `gafus-agents-integration-preflight-policy-20261112-r17.json`. Сверяет SHA 23 source handoffs (276 записей / 183 файлов), 47 companion evidence, source dirty fingerprint, A2 39 committed paths, A3 final 39, 6 P0 A2, Prisma полные A1 модели + `previewFeatures=["metrics"]`, старый A2 lock отклоняет. Только `pnpm-lock.yaml` прямой конфликт с committed A2; 0 with final A3. AG4 admission checks: existing keyed POST keeps compiled Core binder, review route unmounted, owner/advisory lock, cap 5, idempotency and UNKNOWN fail-closed; real PostgreSQL and full 33/5 gates remain pending. A1 is actively editing next cluster; source coverage must FAIL on new unmanifested files and regenerate only at final A1 checkpoint, not weaken it. Runner points to the new r17 policy and cannot run full regression without final source manifest/lock approval.

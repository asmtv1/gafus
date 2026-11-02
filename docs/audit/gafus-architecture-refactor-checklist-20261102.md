# GAFUS — архитектурный рефакторинг: проверяемый checklist (2026-11-02)

**Scope:** только `/Users/asmtv1/Desktop/gafus-refactor`; ветка `fix/media-video-cache-20261102`, исходный HEAD `daaa8fd84`. Ни production, ни gafus1, ни облачные сервисы не изменять. В рабочем дереве есть параллельные незакоммиченные изменения; они не принадлежат этому чеклисту. **Статус COMPLETE означает измеряемые тесты, а не обещание будущих действий.** Запускать локальные проверки после изменений; `SKIP` и блокеры сохранять явно.

| № | Раздел | Статус | Доказательство / выполнено | Остаток и объективное условие завершения |
|---|---|---|---|---|
| 1 | Prisma boundaries | PARTIAL | `node scripts/check-app-prisma-boundary.mjs` PASS; baseline 146→133; production 29→16 через безопасный вынос 13 routes в Core (11 admin, trainer-statistics и ранее training/admin-users; считать по реестру ниже). Полный пофайловый реестр ниже. | Осталось 16 runtime non-test imports, среди них 5 HTTP routes; унести допустимые HTTP-обращения в имеющиеся Core/application сервисы; не переносить CLI/persistence технически без необходимости, не снижать baseline без кода и тестов. |
| 2 | Core, workspace dependencies | PARTIAL | Исторический анализ: 46 workspace пакетов, 135 runtime workspace edges, циклов 0; `pnpm check:core-boundaries` PASS 14/14. | Проверить устаревшие exports, тяжёлые barrels, DTO и runtime deps; без механических абстракций. |
| 3 | Media, CDN/S3, cache | PARTIAL | Общий `@gafus/core-client/media-delivery`, fail-closed 403/404, 410/5xx policy, `signedExpiry` и media tests. | Обязательны локальные HTTP Range, истёкшие capability URLs, retry/recovery в изолированном S3; нельзя утверждать production-доставку. |
| 4 | Крупные модули | BLOCKED/PARTIAL | Размеры в исходниках: paymentService ~2894, dailyCourseService ~1855, Web Chat ~2066; component chat и media параллельно изменяются. | Payment нельзя распиливать без явных webhook/idempotency/transaction contracts; разделить только безопасные независимые pure-функции, с проверкой импорта/платежей. |
| 5 | Observability | PARTIAL | `health-monitoring.contract.test.mjs` PASS; /healthz frontend исправлены, worker `/metrics/media`; alert rules написаны, но **не активированы**. | Создан `emit-verified-backup-metric.py` (только после size/type remote verification) и текстовый node_exporter mount. Локальные tests 5/5+mock backup 3/3, Compose config PASS; проверить promtool и wiring, production exporter пока не подключён. Production alert activation **запрещён**. |
| 6 | CI/CD | PARTIAL | Workflow contracts PASS; проверка кодов каждого параллельного build, включена pnpm integrity, core-client раньше Core. | Проверка полного build graph, dry-run compose/config и локальная контейнерная smoke (только при безопасной изоляции). Никакого релиза. |
| 7 | Queues/leases | PARTIAL | Worker unit suite 191 PASS / 2 SKIP, expiry gauges, существующие SKIP LOCKED/lease/retry оставлены. | Доказать реальную транзакционную конкуренцию PG, падение worker, отказ Redis/S3 и корректный терминальный статус на disposable стенде. |
| 8 | Security | PARTIAL | ACL проверка администратора перемещена в Core; тесты admin/API; защищены signed URLs и роли. | Полная матрица RBAC, CORS/CSRF, index/N+1 и upload abuse не завершена. |
| 9 | Test gate | PARTIAL | По итогам предыдущего прохода Core 2244 PASS /169 SKIP, API 2504/266, Mobile 2388/1, Worker 191/2, Web 3102 PASS / 1 FAIL /6 SKIP; core-boundaries 14 PASS, release 19 PASS. | Повторить после внесённых изменений; Web `MomentVideo.mounted.test.tsx` FAIL (video poster) в зоне активных изменений другого агента. |
| 10 | Exit criteria | BLOCKED | Нет push/deploy, Git diff --check PASS на предыдущем проходе; API и Core контрактные тесты PASS. | Принятие возможно только после закрытия Web FAIL, реальных isolated интеграций и неопровергнутой совместимости. |
| 11 | Final report | PARTIAL | Первый промежуточный отчёт — 7,6/10; логи `.gafus-refactoring/architecture-qa-20261102/` (локально, не отслеживаются). | Указать перед завершением точные пути, тесты PASS/FAIL/SKIP, оставшиеся риски и честную оценку. |

## Реестр 27 production Prisma imports в начале данного этапа

**Текущий boundary: 133 total / 16 runtime non-test / 117 test (с 146/29 на старте общего рефакторинга).** Из этого реестра уже мигрировали `admin-analytics`, `admin-cache`, `admin-feature-flags`, `admin-settings`, `admin-profit`, `admin-mail`, `admin-reengagement-trigger`, `admin-consultation-schedules`, `admin-subscriptions`, `admin-broadcasts`, `trainer-statistics`; остальные строки пока открыты. Точные проверки: API 67/67 по пяти маршрутам, 42/42 broadcast/trainer mounted, 30/30 analytics/settings/feature flags, 9/9 admin-cache, Core 4/4 trainer target, 4/4 cache revision, API/core typecheck PASS, Core build PASS. Всё локально, без push.


| Файл | Классификация / граница | Очередность |
|---|---|---|
| `apps/api/src/chat2-v2-cloud-core.ts` | API composition для durable Chat2; изучить сервис | P2 |
| `apps/api/src/lib/consultation-booking-lookup.ts` | application helper, persistence через Core при необходимости | P2 |
| `apps/api/src/modules/chat2/archive.ts` | модульная инфраструктура/потенциальный CLI | P2 |
| `apps/api/src/modules/chat2/import-cli.ts` | CLI/infra: **возможно легитимно** | P3 |
| `apps/api/src/modules/chat2/media-v2-jobs.ts` | media persistence adapter | P2 |
| `apps/api/src/modules/chat2/media-v2-upload.ts` | media persistence adapter | P2 |
| `apps/api/src/modules/chat2/service.ts` | application+SQL mixed, высокий риск | P1 после tests |
| `apps/api/src/modules/questions/media-v2-jobs.ts` | media persistence adapter | P2 |
| `apps/api/src/modules/questions/media-v2-upload.ts` | media persistence adapter | P2 |
| `apps/api/src/modules/trainer-articles/infrastructure/read-own-article-metadata-rows.ts` | **легитимный infrastructure adapter** | P3 |
| `apps/api/src/modules/trainer-notes/infrastructure/read-notes-summary-snapshot.ts` | **легитимный infrastructure adapter** | P3 |
| `apps/api/src/routes/v1/admin-analytics.ts` | ✅ Core role projection + route tests | DONE |
| `apps/api/src/routes/v1/admin-broadcasts.ts` | ✅ HTTP direct Prisma removed; delegated to Core; targeted tests PASS | DONE |
| `apps/api/src/routes/v1/admin-cache.ts` | ✅ HTTP direct Prisma removed; delegated to Core; targeted tests PASS | DONE |
| `apps/api/src/routes/v1/admin-consultation-schedules.ts` | ✅ HTTP direct Prisma removed; delegated to Core; targeted tests PASS | DONE |
| `apps/api/src/routes/v1/admin-feature-flags.ts` | ✅ HTTP direct Prisma removed; delegated to Core; targeted tests PASS | DONE |
| `apps/api/src/routes/v1/admin-mail.ts` | ✅ HTTP direct Prisma removed; delegated to Core; targeted tests PASS | DONE |
| `apps/api/src/routes/v1/admin-profit.ts` | ✅ HTTP direct Prisma removed; delegated to Core; targeted tests PASS | DONE |
| `apps/api/src/routes/v1/admin-reengagement-trigger.ts` | ✅ HTTP direct Prisma removed; delegated to Core; targeted tests PASS | DONE |
| `apps/api/src/routes/v1/admin-settings.ts` | ✅ HTTP direct Prisma removed; delegated to Core; targeted tests PASS | DONE |
| `apps/api/src/routes/v1/admin-subscriptions.ts` | ✅ HTTP direct Prisma removed; delegated to Core; targeted tests PASS | DONE |
| `apps/api/src/routes/v1/chats.ts` | legacy Chat vs Chat2 inspect | P2 |
| `apps/api/src/routes/v1/trainer-authoring.ts` | HTTP violation, transaction inspect | P2 |
| `apps/api/src/routes/v1/trainer-content-manage.ts` | HTTP violation, transaction inspect | P2 |
| `apps/api/src/routes/v1/trainer-course-full-manage.ts` | HTTP violation, transaction inspect | P2 |
| `apps/api/src/routes/v1/trainer-statistics.ts` | ✅ HTTP direct Prisma removed; delegated to Core; targeted tests PASS | DONE |
| `apps/api/src/routes/v1/trainer-videos-metadata.ts` | HTTP violation / ACL inspect | P2 |

## Ограничения среды (перепроверять, не считать бесконечными)

- Production alerting и Cloud.ru/Beget API не проверять согласно запрету; можно делать только статические и локальные проверки.
- Реальный PG/Redis/MinIO — только новые disposable Docker контейнеры в закрытой сети с уникальными именами; **не** обращаться к существующим/production URLs и не пользоваться `.env`.
- Если исходник меняется другим агентом, не сохранять конкурентный patch поверх него; пометить conflict.
- Скрипт production-backup **не запускать**: локальные проверки допустимы только через mock curl/docker и временные файлы.

## Локальные результаты дополнительного этапа

- API admin HTTP routes: `pnpm --filter @gafus/api exec vitest run ...` 30+67+9 PASS; broadcast + mounted trainer statistics 42/42 PASS; API `tsc --noEmit` PASS.
- Core: `trainerTargetAccess` 4/4 и `cacheRevisionService` 4/4 PASS; Core `pnpm build` PASS.
- CI baseline: `node scripts/check-app-prisma-boundary.mjs` PASS (133/16/117), `--self-test` PASS; `git diff --check` PASS.
- Бэкап: локальный mock `node --test ci-cd/scripts/backup-to-yandex.test.mjs` 3/3, `emit-verified-backup-metric.test.mjs` 3/3, Prometheus contracts 2/2, `docker compose ... config --quiet` PASS. **Никаких настоящих бэкапов или production метрик не запускалось.**
- `MomentVideo` FAIL подтверждён; связан с изменениями в Web-медиа другого агента — не трогать конфликтные файлы.

## Дополнение к контрольному реестру — продолжение с изолированными проверками

Таблица разделов 1–11 в начале файла — начальная контрольная точка, а не окончательные результаты. Последние проверенные доказательства ниже; при конфликте значений использовать позднейший **успешный** тест, а не текущую цифру из промежуточного baseline. Никаких данных `.env`, GitHub Secrets, реальных пользователей, production API и облачных провайдеров не использовано.

### 1. Prisma boundaries — PARTIAL / CONCURRENT CHANGE

- **Реализовано в этом продолжении:** четыре HTTP-роута (`admin-analytics.ts`, `admin-settings.ts`, `admin-feature-flags.ts`, `admin-cache.ts`) больше не импортируют `@gafus/prisma`; текущая роль берётся из Core `readAdminActorRole`, увеличение ревизии из `packages/core/src/services/training/cacheRevisionService.ts` под транзакционной блокировкой владельца. HTTP 30 + 9 PASS, Core 4 PASS; `pnpm --filter @gafus/api typecheck` PASS.
- Непосредственно после безопасного переноса было **140 исторических импортов: 23 нетестовых + 117 тестовых**; `node scripts/check-app-prisma-boundary.mjs --self-test` и обычный запуск PASS.
- **Параллельный конфликт:** другой агент редактирует `apps/api/src/routes/v1/trainer-*`, `chats.ts`, статистику в Core и `scripts/app-prisma-runtime-existing-baseline.json`; baseline одновременно стал 133. На момент последней проверки gate сообщал `stale Prisma exception` в `apps/api/src/routes/v1/chats.ts`. Не перезаписывать параллельную работу и не объявлять этот моментальный baseline PASS. **Для закрытия:** агент завершает перенос и синхронизирует baseline с actual AST; после этого обязательны `--self-test` и полный boundary gate.
- Остальные mixed/infra imports перечислены в инвентаризации выше; незавершённые SQL-транзакции Chat/Trainer/Subscription намеренно не извлечены без доказательств parity.

### 2. Монорепозиторий — PARTIAL

- Ранее проверено 46 workspace-пакетов / 135 runtime dependencies / 0 графовых циклов; Core boundary тесты в предыдущем цикле 14/14. В CI принудительно собирается `core-client` перед Core, чтобы тесты не использовали устаревший `dist` (контрактный тест).
- **Остаток:** реальный dependency audit устаревших exports, DTO, N+1 и barrel-чанков не доказан для всех пакетов. Нужен функциональный graph и bundle budget по всем entrypoints.

### 3. Медиа — PARTIAL / MINIO BLOCKED

- Новый контракт `packages/core-client/src/media-delivery/cdnContract.test.ts`: 4 PASS — 403/404 не дают storage fallback, 410/5xx распознаются, signed media URL истекает и не допускает untrusted paths, CORS ошибку нельзя считать CDN-отказом, подтверждённый 503 открывает только ограниченный 60-секундный circuit.
- `apps/api/src/routes/v1/training.validation.test.ts`: 44 PASS — добавлены byte Range 206, `Content-Range`, `Accept-Ranges`, `private,no-store`, no multi-range forward; существующие ACL и подписанные HLS токены сохранены.
- `pnpm --filter @gafus/gallery-server test`: 38 PASS (включая gallery redirect и S3 fallback ACL); `pnpm --filter @gafus/core-client test`: 8 PASS.
- **Блокер:** нет доступного образа MinIO: Docker Hub — `pull access denied`, Quay — HTTP 401. Реальную S3/MinIO доставку, multipart, CORS, Range и перезапрос истёкших capabilities нельзя считать проверенными. **Решение:** безопасно получить официальный/доверенный локальный образ MinIO или доступный полностью disposable S3-compatible emulator и запускать только на случайной loopback сети с синтетическими данными.

### 4. Крупные модули — PARTIAL

- Выделены **не транспортные и не платежные** политики очистки DailyCourse из `dailyCourseService.ts` в `dailyCourseCleanupScope.ts`: общие фильтры владельца, даты и защищённых step links. Новый `dailyCourseCleanupScope.test.ts` и существующий `dailyCourseService.test.ts`: 24/24 PASS, Core typecheck PASS. Изменение отдельное и адресное, не дробление по строкам.
- **Объективный блокер Payment:** `paymentService.ts` (~2894 строк) выполняет критичные YooKassa/Apple HTTP webhooks и транзакционные изменения; безопасное масштабное разделение требует real local PG + подменённых Apple/YooKassa webhook payloads, сценариев exactly-once, duplicate, timeout, cancellation/refund, migration compatibility. Эти реальные интеграции не готовы; исходник платежей **не трогали**. Chat Web/Mobile UI уже менялся другими агентами; не трогали их работающие компоненты.

### 5. Observability — PARTIAL / PRODUCTION BLOCKED BY POLICY

- Health endpoint static contracts 2 PASS, `docker compose ... config --quiet` PASS. Nginx Web/Admin/Trainer `nginx -t` в контейнерах с `--network none`: 3 PASS.
- **Новая проверяемая backup success metric** `gafus_database_backup_last_success_timestamp_seconds`: скрипт `ci-cd/scripts/emit-verified-backup-metric.py` атомарно пишет только timestamp после подтверждения remote `size`/`type=file` в `backup-to-yandex.sh`. На ошибке квоты метрика не создаётся; mock backup tests 3/3, metric tests 3/3, Prometheus config tests 2/2 PASS. Локальный `node-exporter` имеет textfile collector и read-only mount, правила `GafusBackupMissing` и `GafusBackupStale` подготовлены.
- **Не утверждать реальную доставку алертов:** production activation, настройки удалённого Prometheus/Alloy и реальная резервная копия ЗАПРЕЩЕНЫ. Для local smoke необходимы node-exporter/Prometheus контейнеры, настроенные в отдельной QA-сети, и тестирование ingestion/alert fire без production.

### 6. CI/CD — PARTIAL

- Новый `ci-cd/scripts/release-graph.contract.test.mjs`: 2 PASS — job graph без циклов, 7 images обязательны, main deploy зависит от сборки/сигнала безопасности и применимых fail-closed gates, единый SHA. Подключён к CI contract step (как и backup metric tests).
- Контракт CI integrity pnpm-store, отдельных `wait $pid`, отдельной Core-client сборки, dependency validation FAIL-closed: PASS в предыдущем прогоне. Web/Admin/Trainer Nginx syntax PASS (контейнеры без сети); compose local syntax PASS.
- **Не проверено/запрещено:** реальная сборка 7 Docker образов для SHA и деплойный cutover/rollback на настоящей схеме БД. В тестовом режиме допустима независимая ephemeral сборка с offline mock; нужны достаточные CPU/disk и подготовленный полностью synthetic Docker state.

### 7. Queues/leases — PARTIAL / REAL MECHANISM VERIFIED

- `ci-cd/scripts/isolated-pg-redis.smoke.mjs`: на **двух живых ephemeral контейнерах** Postgres 18 + Redis 7, только random loopback ports + randomly named Docker bridge + tmpfs; PASS `SKIP LOCKED` 2 concurrent claims, crash `ROLLBACK` восстановил задачу, истёкший lease обнаружен, `SET NX PX` дедупликация и retry, Redis unavailable fail-closed и задачи в PG остались. В конце **0 QA контейнеров**, данные с tmpfs удалены. Не читает `.env`.
- Worker unit suite ранее 191 PASS /2 SKIP. **Остаток:** это проверка механизма и синтетической схемы, не end-to-end существующих Chat2/Feed/Gallery/Questions Prisma leases/Cloud.ru Jobs; нужна disposable миграционная PG fixture, Redis + MinIO для всех media workers.

### 8. Security — PARTIAL

- ACL на Admin/Trainer/Core, authenticated Gallery fallback, запрещённые S3 grants при 403/404, stale JWT и запрет удаления step links покрыты соответствующими тестами выше. Локальная S3-подпись не выводится в логи. Воспроизведение HLS Range private,no-store.
- **Остаток:** нет полной матрицы CORS/Origin/CSRF, index/N+1, rate-limit under load, security audit WebSocket и актуальных S3 grants на реальном MinIO. Не менять RBAC без контракта.

### 9. Полные проверки — RUNNING / SEE POST-RUN LOGS

- Запущена отдельная серия `pnpm` тестов и сборок с сохранением stdout в `.gafus-refactoring/architecture-qa-20261102/continuation/` и итоговыми кодами завершения в `summary.tsv`. Ранние Core/API/Worker/Mobile повторные наборы PASS; Web в момент записи выполнялся. В процессе проверки другие агенты меняли код, поэтому полный PASS обязательно пересверять с последними targeted тестами и boundary gate.
- `MomentVideo.mounted.test.tsx` теперь 2/2 PASS: тест скорректирован под существующий `FeedCdnImage`-постер, а не нативный `video[poster]`; **чужой изменённый `FeedV2Video.tsx` не затронут**.

### 10. Критерии завершения — PARTIAL / NOT READY=YES

- No push, no deploy, no user data writes, no external API reads. `gafus1` не открывали и не изменяли. Никакого production alerting.
- **Остаток для приёмки:** zero open regression FAIL, реальные отдельные media S3 + PG + Redis acceptance, завершение параллельного baseline/Prisma-переноса, Payment webhook exactly-once test suite, реальные контейнерные health/readiness end-to-end на локальной сети. До выполнения нельзя выставлять 9.5–10/10.

### 11. Итоговый отчёт — PARTIAL

- Список точных изменённых файлов, тесты PASS/FAIL/SKIP и блокеры приведены в этом markdown и сохранённых логах. Перед финальным ответом сверить **последнюю** Git ветку/status, результаты series `summary.tsv`, `git diff --check`, boundary; итоговая оценка должна отражать НЕзавершённые интеграции, а не скрывать их.

## Контрольная точка 2026-11-02 23:59 — самостоятельное продолжение HTTP→Core и локального QA

Этот раздел **новее** предшествующих промежуточных срезов этого файла. Ранние строки baseline 133 и `RUNNING` являются историческими; итог сверять по последнему успешному gate. Изменения чужих агентов не перезаписывались, коммитов/пушей нет.

| № | Подзадача | Результат на контрольной точке | Объективный остаток / решение |
|---|---|---|---|
| 1 | Prisma boundaries | **HTTP routes чисты**; `node scripts/check-app-prisma-boundary.mjs`: **127 total / 10 runtime non-test / 117 test**, self-test PASS; 17 нетестовых нарушений снято за данный этап относительно 27. Сохранён полный пофайловый реестр `docs/audit/gafus-remaining-prisma-20261102.md`. | 10 остающихся файлов — Chat2/Questions infra, CLI, startup ingress, explicitly scoped read adapters; Chat2 service 1485 LOC (~139 SQL/tx refs) требует прежде всего real disposable PG/Redis/S3 contracts. Механическое обнуление baseline запрещено. |
| 2 | Core/packages dependency graph | Предыдущая графовая проверка 46 packages / 135 runtime edges / 0 cycles; `core-client` собирается до Core в release CI; новые портовые функции экспортированы и компилируются, сохранены Facade imports. | Полный dead-exports/bundle-cost/N+1 audit всех пакетов не доказан; нужен профилируемый baseline с approved entrypoints. |
| 3 | CDN→S3, Range, expiry/recovery | `cdnRangeRecovery.http.test.ts` **3 PASS**: реальный loopback HTTP симулятор HEAD 503, signed fallback 206 + Content-Range, invalid Range 416, unsigned/expired 403, CDN cooldown recovery. `cdnContract.test.ts` и Hono training Range тесты в предыдущем этапе PASS. | Это **не MinIO** и не реальный Cloud; S3 E2E с CORS/подписью/ACL на disposable MinIO заблокирован отсутствием локального MinIO image и необходимостью нового безопасного fixture. |
| 4 | Payment/DailyCourse и большие сервисы | `paymentPure.ts` 4 чистые функции и 4 новых PASS; `dailyCoursePure.ts` 5 чистых функций и 3 новых PASS; payment webhook/idempotency/SQL, DailyCourse CAS и DB транзакции не затронуты. | Разделение оркестрации Payment (~2894 LOC)/DailyCourse (~1855 LOC) требует real PG+mock YooKassa/Apple и конкурентного теста идемпотентности. Без него wholesale split небезопасен; Chat2 service 1485 LOC тоже требует suite. |
| 5 | Наблюдаемость/бэкап | `emit-verified-backup-metric.py`, опционально вызывается **после** verified Yandex size/type; backup mock 4 PASS (success, quota, mismatch), metric tests 3 PASS, monitoring contracts 2 PASS; в local compose readonly node-exporter textfile mount; alert rules отсутствующий/старый backup. | Production metric и alert **не включены по прямому запрету**; `promtool`/Alloy не установлены, cached Prometheus image отсутствует. Для local evaluator smoke нужен разрешённый офлайн-образ, а production wiring — отдельное авторизованное изменение. |
| 6 | Release graph/local containers | `release-graph.contract.test.mjs` 4 PASS, CI contracts PASS; 7 image matrix, prerequisites, GitHub Actions DAG, immutable tags; `local-vite-nginx-smoke.mjs` PASS `--network none`, healthz/SPAs/API fail-closed. | Полная сборка 7 образов не выполнялась; 15 GiB свободного места, несколько параллельных сборок и отсутствие согласованных фикстур дают риск исчерпания. Production deploy/rollback запрещён. |
| 7 | Lease/failures PostgreSQL/Redis/MinIO | `local-isolated-pg-redis-concurrency.mjs` **REAL Docker PASS**: одноразовые Postgres 18 + Redis 7 без опубликованных портов, `FOR UPDATE SKIP LOCKED`, rollbacks, Redis NX fencing/compare-delete, shutdown refusal. Контейнеры удалены. | Это synthetic schema/SQL, не реальные Prisma worker migrations; для Chat2/Feed/Questions/Gallery production-like fault injection нужен disposable schema+queue+MinIO. |
| 8 | Security contracts | ACL/stale role и transaction row lock вынесены в Core; Trainer editor counts scoped, chat discovery исключает удалённые аккаунты/`lana`; Consultation receipt owner-scoped, no POST retry; 403/404 CDN не дают S3 fallback. | Полная матрица HTTP Origin/CORS/CSRF, WebSocket, upload abuse, N+1 и SQL grants не проверена; эксплуатационные тесты с настоящими секретами запрещены. |
| 9 | Tests / typecheck | API **2508 PASS / 266 SKIP** после пересборки Core (первый прогон 11 FAIL из-за stale `dist`, устранено). Core **2268 PASS /169 SKIP** плюс 4 новых Core consultation PASS, Worker **191 PASS /2 SKIP**. MomentVideo targeted **2/2 PASS** после обновления теста другим агентом. | Web/Mobile штатные тесты в отдельном финальном gate; перед финалом обновить значения. Запуск широкой `vitest run` захватил `node:test` runner файлы: 8 ложных Web suite failures (0 упавших Web assertions). Mobile 1 failure в 4-worker прогоне, targeted rerun 7/7 PASS — возможная конкуренция, нужно штатное повторение. |
| 10 | Exit criteria | Branch isolation и `git diff --check` PASS; локальные тесты и контейнеры не подключались к production. Никаких push, deploy, БД/Cloud.ru/Beget изменений. | `READY=YES` запрещено до всех реальных мультимедиа/worker E2E и свежих штатных full gates; 9.5–10/10 по текущим доказательствам необоснованно. |
| 11 | Final evidence/report | Этот checklist, `docs/audit/gafus-remaining-prisma-20261102.md`, журналы `.gafus-refactoring/architecture-qa-20261102/{full-post-extraction,final-regression}/`, множество адресных тестов и source diff. | Последним пунктом приложить штатный `final-regression/summary.tsv`, актуальные PASS/FAIL и отдельные архитектурные блокеры, не выдавать промежуточные тесты за полную готовность. |

В дополнение к API suite (2508 PASS) успешно прошли консультационные контрактные тесты после fresh Core build: `45/45`; Core consultation source 4/4. После фиксации экспорта только тогда удалена baseline запись `apps/api/src/lib/consultation-booking-lookup.ts`. Проверка `node scripts/check-app-prisma-boundary.mjs --self-test` блокирует новые и stale imports. Проверка `find apps/api/src/routes -name '*.ts' ... grep '@gafus/prisma'` не находит direct runtime DB imports в маршрутах.

## Окончательная сверка контрольных gate после продолжения (финальный доказанный срез)

**Git:** `fix/media-video-cache-20261102`, HEAD `daaa8fd84`; изменения остаются локальными и незакоммиченными, вместе с чужими параллельными изменениями. На момент сверки `node scripts/check-app-prisma-boundary.mjs --self-test` и обычная проверка — PASS **127 total / 10 non-test / 117 test**. Остаток 10 и архитектурная допустимость каждого описаны отдельно в `gafus-remaining-prisma-20261102.md`. Новых исключений не добавлено, прямых Prisma импортов в HTTP-роутах нет.

| Gate (полный штатный запуск, когда указан) | PASS | FAIL | SKIP | Доказательство |
|---|---:|---:|---:|---|
| Core (post-extraction) | 2268 | 0 | 169 | `.gafus-refactoring/architecture-qa-20261102/full-post-extraction/core-tests.log` |
| API (после rebuild Core / final-regression) | 2508 | 0 | 266 | `.gafus-refactoring/architecture-qa-20261102/final-regression/api-tests.log` |
| Web (официальный штатный прогон, после исправлений test awaits) | 3103 | 0 | 6 | `.gafus-refactoring/architecture-qa-20261102/final-regression/web-official.log` |
| Mobile (штатный прогон) | 2388 | 0 | 1 | `.gafus-refactoring/architecture-qa-20261102/continuation/mobile-tests.log` |
| Worker | 191 | 0 | 2 | `.gafus-refactoring/architecture-qa-20261102/continuation/worker-tests.log` |
| Gallery Server | 38 | 0 | 0 | `pnpm --filter @gafus/gallery-server test` |
| Core-client | 8 | 0 | 0 | `pnpm --filter @gafus/core-client test` |
| Core boundary contracts | 14 | 0 | 0 | `pnpm check:core-boundaries` |
| CI release + backup + monitoring/workspace latest focused contracts | 14 | 0 | 0 | `node --test ci-cd/scripts/release-graph.contract.test.mjs ci-cd/scripts/workspace-dependency-graph.contract.test.mjs ci-cd/scripts/emit-verified-backup-metric.test.mjs ci-cd/scripts/backup-to-yandex.test.mjs ci-cd/docker/prometheus/health-monitoring.contract.test.mjs` |
| Local HTTP CDN/Range production-route simulation | 3 | 0 | 0 | `ci-cd/scripts/cdnRangeRecovery.http.test.ts`, synthetic loopback, **not real S3** |

Временные FAIL при последовательной разработке НЕ скрывались: ранее full Web 2 FAIL в legacy route await (исправлено), затем 1 FAIL гостевого `/questions/:id/edit` из-за незавершённого lazy landing (исправлено), после чего **штатный full Web 3103 PASS/6 SKIP**; первоначальный API full запуск после выделения Core сервисов получил 11 FAIL из-за устаревшего `dist`, исправлено Core rebuild и подтверждено API 2508 PASS/266 SKIP. Один конкурирующий Mobile run с увеличенной параллельностью дал 1 FAIL; штатный отдельный Mobile suite — 2388 PASS/1 SKIP.

**Реальный контейнерный локальный smoke:** отдельные безвнешние Nginx Web/Admin/Trainer `GET /healthz` = 200, устаревший `GET /api/health` не 200, контейнеры удалены; независимые одноразовые PostgreSQL/Redis на синтетических строках проверили `SKIP LOCKED`, rollback, lease expiry, Redis NX, disconnected Redis и отсутствие потери PG-строк, контейнеры удалены. Не утверждать доказательство реальных worker migrations/MinIO по этим smoke.

**Статус всего задания:** **PARTIAL / NOT READY FOR 9.5–10**. Объективные оставшиеся блокеры: недоступный доверенный MinIO образ для E2E real PG/S3/Redis всех медиа pipelines; отсутствие полной матрицы платежных webhook + callback-duplicates/transaction races на disposable PG; production alert activation и облачная проверка строго запрещены пользователем; 7 обязательных Docker образов не собирались полностью на локальном диске (около 16 GiB свободно, параллельные агенты); критичные Chat2/Questions SQL adapters требуют их собственного lease/ACL acceptance до переезда из `apps/api`; полный N+1/DTO/dead-exports аудит не завершён. Эти пункты не маскируются зелёными unit тестами. Промежуточная инженерная оценка по доступным проверкам: **8,3/10**, не production-рейтинг.

## ИТОГ ПОСЛЕДНЕЙ ПРОВЕРКИ — все доступные безопасные работы этого этапа

**Source guard:** рабочая ветка `fix/media-video-cache-20261102`, исходный HEAD `daaa8fd84` не менялся, только локальные незафиксированные файлы; `git diff --check` PASS. Ни production, ни gafus1, ни Beget, ни Cloud.ru, ни production DB, ни push/deploy, ни ручной очистки пользовательских данных. Изменения concurrent agents (особенно Web Moment/Chat и Mobile) сохранены; конфликтный файл не перезаписывался.

**Фактические финальные exit-codes** (`.gafus-refactoring/architecture-qa-20261102/final-regression/summary.tsv`, `build-typecheck-summary.txt`):

| Проверка | Измеренный результат |
|---|---|
| Core full unit | 2268 PASS, 169 SKIP, 0 FAIL (+4 PASS новых Core consultation target tests после этого прогона) |
| API full after **fresh Core build** | **2508 PASS, 266 SKIP, 0 FAIL**, exit 0 |
| Web official `pnpm test` | **3103 PASS, 6 SKIP, 0 FAIL**, exit 0 |
| Mobile official `pnpm test` | **2388 PASS, 1 SKIP, 0 FAIL**, exit 0 |
| Worker unit | **191 PASS, 2 SKIP, 0 FAIL**, exit 0 |
| Consultation receipt + API routes targeted | **45/45 PASS** после новой Core сборки |
| Core boundaries | **14/14 PASS** |
| 23 combined CI + monitoring + backup static contracts | **23/23 PASS** |
| Core-client build, Core build, API build, Web/Mobile/Worker typecheck | **все exit 0** |
| Prisma no-new/stale, frozen 127/10/117 | **PASS**, self-test PASS; нет DB imports в HTTP routes |
| Disposable real PG/Redis + three isolated Nginx configurations | **PASS**; 0 оставленных контейнеров |
| Simulated HTTP CDN→S3 signed Range/expiry/recovery | **3/3 PASS** (симулятор, НЕ MinIO) |
| YAML local compose syntax, ESLint изменённых server-файлов, `git diff --check` | **PASS**, 0 lint ошибок; найденные 2 line-length предупреждения исправлены |

**Отдельно о ложных прогонах:** полный API тест первоначально выдал 11 ошибок только в ещё не пересобранном consultation Core export; после fresh build API 2508/0 FAIL. Неправильный широкий `vitest run` Web включил 8 `node:test` файлов вне `src` (0 реальных Web assertions failed); **официальный** `pnpm test` полностью зелёный. Mobile в `--maxWorkers=4` разово упал в mounted gallery logout race; адресный retry 7/7 и официальный full 2388/0 FAIL. `MomentVideo` тест изменён **другим агентом**, финальный targeted 2/2 и full Web PASS; сам конфликтный Web-код мы не меняли.

**Незакрытые критерии из разделов 1–11 не скрыты:**

1. 10 технических Prisma импортов (`docs/audit/gafus-remaining-prisma-20261102.md`) — законные/смешанные инфраструктурные зависимости, нужны отдельные disposable worker transactions и policy review; никаких прямых HTTP Prisma более нет.
2. Для 9.5–10/10 нужны безопасный standalone MinIO образ/фикстура и полностью изолированные PG+Redis+S3 интеграции реальных Chat2/Questions/Feed/Gallery workers, включая crash/recovery, Range, invalidation и failed ACK. Локального MinIO образа нет (Docker pull не выполнялся), свободного места около 15 ГБ — небезопасно запускать неконтролируемую серию тяжёлых загрузок/сборок.
3. Payment и DailyCourse orchestration остаются крупными; извлечены только доказуемо чистые функции и ранее independent cleanup policy; для полного дробления нужны idempotent webhook replay + Apple/YooKassa stub + real PG concurrency contracts. Без них каскадный рефакторинг может нарушить платёжную целостность.
4. Полный 7-image Docker build/production-like rollback не проверен: release DAG и Nginx gates зелёные, но нет выделенной дисковой квоты и свободного isolated image workspace для столь дорогой сборки. Production deployment запрещён.
5. Production backup status и отправка production alert не проверялись и не включались по прямому запрету. Локальный script/metrичeский текстовый контракт зелёный, но реальный Prometheus/Alloy evaluator отсутствует локально; для отдельного local evaluation нужен cached offline image/бинарник. Подробнее `ci-cd/docker/prometheus/local-backup-metrics/README.md`.
6. Full security review (Origin/CORS/CSRF, WebSockets, network fault injection, N+1, bundle/dead-exports) не заявлен как выполненный только на основании unit tests. Требуются согласованные fixture identities, snapshots и acceptance budget, без доступа к пользовательским данным.

**Статус приёмки:** все *запущенные финальные локальные CI-like gates* зелёные; общий архитектурный target 9,5–10/10 **пока не достигнут**. Оценка инженерной готовности этого этапа ориентировочно **8,4/10**, не 10/10. Следующий независимый безопасный пакет требует MinIO/тестовых образов, свободной локальной дисковой квоты и утверждённых контрактов транзакций Payment/Chat/Media. Прод не трогали и не будем объявлять production READY без запретной сейчас отдельной авторизации.

### Дополнение к Web gate после последней независимой проверки (не скрывать FAIL)

Наряду с **подтверждённым полностью зелёным** `final-regression/web-official.log` (3103 PASS / 0 FAIL / 6 SKIP), отдельный параллельный full-run `continuation/web-final-post-guestfix.log` выявил **1 FAIL / 3102 PASS / 6 SKIP**: `CoursesDirectRoute.mounted.test.tsx` ожидал `data-ui-parity="legacy-landing"` после одного 24-мс tick, хотя redirect на `/` уже был произведён и lazy-лендинг ещё загружался. Исправлено только ожидание **появления самого лендинга**, без ослабления проверок redirect/отсутствия приватных GET. Кроме того, увеличено ожидание lazy авторизованной course-card, без изменения assertions.

**После обоих исправлений:** адресный совместный прогон четырёх Web regression suites (`legacy-route-compat`, `QuestionEditDeepLink`, `CoursesDirectRoute`, `MomentVideo`) → **36 PASS / 0 FAIL / 0 SKIP**; ESLint двух скорректированных тестов 0 errors. Полный Web 3103 PASS был выполнен до последней правки CoursesDirectRoute: **нет доказанного повторного полного зелёного прогона именно на последнем snapshot**, и потому абсолютное требование стабильности всей матрицы остаётся PARTIAL. Не объявлять production READY=YES по этой причине; для исчерпывающего подтверждения нужен одиночный непрерываемый Web CI запуск без конкурирующих vitest-процессов.

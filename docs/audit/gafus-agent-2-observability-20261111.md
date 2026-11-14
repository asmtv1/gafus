# Агент 2 — наблюдаемость, нагрузка и учения, 11.11.2026

> **Итоги продолжения 12.11.2026:** [актуальные PASS, измерения и внешние блокеры](gafus-agent-2-followup-20261112.md). Исторические PENDING ниже заменены только там, где есть новая квитанция.

## Зафиксированная стартовая точка

- Отдельный `git worktree`: `/Users/asmtv1/Desktop/gafus-agent2-observability`, исходный коммит `0dcd18c13`. Production и `gafus1` не затрагивались.
- Соседние агенты владеют Hono app/startup, Worker/Cloud callback и общей CI. Незаписанные изменения этих файлов скопированы в worktree **только как overlay**, чтобы выполнять совместные контракты и локальные тесты; они не принадлежат ветке агента 2.
- Префикс run IDs: `a2-obs-`; сценарии БД, тестовые веб-серверы и receiver запускаются только на loopback и используют синтетические записи. Не подменять этим внешний стенд.

## 0. Матрица операций / наблюдаемости

| Контур | Ожидаемый путь вход → durable state → внешние эффекты | Что видно / что отсутствует |
| --- | --- | --- |
| Auth/ACL | Hono → auth/policy → Prisma/Redis/session → HTTP 2xx/4xx | requestId/traceId и operationId в Hono; отдельные ACL ошибки/use cases ещё PENDING |
| Chat2 | HTTP/WS → Chat2 application → PostgreSQL message/outbox → Worker → Centrifugo | outbox сохраняет operationId, worker attempt/age/DLQ counters; реальный OTLP полный путь PENDING |
| Media/360p/Chat | API intent → media outbox → Worker → Cloud.ru Job → callback → MP4 360p | корреляция intent/job/attempt, stalled metrics; реальный Cloud callback PENDING (Agent3) |
| Moments/Gallery | API → media policy → PostgreSQL/S3 → CDN/Job → result | duration/failures для каждого pipeline и CDN edge path PENDING |
| Courses/Video ACL | Hono → entitlement use case/read port → PostgreSQL/CDN → allow/deny | HTTP p95/use-case spans доступны в контракте; полное покрытие ACL PENDING |
| Payments/Gafus | Billing/callback → finance policy → PostgreSQL/provider/email | стабильный persisted operationId при callback/retry и провайдерские receipts PENDING |
| Questions | Create/reply/photo/delete → SQL/outbox → S3 cleanup Worker | pending/processing/failed age и DLQ; реальный cleanup callback PENDING |
| Walks/GPS | Sync → Hono/application → PostgreSQL/Redis → readback | HTTP metrics; конкурентная sync+DB/Redis failover PENDING |
| Уведомления | Scheduler/intent → PostgreSQL/outbox → Worker → Push/Resend | operationId и ограниченные failure classes; внешнее подтверждение доставки PENDING |
| Admin/Trainer | Role-based Hono → application/policy → PostgreSQL → operator retry | requestId/operationId, fixed event names; полный audit/retry PENDING |

Таблица задаёт **контрольные цепочки**, а не объявляет, что все маршруты инструментированы. Для каждого: сохранять operationId вместе с durable intent, назначать отдельные eventId/jobId/attempt, после callback с новой трассой искать через прежний operationId. Токены, cookie, SQL, chat body, PII, objectKey и все уникальные идентификаторы запрещены в метках Prometheus.

## 4. Трассы / логи

- `packages/logger/src/serverTelemetry.ts`: W3C traceparent, OTLP async batching и sampling; allowlist для атрибутов, bounded error classes, стабильные сигнатуры `startCorrelatedSpan` и `withServerSpan`.
- `formatCorrelatedDiagnostic`: JSON event с `service,event,level,requestId,traceId,operationId,jobId/eventId,attempt,durationMs,errorCode`; неизвестные поля и чувствительные raw errors отбрасываются. `apps/api/src/lib/operation-observability.ts` пишет только ошибки; успехи отражены метриками.
- `packages/prisma/src/client.ts`: реальный duration-only Prisma engine `$on("query")`; raw SQL/params не печатаются. `db_query_duration_seconds` **не равен** ожиданию подключения: `db_pool_wait_seconds` пока PENDING.
- Локально проверено сохранение operationId между разными trace callback, вложенные spans и отказ коллектора без срыва пользовательской операции. Развёрнутый OTLP search backend, retention, ротация, реальные callback и overhead profile: PENDING.

**Контракт для Agent1/3:** HTTP requestId всегда новый и не берётся из клиента; повторная бизнес-попытка извлекает operationId из БД/outbox. Callback при другой трассе содержит `gafus.operation_id`, но не выдаётся за child span без валидного traceparent. Не менять текущие публичные сигнатуры, не создавать динамических labels.

## 5. Метрики, Grafana, алерты

| Источник | Семантика | Локальное подтверждение |
| --- | --- | --- |
| `http_requests_total`, `http_request_duration_seconds`, `http_inflight_requests` | HTTP matched route/status family, p50/p95/p99, in-flight | API unit/contract PASS, scrape стенда PENDING |
| `db_query_duration_seconds` | SQL duration только Prisma engine event, без SQL и pool wait | Изолированный реальный PostgreSQL + Prisma PASS |
| `dependency_errors_total` | Только фиксированные dependency/errorClass, без IDs | unit + contract PASS |
| `gafus_chat2_outbox_pending`, `...oldest_age_seconds`, `...dead_letters` | Durable snapshot состояния очереди | Worker contracts PASS; внешний scrape PENDING |
| `job_attempts_total`, `job_failures_total`, `job_duration_seconds` | попытки Chat2 dispatch и длительности | Worker metrics contracts PASS |
| `gafus_media_stalled_processing`, `gafus_media_failed_tasks` | 360p stuck/failed по ограниченному pipeline | локальное firing/resolved PASS |
| `db_pool_wait_seconds` | реальное ожидание соединения **в пуле** | PENDING, нельзя выдавать за SQL duration |

Grafana: **API & Latency**, **Media/Chat**, **Operations Reliability**, **Storage and Dependencies** — 8 панелей в каждом, плюс существующие PostgreSQL/Redis dashboards. Storage view включает environment filter. `config.alloy` допускает только проверяемые ограниченные ряды. На стенде подтвердить, что environment external labels действительно присутствуют, все panel query возвращают ряды, а перезапуск счётчиков и исчезновение/восстановление источника корректно отображаются.

Prometheus: 25 alert rules; локальный `promtool check rules` и два набора fixtures PASS. Добавлены GafusApiP95High, GafusWorkerNoSuccessWithBacklog, GafusWorkerAttemptMetricsMissing, GafusPostgresConnectionsHigh, GafusApiMetricsMissing; у API 5xx и p95 есть минимальный объём трафика. Проверены синтетические случаи 5xx на малом/большом объёме, высокий p95, нулевой successful Worker при backlog, число PG соединений, исчезновение и появление API метрик и stuck 360p.

Реальный локальный поток `Prometheus v3.15.1 → Alertmanager v0.29.0 → webhook` с искусственными метриками доставил **firing и resolved** для двух сигналов: media 360p stuck и Chat2 DLQ. Квитанция: `artifacts/a2-obs-alert-delivery-summary.json` (вне Git). Рабочий маршрут Alertmanager, сроки хранения, все реальные ряды и calibration SLO на стенде — PENDING.

## 8. Нагрузочное измерение и восстановление

**Load driver:** `scripts/qa/observability-multi-instance.mjs` допускает только явные loopback `http://127.0.0.1` / localhost GET health/readiness; внешний API и произвольные write endpoints блокируются. Параметры: rate, concurrency, burst, warmup, duration, timeout. Сохраняет p50/p95/p99, error fraction, capacity drop rate, per-target и steady/burst в `summary.json`, отдельные записи ответов без body, URL и секретов в `samples.jsonl`. Компаратор p95 по согласованному профилю сравнивает baseline и candidate. Тест на двух HTTP-серверах (200 и 503) и тест намеренно замедленного кандидата — PASS.

Пример запуска **после** отдельного поднятия 2 изолированных API и 2 Worker с собственными PostgreSQL/Redis/Centrifugo/mock storage:

```sh
node scripts/qa/observability-multi-instance.mjs \
  --target=http://127.0.0.1:4101/health \
  --target=http://127.0.0.1:4102/health \
  --warmup=30 --duration=180 --rate=40 --concurrency=32 --burst=4 \
  --out=artifacts/a2-obs-baseline
node scripts/qa/observability-multi-instance.mjs \
  --target=http://127.0.0.1:4101/health \
  --target=http://127.0.0.1:4102/health \
  --warmup=30 --duration=180 --rate=40 --concurrency=32 --burst=4 \
  --baseline=artifacts/a2-obs-baseline/summary.json \
  --regression-threshold=20 --out=artifacts/a2-obs-candidate
```

**Не подменять** реальный production-like Chat2/ACL/media traffic двумя synthetic health endpoints. Полноценный профиль требует baseline snapshot, точного dataset size, 2+ API/Worker, конкурентных токенов и media, metrics PG/Redis, остановки PG и Redis по очереди и замера backlog drain; до выполнения PENDING.

**Restore:** `scripts/qa/observability-restore-rpo-rto.sh` запускает одноразовую локальную PostgreSQL с полной Prisma schema, тестовый Prisma engine query, synthetic pending Questions deletion и CourseContentRevision, делает `pg_dump/pg_restore`, сверяет состояние и потерю одной подтверждённой записи после snapshot. Последний exit 0: логическое `pg_restore` **515 мс**, интервал между сохранённой и более поздней подтверждённой записью **227 мс**, намеренно утрачена **1** новая запись. Report `artifacts/a2-obs-restore-summary.json`. Это не full-service RPO/RTO: БД уже запущена, API/Worker не переключались, реальная авария не моделировалась. `fullServiceRto`, `workerAndApiRecovery`, `stagingRpoRto` = PENDING.

**Staging release/rollback runbook:** после отдельного одобрения стенда (1) проверить свежий backup и restore, (2) зафиксировать baseline/time window/SLO и synthetic traffic, (3) expand-only миграция и совместимость предыдущих API/Worker, (4) новая версия за feature flag, canary 10→25→50→100%, (5) контролировать HTTP 5xx/p95, worker backlog/age и firing/resolved, (6) при превышении SLO остановить трафик и откатить feature flag и application, не выполнять destructive schema rollback, (7) проверить API/Worker health, сохранённые outbox/DLQ и повторное выполнение, (8) записать timestamps, фактические RPO/RTO, incident alert receipts. Внешних операций не выполнять без разрешения; статус PENDING.

## Состояние приёмки и команды

| Проверка | Подтверждено |
| --- | --- |
| `pnpm --filter @gafus/logger build` | PASS |
| `pnpm --filter @gafus/prisma exec prisma generate`; `pnpm --filter @gafus/prisma typecheck` | PASS |
| `node --test scripts/qa/otel-local-collector.test.mjs` | 4/4 PASS: W3C, safe metrics/logs, callback new trace, отказ коллектора |
| `node --test scripts/qa/observability-multi-instance.test.mjs` | 3/3 PASS: safe endpoints, 2 servers/HTTP errors, p95 regression |
| `pnpm --filter @gafus/api exec vitest run --config vitest.config.ts src/lib/operation-observability.test.ts` | 6/6 PASS |
| `node --test ci-cd/docker/prometheus/health-monitoring.contract.test.mjs` | 5/5 PASS |
| `bash scripts/qa/prometheus-alertmanager-isolated.sh` | 25 rules, два promtool fixture suites, firing+resolved webhook PASS |
| `bash scripts/qa/observability-restore-rpo-rto.sh` | PASS: real PG query event, full-synthetic schema snapshot |
| `pnpm --filter @gafus/api typecheck` | **NOT PASS** в checkout этого worktree: HEAD не содержит незакоммиченных server-side модулей агентов 1/3 и сборочных outputs workspace; нужен общий merge и build dependency graph |
| Вся общая матрица 18 сценариев, 33 локальных этапа, 5 аварийных этапов, полный Web/Mobile/Admin/Trainer | **PENDING** на объединённом snapshot (не считать этим логом подтверждённой) |

### Handoff / встраивание

1. **Agent1:** сохранить в `apps/api/src/app.ts` вызов `operationMetricsMiddleware`, защищённый bearer-only `/internal/metrics`, прокинуть `API_METRICS_KEY` и OTLP переменные в Compose и `apps/api/src/index.ts`. Ни один ID/PII не должен попадать в метрики.
2. **Agent3:** сохранить Worker execution counters, `operationId` в durable Chat2 outbox, `traceChat2DispatchStage`, Cloud Job intent/jobId и callback reconciliation. Worker и Cloud логи должны содержать операционные ID/attempt IDs, а не содержимое чатов/SQL.
3. **Merge owner:** пересобрать lockfile, типизировать монорепозиторий, проверить OTLP + Alloy, Grafana dashboards и promtool на объединённом дереве. Контекстные overlay-файлы этого worktree: `apps/api/src/app.ts`, `ci-cd/docker/docker-compose.prod.yml`, `packages/worker/src/chat2-outbox-worker.ts`, `packages/worker/src/chat2-outbox-metrics.ts`, `packages/prisma/schema.prisma` — **не включать** в отдельный коммит агента 2.
4. Все метрики выводить из каждой реплики с уникальным instance label; проверять worker counter resets после рестарта и алерты `up=0` / absent. Отдельно установить настоящий pool-wait probe и запустить нагрузку с 360p/ACL для p95/p99.

### Два внешних критерия

**№16:** частичная локальная OTLP корреляция PASS; реальные HTTP→Application→outbox→Worker→Cloud→callback→конечное состояние и запрос к развёрнутому searchable storage **PENDING**. Нужны изолированный Cloud Job, callback receiver, traces backend query, записи с одним persisted `operationId` и разными request/attempt IDs, выборка из исторических данных.

**№17:** локальный Prometheus→Alertmanager→webhook `firing` и `resolved` для 360p+DLQ **PASS**; стендовый рабочий канал и квитанция получателя **PENDING**. Не утверждать production routing.

**Никакого production release/deploy или внешнего Cloud Job не выполнялось.** Полная оценка архитектуры 9–9.5/10 не подтверждена, пока остаются внешние gates и неполная регрессия.

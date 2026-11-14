# Агент 3 — матрица совместимости с A2 и основным деревом перед локальным объединением

**Срез:** `2026-11-12T04:02:18+04:00`; основное дерево `gafus-refactor` HEAD `0dcd18c13c8d`; отдельная рабочая копия A2 `gafus-agent2-observability` HEAD `bd93aef2234e`. Общий предок `0dcd18c13c8d`. Только read-only сравнение, **не** Git merge/cherry-pick/commit/push.

## Результат сопоставления

- **Прямых совпадений путей A3 с реальными изменениями A2: 0 из 39 путей** финального A3-манифеста. Не путать это с совпадением кода на уровне функций и импортов.
- **22 пересечения путей** между всеми изменениями **основной** рабочей копии и коммитами/незакоммиченными изменениями A2; среди них **11 совпадают побайтово** и **11 различаются**. Эти 22 не являются «22 изменениями A3».
- Оба дерева не чистые; `git status` на момент среза: main — **1773** путей, A2 — **41**; staged **0 / 0**.
- Снимки и SHA-256 **обоих** путей в `docs/audit/gafus-agent-3-cross-worktree-premerge-20261112.json`. Статус `same` относится к конкретному снимку, не означает финальное разрешение интеграции.

## 22 спорных пути между main и A2: кто решает, какие тесты, как переносить

| Файл | Байты main ↔ A2 | Источник истины / ручной риск | Зависимые тесты | Решение |
| --- | --- | --- | --- | --- |
| `apps/api/src/app.ts` | совпадают | A1 API composition; A2 observability only; **LOW** | API route tests; A2 multi-instance local test | Both dirty and SHA-identical today. Do not replay A2 full app patch; A1 reviews route/telemetry wiring. |
| `apps/api/src/lib/operation-observability.test.ts` | совпадают | A2 observability; **LOW** | apps/api/src/lib/operation-observability.test.ts | Byte-identical test; stage only once under A2 ownership. |
| `apps/api/src/lib/operation-observability.ts` | **различаются** | A2 observability; **HIGH** | apps/api/src/lib/operation-observability.test.ts; A2 OTLP synthetic trace | Different revisions; A2 owns semantic PII-safe fields, reconcile source changes rather than overwrite latest main. |
| `ci-cd/docker/docker-compose.prod.yml` | совпадают | A1 release approval + A2 observability services; **MEDIUM** | docker compose config on integration; A2 staging preflight | Both dirty, same bytes now; do not redeploy or replay compose changes. |
| `ci-cd/docker/grafana/dashboards/gafus-api-latency.json` | **различаются** | A2 observability dashboards; **MEDIUM** | A2 Grafana dashboard/OTLP receipt | Different JSON; preserve latest validated panel expressions/labels. |
| `ci-cd/docker/grafana/dashboards/gafus-media-chat.json` | совпадают | A2 observability dashboards; **LOW** | A2 Grafana media dashboard receipt | Identical JSON; import once, no patch conflict. |
| `ci-cd/docker/grafana/dashboards/gafus-operations-reliability.json` | совпадают | A2 observability dashboards; **LOW** | A2 Grafana operations receipt | Identical JSON; import once, no patch conflict. |
| `ci-cd/docker/prometheus/config.alloy` | **различаются** | A2 telemetry pipeline; **HIGH** | A2 OTLP collector test; staging preflight | Different Alloy config; avoid losing filtering and exporter routes. |
| `ci-cd/docker/prometheus/gafus-alerts.promtool.test.yml` | совпадают | A2 alerting; **LOW** | promtool test rules; A2 alert firing/resolved | Same file bytes; use one A2 copy. |
| `ci-cd/docker/prometheus/gafus-alerts.yml` | **различаются** | A2 alerting; **MEDIUM** | promtool test rules; A2 alert firing/resolved | Different alert expressions; compare 360p/DLQ thresholds and labels, no blind replacement. |
| `ci-cd/docker/prometheus/health-monitoring.contract.test.mjs` | **различаются** | A2 monitoring contracts; **MEDIUM** | node --test ci-cd/docker/prometheus/health-monitoring.contract.test.mjs | Different acceptance contracts; keep matching rules and test assertions. |
| `docs/audit/gafus-agent-2-observability-20261111.md` | **различаются** | A2 audit history; **LOW** | A2 local receipt JSON and replay logs | Separate provenance; never replace more recent receipts with stale notes. |
| `packages/logger/package.json` | совпадают | A2 telemetry deps; **LOW** | API Worker typecheck; pnpm frozen lockfile | Same dependency declarations; avoid duplicate edits. |
| `packages/logger/src/serverTelemetry.ts` | **различаются** | A2 telemetry APIs and sanitization; **HIGH** | API operation-observability.test.ts; Worker tracing.test.ts; A2 OTLP local | Different implementations; preserve PII-safe spans and stable correlated IDs, A2 decides final implementation. |
| `packages/prisma/schema.prisma` | **различаются** | A3 schema/migrations + A2 generator metrics; A1 shared models; **HIGH** | prisma validate/generate; chat2-outbox-isolated-pg.sh; A2 metrics QA | Same Chat2 DLQ fields; A2 adds generator previewFeatures metrics absent in main. Merge exact generator option after A3/A1 schema signoff, never replace full schema. |
| `packages/worker/src/chat2-outbox-metrics.ts` | совпадают | A2 metrics contract; A3 worker consumer; **MEDIUM** | src/chat2-outbox-metrics.test.ts; A2 Prometheus sampling | Same SHA, both untracked; import exactly once to avoid duplicate-add conflict. |
| `packages/worker/src/chat2-outbox-tracing.ts` | совпадают | A2 trace contract; A3 worker consumer; **MEDIUM** | src/chat2-outbox-tracing.test.ts; A2 OTLP trace receipt | Same SHA, both untracked; import once, verify operationId across retries. |
| `packages/worker/src/chat2-outbox-worker.ts` | совпадают | A3 Worker/outbox semantics; A2 tracing/metrics integration; **HIGH** | src/chat2-outbox-reliability.test.ts; chat2-outbox-multiprocess-acceptance.sh; A2 multi-instance | Both dirty, identical bytes now; preserve A3 CAS/lease/idempotency and A2 bounded labels/traces, do not replay two separate worker patches. |
| `packages/worker/src/reliable-job-policy.ts` | совпадают | A3 retry semantics signoff; A2 originally added support; **MEDIUM** | src/reliable-job-policy.test.ts; chat2-outbox-multiprocess-acceptance.sh | Same SHA and both untracked; review terminal/retry classifications once under A3 owner. |
| `pnpm-lock.yaml` | **различаются** | A1 common dependency lock; A2 dependency additions; **HIGH** | pnpm install --frozen-lockfile on integration; API Worker typecheck | Different lockfile revisions; regenerate once in integration via A1, never replace with A2 lockfile. |
| `scripts/qa/otel-local-collector.test.mjs` | **различаются** | A2 OTLP local QA; **MEDIUM** | node --test scripts/qa/otel-local-collector.test.mjs | Different test revisions, choose A2 validated local acceptance with safe synthetic data. |
| `scripts/qa/prometheus-alertmanager-isolated.sh` | **различаются** | A2 alerting QA; **MEDIUM** | A2 local alert manager firing/resolved test | Different shell QA; preserve bounded localhost and cleanup without prod alerts. |

## Четыре стыка собственного потока A3 с основным деревом (не изменения A2)

Эти файлы **не изменялись в A2 относительно её HEAD / общего предка**, но в основном дереве они включают работу **A3 и A1**. По исходному handoff A3 допустимы только обозначенные фрагменты:

| Смешанный файл | Владелец и изменения | Риск | Зависимая приёмка | Правило |
| --- | --- | --- | --- | --- |
| `apps/api/src/routes/v1/admin-media.ts` | A3 DLQ GET/POST endpoints; A1 keeps stats/service changes | **HIGH** | A3 admin DLQ real-PG and API contract; core boundary | Only apply A3 DLQ route hunks, preserve A1 statistics import; A2 did not modify path |
| `apps/admin-panel/src/admin-live/App.tsx` | A1 page composition, A3 conditional ADMIN ChatOutboxPanel mount | **HIGH** | A3 ChatOutboxPanel.mounted.test.tsx; Admin full suite | Apply only import/mount, preserve A1 navigation and role guard; no A2 edit |
| `packages/worker/tsconfig.json` | A3 only consultation-server/booking-application TS paths; A1 owns remaining paths | **HIGH** | pnpm --filter @gafus/worker typecheck | Do not replace 323-line parallel TS paths diff with A3 one-line patch |
| `scripts/qa/account-cleanup-snapshot-isolated-pg.smoke.ts` | A1 account cleanup QA, A3 only composition import fix | **MEDIUM** | bash scripts/qa/account-cleanup-snapshot-isolated-pg.sh | Keep A1 fixture; ensure A3 import points at API composition |

## Смежные файлы A2, отсутствующие в явном списке A3 (не переносить как A3)

| Файл | Источник | Риск | Зависимость / правило |
| --- | --- | --- | --- |
| `packages/prisma/src/client.ts` | A2 telemetry instrumentation | **MEDIUM** | A2 isolated Prisma query metrics; pnpm --filter @gafus/prisma typecheck; A2 committed source differs from main committed baseline; adopt only after verifying Prisma client metrics mode |
| `packages/worker/src/a2-observability-private-worker.ts` | A2 private synthetic runner | **LOW** | A2 observability-multi-instance localhost-only QA; A2-only test module absent from main; add for shared local tests, never wire into production Worker by default |

### Важные интеграционные детали

- **`packages/worker/src/chat2-outbox-worker.ts`** отсутствовал среди 39 A3-манифест-путей, однако по таблице владения это A3 Worker runtime. В обоих деревьях файл **сейчас побайтово одинаков**, уже включает A2 tracing/metrics. В будущем конфликт может быть **семантическим**: не потерять fencing/CAS/ACK/dedup при дальнейших правках. Подтверждать минимум `chat2-outbox-multiprocess` и Worker unit/reliability.
- **`packages/worker/src/chat2-outbox-{metrics,tracing}.ts` и `reliable-job-policy.ts`**: лежат как untracked в обоих деревьях, содержимое одинаковое. Нельзя одновременно «добавлять» их обеими копиями. A2 определяет контракт телеметрии, A3 принимает retry semantics и runtime call-sites. Стандартный `git diff` по untracked их не увидит, поэтому есть SHA-256 в JSON.
- **`packages/prisma/schema.prisma`**: два грязных дерева, SHA различен. Отличающийся пункт `generator client.previewFeatures = ["metrics"]` в A2 — сознательная опция observability; единую схему, реальные outbox поля/migrations и `prisma generate` согласовать с A1/A3. **Нельзя** брать весь `schema.prisma` одного агента поверх другого, особенно при работающей миграции.
- **`pnpm-lock.yaml`**: владелец финального lockfile — A1; A2 добавлял телеметрические зависимости. Не переносить файл по стратегии «последний победил»: пересобрать/frozen проверить один раз на согласованном локальном кандидате.
- **`apps/api/src/app.ts`**: одинаковые байты и обе копии dirty, но точка принадлежит A1; A2 instrumentation интегрировано на текущем снимке. Дублирующий патч потенциально размоет подключение маршрута A3 DLQ. Сверять зарегистрированный `adminMediaRoutes` на фактическом API.
- **Список 22 строк** включает dashboard/test/lockfile/monitoring paths, которые **A3 не должен менять**. Их источники истины и тесты приведены, чтобы не считать эти расхождения частью A3 patch.

## Компактная приёмка Worker/DLQ для *будущей* объединённой ветки

Подготовлен **один** отдельный скрипт `scripts/qa/a3-merged-worker-dlq-acceptance.sh` в A3 QA. Проверка текущего общего дерева не есть проверка будущего объединения.

```bash
bash scripts/qa/a3-merged-worker-dlq-acceptance.sh --plan
bash scripts/qa/a3-merged-worker-dlq-acceptance.sh a3-merged-integration-001
```

- **10 независимых gate**: Prisma/Core boundary, Worker TypeScript, 7 файлов Worker-тестов включая A2 metrics/tracing/retry, real PostgreSQL outbox lease/CAS, два Worker process с потерей ACK, реальный Redis/BullMQ unknown ACK, API DLQ unit, real Hono+PG DLQ ACL/CAS, UI mounted DLQ, real PG+Redis media priority burst.
- **Все 10/10 PASS на исходном совместно изменяемом дереве** в проверочном запуске `a3-merged-preflight-nov12-r2` (exit 0); журнал `~/Library/Logs/gafus-refactor-regression/a3-merged-preflight-nov12-r2/results.tsv`. Первоначальный r1 остановился на TS2305 в чужом Worker cron/подписках, повторный r2 прошёл **без исправления чужих файлов A3**.
- Уникальный run ID обязателен, существующая квитанция не перезаписывается. Каждый gate пишет отдельный лог, `results.tsv`, `source.txt` (HEAD/ветка/чистота) и `source.sha256` девяти файлов на **реальном объединённом кандидате**. При любом отказе собираются остальные независимые результаты и скрипт возвращает **exit 1**; зелёным считается только полный 10/10.
- Доступ к удалённым Cloud.ru/Beget, production, личному Chrome, общим PG/S3 **не требуется**. Входные секреты провайдеров и shared `DATABASE_URL`/`REDIS_URL` не наследуются; тесты создают/удаляют свои локальные PG/Redis и broker fixtures. Для внешних проверок требуется отдельный утверждённый стенд из финального handoff.

## Условия разрешённого локального объединения после A1

1. Зафиксировать единый source snapshot и SHA-256 A3 scope из `gafus-agent-3-final-local-handoff-20261112.json`, сверив текущие изменения перед переносом.
2. A1 принимает общие API/админку/tsconfig/lockfile, A2 принимает logger/OTLP/Prometheus/metrics contracts, A3 — Worker runtime, Cloudru/Chat2 policy, DLQ и Prisma migration. Смешанные фрагменты изменяет **один** назначенный владелец.
3. Не пересобирать весь монорепозиторий на двух правках. Сначала этот 10-gate компактный QA и A2 OTLP локальные контракты, затем **один** полный global build/typecheck/regression на финальном едином дереве.
4. Любой byte-different entry с риском HIGH обязан пройти ревью исходного контракта и зависимых тестов до Git commit/merge/push. Совпадающие SHA-файлы не копировать второй раз.
5. Внешние Cloud.ru/Beget остаются `PENDING` до подтверждения nonprod project/Job/edge/запроса полномочий. Исторические 16 PG ошибок также не закрываются по новому 16/16.

**Состояние передачи:** файлы `docs/audit/gafus-agent-3-cross-worktree-premerge-20261112.{md,json}` и QA runner созданы в текущем Mac `gafus-refactor`. **Никакого Git merge/add/commit/push или изменения чужого кода.**

# Agent 3 → Agent 2: общий стенд и оставшиеся проверки, 12.11.2026

Это **требования к совместной приёмке**, а не утверждение, что агент 2 уже провёл внешнюю проверку. Сверены исходные планы `docs/audit/gafus-agent-{2,3}-*-20261111.md`, отчёт `/Users/asmtv1/Desktop/gafus-agent2-observability/docs/audit/gafus-agent-2-observability-20261111.md` и реальные локальные квитанции. Не создавать вторую подсистему трассировки, алертов, генератор нагрузки или схему медиа.

## Выполненное агентом 3

- Предыдущая локальная PG/Redis/Centrifugo/MinIO media приёмка `a3-jobs-media-nov12-r3/results.tsv`: **16/16 PASS**. Chaos `a3-jobs-20261111-r2/chaos-results.tsv`: **5/5 PASS**. Это не свежий полный CI после параллельных правок.
- **Prisma-граница DLQ исправлена:** API test `apps/api/src/routes/v1/admin-media-dlq.real-pg.test.ts` больше не импортирует `@gafus/prisma`; seed/read/reset доступны только через `packages/prisma/tests/a3AdminDlqFixture.ts` с жёстким guard disposable loopback PG. `bash scripts/qa/a3-admin-dlq-isolated-acceptance.sh`: **5/5 PASS**, включая auth 401, MODERATOR 403, redacted list, CAS 409, 6 конкурентных retry (1 успешный, 5 конфликтов).
- **Настоящий Admin Panel в существующем Google Chrome** через локальный MCP McpGo `127.0.0.1:8940`, без отдельного профиля/Chromium. Vite UI → настоящий Hono admin-media → disposable PostgreSQL: ADMIN видит запись; кнопка сбрасывает DB CAS; занятая запись даёт видимую ошибку 409; MODERATOR получает HTTP 403 и не видит административное меню; ADMIN восстанавливает доступ. `bash scripts/qa/a3-admin-dlq-browser-full-acceptance.sh a3-jobs-dlq-browser-nov12-r3` **exit 0**; `~/Library/Logs/gafus-refactor-regression/a3-jobs-dlq-browser-nov12-r3/browser-results.log`; вкладка и тестовые API/Vite/PG остановлены. Использован **synthetic role middleware** в QA, а не настоящая пользовательская сессия; middleware 401 отдельно проверен в PG.
- Media priority burst: 220 synthetic media wake, реальные Redis/PostgreSQL, по два BullMQ Worker на каждой из двух медиа-очередей, два конкурирующих SQL outbox dispatcher: **1 event доставлен до разгрузки медиа**, `a3-jobs-media-nov12-r3/media-priority-burst.log`. Это не многоинстансный production-like профиль A2.
- Beget offline production-script safety tests **4/4 PASS** (`node --test infra/cloudru/beget-synthetic-acceptance.test.mjs`); **не** реальные Beget 403/404.

## Один стенд и разделение ответственности

| № | Агент 3 — сценарий/результат | Агент 2 — измерение на ТОМ ЖЕ сценарии |
| --- | --- | --- |
| 4–9, 14 | Outbox rollback/commit, CAS lease/takeover, DLQ, ACK unknown, `clientMessageId`, один бизнес-эффект; дать event ID и timeline | Имеющиеся `operationId`, traces, `job_attempts_total`, `gafus_chat2_outbox_dead_letters`; firing/resolved. Не дублировать Hono/Worker |
| 7, 10–13 | Только approved nonprod Cloud.ru Job: реальный потерянный ACK, поздние/двойные/out-of-order callbacks, Cloud run ID, S3 HEAD/ETag и 720→360 state/lease | OTLP lookup, p95/p99, Worker backlog/drain, stalled-360 firing/resolved на тех же `operationId` |
| 18 | Только отдельный Beget stage CDN+origin: GET/HEAD/Range allow, реальные 403/404 deny, нет S3 fallback, адресный purge | HTTP/error spans, ACL metrics на тех же пробах; не делать вторую CDN-схему |
| 8.1–8.4 agent2 | Agent3 даёт медиа/ACK/failure injectors, после provider разрешения | Переиспользовать `scripts/qa/observability-multi-instance.mjs` (не писать второй load driver), topology 2+ API/Worker, baseline vs candidate, p50/p95/p99, drain, PG/Redis recovery, full-service RPO/RTO, rollout/rollback |

**Корреляция:** `operationId` хранить в durable intent, новые `requestId`/`traceId` на HTTP и callback, `outboxEventId`, `cloudJobId/runId`, `callbackId`, `attempt`, `mediaRevision`, `leaseToken`, UTC timeline с intent/claim/execute/ACK/callback/S3 HEAD/final CAS/720/360. Callback может открыть новую trace с прежним `operationId`; не подделывать parent span. Нельзя писать PII, chat body, signed URL, objectKey, cookie, SQL params и секреты в логи/метки. IDs только в защищённых трассах/диагностике, **никогда** в labels Prometheus.

**У A2 уже есть:** `http_requests_total`, `http_request_duration_seconds`, `http_inflight_requests`, `db_query_duration_seconds` (это **не** pool wait), `dependency_errors_total`, `gafus_chat2_outbox_pending`, `gafus_chat2_outbox_oldest_age_seconds`, `gafus_chat2_outbox_dead_letters`, `job_attempts_total`, `job_failures_total`, `job_duration_seconds`, `gafus_media_stalled_processing`, `gafus_media_failed_tasks`; Grafana API/Latency, Media/Chat, Operations Reliability, Storage/Dependencies; 25 Prometheus rules. `db_pool_wait_seconds` и развёрнутый OTLP searchable storage **PENDING**. №16: полная трасса Cloud callback PENDING; №17: firing/resolved в рабочем стендовом канале PENDING (только local webhook PASS). Трассировка, метрики, load driver и restore runbook принадлежат агенту 2.

## Внешний stage gate: НЕ ГОТОВ

Перед любым внешним `:execute`, S3 mutate, callback или Beget purge нужны **все** подтверждения:

1. Выделенный **nonproduction Cloud.ru project/Job для 360p** с закреплённым image digest, отдельным nonprod `Core` и подписанным callback, который не смотрит на `api.gafus.ru`; реальные project/job/run IDs, статус и права проверены read-only.
2. Изолированные staging bucket/object prefix, IAM роль только для синтетики, отсутствие доступа к объектам пользователей, TTL и owner очистки. 720p остаётся доступным, 360p никогда не перезаписывает более новую версию.
3. Отдельный **Beget staging CDN service/hostname** с тестовым origin и подтверждённым ACL; 403/404, fallback и purge проходят только для своих синтетических объектов. Существующий `infra/cloudru/beget-synthetic-purge-acceptance.mjs --run` указывает на production service IDs — **не запускать как stage**.
4. Агент 2 готовит **одну** общую топологию 2+ API/Worker, PostgreSQL/Redis/Centrifugo/MinIO, OTLP query backend, Prometheus/Alertmanager, baseline dataset/run manifest и безопасные destinations. Агент 3 приносит external failure scenarios, A2 снимает p95/p99, RPO/RTO и firing/resolved на тех же событиях.
5. Документированное разрешение на перечисленные изолированные ресурсы и операции, период/квоты/rollback, отсутствие prod IDs; наличие `.env` или старого бэкапа **не означает** разрешения.

**Инвентаризация 12.11:** текущий shell не содержит экспортированных `CLOUDRU_*`, `BEGET_*`, `GAFUS_STAGING_*`; старый `~/.codex/cloudru/gafus-media-core-staging/core.env` датирован **12.10.2026**. `infra/cloudru/staging-job-connect.mjs` содержит allowlist `gafus-feed-video-staging`, но фактический текущий stage job/run не подтверждён, Chat2 и Beget nonprod stage отсутствуют в доказательной базе. Сохранённые Cloudru JSON backup/release-скрипты относятся к прежним состояниям, а не к доступности стенда сегодня. Известные `gafus-feed-video[-2]` и `gafus-chat-video[-2]` — production: **не использовать**. На Cloud.ru/Beget не выполнялись удалённые чтения, запуски или изменения; реальные проверки остаются PENDING.

## Поиск исторических 16 отказов

Источник формулировки — `docs/audit/core-server-bulk-progress-20261111.md` раздел «Открытые проверки» и `docs/audit/gafus-agent-3-reliability-20261111.md`. Указаны устаревшее ожидание Gallery server-side publish и старый тестовый видеоформат account cleanup (позже локально исправлен), **но нет точных 16 test IDs/команды/лога**. Проверены **2864** локальных файла в `~/Library/Logs/gafus-refactor-regression` и `/tmp` и ещё **8465** файлов в `.local-pg-scratch`, `artifacts`, `.gafus-refactoring`. Найденные текстовые совпадения `16 failed` относятся к **другим** Web/API/октябрьским проверкам. Ни один из них не доказывает исходный единый PostgreSQL media run. Новые **16/16 PASS — не те исторические 16 ошибок**.

**Зависимость от владельца исходного прогона (агент 1):** точный run ID, команда, лог или CI artifact, git SHA/снимок, PG fixture и 16 test IDs с expected/actual. Затем агент 3 поштучно классифицирует дефект / старый Gallery entrypoint / среду и повторяет единый интеграционный PG media suite, а A2 использует **этот же dataset и timeline**, без дублирования.

## Стыки с параллельными изменениями агента 1

- После устранения **своего** Prisma импорта `node scripts/check-app-prisma-boundary.mjs` и затем полный `pnpm check:core-boundaries` прошли. Позднее при параллельных правках **новый** полный boundary gate упал на других тестах агента 1: `apps/api/src/modules/daily-course/composition/dailyCourseService.real-pg.mounted.test.ts` и `g1-daily-bound-work.realpg.test.ts` непосредственно импортировали `@gafus/prisma`. Агент 3 эти чужие тесты/allowlist не меняет; владельцу надо также вынести ORM в тестовый persistence fixture.
- Независимый API TypeScript gate ранее сообщал `TS2307` для `@gafus/core/services/course/publicOutlinePolicy` в `read-public-outline.ts`; **повтор 12.11** `pnpm --filter @gafus/prisma typecheck && pnpm --filter @gafus/admin-panel typecheck && pnpm --filter @gafus/api typecheck` завершился **exit 0 для всех трёх**. Однако общий `pnpm check:core-boundaries` повторно остаётся **FAIL на двух чужих Daily Course тестах**; не записывать green baseline до исправления владельцем и повторного 33-stage integration на одном snapshot.
- Наличие **долговременного** журнала оператора для ручного DLQ retry не подтверждено: роли, Hono/PG CAS и real Chrome UI проверены, но audit attribution требует совместимого решения владельца Prisma/DB (агент 1) и безопасного telemetry-контракта (агент 2). Не объявлять это частью подтверждённого PASS.

## Граница полномочий

Agent3 не редактирует инструментарий/CI агента 2, Prisma-схему и общий `apps/api/src/app.ts` агента 1, не запускает production/stage provider без проверенного манифеста, не делает deploy, push и реальный purge. **Полный внешний PASS возможен лишь после одного согласованного изолированного стенда и исходной исторической 16-case квитанции.**

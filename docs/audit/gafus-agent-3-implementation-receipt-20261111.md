# Агент 3 — Worker, outbox, Chat2 и медиа: локальная приёмка 11.11.2026

## Граница и снимок

- Исходное дерево: `/Users/asmtv1/Desktop/gafus-refactor`, HEAD `0dcd18c13`, включая **716 изменений отслеживаемых файлов, 207 удалений, 716 новых файлов** на момент синхронизации. Изменения других агентов не перезаписаны.
- Независимая рабочая копия: `/Users/asmtv1/Desktop/gafus-agent3-worker`, ветка `a3-worker-outbox-20261111`, префиксы прогонов `a3-jobs-`.
- Вся локальная работа проведена через McpGo-Terminal1, только disposable PostgreSQL/Redis и синтетические провайдеры. `gafus1`, production, настоящие S3/Cloud.ru Jobs и Beget edge не менялись.
- Агент 1 отвечает за бизнес-команды/удаление аккаунта/финансы, агент 2 — за инструментирование/метрики/панели. Этот отчёт описывает исполнение фоновых задач и требуемые стыки, не переносит чужие бизнес-правила.

## Реестр критичных фоновых операций

| Контур / приоритет | Постановка и устойчивое состояние | Защита повтора / lease / восстановление | Квитанция / открытый риск |
| --- | --- | --- | --- |
| Chat2 сообщения и события / P0 | `apps/api/src/modules/chat2/service.ts` пишет бизнес-строку вместе с `Chat2OutboxEvent`; `packages/worker/src/chat2-outbox-worker.ts` доставляет Centrifugo и push | `event.id`, `claimToken`, `claimedUntil`, `nextAttemptAt`, ограниченные попытки, `deadLetteredAt`; push receipt уникален по `(messageId,recipientId)`; повтор брокера использует тот же event ID | `architecture-chaos-local`: rollback/commit, 2 процесса, потеря ACK, lease takeover и DLQ PASS; HTTP + WS по существующему изолированному контракту, повтор после broker ACK допускает повтор транспорта, но не эффекта |
| Chat2 720→360 / P1 | `Chat2V2MediaTask`, `apps/api/src/modules/chat2/media-v2-jobs.ts`; подписанные HMAC routes `apps/api/src/routes/internal/chat2-media-jobs.ts`; запуск `packages/worker/src/chat2-media-processing-trigger-worker.ts` | 4 попытки, `attemptToken`, 3-минутный lease, SQL `FOR UPDATE SKIP LOCKED`, `renew/complete/fail`, `READY` 720p не блокируется незавершённым 360p; `chat2-media-recovery.ts` ищет due и старые leases | isolated PG recovery 3/3 PASS; настоящий Cloud.ru 360p callback + потерянный ACK **PENDING** |
| Feed/Moments video / P1 | `FeedStorageJob`, `packages/feed-server/src/internal.ts`, `packages/worker/src/feed-processing-trigger-worker.ts` и Cloud.ru feed video pool | `attemptToken` + `leaseUntil`, `availableAt`, bounded dispatch, `feed-media-recovery.ts`; retired photo Cloud jobs запрещены; 720/360 и публикация тестируются отдельно | unit and local media tests PASS; actual Cloud.ru run and callbacks **PENDING** |
| Gallery client WebP / P1 | `packages/gallery-server/src/dispatcher.test.ts`, `client-photo-dispatch.test.ts`: публикация клиентским `/client-complete`, старый `/complete` отклоняется | ACL/owner service, S3 verification и ограниченная fallback-ветка; серверный photo Job выведен | Gallery server 43 unit PASS; три абсолютных пути старых тестовых guards привязаны к исходному root; edge **PENDING** |
| Questions media/cleanup / P1 | `QuestionV2MediaTask`, `apps/api/src/modules/questions/media-v2-upload.ts`, `media-v2-jobs.ts`, `apps/api/src/routes/internal/questions-media-jobs.ts` | Подписанный запрос с nonce anti-replay, `attemptToken`, lease, проверка владельца, отдельная очистка; старая photo-delivery не восстанавливается Cloud photo Job | isolated PostgreSQL media deletion PASS; реальный CDN/S3 **PENDING** |
| Media deletion и CDN purge / P1 | `MediaCdnPurge`, `PetMediaDeletionIntent`, `Chat2MediaDeletionIntent`, `packages/media-server/src/mediaCdnPurgeRepository.ts`, `packages/worker/src/media-cdn-purge-worker.ts` | Уникальный intent, атомарный enqueue, fencing, durable checkpoint Beget operation IDs; ack/retry после внешнего удаления | PG media-deletion outbox PASS, CDN purge PG 5/5 PASS; настоящий Beget 403/404 **PENDING** |
| Account cleanup / P0 | Агент 1: атомарная запись в `packages/identity-write-server/src/account-cleanup-records.ts`; агент 3: `packages/worker/src/accountCleanupWorker.ts`; `AccountStorageCleanup` | Owner/token CAS, retry с сохранением невыполненных ключей и операций purge; доступность не зависит от gallery/feed feature flags | phase F / другие тесты локально, независимый реальный провайдер **PENDING**, business enqueue принадлежит агенту 1 |
| Уведомления, push и письма / P1 | `GafusNotificationOutbox`, `FeedNotificationOutbox`, `TransactionalMailOutbox`; `packages/notifications-server/src/gafus-delivery.ts`, `packages/mailer/src/outbox.ts`, Worker cron | Уникальные recipient/event intent там, где определены; attempts, lease/fencing, terminal/unknown, mailbox monitor; важно отделять результат провайдера от подтверждения БД | unit и phase F по NPD email PASS; реальный провайдер не проверен |
| NPD, экономические события / P0 | `NpdReceiptOperation`, `NpdReceiptEmailDelivery`, `GafusNotificationOutbox`; business mutation и курс правил у агента 1 | Идемпотентность economic event и single SQL effect — владелец агент 1; Worker не должен повторять признанный `UNKNOWN` без сверки | phase F PG CAS/UNKNOWN recovery PASS; остальную экономическую приёмку подтверждает агент 1 |
| Аналитика / P2 | `packages/worker/src/cron-scheduler.ts` (smart-feed training, статистика, материальные представления) | Отдельный cron и gate; 2 реальные Redis Worker на каждую из двух медиа-очередей, одновременно 2 конкурирующих SQL Chat2 outbox dispatcher | **PASS synthetic burst 220 video-wakes / actual PG+Redis**, критический outbox доставлен до опустошения очередей; общий live multi-instance Cloud.ru/analytics burst **PENDING** |

## Отображение общих статусов на фактическую схему

У существующих систем нет одной enum `PENDING/RUNNING/RETRY_WAIT/COMPLETED/FAILED/DEAD_LETTER/CANCELLED`. Это **отображение**, а не новая миграция:

| Фактическая запись | PENDING / RUNNING / RETRY_WAIT | COMPLETED / FAILED / DEAD_LETTER | Уникальность и предел |
| --- | --- | --- | --- |
| `Chat2OutboxEvent` | `deliveredAt IS NULL`, действующий `claimToken` + `claimedUntil`, будущий `nextAttemptAt` | `deliveredAt IS NOT NULL`, `deadLetteredAt IS NOT NULL`; отдельного persisted `status` нет | событие `id`, опциональный `operationId`; `Chat2Message` имеет `@@unique([conversationId,authorId,clientMessageId])`; budget в Worker |
| `Chat2V2MediaTask`, `QuestionV2MediaTask` | `AWAITING_UPLOAD`, `QUEUED`, `PROCESSING`, `nextAttemptAt`, `attemptToken/leaseUntil` | `READY`, `FAILED`; результат версионируется отдельно от 360p | `mediaId` / `ownerId`, token CAS, Chat2 4 attempts в service |
| `FeedStorageJob` | `pending`, `processing`, `availableAt`, `attemptToken/leaseUntil` | `completed`, `failed` | `dedupeKey @unique`, `attemptToken @unique` |
| `MediaCdnPurge`, `AccountStorageCleanup` | `pending`, `processing`, `availableAt`, `attemptToken/leaseUntil` | terminal `completed/failed` по коду конкретного репозитория | purge ID / `@@unique([ownerId,scope])` для cleanup |
| `GafusNotificationOutbox` | `PENDING`, `PROCESSING`, `availableAt`, `attemptToken/leaseUntil` | `DONE`, `FAILED` | `attemptToken @unique`; recipient/event по бизнес-ключу |
| `TransactionalMailOutbox` | `PENDING`, lease owner/expiry, `nextAttemptAt` | terminal delivery status и manual `UNKNOWN` resolution по outbox module | попытки и квитанции в mailer, не повторять неоднозначный provider ACK без сверки |

`CANCELLED` и самостоятельный SQL `DEAD_LETTER` не существуют универсально для каждого типа задач. Их нельзя объявить поддержанными только по локальной квитанции. Для существующих событий Chat2 применяется `deadLetteredAt`; для прочих типов необходимо сохранять их текущий wire/status-контракт. Расширение общей модели состояния потребует отдельной совместимой миграции и интеграционной проверки с владельцами бизнес-состояний; не вводилось без обнаруженного дефекта.

## Изменения агента 3 поверх синхронизированного дерева

1. `packages/worker/src/feed-processing-trigger-worker.ts`: невалидный UUID wake и снятая с эксплуатации photo-задача выбрасывают `BullMQ.UnrecoverableError`, а не расходуют бюджет повторов.
2. `packages/worker/src/chat2-media-processing-trigger-worker.ts`: та же политика для Chat2.
3. `packages/worker/src/cloudru-trigger-error-policy.ts`: уже существующая защита от потерянного ACK сохранена. Подтверждённые 400/401/403/404/410/422 исполнения Cloud.ru и IAM 401/403 становятся terminal и не повторяют `:execute`; 429 остаётся retryable.
4. `packages/worker/src/{feed-processing-trigger-worker,chat2-media-processing-trigger-worker,cloudru-trigger-error-policy}.test.ts`: тесты постоянных отказов, неизвестного ACK, 429, невалидных ID, retired photo и единственного запуска.
5. `packages/core/src/services/feed/clientVideoReady.test.ts`: тестовая транзакция теперь возвращает `null` из `feedPostRevision.findFirst` при отсутствии pending-ревизии. Так зафиксирован существующий рабочий путь завершения 720p без изменения бизнес-сервиса. В каноническом дереве тестовый пакет 10/10, Core в целом 2077 PASS.
6. `scripts/qa/a3-jobs-media-isolated-acceptance.sh`: объединены 13 локальных независимых этапов, протоколирование `PASS/FAIL` по каждому и безопасный отказ при повторном run ID; проверено 13/13 на полном снимке.
7. `apps/admin-panel/src/admin-live/ChatOutboxPanel.mounted.test.tsx`: 3 смонтированных React-проверки точечного ручного retry, восстановления после 409 и диагностических сбоев (без bulk resend).
8. `apps/api/src/routes/v1/admin-media-dlq.real-pg.test.ts` с `apps/api/vitest.a3-admin-dlq-isolated.config.ts`: 5 Hono/SQL тестов на реальном disposable PostgreSQL, включая actual authMiddleware для неавторизованного клиента, роль MODERATOR, список без внутренних identifiers и CAS при 6 одновременных admin retry.
9. `scripts/qa/a3-admin-dlq-isolated-acceptance.sh`: отдельный временный PG18 с локальным портом, схемой Chat2 outbox и гарантированным cleanup, без общих/боевых БД.
10. `packages/worker/src/a3-media-priority.real-services.spec.ts`, `packages/worker/vitest.a3-priority-isolated.config.ts` и `scripts/qa/a3-media-priority-isolated.sh`: real Redis+PG18, 2 BullMQ Worker на feed, 2 на Chat2 media, по 110 искусственных media-wake jobs, 2 одновременных SQL outbox poller. Один event доставлен единожды через тестовый HTTP broker до завершения очередей.
11. `scripts/qa/a3-jobs-media-isolated-acceptance.sh`: добавлены три новых gate (admin DLQ real PG, priority PG/Redis, admin panel mounted), теперь 16 независимых этапов; повторный итог **16/16 PASS**.
12. Тестовые PostgreSQL для новых SQL acceptance принудительно стартуют с `timezone=UTC`: исходная попытка priority-теста справедливо обнаружила, что локальный PG с унаследованным часовым поясом +04:00 создавал `TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP` на четыре часа вперед относительно Prisma/Node UTC; после явной UTC-конфигурации тест проходит. Это требование к конфигурации окружения, а не правка бизнес-логики; production session timezone не проверен.
13. Без изменений глобальных CI, app.ts, lockfile, logger или бизнес-ACL. Существующие имена очередей, wire-контракт и Cloud jobs не менялись.

## Миграции и совместимость

Новая миграция Prisma **не требуется** для текущих исправлений: сохранены имеющиеся `claimToken`, `leaseUntil`, `attemptToken`, `deadLetteredAt`, idempotency/dedupe keys и текущие wire-ошибки. Поведение BullMQ для невалидных wake и постоянных 4xx изменено только в направлении уменьшения небезопасных повторов. До любого будущего добавления Cloud.ru run binding или общего DLQ необходимо отдельно согласовать схему с агентом 1: расширить БД nullable полями и индексами, на следующем шаге обновить readers, затем writers/Worker, обеспечить совместимость при rollout и отдельно проверить rollback на disposable PostgreSQL с двумя версиями потребителей. Внешнее связывание Cloud.ru Job/run ID с intent **PENDING** — схему без подтверждённого API провайдера не вводили.

## Квитанции локальной приёмки

| Проверка | Результат | Лог/команда |
| --- | --- | --- |
| Зависимости и сборка Worker+52 зависимых packages, Prisma generate | **PASS** | `pnpm --filter '@gafus/worker...' -r build`, `/tmp/a3-worker-rebased-build2.log`, exit 0 |
| TypeScript Worker после изменений (включая тесты) | **PASS** | `pnpm --filter @gafus/worker typecheck`, `/tmp/a3-jobs-final-tsc.log` |
| API mounted route/HMAC/ACL/media CDN/admin DLQ | **59/59 PASS** | `pnpm --filter @gafus/api exec vitest run` для восьми route/module test files; повтор после сборки `@gafus/auth` |
| Адресные отказы Cloud.ru/Feed/Chat2 после финальных добавлений | **38/38 PASS** | `pnpm --filter @gafus/worker exec vitest run src/cloudru-trigger-error-policy.test.ts src/feed-processing-trigger-worker.test.ts src/chat2-media-processing-trigger-worker.test.ts` |
| Isolated PG Chat2 360p, renew/READY/lease | **3/3 PASS** | `~/Library/Logs/gafus-refactor-regression/a3-jobs-media-20261111/chat2-media-recovery.log` |
| Isolated PG transactional media deletion | **PASS** | `~/Library/Logs/gafus-refactor-regression/a3-jobs-media-20261111/media-deletion-outbox.log` |
| Isolated PG media CDN purge, two claims/ACK/lease/retry | **5/5 PASS** | `~/Library/Logs/gafus-refactor-regression/a3-jobs-media-20261111/media-cdn-purge.log` |
| Chaos: 2 Worker + PG rollback/lease + Redis unknown ACK + phase F + backup restore | **5/5 PASS** | `~/Library/Logs/gafus-refactor-regression/a3-jobs-20261111-r2/chaos-results.tsv`, run ID `a3-jobs-20261111-r2`; first attempt failed on missing course-server dist, rebuilt and rerun green |
| Media unit packages, canonical repository root | **610 PASS / 20 SKIP** | `~/Library/Logs/gafus-refactor-regression/a3-jobs-media-nov12/unit-*.log` (gallery-server 43, gallery-storage 78, feed-server 94, media-server 25, chat-server 109, worker 261) |
| Единая локальная медиа-приёмка (13 gates, отдельные disposable PG/Redis/MinIO) | **13/13 PASS** | `bash scripts/qa/a3-jobs-media-isolated-acceptance.sh a3-jobs-media-nov12`; `~/Library/Logs/gafus-refactor-regression/a3-jobs-media-nov12/results.tsv` |
| Дополнительная локальная приёмка на актуальном дереве (16 независимых gates) | **16/16 PASS** | `bash scripts/qa/a3-jobs-media-isolated-acceptance.sh a3-jobs-media-nov12-r3`; `~/Library/Logs/gafus-refactor-regression/a3-jobs-media-nov12-r3/results.tsv` (повтор после последнего изменения теста, 16/16; предыдущий r2 тоже 16/16) |
| ADMIN DLQ: actual Hono authorization + PostgreSQL 18 CAS 6 competing retries | **5/5 PASS** | `a3-jobs-media-nov12-r3/admin-dlq-real-pg.log`; новые адресные тесты не используют базу приложения |
| ADMIN DLQ: смонтированный React UI, exact retry/409/error refresh | **3/3 PASS** | `a3-jobs-media-nov12-r3/admin-dlq-mounted.log`; это не ручной Chrome/browser acceptance |
| Media priority: 2 BullMQ Workers в каждой из двух очередей, реальные Redis/PG, 220 wake, SQL outbox | **1/1 PASS synthetic** | `a3-jobs-media-nov12-r3/media-priority-burst.log`; 1 outbox event доставлен до опустошения backlog, тестовый HTTP broker, не настоящий Cloud.ru |
| Beget edge production-only synthetic acceptance safety guard, offline | **4/4 PASS, network calls absent** | `node --test infra/cloudru/beget-synthetic-acceptance.test.mjs`; `~/Library/Logs/gafus-refactor-regression/a3-jobs-media-nov12-r3/beget-synthetic-offline-guard.log`; **не live Beget edge** |
| TypeScript после дополнительных тестов | **Admin Panel, API, Worker PASS** | `pnpm --filter @gafus/admin-panel typecheck`, `pnpm --filter @gafus/api typecheck`, `pnpm --filter @gafus/worker typecheck`; последовательный запуск завершил все три tsc с code 0 |


| Свежее Chat2 Hono HTTP/WebSocket с PostgreSQL+Redis+Centrifugo | **6/6 PASS** | `~/Library/Logs/gafus-refactor-regression/a3-jobs-media-nov12/chat2-http-websocket.log`: same `clientMessageId`, broker/outbox, ACL, reconnect |
| Свежее CDN HTTP с JWT/MinIO/отзывом доступа | **5/5 PASS** | `~/Library/Logs/gafus-refactor-regression/a3-jobs-media-nov12/cdn-hono-minio.log`; не настоящий Beget edge |
| Полная архитектурная регрессия, общий снимок | **PASS по частям, включая build 61/61, Web 30/30, Mobile, trainer/admin, typecheck** | `a3-jobs-regression-20261111/results.tsv` (первые 5 PASS), `a3-jobs-regression-postcore/results.tsv` (API/Worker и 4 сервиса), `a3-jobs-regression-postfeed/results.tsv` (остальные сервисы и клиенты); Core отдельно 2077 PASS и Feed 94 PASS на canonical root; Web 3144 PASS/6 SKIP, все 303 файла учтены |

**Границы тестов:** независимая рабочая копия первоначально дала 4 отказа в четырёх тестовых файлах (`gallery-storage/src/isolatedNonprodS3.test.ts`, `gallery-storage/src/localReadonlyCdn.test.ts`, `gallery-storage/src/web4PrivateProfile.test.ts`, `feed-server/src/localReadonlyCdn.test.ts`), поскольку их физические guards привязаны к каноническому пути `/Users/asmtv1/Desktop/gafus-refactor`. Для проверки без обхода охранных условий 12 ноября полный пакет повторён **в каноническом каталоге**: Gallery Storage 78 PASS, Feed Server 94 PASS, и общий медиа-run 13/13 PASS. Отдельно Core 2077 PASS/136 SKIP, Worker 261 PASS/13 SKIP, Web 3144 PASS/6 SKIP. Исходные 16 отказов исторического *единого* PG медиа-прогона **не закрыты поштучно**, поскольку оригинальные case IDs и логи не найдены; 13 независимых проверок не доказывают тождественность тому старому прогону. Реальные Cloud.ru Jobs и Beget edge остаются PENDING, несмотря на полностью зелёный локальный стенд. Дополнительно 16/16 новых раздельных gates не являются историческими 16 упавшими case IDs. Ручной доступ к существующему Chrome через MCP Hub на 12.11 возвращает HTTP 429, поэтому административная панель принята смонтированным React-тестом, а браузерная сессия оператора остаётся PENDING.

## Матрица проверок из ТЗ агента 3

| Пункты ТЗ | Состояние | Основание / ожидаемый внешний стенд |
| --- | --- | --- |
| 4–6: rollback/commit, 2 real Worker и fencing | **PASS local** | Chaos outbox-pg и outbox-multiprocess, отдельные реальные процессы PostgreSQL |
| 7: потеря ACK после внешнего эффекта | **PASS synthetic / PENDING real Cloud** | Chaos killed-after-ACK Centrifugo + BullMQ Redis, а реальный Cloud Job не запускался |
| 8–9: lease takeover, DLQ/admin retry | **PASS local** PG lease/fencing, actual Hono auth/role/CAS **5/5**, mounted React **3/3**; ручная Chrome-сессия **PENDING (MCP Hub 429)** | `a3-jobs-media-nov12-r3/admin-dlq-real-pg.log` и `admin-dlq-mounted.log`; 6 конкурентных CAS retry, 1 success / 5 conflicts |
| 10: восстановление зависимостей | **PASS local для PG/Redis; PENDING Cloud** | Chaos backup restore, повторные Worker, Cloud stage не подтверждён |
| 11–13: 720p while 360p pending, callbacks, reconciliation | **PASS local state / PENDING real Job** | PG recovery / existing unit fixtures; настоящие job/run IDs и S3 HEAD не получены |
| 14: duplicate clientMessageId HTTP + WS | **PASS fresh isolated** | `a3-jobs-media-nov12/chat2-http-websocket.log`: 6/6 реальные Hono/PG/Redis/Centrifugo, actor ACL, одна логическая отправка и восстановление WS |
| 18: deny 403/404 at real Beget | **PASS local MinIO 5/5; PENDING real edge** | `a3-jobs-media-nov12/cdn-hono-minio.log`, JWT/Core access и revoke; настоящие ответы Beget edge 403/404 ещё не получены, требуются изолированные test bucket/CDN |

## Повторяемый локальный запуск

`bash scripts/qa/a3-jobs-media-isolated-acceptance.sh a3-jobs-<уникальный-id>` выполняет **16** последовательно подтверждаемых этапов (HTTP/WS, CDN с MinIO, PG восстановления 360, медиа-удаление, CDN-purge, account/pet cleanup, **admin DLQ real PG/Hono + mounted React UI + real PG/Redis media burst**, шесть unit-пакетов). Каждый шаг пишет отдельный лог и `results.tsv`; при ошибке выполнение прерывается. Синтетический media-burst использует **реальные PostgreSQL/Redis**, но тестовый HTTP-брокер вместо внешнего Cloud.ru; `nextAttemptAt` при bootstrap гарантированно UTC. Репозиторный `git diff --check` в момент финальной проверки сообщал о пробелах в **чужом** `patches/react-native-compressor@1.16.0.patch` (строки 28, 39, 72, 78); scoped Agent3 `git diff --check`, проверки trailing whitespace всех новых файлов и shell syntax **PASS**. Чужой патч не правился. Старый `architecture-chaos-local.sh` не изменён; квитанция 5/5 лежит в `a3-jobs-20261111-r2`. Для проверок жёстко привязанных к каноническому корню команда запускается в исходном `gafus-refactor`, а не в отдельном worktree. Внешние реальные провайдеры не вызываются.

## Действия для полного внешнего закрытия

По локальной проверке текущей shell-среды не выставлены `CLOUDRU_*`, `BEGET_*` и `GAFUS_STAGING_*` переменные, а существующий Beget provider script для реального edge использует **production** service IDs и требует отдельного подтверждения. Реальный provider прогон нельзя подменить production-проверкой. Требуется явное подтверждение безопасных изолированных staging provider ресурсов; при этом реальных данных и секретов в отчёте нет. Только после подтверждения изолированных ресурсов Cloud.ru/Beget: проверить Cloud Job `:execute` с потерянным ACK и известным run ID; отложенный callback и out-of-order callback; S3 HEAD/manifest 360p при неизменённом доступном 720p; Beget edge 403/404 без origin fallback и разрешённые соседние ошибки. К каждой операции приложить `operationId`, Cloud Job/run/event ID, временную шкалу, PG состояния и ключи **без секретов**, затем сверить метрики агента 2. Это **PENDING**, не production-проверка.

## Продолжение 12.11.2026 — DLQ Prisma boundary, Chrome, внешний стенд, исторические журналы

**Источник новой точной квитанции:** `docs/audit/gafus-agent-3-agent-2-stage-handoff-20261112.md`. Документ описывает разделение владения, готовность стенда и фактические зависимости A1/A2/A3; это handoff через общий репозиторий, не подтверждение того, что агент 2 уже запускал внешний стенд.

- DLQ-тест больше не импортирует ORM в API: `apps/api/src/routes/v1/admin-media-dlq.real-pg.test.ts` обращается только к `packages/prisma/tests/a3AdminDlqFixture.ts`, чья среда ограничена тестовым `a3qa@127.0.0.1` disposable PostgreSQL. После изменения `bash scripts/qa/a3-admin-dlq-isolated-acceptance.sh` **5/5 PASS**. Отдельные `pnpm --filter @gafus/prisma typecheck`, `pnpm --filter @gafus/admin-panel typecheck`, `pnpm --filter @gafus/api typecheck` — **все PASS** на повторе 12.11.
- MCP Chrome через внешнее подключение отвечал `429`; восстановлены остановленные локальные McpGo Playwright browser/proxy LaunchAgents. Доступ к существующему Google Chrome через `127.0.0.1:8940/mcp` **PASS**. `bash scripts/qa/a3-admin-dlq-browser-full-acceptance.sh a3-jobs-dlq-browser-nov12-r3` **exit 0**: реальный интерфейс Admin Panel/Vite + действующий Hono route + отдельный PostgreSQL; admin exact retry сбрасывает CAS, занятый event даёт UI 409, MODERATOR GET 403 и скрытое меню, ADMIN восстанавливает видимость. QA-вкладка закрыта и API/Vite порты 3001/5174 остановлены. Browser test middleware использует synthetic role: настоящая session/login не проверялась (Hono unauthenticated 401 в PG тесте).
- Изолированный Cloud.ru 360p Job и Beget staging CDN **НЕ подтверждены**: в текущем shell нет явно заданных staging-credentials; старый `~/.codex/cloudru/gafus-media-core-staging/core.env` от 12.10 и backup JSON не дают право на external execute. Имеющийся Beget synthetic `--run` использует production CDN resource IDs. Cloudru/Beget вызовов не выполнялось; безопасный локальный MinIO и fake Job не выдаются за edge.
- Поиск исходных 16 старых ошибок: 2864 файла в `~/Library/Logs/gafus-refactor-regression`, `/tmp`; 8465 в `.local-pg-scratch`, `artifacts`, `.gafus-refactoring`. Исходный unified media PostgreSQL failing log / case IDs отсутствуют, найденные совпадения `16 failed` относятся к другим Web/API тестам. Старый текстовый источник `docs/audit/core-server-bulk-progress-20261111.md` только указывает категории Gallery publish и account cleanup video format. Запрос к агенту 1: исходный run ID/лог/PG fixture/16 case IDs + baseline SHA; до этого исторические 16 помечены **PENDING**, а не «исправлены».
- После исправления нашего единственного прямого Prisma импорта архитектурная граница один раз **PASS**. На дальнейшем общем snapshot `pnpm check:core-boundaries` **FAIL** по новым импортам `@gafus/prisma` в `dailyCourseService.real-pg.mounted.test.ts` и `g1-daily-bound-work.realpg.test.ts` другого владельца; наш DLQ test таких импортов не содержит. Это **текущий общий blocker**, не исправлять путём расширения frozen baseline и не объявлять общую регрессию зелёной.

### Строки исходного ТЗ и доказательные границы

| Пункт | Локально подтверждено | Что остаётся/конкретная зависимость |
| --- | --- | --- |
| №4 rollback | **PASS**: PG outbox rollback/медиа-удаление, zero side effect | Тот же профиль на общем external stage при его утверждении |
| №5 commit | **PASS**: бизнес-строка+outbox атомарно в PG, другое подключение | Реальный provider effect только на stage |
| №6 multi-worker | **PASS**: два процесса, concurrent claim, SQL fencing | Повторить при общей A2 нагрузке, не создавать вторую topology |
| №7 ACK-loss | **PASS local synthetic**: Centrifugo eventId и real Redis/BullMQ Unrecoverable unknown ACK | **PENDING real Cloud**: approved nonprod Job/runId, контролируемый abort ACK, S3 proof |
| №8 lease takeover | **PASS local** PG lease/heartbeat/CAS, stale token reject | Задержанный внешний callback на stage |
| №9 DLQ/admin | **PASS local** real Hono/PG 5/5, real Chrome browser, роль 403, CAS 1/6, UI 409 | **PENDING durable actor audit**: A1 schema/retention, A2 safe operator trace; QA browser synthetic role не live SSO |
| №10 dependency recovery | **PASS local PG/Redis** в chaos | **PENDING Cloud + full A2 2+API/Worker recovery**, общая topology и provider fixture |
| №11 720p→360p | **PASS local state** Chat2 PG recovery 3/3, 720 при pending 360 | **PENDING** delayed real staging Job + client playback after actual READY |
| №12 media retry/callback | **PASS local** bounded attempts/CAS/unknown-ACK fixtures | **PENDING real** out-of-order/replay callback, actual Cloud run/result/object manifest |
| №13 reconciler | **PASS local** stale lease+active lease+360 recovery | **PENDING** stage run matching and HEAD of actual 360p, A2 trace lookup |
| №14 clientMessageId | **6/6 PASS** real Hono/PG/Redis/Centrifugo/WebSocket, one logical message | Production traffic не требуется |
| №18 Beget edge | **5/5 PASS local** JWT/ACL/MinIO revoke; offline Beget safety 4/4 | **PENDING real nonprod Beget edge**: service+host+origin+test prefix, actual 403/404 and fallback |

Отдельные A2 критерии №16 (полный OTLP lookup через Cloud Job/callback) и №17 (firing/resolved рабочего маршрута) — **PENDING внешнего стенда**, несмотря на локальные OTLP/Alertmanager PASS. Для одного shared stage A2 переиспользует `observability-multi-instance.mjs`, свои OTLP/25 alert rules/restore driver; A3 предоставляет Cloud/Beget failure scenarios и IDs, не дублирует инструментирование. Production, `gafus1`, Git push/deploy не изменялись.

## Дополнительное продолжение 12.11.2026 — параллельные composition ports / новая локальная приёмка

Новый исходный снимок всё ещё находится на HEAD `0dcd18c13` с незакоммиченными параллельными изменениями трёх агентов. Приведённые ниже выводы относятся к **фактической текущей файловой системе**, а не к старому Git HEAD или внешнему провайдеру.

### `publicOutlinePolicy`: подтверждённая совместимость без отката

1. `packages/core/src/services/course/publicOutlinePolicy.ts` и `publicOutlinePolicy.test.ts` существуют; `packages/core/package.json` содержит `./services/course/publicOutlinePolicy`, сборка Core (`pnpm --filter @gafus/core build`) создала `.js` и `.d.ts` под `dist/core/src/services/course/`.
2. `apps/api/src/modules/courses/application/read-public-outline.ts` оставляет только **type-only** импорт подписей и получает обе функции через ports; `apps/api/src/modules/courses/composition/read-public-outline.ts` осуществляет runtime composition. `node -e "import('@gafus/core/services/course/publicOutlinePolicy')"` подтвердил оба callable exports; `publicOutlinePolicy.test.ts` **3/3 PASS**, адресные Core boundary+API dependency tests **85/85 PASS**, общий `pnpm check:core-boundaries` **PASS**.
3. Старая `TS2307` по `publicOutlinePolicy` не воспроизводится. Чужие исходники/публичные экспорты не переименовывались и не откатывались; не требуется отдельная миграция.

### Изменения A3 для актуальных портов

- `scripts/qa/account-cleanup-snapshot-isolated-pg.smoke.ts`: единственный старый импорт удалённого прямого `enqueueAccountStorageCleanup` из `packages/core/src/services/accountCleanup/enqueue.js` заменён импортом из фактического `apps/api/src/modules/account-cleanup/composition/enqueue.js`. Логика теста и бизнес-код не переписывались. `bash scripts/qa/account-cleanup-snapshot-isolated-pg.sh` **PASS** с реальной disposable PostgreSQL `Pacific/Auckland`: атомарный snapshot, rollback, пред- и пост-удалённые записи, lease takeover/fencing и retry.
- `packages/worker/tsconfig.json`: для нового `@gafus/consultation-server/booking-application` добавлен только TypeScript `paths` → `../consultation-server/dist/bookingApplication.d.ts`, по уже принятому шаблону `consultation-server/mail-delivery`. Это устраняет `TS2307` в трёх Worker consumers после переноса консультаций, не меняя runtime imports или чужой код. Самостоятельный `pnpm --filter @gafus/worker typecheck` **PASS**.

### Новая изолированная и браузерная квитанция

- `bash scripts/qa/a3-jobs-media-isolated-acceptance.sh a3-jobs-media-nov12-r5`: **16/16 PASS** (`~/Library/Logs/gafus-refactor-regression/a3-jobs-media-nov12-r5/results.tsv`), **после** перехода QA account cleanup на действующий composition порт. Предшествующий `r4` остановился именно из-за removed export; `r5` подтвердил исправление без изменения бизнес-логики.
- `bash scripts/qa/architecture-chaos-local.sh a3-jobs-nov12-r4`: **5/5 PASS** (`~/Library/Logs/gafus-refactor-regression/a3-jobs-nov12-r4/chaos-results.tsv`), включая два реальных Worker процесса, SIGKILL после ACK до PostgreSQL commit, Redis/BullMQ unknown ACK, phase-F PG и backup/restore.
- `bash scripts/qa/a3-admin-dlq-browser-full-acceptance.sh a3-jobs-dlq-browser-nov12-r5`: **exit 0 PASS** в личном Chrome через локальный McpGo MCP 8940 и только synthetic PostgreSQL. ADMIN view + retry CAS + visible conflict + MODERATOR 403/hidden menu + restore ADMIN + dedicated QA tab close + loopback API/Vite port cleanup. Квитанция `~/Library/Logs/gafus-refactor-regression/a3-jobs-dlq-browser-nov12-r5/browser-results.log`. Первая попытка `r4` столкнулась с transient MCP proxy timeout при одновременном chaos-run, это не проверка функционала; последовательный `r5` прошёл.

### Архитектурный/ресурсный gate и пересечения с A1/A2

- `pnpm check:core-boundaries` после переноса тестовой Prisma-фикстуры **PASS**. API полный `pnpm --filter @gafus/api test` под новым снимком **2739 PASS /266 SKIP, 0 FAIL** (runner `a3-jobs-nobuild-nov12/test-api.log`).
- **НЕ выдавать global full regression за PASS**: новый `@gafus/core` full test даёт **2033 PASS/136 SKIP/14 FAIL** в трёх файлах консультаций (`bookingService.test.ts`, `g1-moderator-core-deny.test.ts`, `slotService.test.ts`). После параллельного переноса часть тестов сравнивает несогласованные экземпляры `Consultation*Error` (`instanceof`), а часть при запуске использует реальный Prisma вместо mock/ports и получает `PrismaClientInitializationError`. Это стык консультационного слоя агента 1; A3 не откатывает их код или защиту ACL. Полный журнал: `~/Library/Logs/gafus-refactor-regression/a3-jobs-nobuild-nov12/test-core.log`.
- macOS free space на момент глобального прогона **4.5–6.0 GiB**, существенно меньше ранее установленного безопасного build reserve **12 GiB / прекращать новые тяжелые сборки ниже 16 GiB**. `pnpm typecheck` запускает Turbo dependency builds, поэтому он был **остановлен SIGTERM** после нескольких минут роста cache/compiled outputs, **не** объявлен failed TS. Форсированный `architecture-final-regression.sh` с `turbo build --force` не запускается при такой доступной ёмкости. Отдельный `a3-jobs-regression-no-build.sh` проверяет 31+ source/test gates без build, с cutoff 4 GiB и честной строкой `build\tSKIP_LOW_DISK_NO_FORCED_COMPILE`; это **не** сертификат 33/33 full build.
- Доступный старый unified PostgreSQL media log с **историческими 16 case IDs** по-прежнему не найден даже после сверки проектного журнала и сохранённых контекстов прошлых прогонов. Текущие 16/16 новые локальные gates и старые 16 FAIL нельзя отождествлять. Нужны original run ID, command, logs, case IDs и fixture/snapshot owner для поштучной классификации.
- Cloud.ru и Beget **EXTERNAL PENDING**: нет подтверждённых именно nonprod Cloud Job 360p + callback + S3 bucket, Beget CDN edge service/hostname + отдельный origin, credentials+authorisation+operation manifest. Legacy scripts/backups и существующие production service IDs не являются разрешением; **никаких внешних Cloud.ru/Beget сетевых приёмочных вызовов или мутаций не выполнялось**. Общий stage и OTLP/Alertmanager/load analytics принадлежат агенту 2, A3 предоставляет только failure scenarios и заверенные IDs без PII. См. handoff `docs/audit/gafus-agent-3-agent-2-stage-handoff-20261112.md`.

### Закрытая квитанция локальной регрессии без форсированной сборки (12.11.2026)

Сценарий `bash scripts/qa/a3-jobs-regression-no-build.sh a3-jobs-nobuild-nov12` окончательно завершился **exit=1 строго из-за `test-core`**. Результаты по 38 явным gate: **36 PASS, 1 FAIL (Core), 1 SKIP (forced build, нехватка диска)**. Квитанция и адресные логи: `~/Library/Logs/gafus-refactor-regression/a3-jobs-nobuild-nov12/results.tsv`; Web batches: `a3-jobs-nobuild-nov12-web-chunks/completion.json`. Ни один другой gate не упал.

| Gate | Подтверждение |
| --- | --- |
| Architecture, workspace graph, monitoring, release-graph runtime | **4/4 PASS** |
| Core test | **2033 PASS / 136 SKIP / 14 FAIL** в трёх legacy consultation tests; A1 handoff, это единственный красный gate |
| API test | **2739 PASS /266 SKIP /0 FAIL** |
| Worker и оставшиеся 20 серверных пакетов | **Все PASS** (включая consultation-server, query/write, media/feed/chat зависимые) |
| Web | **33/33 batches PASS; 302 passed files / 1 skipped file; 3144 PASS /6 SKIP**, все 303 файлов учтены |
| Mobile | **359 passed files /1 skipped; 2742 PASS /1 SKIP** |
| Trainer Panel | **86 files; 726/726 PASS** |
| Admin Panel | **36 files; 242/242 PASS** |
| Прямой TypeScript `@gafus/{core,api,worker,mobile,trainer-panel,admin-panel}` | **6/6 PASS**, каждый `tsc` отдельным gate без Turbo force build |
| Scoped workspace whitespace | **PASS**, исключён pre-existing native compressor patch, как и в исходном full regression script |
| Forced `turbo build --force` | **SKIP_LOW_DISK_NO_FORCED_COMPILE**: Mac имел 4.5–6 GiB свободного места, ниже установленного порога 12–16 GiB. Старый full 33-stage на этом source snapshot **не сертифицирован** |

Этот прогон дополняет, но **не заменяет** `a3-jobs-media-nov12-r5` 16/16 PASS, `a3-jobs-nov12-r4` chaos 5/5 PASS и настоящий Chrome Admin `a3-jobs-dlq-browser-nov12-r5` PASS. `pnpm test:cloudru-media` и `node --test infra/cloudru/beget-synthetic-acceptance.test.mjs` отдельно **offline PASS**; они **не** свидетельствуют о реальном provider ACK/callback/edge. Исходные исторические 16 ошибок общего PG media-run всё ещё PENDING поштучно без original case IDs.

**Владелец следующего локального шага:** агент 1 — 14 assertion/mock mismatches в `packages/core/src/services/consultation/{bookingService.test.ts,g1-moderator-core-deny.test.ts,slotService.test.ts}`. Отчёт с точным логом находится в `docs/audit/gafus-agent-3-agent-1-compat-handoff-20261112.md`. После ремонта нужен повтор полного `@gafus/core test` и общий green regression snapshot. Для forced build/`pnpm typecheck` через Turbo необходимо безопасно освободить место либо предоставить изолированный runner; не выполнять `docker prune`, удаление чужих артефактов или CI/release с текущими 5.5 GiB. Внешний провайдер stage и 16-case исходная квитанция по-прежнему отдельные blockers.

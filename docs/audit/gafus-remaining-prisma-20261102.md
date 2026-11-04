# GAFUS / остаток runtime Prisma / 2026-11-02

После фактических переносов и адресных контрактных тестов: `node scripts/check-app-prisma-boundary.mjs` → **127 исторических импортов: 10 runtime non-test и 117 test fixtures**. Первоначально в текущем цикле оставалось 27 runtime imports. Ни одного прямого Prisma import в `apps/api/src/routes/**/*.ts` больше нет. Замороженный baseline **не** обнулён: проверка stale entries и новых импортов обязательно должна проходить (self-test).

| Последний технический импорт | Тип, текущая ответственность | Что нужно для безопасного удаления из app-level boundary |
|---|---|---|
| `apps/api/src/chat2-v2-cloud-core.ts` | Isolated startup ingress; динамически подключает Prisma только после fail-closed nonproduction preflight; health SQL `SELECT 1`, shutdown | Выделить shared platform health adapter, доказать что preflight остался до import, проверить isolated startup, shutdown и auth; не трогать Cloud.ru |
| `apps/api/src/modules/chat2/archive.ts` | Разовый архивный импорт, транзакционный перенос legacy conversations; не HTTP handler | Синтетический архив в disposable PG с проверкой FK/sequence/idempotency; ограничить CLI режим и отметить в отдельном package/infra adapter |
| `apps/api/src/modules/chat2/import-cli.ts` | Offline CLI, явный `$disconnect` | CLI fixture под disposable PG, обязательная проверка empty DB + flags; допустимо оставить Prisma в инфраструктурном CLI |
| `apps/api/src/modules/chat2/media-v2-jobs.ts` | Chat2 worker/job lease processing + persisted status | Real PG+queue+S3 lease recovery tests с падением между claim и publish, nonprod auth signatures; только после — adapter extraction |
| `apps/api/src/modules/chat2/media-v2-upload.ts` | Chat2 upload persistence, ownership metadata | Real synthetic PG/S3 upload/finalize/ACL/failure test; транзакционные state transitions неделимы до contract parity |
| `apps/api/src/modules/chat2/service.ts` | ~1485 строк, ~139 Prisma/tx references: Chat2 application/persistence смешаны | Ступенчатое разделение: ACL/readGate, room reads, message writes, reactions, group roles, media. Сначала обновить независимые реальные PG/Redis/S3 маршруты и concurrency/race; не перетаскивать 139 запросов механически |
| `apps/api/src/modules/questions/media-v2-jobs.ts` | Questions job state/retry/recovery persistence | Disposable PG+Redis+MinIO, failed/late ACK, 410/5xx recovery, job HMAC tests; только затем extract |
| `apps/api/src/modules/questions/media-v2-upload.ts` | Questions photo upload/ownership persistence | Real ACL and synthetic S3 upload-state test, retries, no orphan grants |
| `apps/api/src/modules/trainer-articles/infrastructure/read-own-article-metadata-rows.ts` | 10-строчный explicit infrastructure adapter | Architectural decision: оставить Prisma в инфраструктурном адаптере с boundary tests либо перенести в infrastructure package без new dependency cycle; это не HTTP violation |
| `apps/api/src/modules/trainer-notes/infrastructure/read-notes-summary-snapshot.ts` | 20-строчный scoped infrastructure adapter, 3 SQL/Prisma read refs | То же; сохранить user scope, bounded projections и existing tests; не косметическое снижение цифры |

## Доказательства выполненного этапа

- HTTP admin route helpers и кэш-ревизия переведены в Core с row lock внутри транзакции; route tests 30+67+9 PASS, Core cache tests 4 PASS.
- Trainer role/count scopes и видео metadata переведены в Core; API trainer routes 27 PASS, mounted video 4 PASS, Core 4+4+2 PASS.
- Chat direct-user lookup/search перемещены в уже существующий Chat2 application service; route/perms 11 PASS + application 3 PASS.
- Owner-scoped consultation booking lost-ACK receipt: `packages/core/src/services/consultation/bookingIdempotencyReadback.ts` с сохранённым import facade, Core 4 PASS, API consultation+route 45 PASS после Core rebuild; `UNKNOWN` не разрешает POST replay.
- `node scripts/check-app-prisma-boundary.mjs --self-test` PASS, актуальный frozen count=127; никаких исключений задним числом не добавлено.

**Не интерпретировать** 117 test fixture imports как runtime-нарушения. **Не использовать** новую Core обёртку, которая лишь проксирует Prisma без policy/transaction boundary, ради статистики. Этот реестр описывает честный технический долг для планирования отдельного безопасного isolated work package.

## Сверка 2026-11-03 после `main` `b4492e73e`

`node scripts/check-app-prisma-boundary.mjs` снова подтвердил **PASS 127 frozen / 10 runtime non-test / 117 test** и отсутствие прямых Prisma импортов из `apps/api/src/routes`; ни одно baseline исключение не удалялось ради цифры. Позднейший `7456dc4a5` перенёс Worker media metrics в Core, не добавив новой API boundary лазейки.

В `apps/api/src/modules/chat2/service.ts` дополнительно устранена **N+1-проверка блокировок при `listChats`**: один actor-scoped `chat2Block.findMany` по уникальным peers ограниченного inbox вместо отдельного `findFirst` для каждого DIRECT; обе стороны блокировок и запрет спец-лички сохранены, readGate/writeGate независимы. В отдельный чистый `inboxVisibility.ts` вынесены только deterministic projections; после правки Chat2 focused 42 PASS и полный API 2549 PASS. Это **не** даёт оснований переместить 1485-строчный Chat2 persistence service или уменьшить список 10 runtime импортов: для его транзакций нужны disposable migrated PG/Redis/MinIO и race/ACL инварианты.

Два небольших adapter (`trainer-articles/infrastructure/read-own-article-metadata-rows.ts` и `trainer-notes/infrastructure/read-notes-summary-snapshot.ts`) по-прежнему квалифицируются как scoped infrastructure ports, а не прямые нарушения HTTP; косметическая упаковка их в Core без доменной политики, транзакционного смысла или доказанной циклической безопасности не считается архитектурным улучшением.

## 2026-11-03: реальная новая PostgreSQL выявила отдельный bootstrap blocker

При попытке `prisma migrate deploy` на **собственном ephemeral PG18** без production fixtures подтвердился **P3018 / 42P01**: первая `20241108120000_exam_result_trainer_review` требует `ExamResult`, не созданную предыдущими migration. Всего 163 migration; **чистый replay существующей истории невозможен**. Отдельная новая empty DB получила текущую схему через `prisma db push` (этот успех **НЕ заменяет migrate deploy**). На ней настоящий Core YooKassa webhook + Prisma/PostgreSQL подтвердил 4 сценария sequential/concurrent/failed-retry/first PENDING→ACTIVE и физический backup/restore пяти event receipts в отдельную БД, но не конкурентный first-payment, refund/finance race или Apple callback lifecycle. Полный протокол и минимальное решение для корректного baseline/restore — в нижнем разделе `docs/audit/gafus-architecture-refactor-checklist-20261102.md`.

Всё это **не даёт основания** изменять frozen Prisma boundary `127 / 10 non-test / 117 test` и не превращает два `trainer-articles/trainer-notes` infrastructure adapters в HTTP-нарушения. Отдельная миграционная bootstrap стратегия должна сохранить forward compatibility с существующей production `_prisma_migrations`, без прямой правки/применения на пользовательской БД.

## 2026-11-04 decision: exact 10 remaining non-test imports (no new baseline)

The 127-import existing/frozen ledger is not an instruction to eliminate every occurrence or fabricate a smaller count. `node scripts/check-app-prisma-boundary.mjs` currently PASS: **10 non-test + 117 test = 127**; no HTTP handler direct Prisma. Two distinct classes are now explicit:

| Class | Exact allowed/existing source | Architectural reason and rule |
|---|---|---|
| **Legitimate isolated infrastructure** | `apps/api/src/chat2-v2-cloud-core.ts` | Startup-only dynamic DB health/shutdown after isolated preflight; this is a composition root, not an HTTP or domain handler. Retain until a dedicated platform health port improves rather than obscures ownership. |
| **Legitimate offline infrastructure** | `apps/api/src/modules/chat2/archive.ts`; `apps/api/src/modules/chat2/import-cli.ts` | One-shot CLI with owned schema/transaction scope. Never invoke on an existing database without an approved migration/backup plan. Do not move raw import side effects into Core merely to reduce the counter. |
| **Legitimate data-read infrastructure** | `apps/api/src/modules/trainer-articles/infrastructure/read-own-article-metadata-rows.ts`; `apps/api/src/modules/trainer-notes/infrastructure/read-notes-summary-snapshot.ts` | Existing explicit scoped SELECT adapters; retain projection/index/owner constraints. Moving to Core without domain gain would add unnecessary layers. |
| **Outstanding mixed application/persistence boundary** | `apps/api/src/modules/chat2/media-v2-jobs.ts`; `apps/api/src/modules/chat2/media-v2-upload.ts`; `apps/api/src/modules/chat2/service.ts` | Persistent lease/CAS/status, upload ownership and room policy mixed with adapter; extract to focused Core services ONLY with real PostgreSQL/S3 concurrency + ACL parity and correct ownership injection. |
| **Outstanding mixed application/persistence boundary** | `apps/api/src/modules/questions/media-v2-jobs.ts`; `apps/api/src/modules/questions/media-v2-upload.ts` | Queue ownership, user-scope, retries and S3 publication must stay atomically fenced. Same acceptance prerequisites, no blind source relocation. |

**Count = 5 defensible infrastructure files + 5 further architecture review files.** The frozen baseline remains 127. Archive/bootstrap/read infra counts are not user-facing architecture errors; no permission to normalize or artificially shrink this baseline. The follow-up opt-in acceptance `apps/api/tests/chat2-realtime-owner-media.realpg.archqa.acceptance.ts` resides **outside runtime `src`** and verifies 10/10 with a new disposable PG18 (member role ban, two-way DIRECT blocks, specialist bypass denial, owner-only upload polling/confirm/attach, no unbound media URL, atomic owner discard, nonmember/blocked reservation rejection). It does NOT eliminate the five mixed imports, but now provides realistic security regression evidence for the eventual design.

### Trainer-notes optional owner filter is an authorized ADMIN case, not a missing security predicate

Inspected the only live application wiring: `trainer-notes/composition/read-notes-summary.ts` injects the infrastructure into `trainer-notes/application/read-notes-summary.ts`; the HTTP route `routes/v1/trainer-notes-summary.ts` derives `isAdmin` exclusively from `c.get("user").role === "ADMIN"`. A TRAINER/MODERATOR request carries `{trainerId: actorUserId}`; the ADMIN-only cross-trainer summary intentionally passes `{}` for a small metadata projection (id, title, tags, createdAt) and fixed pagination. Existing adapter runs count and list in a single RepeatableRead transaction. New tests `trainer-notes/application/read-notes-summary.scope.test.ts` plus `infrastructure/stable-order-metadata.contract.test.ts`: 9 PASS, eslint 0. **Do not force a nonoptional trainerId or count this intentional admin read as a defect.** This does not license client-provided owner bypass and must remain independently protected by HTTP role middleware.

## 2026-11-04 incremental Core policy extraction (no Prisma baseline change)

The **five mixed API modules** `chat2/service.ts`, `chat2/media-v2-jobs.ts`, `chat2/media-v2-upload.ts`, `questions/media-v2-jobs.ts`, `questions/media-v2-upload.ts` now delegate pure room-reader eligibility, uploaded/ready/confirm state classification, shared media retry/terminal failure policy, capped cleanup backoff, Questions 100-per-day threshold, and signed-upload/lease-safe cleanup deadlines to `packages/core/src/services/chat2` and `packages/core/src/services/mediaDelivery/mediaTaskPolicy.ts`. Their existing Prisma imports remain **legitimate for the moment** because they perform actual user/room-scoped reads, atomic `UPDATE ... WHERE ...` fencing, CAS, durable lease, advisory locks and transactionally coupled attachment/post changes. No phantom `@gafus/prisma` removal or baseline reset was done.

New project-mounted internal Chat2 subscribe proxy (`apps/api/src/modules/chat2/subscribeProxy.ts`) has **NO Prisma import**; it composes Core `authorizeChat2SubscriptionProxy` with `readGate`, plus 32+-byte authenticated broker secret and fail-closed body validation. Last `node scripts/check-app-prisma-boundary.mjs`: **PASS, 127 total = 10 non-test + 117 test**, no exceptions added. The five earlier classified infrastructure imports remain justified for scoped composition/CLI/read adapters; avoid blanket rewriting them into Core to game the metric.

## 2026-11-04: окончательное пофайловое решение вместо механического обнуления счётчика

Полный review packet, включая **отдельную строку на каждый из десяти импортов** и таблицу ответственности пяти смешанных модулей: [`gafus-architecture-review-packet-20261104.md`](./gafus-architecture-review-packet-20261104.md), раздел B.

- **Оставить инфраструктурными:** `chat2-v2-cloud-core.ts` (preflight composition/health), `chat2/archive.ts` и `chat2/import-cli.ts` (изолированный offline migration/CLI), `trainer-articles/infrastructure/read-own-article-metadata-rows.ts` (author-scoped bounded read), `trainer-notes/infrastructure/read-notes-summary-snapshot.ts` (RepeatableRead list/count; разрешённый ADMIN scope). Это **не** HTTP handlers и не domain logic, а явное I/O.
- **`chat2/service.ts`:** actor/business policy уже частично в Core; tx idempotency/outbox, reactions, group owner и readGate query остаются около persisted state. Отделять только ограниченные message/reaction ports под реальный PG concurrent acceptance при доказанной пользе.
- **`chat2/media-v2-jobs.ts` / `questions/media-v2-jobs.ts`:** уже инъецируют базу в queue factory; live Prisma import — composition adapter. `SKIP LOCKED`, PostgreSQL advisory lock на два questions jobs, lease tokens, CAS, HEAD/cleanup не следует механически выносить в Core. Pure retry/deadline — в Core.
- **`chat2/media-v2-upload.ts` / `questions/media-v2-upload.ts`:** actor scope, reserve/confirm CAS, queued state, S3 signature deadline и daily limit tightly coupled к транзакциям; Core pure policy извлечены. Порт нужен лишь при втором backend или регрессии, с actual PG+MinIO race/ownership проверками.

**Вывод:** frozen boundary `127 = 10 нетестовых + 117 тестовых` — подтверждённый допустимый baseline. Меньший счётчик без изменённого data flow и интеграционных тестов не означает архитектурного улучшения. Ни одно из этих десяти использований в текущем проходе не изменено.

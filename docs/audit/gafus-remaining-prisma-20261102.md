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

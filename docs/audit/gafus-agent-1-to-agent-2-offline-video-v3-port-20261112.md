# A1 → A2: OFF021 Video Position V3 Source-only Transactional SQL Port

**12.11.2026 · main HEAD `0dcd18c13c8d` · без merge/commit/push/deploy.**

## Итог

- Core→server **17 → 16**; frozen baseline 41: **25 resolved / 0 new**; исторически **126/142** устранено. Baseline JSON не тронут.
- Семь SQL-команд (owner-scoped unique receipt claim, replay, FOR UPDATE revision, CAS, ACK commit) переходят из Core в порт; серверные транзакции не разбиваются. Source service remains OFF021 v3 review only.
- Core сохраняет authorizeVideoOccurrenceV3(tx, ownerId, parsed, now) ДО поиска даже уже сохранённого ACK; отзыв доступа не открывает платное видео. Проверяются exact course/day/step/video occurrence и payloadHash.
- Та же проверка revision: новая версия только expectedRevision+1, время recordedAt не откатывается; конфликт receipt/старая ревизия дают прежний 409, нет DB reader — 503, отказ доступа 403.
- Композиция v3 SQL объявлена в apps/api/src/modules/offline/composition, но НЕ импортируется ни app.ts, ни действующим v2 offline.ts. Новый маршрут, миграция и dual-write НЕ активированы.

## Файлы и SHA-256

До — байты общего *незакоммиченного* дерева непосредственно перед этим кластером; после — текущие байты. Полные контрольные суммы в JSON.

| Тип | Файл | До SHA256 | После SHA256 |
|---|---|---|---|
| A | `apps/api/src/modules/offline/composition/install-video-position-v3-review.contract.test.ts` | `—` | `d521a43c0411` |
| A | `apps/api/src/modules/offline/composition/install-video-position-v3-review.ts` | `—` | `93570973283a` |
| M | `docs/audit/core-server-adapter-risk-inventory-20261111.md` | `e8d7d4fdc797` | `048505b33e4e` |
| M | `docs/audit/core-server-bulk-progress-20261111.md` | `313bf69627a4` | `29c01ce931b7` |
| M | `packages/core/src/services/offline/index.ts` | `33309af33f43` | `45b0f2c05d58` |
| M | `packages/core/src/services/offline/offlineVideoPositionV3Service.ts` | `952e2d09c738` | `2f361c0da702` |
| A | `packages/core/src/services/offline/offlineVideoSqlPort.test.ts` | `—` | `d51bc5e1aee9` |
| A | `packages/core/src/services/offline/offlineVideoSqlPort.ts` | `—` | `d6d964969d29` |
| M | `scripts/check-core-server-boundary.mjs` | `38900d5710ff` | `60692f051477` |

**Всего 9 файлов:** 5 M, 4 A.

## Подтверждённые проверки

| Проверка | Результат | Журнал |
|---|---|---|
| Core six source-only SQL port + two exact occurrence ACL tests | PASS 8 passed | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-offline-video-v3-core-target-final.log` |
| API composer unmounted and existing v2 route tests | PASS 6 passed | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-offline-video-v3-api-target-final.log` |
| Core TypeScript | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-offline-video-v3-core-types-final.log` |
| Core build | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-offline-video-v3-core-build-final.log` |
| API TypeScript | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-offline-video-v3-api-types-final.log` |
| Course-progress SQL adapter types | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-offline-video-v3-server-types-final.log` |
| Workspace DAG | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-offline-video-v3-workspace-graph.log` |
| Architecture boundaries and no live v3 route | PASS | `/tmp/a1-offline-video-v3-boundaries.log` |

## Непройденные внешние acceptance-гейты

- Disposable PostgreSQL with new OFF021 additive schema: concurrent events same owner/resource, unique claim owner/event, FOR UPDATE CAS, rollback on failure, grant revocation during replay.
- Design and test intentional dual-write compatibility with legacy UserVideoProgress, plus full UI/HTTP authenticated Web/Mobile acceptance before any v3 route activation.
- Remove remaining 16 reverse Core→server edges; after all A1/A2/A3 streams conduct shared 33-stage full regression and 5-stage chaos. Do not modify frozen baseline or deploy.

A2: сверять текущие `sha256_after_current`, переносить Core-port + API-composition + тесты вместе; общие файлы объединять семантически. A1 не выполнял merge/push/deploy.

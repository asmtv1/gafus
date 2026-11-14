# A1 → A2: Trainer Day Owner/Step Transactional Rows Port

**12.11.2026, main HEAD `0dcd18c13c8d`, no merge/commit/push/deploy.**

## Итог

- **20 → 19** Core→server; frozen 41 **22 resolved / 0 new**; historical 142 **123 retired**. Frozen baseline JSON не менялся.
- Core `trainingDayService.ts` теперь обращается к `TrainingDayRowsPort` (5 методов). SQL в `course-progress-server/trainingDayRows.ts` сохраняет owner-scoped read, Step ownership и атомарные изменения в PG Tx; Core сохраняет ActionResult, ошибки и посткоммитную cache invalidation.
- Missing port fails closed, replacement port forbidden. Original trainer/day editor response DTOs preserved by narrow structural projections.

## Файлы SHA256

Начальная база — свежий снимок текущего незакоммиченного дерева перед этой группой, не старые A2 SHA. JSON содержит полные суммы и пути prechange backups.

| Статус | Файл | До SHA | После SHA |
|---|---|---|---|
| M | `apps/api/src/app.ts` | `7f8108b385e1` | `964aaa01f1a6` |
| A | `apps/api/src/modules/trainer-days/composition/install-training-day-rows.contract.test.ts` | `—` | `5a93b0a4b021` |
| A | `apps/api/src/modules/trainer-days/composition/install-training-day-rows.ts` | `—` | `bc9c40eefb31` |
| M | `docs/audit/core-server-adapter-risk-inventory-20261111.md` | `e343be163499` | `3b9497b5bd80` |
| M | `docs/audit/core-server-bulk-progress-20261111.md` | `09fa7612a8e7` | `6a6f02c29106` |
| M | `packages/core/src/services/trainingDay/index.ts` | `820d5929ff29` | `fcb79b7357ec` |
| M | `packages/core/src/services/trainingDay/trainingDayOwnerScope.test.ts` | `af6d01caf85b` | `0b2a6e545d8f` |
| A | `packages/core/src/services/trainingDay/trainingDayRowsPort.test.ts` | `—` | `7e7822d1d1dd` |
| A | `packages/core/src/services/trainingDay/trainingDayRowsPort.ts` | `—` | `bf86984fa6c8` |
| M | `packages/core/src/services/trainingDay/trainingDayService.test.ts` | `68d97b46cc7d` | `b8b1d8a0f676` |
| M | `packages/core/src/services/trainingDay/trainingDayService.ts` | `5ca022df6698` | `847cc627abf4` |
| M | `scripts/check-core-server-boundary.mjs` | `cad038aa50f6` | `d1184ab171c9` |

**Всего 12 файлов:** 8 M, 4 A.

## Проверки

| Этап | Результат | Log |
|---|---|---|
| Core trainer day owner mutation and visibility | PASS 15 passed | `/tmp/a1-training-day-rows-core-target.log` |
| Core fail-closed trainer day SQL port | PASS 3 passed | `/tmp/a1-training-day-rows-new-core-v2.log` |
| API trainer day owner-scoped SQL composition | PASS 1 passed | `/tmp/a1-training-day-rows-api-contract.log` |
| Core full | PASS 2127 passed / 136 skipped | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-trainer-day-rows-core-full.log` |
| API full | PASS 2759 passed / 266 skipped | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-trainer-day-rows-api-full.log` |
| Core TS | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-trainer-day-rows-core-types.log` |
| Core build | PASS | `/tmp/a1-training-day-rows-core-build-v2.log` |
| API TS | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-trainer-day-rows-api-types.log` |
| Course progress server TS | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-trainer-day-rows-server-types.log` |
| Architecture boundary | PASS | `/tmp/a1-training-day-rows-boundaries.log` |

## Внешние acceptance-блокеры

- **TRAINER_DAY_REAL_PG** — Disposable full-schema PostgreSQL with TRAINER A, TRAINER B, ADMIN, foreign Step owner, edited Day; concurrent change/delete proves step ownership checked in same Tx, zero unauthorized changes and correct attachment unlink rollback.
- **TRAINER_PANEL_HTTP** — Shared A1/A2/A3 staging trainer-panel and API, ensure all prior response fields, owner-visible Days, editor permission errors and postcommit cache revision for day changes.
- **FINAL_ARCHITECTURE** — 19 remaining Core→server links, then combined 33-stage architecture + 5-stage chaos and Web/Mobile/Worker/panels/PG/Redis acceptance before ratchet baseline.

Агенту 2: сверить каждый текущий SHA; port, API bootstrap, тесты, guard интегрировать вместе, shared app.ts и audit семантически. Не выполнять merge/push от A1.

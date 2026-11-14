# A1 → A2: Owner-neutral Training Day Snapshot Read Port

**12.11.2026, main, HEAD `0dcd18c13c8d`, никаких merge/commit/push/deploy.**

## Итог

- **24 → 23** Core→server; frozen 41 **18 resolved / 0 new**, historical 142 **119 retired**. Baseline JSON не менялся.
- `TrainingDayContentReadPort` точно передаёт `courseType + dayOnCourseId` в исходный SQL `readTrainingDayContent`, без user/role/grant в кэше. Core остаётся владельцем TTL 60s, LRU 256, fencing out-of-order PG revisions и `bypass` на missing revision.
- Сохранили тип `StepType` из browser-safe types, JSON-проекцию, attachments, empty/missing content. Unbound port fails closed и не молча отдаёт устаревший cache.
- Первый полный Core прогон обнаружил 24 отказа **только** в тестовых фикстурах, не подключавших порт. Подключили SQL reader в `trainingService.test.ts` и после `vi.resetModules()` двух-process simulation; адресные 44/44, финальные **2115 Core / 2755 API** PASS.

## Файлы и SHA-256

Снимок `до` создан непосредственно перед этим кластером в общем рабочем дереве; SHA общих файлов из прежних потоков A2/A3 не подставлялись. Полные SHA-256 в JSON.

| Тип | Путь | До SHA | После SHA |
|---|---|---|---|
| M | `apps/api/src/app.ts` | `9d721c057fe2` | `73084f90f769` |
| A | `apps/api/src/modules/training/composition/install-day-content-read.contract.test.ts` | `—` | `9cacdfeaa20b` |
| A | `apps/api/src/modules/training/composition/install-day-content-read.ts` | `—` | `f02a7522d8ea` |
| M | `docs/audit/core-server-adapter-risk-inventory-20261111.md` | `b7deb3562a06` | `0de066c4cf30` |
| M | `docs/audit/core-server-bulk-progress-20261111.md` | `13464844c7fb` | `33b580a2aade` |
| M | `packages/core/src/services/training/index.ts` | `a185660da4c1` | `1f689299e683` |
| M | `packages/core/src/services/training/trainingContentCluster.integration.test.ts` | `489914c8091a` | `4890b18524e3` |
| M | `packages/core/src/services/training/trainingDayContent.test.ts` | `fb88df1d272a` | `1374dcece8d2` |
| M | `packages/core/src/services/training/trainingDayContent.ts` | `61ef38fa9d53` | `0ed8930bb754` |
| A | `packages/core/src/services/training/trainingDayContentReadPort.test.ts` | `—` | `33c73b614638` |
| A | `packages/core/src/services/training/trainingDayContentReadPort.ts` | `—` | `2c23f160952a` |
| M | `packages/core/src/services/training/trainingService.test.ts` | `98238474dc85` | `2c1015b71847` |
| M | `scripts/check-core-server-boundary.mjs` | `0eb19e8c4083` | `53916d92e4b4` |

**Всего 13 файлов:** 9 M, 4 A.

## Проверки

| Этап | Результат | Лог |
|---|---|---|
| Existing Core course cache and revision | PASS 30 passed | `/tmp/a1-training-day-target-tests.log` |
| Core fail-closed day content DB port | PASS 4 passed | `/tmp/a1-training-day-new-core-tests.log` |
| Core progress and per-process revision, repaired fixtures | PASS 44 passed | `/tmp/a1-training-day-repaired-two-suites.log` |
| API day read SQL projection composition | PASS 1 passed | `/tmp/a1-training-day-api-target.log` |
| Full Core suite final | PASS 2115 passed / 136 skipped | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-day-content-core-full-v3.log` |
| Full API suite final | PASS 2755 passed / 266 skipped | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-day-content-api-full-v3.log` |
| Core types | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-day-content-core-types-final.log` |
| Core build | PASS | `/tmp/a1-training-day-core-build-v3.log` |
| API types | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-day-content-api-types-final.log` |
| Course-read adapter types | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-day-content-server-types-v2.log` |
| Architecture boundaries | PASS | `/tmp/a1-training-day-boundaries.log` |

## Внешние гейты

- **PG_TRIGGER_AND_READ** — Disposable full-schema PostgreSQL with row-level trigger on CourseContentRevision; verify trainer edit commits a new revision in same SQL transaction while other requests are in flight, including cached day mutations.
- **REDIS_AND_CLIENTS** — API/Web/Mobile staging with cache rollout flags, Redis disconnect, slow/out-of-order PostgreSQL probes and paid/private video; ensure bypass never shows stale/foreign content.
- **FINAL_ARCHITECTURE** — Remove remaining 23 Core→server edges; combine A1/A2/A3 and run 33-stage architecture final + 5-stage chaos + Worker/panels/PG/Redis/Web/Mobile before ratcheting baseline.

Агент 2: сверять SHA256, переносить port + API bootstrap + Core fixture repair атомарно; shared app.ts и architecture script интегрировать семантически. A1 не делает merge/push.

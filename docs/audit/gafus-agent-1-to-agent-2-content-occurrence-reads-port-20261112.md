# A1 → A2: Owner-scoped Course Occurrence Entitlements

**12.11.2026, main HEAD `0dcd18c13c8d`, без commit/merge/push/deploy.**

## Перенос

- Core→server **28 → 27**, frozen 41 **14 resolved / 0 new**, historical 142 **115 retired**. Frozen baseline JSON не тронут.
- Core `contentAccess/index.ts` больше не импортирует `@gafus/entitlements-server`. `CourseOccurrenceReadsPort` переносит два SQL reader в API composition до Hono routes.
- Core остаётся владельцем callback для exact `userId/dayOnCourseId/stepOnDayId`, private assignment, role, платного шага и Gafus-политики. Нельзя выдать video access по global Step ID или чужому mini-guide grant.
- Missing port throws `COURSE_OCCURRENCE_READ_PORT_UNBOUND` вместо допуска, hot swap запрещён. Существующий серверный SQL не менялся.

## Файлы и SHA-256

База «до» — побайтовое незакоммиченное дерево перед этой группой (не Git HEAD). Backup `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/content-occurrence-port-prechange`. Полные SHA-256 в JSON.

| Статус | Путь | До SHA-256 | После SHA-256 |
|---|---|---|---|
| M | `apps/api/src/app.ts` | `c0ca1131b049` | `a1d4f8f349b6` |
| A | `apps/api/src/modules/content-access/composition/install-occurrence-reads.contract.test.ts` | `—` | `603d68838a38` |
| A | `apps/api/src/modules/content-access/composition/install-occurrence-reads.ts` | `—` | `32b119ac68a0` |
| M | `docs/audit/core-server-adapter-risk-inventory-20261111.md` | `edab522d7d13` | `9a55bc59e0c9` |
| M | `docs/audit/core-server-bulk-progress-20261111.md` | `78314583baee` | `785561bc3ffe` |
| A | `packages/core/src/services/contentAccess/courseOccurrenceReadPort.test.ts` | `—` | `b4ba31558276` |
| M | `packages/core/src/services/contentAccess/courseStepGrantLookup.test.ts` | `0f1290ebb71c` | `ab55aff336d0` |
| M | `packages/core/src/services/contentAccess/courseStepGrantReads.realpg.test.ts` | `7c651eda70b2` | `1d1723d1f4cf` |
| M | `packages/core/src/services/contentAccess/index.ts` | `cbc212afa95b` | `9192f60464e9` |
| M | `scripts/check-core-server-boundary.mjs` | `fe4a70fc9cfb` | `a75473d081e5` |

Итого **10 файлов**: 7 M, 3 A.

## Подтверждённые проверки

| Название | Результат | Журнал |
|---|---|---|
| Core prior occurrence grant and canonical access policy | PASS, 13 tests | `/tmp/a1-occurrence-core-target.log` |
| Core port fail-closed & strict occurrence args | PASS, 3 tests | `/tmp/a1-occurrence-port-core-test.log` |
| API occurrence SQL composition | PASS, 1 tests | `/tmp/a1-occurrence-api-test.log` |
| Full Core | PASS, 2099 tests, 136 skip | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-occurrence-core-full.log` |
| Full API | PASS, 2751 tests, 266 skip | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-occurrence-api-full.log` |
| Core TypeScript | PASS | `/tmp/a1-occurrence-core-ts.log` |
| Core build | PASS | `/tmp/a1-occurrence-core-build.log` |
| API TypeScript | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-occurrence-api-ts.log` |
| Entitlements adapter TypeScript | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-occurrence-entitlements-ts.log` |
| Architecture boundary | PASS | `/tmp/a1-occurrence-boundaries.log` |

## Незавершённая внешняя приёмка

- **GRANT_OWNER_REAL_PG** — Disposable localhost PostgreSQL with production schema, test paid/private/guide/free step occurrence rows and Gafus target grants; verify owned vs outsider, revoked private assignment, expired grant, cross-day step and article; gated real-PG suite was skipped.
- **VIDEO_STAGING** — Approved API + mobile/web test media with video of paid/private course; check range/manifest endpoint denies without exact owner/day/step access. No prod media writes.
- **FINAL_ARCH** — Remove remaining 27 Core→server edges before joint A1/A2/A3 33-stage architecture final + 5-stage chaos, Web/Mobile/Worker/panels/PG/Redis gates. Do not modify frozen 41 baseline prematurely.

Агент 2: сверять `sha256_after` для всех 10 файлов, выполнить семантический merge в shared `app.ts`/guard/index. A1 не выполнял merge/push.

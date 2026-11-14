# A1 → A2: Owner-scoped Course Catalog Read Port

**12.11.2026 · main · HEAD `0dcd18c13c8d` · без merge/commit/push/deploy.**

## Результат

- **25 → 24** Core→server; frozen 41 **17 resolved / 0 new**, historical 142 **118 retired**. Baseline JSON не менялся.
- Core `courseService.ts` больше не импортирует `legacy-catalog-rows`; `CatalogReadPort` содержит 7 typed SQL projections, API bootstrap устанавливает их до Hono.
- Защищены приватные курсы и favorites от чужих записей, сохранены CourseWithProgressData, пустой legacy `userCourses`, paid access, Dates, порядок дней, и CAS/ошибки логотипа курса.
- Неиспользуемый порт отказывает `COURSE_CATALOG_READ_PORT_UNBOUND`, hot-rebind заблокирован. При проверке исправлены Prisma enum/public enum граница и устаревшая тестовая фикстура.

## Файлы и SHA-256

Снимок «до» создан для этой группы непосредственно после системной ошибки; предыдущие SHA общих файлов A2/A3 не используются. Full SHA-256 в JSON.

| Тип | Файл | SHA до | SHA после |
|---|---|---|---|
| M | `apps/api/src/app.ts` | `52932825b7b0` | `9d721c057fe2` |
| A | `apps/api/src/modules/courses/composition/install-catalog-read.contract.test.ts` | `—` | `242d2c232e02` |
| A | `apps/api/src/modules/courses/composition/install-catalog-read.ts` | `—` | `6f93db4facf8` |
| M | `docs/audit/core-server-adapter-risk-inventory-20261111.md` | `2ed534c67d0c` | `b7deb3562a06` |
| M | `docs/audit/core-server-bulk-progress-20261111.md` | `5aada74a00eb` | `13464844c7fb` |
| A | `packages/core/src/services/course/catalogReadPort.test.ts` | `—` | `d11e8cf6cb89` |
| A | `packages/core/src/services/course/catalogReadPort.ts` | `—` | `8eb649861fa5` |
| M | `packages/core/src/services/course/courseService.test.ts` | `1d3390202c62` | `3698c94ac7e4` |
| M | `packages/core/src/services/course/courseService.ts` | `14361bf7c14e` | `4eb33c094c7b` |
| M | `packages/core/src/services/course/g1-course-favorites-private-work-read.test.ts` | `b9ee18688d38` | `faecbd4c9d5f` |
| M | `packages/core/src/services/course/index.ts` | `2fb3aa49c547` | `2310dc2c6e2b` |
| M | `scripts/check-core-server-boundary.mjs` | `2c77bf214697` | `0eb19e8c4083` |

**Всего 12 файлов**: 8 M, 4 A.

## Проверки

| Этап | Результат | Журнал |
|---|---|---|
| Core existing catalog + new owner ACL | PASS 27 passed | `/tmp/a1-catalog-new-core-tests-v2.log` |
| API catalog SQL composition | PASS 1 passed | `/tmp/a1-catalog-api-contract.log` |
| Full Core | PASS 2111 passed / 136 skipped | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-catalog-core-full.log` |
| Full API | PASS 2754 passed / 266 skipped | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-catalog-api-full.log` |
| Core TS | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-catalog-core-types-final.log` |
| Core build | PASS | `/tmp/a1-catalog-core-build-v3.log` |
| API TS | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-catalog-api-types-final.log` |
| Course adapter TS | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-catalog-course-read-types.log` |
| Workspace dependency DAG | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-catalog-workspace-graph.log` |
| Architecture boundaries | PASS | `/tmp/a1-course-catalog-boundaries.log` |

## Открытые внешние проверки

- **REAL_PG_CATALOG_READ** — Dedicated pre-populated read-only PostgreSQL with pg role locked to local test DB, owner/outsider memberships/favorites, private and public course, viewer progress. Opt-in real work PG18 fixture is not available in unit runs; verify zero foreign IDs and query cost.
- **WEB_MOBILE_WIRE** — Integrated A1/A2/A3 API + Web/Mobile staging to compare anonymous 11-field catalog, authenticated CourseWithProgressData, metadata, private course visibility and paid access.
- **FINAL_ARCHITECTURE** — Remove 24 remaining Core→server edges and run the combined 33-stage regression +5-stage chaos, Web/Mobile/Worker/panels/PG/Redis acceptance before adjusting frozen baseline 41.

Агент 2: сверить все текущие `sha256_after_current`, переносить Core порт + API installer + контракты атомарно, семантически объединить shared `app.ts`/`index.ts`/скрипт/аудит. Не делать merge/push в потоке A1.

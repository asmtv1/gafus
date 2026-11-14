# A1 → A2: Course.version owner-CAS Persistence Port

**12.11.2026 · main · HEAD `0dcd18c13c8d` · без commit / merge / push / deploy.**

**Сканер:** **36 → 35** Core → server, frozen 41: **6 resolved / 0 new**, historical 142: **107 retired**. JSON baseline не редактировался.

## Политика, SQL и публичные контракты

- `courseVersionService.ts`: прочитывает owner-scoped version и выполняет один CAS с явными статусами `found`, `updated`, `stale`, `not_found`, `invalid`, `unknown`. `COURSE_VERSION_PORT_UNBOUND` переводится в прежний `unknown`, не в `updated`.
- PostgreSQL owner `authorId`, `Course.version` trigger, row-lock и транзакция логотипа остаются в `@gafus/course-progress-server/course-version-rows`, исходник SQL не менялся. Core не вызывает SQL.
- Кэш инвалидируется / best-effort Redis публикация выполняется только после доказанной успешной CAS-записи; при UNKNOWN никакого retry и publish.
- API composition `apps/api/src/modules/trainer-courses/composition/install-core-version-rows.ts` регистрирует порт до Hono routes. Повторная замена порта запрещена. Public logo error mapping `STALE_VERSION`, `NOT_FOUND`, `BAD_QUERY`, `INTERNAL_SERVER_ERROR` в `courseService.ts` не менялся.

## Передаваемые файлы (полные SHA-256 в JSON)

База «до» — реальное незакоммиченное дерево перед данной группой, **не Git HEAD**. Исключение: прежний `trainerCourse/index.ts` восстановлен побайтово удалением двух добавленных экспортов, это отмечено в JSON. Исходники и контрольные суммы — в `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/course-version-port-prechange`.

| Статус | Файл | SHA-256 до | SHA-256 после |
|---|---|---|---|
| M | `apps/api/src/app.ts` | `ce11980a7691` | `bd13670c457e` |
| A | `apps/api/src/modules/trainer-courses/composition/install-core-version-rows.contract.test.ts` | `—` | `1cde49eb5afd` |
| A | `apps/api/src/modules/trainer-courses/composition/install-core-version-rows.ts` | `—` | `02048572bf5f` |
| M | `docs/audit/core-server-adapter-risk-inventory-20261111.md` | `0689e305ef8e` | `937e7d0cdbaa` |
| M | `docs/audit/core-server-bulk-progress-20261111.md` | `0c5085349899` | `309d95bfdbc9` |
| A | `packages/core/src/services/trainerCourse/courseVersionPort.test.ts` | `—` | `ed5b57456044` |
| M | `packages/core/src/services/trainerCourse/courseVersionService.ts` | `7fbe8b1334d6` | `9a07ecd9398d` |
| M | `packages/core/src/services/trainerCourse/g1-course-global-version.cas.test.ts` | `7f34fa9deed8` | `b350423312bd` |
| M | `packages/core/src/services/trainerCourse/g1-fullschema-course-version-work-stage.real-pg.test.ts` | `8cc45e7585c2` | `fedb546e0f39` |
| M | `packages/core/src/services/trainerCourse/index.ts` | `0d09c90b0b6f` | `4686e6dfb966` |
| M | `scripts/check-core-server-boundary.mjs` | `d85c6e3c810c` | `2152ba3fd961` |

Всего **11 файлов**, 8 изменено, 3 добавлено.

## Адресные и общие тесты

| Проверка | Статус | Журнал |
|---|---|---|
| Core CAS + injected port | PASS · 18 тестов | `/tmp/a1-course-version-port-tests.log` |
| API composition port | PASS · 1 тестов | `/tmp/a1-course-version-api-port-test-v3.log` |
| Core full tests | PASS · 2066 тестов | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-course-version-core-full.log` |
| API full tests | PASS · 2743 тестов | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-course-version-api-full.log` |
| Core typecheck | PASS | `/tmp/a1-course-version-core-ts.log` |
| Core build | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-course-version-core-build.log` |
| API typecheck | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-course-version-api-types.log` |
| Persistence typecheck | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-course-version-persistence-types.log` |
| Worker typecheck | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-course-version-worker-types.log` |
| Workspace graph | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-course-version-graph.log` |
| Architecture boundary | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-course-version-boundaries.log` |
| Core server facade AST | PASS | `/Users/asmtv1/Library/Logs/gafus-refactor-regression/a1-arch-20261112/a1-course-version-ratchet.log` |

## Незакрытые приёмки

- **VERSIONED_COURSE_FULLSCHEMA_PG** — Dedicated disposable full restored PostgreSQL current schema Course.version trigger and trainer/admin identities. Enable GAFUS_AG1_FULLSCHEMA_STAGE_CAS=1 only against locally guarded gafus_refactor_course_cas_stage_20261025 DB, role gafus_refactor_local_real, loopback host and zero existing user/course rows. The real-PG test is opt-in and was not run.
- **TRAINER_PANEL_MULTI_INSTANCE** — Approved integrated A1/A2/A3 candidate with API and trainer-panel writers; verify every course editor path observes same DB version, logo CAS, content revision and cache signals; no production writes.
- **FINAL_INTEGRATION** — Remove remaining 35 Core→server edges, then run complete 33-stage architecture-final-regression, 5-stage chaos and all API/Web/Mobile/Worker/panel/PG/Redis acceptance suites with disk reserve; only after all green ratchet may change.

**Интеграция A2:** сверять **полные** `sha256_after` и не перетирать параллельные правки A2/A3. Передавать вместе Core port, API installer, тесты, guard и исправленный инвентарь. Замороженный baseline JSON менять только после полного совместного acceptance. **Merge/push не выполнялись.**

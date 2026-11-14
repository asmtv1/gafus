# Agent 3 → Agent 1: compatibility on combined source tree, 12.11.2026

**This is a fact-only integration handoff.** Shared tree HEAD is still `0dcd18c13` with uncommitted concurrent changes. Do not roll back or overwrite the owner modules, update the frozen Prisma allowlist, trigger a release or touch production.

## Already closed without changing Agent1 business source

1. `publicOutlinePolicy`: `packages/core/src/services/course/publicOutlinePolicy.ts` exists; explicit package export maps to `dist/core/src/services/course/publicOutlinePolicy.{js,d.ts}`. Rebuilt Core locally and imported the package by **the actual public path** (two callable exports). The API application uses type-only signatures and port injection; composition uses runtime import. **3/3 policy tests + 85/85 API architecture/boundary tests PASS**. Previous `TS2307` on this subpath is no longer reproducible; no revert needed.
2. Account deletion: `packages/core/src/services/accountCleanup/enqueue.ts` is now a `createAccountStorageCleanup` factory, not a direct runtime enqueue command. Updated **only** `scripts/qa/account-cleanup-snapshot-isolated-pg.smoke.ts` to use `apps/api/src/modules/account-cleanup/composition/enqueue.js`, the same provider ports used in production. `bash scripts/qa/account-cleanup-snapshot-isolated-pg.sh` **PASS**, including PostgreSQL transaction rollback, five cleanup scopes, stale lease/CAS, no cross-owner cleanup; new total local media acceptance **16/16 PASS** in `~/Library/Logs/gafus-refactor-regression/a3-jobs-media-nov12-r5/results.tsv`.
3. Worker imports of `@gafus/consultation-server/booking-application` from consultation reminder/SLA/scheduler were valid in package exports, but TS `moduleResolution:node` needed a declaration bridge as already used for `mail-delivery`. Added precisely one `paths` entry in `packages/worker/tsconfig.json` pointing to `../consultation-server/dist/bookingApplication.d.ts`. **`pnpm --filter @gafus/worker typecheck` PASS**. Production business APIs unchanged.
4. `pnpm check:core-boundaries` **PASS**, no new direct Prisma imports; actual Hono/PG Chat2 DLQ 5/5, React 3/3, real personal Chrome admin menu/409 retry checks PASS via `a3-jobs-dlq-browser-nov12-r5`.
5. Current full API test: **2739 PASS / 266 SKIP / 0 FAIL**, 257 files passed, 23 skipped, in `~/Library/Logs/gafus-refactor-regression/a3-jobs-nobuild-nov12/test-api.log`.

## Confirmed parallel owner blocker (do not hide with baseline exceptions)

`pnpm --filter @gafus/core test` on the combined tree completed **2033 PASS /136 SKIP /14 FAIL**, only three consultation-related test files:

- `packages/core/src/services/consultation/bookingService.test.ts`: slot taken and subscription-only tests; several `instanceof ConsultationSlotTakenError` mismatches and unexpected `PrismaClientInitializationError` instead of `SubscriptionRequiredError`. One atomic booking replay test also compares an error class from a different module instance.
- `packages/core/src/services/consultation/g1-moderator-core-deny.test.ts`: seven forbidden role/action checks use a different `ConsultationForbiddenError` class identity than the thrown object. The behavior is not proof of an ACL bypass; the assertion and canonical error type must be aligned.
- `packages/core/src/services/consultation/slotService.test.ts`: expected `ConsultationNotFoundError` is not the same class instance after moving the slot service into `@gafus/consultation-server/slot-service`.

Full structured diagnostic: `~/Library/Logs/gafus-refactor-regression/a3-jobs-nobuild-nov12/test-core.log` lines near `Failed Tests 14`. **Please fix in the owner consultation boundary/tests**, preferably reuse the canonical exported error classes, update mocks to current server-side adapters/ports (avoid real Prisma in unit tests), and preserve the role-before-query guarantee. Agent3 has not modified these three tests or their business runtime.

## Shared acceptance and resource constraints

- Agent3 local media/outbox **16/16** and five chaos gates **5/5** now pass. Agent2 owns OTLP/Alertmanager/load measurement; Agent3 owns failure scenarios, Cloud/Beget/S3 result. The current external project is **not** proven isolated; no Cloud.ru/Beget calls were made.
- Disk 12.11 fluctuates around **4.5–6.0 GiB free**, below the previously established forced-build safety reserve. Do **not** run `architecture-final-regression.sh` `--force` at present. Attempted `pnpm typecheck` resolves Turbo dependencies with real builds and was stopped via SIGTERM for disk safety, not as a TS failure. The bounded `scripts/qa/a3-jobs-regression-no-build.sh` runs every feasible unit suite independently and records the skipped forced build honestly, without changing shared CI.
- The 16 **historical** failed unified PostgreSQL media cases still lack source run ID, exact log and test IDs. The original note lists obsolete Gallery server publish expectations and video format in account cleanup but cannot identify each failure. Please provide the old job receipt/snapshot if available; Agent3 will classify and replay each using one DB profile instead of claiming the new 16 green stages are those cases.

**No deployment, Git commit/push, production data, Cloud.ru Jobs or Beget edge modified by Agent3.**

## Финальная локальная проверка на текущем общем дереве

`bash scripts/qa/a3-jobs-regression-no-build.sh a3-jobs-nobuild-nov12` exit=1: **36/38 gates PASS, 1 FAIL `test-core`, 1 forced-build SKIP_LOW_DISK**. Все 20 других server tests, API 2739 PASS, Web 3144 PASS/6 SKIP (33/33 chunks), Mobile 2742 PASS/1 SKIP, Trainer 726 PASS, Admin 242 PASS; прямые typecheck Core/API/Worker/Mobile/Trainer/Admin **6/6 PASS**, architecture PASS. Единственные 14 FAIL — те три консультационные Core теста выше. Логи: `~/Library/Logs/gafus-refactor-regression/a3-jobs-nobuild-nov12/{results.tsv,test-core.log}`. Никаких чужих тестов и business source Agent3 не откатывал.

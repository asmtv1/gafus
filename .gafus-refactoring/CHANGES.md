# Local change log — 2026-10-11

- Profile core service/types: city read + write unified, removed app-specific follow-up Prisma mutations and queries in Web/API. Added 5 profile service tests.
- TrainerStep core: shared create/update domain validation and examination predicate, edit-form DTO with validated legacy checklist, persisted step image state read. TrainingDay edit read moved into core. Trainer Panel consumes core services. Added 8 parity and 3 DTO tests.
- Consultation intake: shared pure form validation in consultation-shared, reused in Web/Mobile; added 4 intake tests.
- Worker subscription: plan code parser unified with core, TS path for CommonJS module resolution.
- Protected mini-guides: core transaction now performs target/access check before loading HTML; both Web/API routes thin. Added 3 more guide access tests.
- Admin partner policy: moved shared preflight role-and-promo authorization from two admin routes into core. Updated API/action test mocks and added core policy tests.
- Admin partner balances: typed Prisma selects, payout/referral summaries, and fresh database ADMIN authorization in core. Admin list/detail adapter thin, added 3 tests.
- Admin payout: moved PAID write into core, introduced same userId-based transaction advisory lock as partner self-service and locked admin actor row before checking role. Added 4 mock tests. Postgres two-request concurrency not verified.
- Architecture guard: scripts/check-app-prisma-boundary.mjs and initial JSON baseline; blocking in CI. Legacy direct runtime Prisma usage now 14 files.
- CI: Web lint blocking, Mobile typecheck + tests added; fixed Web profile PublicPets import through public API.
- Source changes are uncommitted. No GitHub push, staging or production modifications.

## Follow-up implementation — 2026-10-11 (after initial checkpoint)

- Core admin user edit: actor and target role rechecked within the same database transaction and ordered row locks; both admin entry points pass trusted actorId, new denial tests.
- Partner payout: two race tests PASSED against a disposable PostgreSQL with a shared transaction advisory lock.
- Core auth/registrationUseCases: Web and Mobile/API reuse promo preview, VK context validation/claim, registration-completion read, and unified registration channels; no app-specific Prisma transaction.
- Core trainerAI: history, clear, config read, atomic exchange save, transactional admin config save, current DB role checking and supported-model policy; Trainer Panel accesses core.
- Core reminders: local time/day/dedup eligibility, atomic claim/release, push subscription reads/removals; Worker reduced to push transports and orchestration.
- Core appSubscription: stored renewal agreement and retry/amount/idempotence policy reused by worker; full renewal job remains in worker.
- Core profile avatar: upload to CDN before DB transaction; delete old avatar after commit; compensate new object on DB failure.
- Core DB lifecycle / HTTP metadata / Feed moderation / Web count / admin promo list: runtime Prisma imports eliminated from apps.
- Strict AST guard: ZERO application runtime Prisma imports allowed; deleted legacy exception baseline. Dependency graph (36 workspaces, no cycles) and Mobile pure core import boundary guarded in CI.
- Unit test baseline updates: guideContent omission, worker bootstrap+cron mocks, payments middleware mock, Web PublicPets mock.
- Full local suites now green across core, API, Web, Mobile, Trainer Panel, Admin Panel, Worker and Consultation Shared; see TEST_RESULTS.md.
- No push/staging/production changes. See BLOCKERS.md for scope that is not finished.

## Further consolidation — 2026-10-11 (current turn)
- Added TrainingReminderDelivery schema and additive SQL migration; atomic daily claims and token leases; crash-recoverable retry candidates after normal schedule window; acknowledgement + lastSentAt updated together. Added 8 unit tests and 2 real isolated PostgreSQL concurrent tests.
- Worker training-reminders-sender now uses core leases and acknowledges actual delivery instead of claiming lastSentAt prior to push. Stale claims can be reclaimed. At-least-once transport semantics documented.
- Moved subscription/NPD metrics queries, eligible exam-video cleanup and compare-and-swap DB update, feed smart ML operational DB injection, Gafus notification outbox/claim, feed maintenance/notification database orchestration, subscription renewal-reminder data selection/mark, consultation email delivery state, push notification DB reads/writes and pet-prevention reminder policy from worker into core.
- Migrated worker-only smart ML train/promote and profit-reconciliation CLI Prisma ownership to core wrappers. Tests updated for mocks and contracts.
- Remaining 7 worker modules still own DB directly, especially subscription renewals; full ARCH-RENEWAL-002 remains blocked by restricted credential handling and unverified staging integration.

## Worker consolidation follow-up — 2026-10-11
- Core now owns video HLS transcoding DB state transitions: started, completed, failed. Worker retains ffmpeg/CDN/BullMQ.
- Core now owns reengagement campaign read state and subscription queries/cleanup; worker retains push transport.
- Core now owns NPD email receipt claim, retry, terminal states, with SMTP rendering/delivery in worker.
- Core now owns NPD fiscalization cutover compare-and-set; CLI retains explicit --confirm. NPD operation retry classification/backoff moved into pure core policy.
- Renewals: core owns select-due + mark-PastDue, buyer-email lookup, and atomic successful payment/period/partner/NPD receipt transaction with compare-and-swap period guard. Worker still owns payment attempts and provider request/failure paths.
- Added scripts/check-worker-prisma-boundary.mjs and blocking CI step; only app-subscription-renewals, npd-worker, interactive npd-bootstrap and 2 opt-in isolated SQL probes remain approved runtime ORM imports.
- Fresh baseline migration test on isolated PG14 failed at 20260306120000 (missing passwordSetAt, then Account); historical migrations unchanged.
- New core unit tests for NPD cutover, retry policy, video transcoding and renewal finalization/candidates; all individually pass (candidates awaiting final check).

## Final local continuation: all production app/worker Prisma ownership moved to core
- RenewalAttemptService: typed transactional payment preparation and eligibility; renewalProviderResultService: failure, cancel and response status persisted in core; renewalProviderPolicy: amount and provider request classification in core. Worker retains HTTP provider access and batch lock only.
- NPD OperationPersistence/UseCase: transactional claims, receipt creation/cancellation, reconciliation and retry state in core. NPD bootstrap persist, NPD email queue, NPD cutover all invoke core. Worker owns provider network and encryption adapters.
- Trainer AI StreamPolicy moved model allowlist and attachment history normalization into core; trainer route thin SDK adapter.
- New fresh-DB bootstrap extras generator and SQL, hardened bootstrap and CI PostgreSQL 16 regression. Disposable PostgreSQL 14 verified 54 checks, 5 triggers, 2 partial indexes, 133 migration records and zero Prisma drift.
- Real PostgreSQL NPD lease + stale cancellation tests 2/2 PASS, independent of prior four local PostgreSQL race tests.

## Added domain-extraction continuation (2026-10-11)
- Migrated reengagement analysis, scheduling, campaign policies and all original tests into core; compatibility adapter and tests now static import.
- Migrated trainer/course/step/user statistics into core; retained statistics API via ESM reexports.
- Feed/Gallery runtime Prisma binding, feed telemetry and feedback now in core; feed-server/gallery-server are transport adapters. Fixed ranking SQL cursor timezone bug.
- Auth credential/session, password reset (short-code now revokes sessions), VK one-time grants and normalized phone query migrated into core. Removed old ambient declarations, resolved NextAuth v4 CJS factory ESM compatibility. Web reset errors use direct core class.
- Immediate push DB and BullMQ job lifecycle moved from webpush to core, provider integrations stay in webpush.
- Created seven-package ORM AST guard with six fixed infrastructure exceptions; CI updated.
- Hardened NPD operation and email delivery types (removed any), added nullable receipt ID explicit check in NPD worker. Corrected test fixtures to match schema and trigger constraints.
- Local PG14 separate isolated bootstrap and broad integration tests; corrected legacy gallery fixed-clock test to use persisted availableAt.
- Full core lint errors fixed without disabling rules (remaining style warnings nonblocking). Trainer AI model vision returns explicit false until explicitly supported.

## Build-driven client/server boundary fixes (2026-10-11 continuation)
- `apps/web/src/features/pet-prevention/components/PreventionEntryList.tsx`: import server action from its dedicated `use server` module instead of a mixed re-export barrel.
- `apps/web/src/features/pet-prevention/components/PreventionEntryForm.tsx`: likewise import create/update dedicated server-action modules, preventing the browser bundle from traversing `core/petPrevention/reminderDelivery` and BullMQ.
- `apps/web/src/app/~offline/layout.tsx`: import client-only Header module directly instead of mixed header barrel exporting ServerWrapper/@gafus/auth, avoiding `node:crypto` in the offline client build.
- Standalone production Web build now succeeds (108 prerendered pages) with one pre-existing autoprefixer CSS warning.
- Added `apps/web/src/features/header/client.ts` explicit client-only public API; offline layout imports it rather than banned feature internals. Full root ESLint now 6/6 PASS.
- Extended GitHub CI Mobile job with Android and iOS Expo Metro export smoke gates, without publishing updates.
- Full monorepo production build 36/36 PASS; both mobile Hermes/Metro exports PASS on local Mac. Native release builds and remote CI/staging/provider checks remain separate release gates.

## Resend upstream integration via AI Commander (2026-10-11)
- Integrated latest existing upstream commit `05c5b67f6a8c54bb714ba54ffc51f0ab5c38bff9` (Resend transactional email with delivery journal) into local `main` without modifying the working-tree content. The commit is a fast-forward from former HEAD `18fb261f`.
- Upstream touched 19 files. Of them 16 were byte-for-byte identical to existing working-tree files; the three additional local variants `.github/workflows/ci-cd.yml`, `packages/prisma/schema.prisma`, and `pnpm-lock.yaml` were conflict-free three-way merges producing output identical to existing working-tree content. No manual rewrites necessary.
- Protected original local changes: binary Git patch for tracked edits, archive of 119 untracked items, archive of 19 upstream-overlapping files and checksum list. Both `/tmp/gafus-resend-merge-20261011T233852/` and persistent `.git/gafus-backups/gafus-resend-merge-20261011T233852/` hold backup. No user file contents were changed by reconciliation.
- Updated local branch ref and Git index to point at the pre-existing upstream Resend commit, leaving the worktree uncommitted (249 modified/untracked paths now). No new commit created, no push/deploy.

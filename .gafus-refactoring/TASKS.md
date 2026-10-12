# Architecture refactoring tasks — 2026-10-11

Status: TESTED = local checks passed, not a deployed or staged verification.
No task is DONE until release criteria and necessary CI/smoke checks have passed.

- ARCH-GUARD-001 TESTED — strict zero-runtime-Prisma import guard for apps; no legacy exceptions.
- ARCH-CI-001 IMPLEMENTED — blocking Web lint in GitHub Actions, GitHub run not verified.
- ARCH-CI-002 IMPLEMENTED — Mobile typecheck and tests required by CI; GitHub run not verified.
- ARCH-PROFILE-001 TESTED — city normalization / profile DTO via core.
- ARCH-PROFILE-002 TESTED — Web and API duplicate city read/write removed.
- ARCH-CONTENT-001 TESTED — private guide access verified in core.
- ARCH-AUTH-001 TESTED — promo preview and context transactions via core.
- ARCH-AUTH-002 TESTED — VK context lookup/claim and registration state via core.
- ARCH-ADMIN-001 TESTED — partner-role authorization under row lock and transaction.
- ARCH-PARTNER-001 TESTED — shared payout advisory locking; two actual isolated PostgreSQL concurrency tests passed.
- ARCH-PARTNER-002 TESTED — administrator partner balances in core.
- ARCH-STEP-001 TESTED — create/update validation parity.
- ARCH-STEP-002 TESTED — no duplicate exam-specific rule in trainer adapter.
- ARCH-STEP-003 TESTED — edit read DTOs in core.
- ARCH-CONSULT-001 TESTED — Web/Mobile consume shared client intake validation.
- ARCH-AI-001 TESTED — core authorization/model constraints on settings.
- ARCH-AI-002 TESTED — core read/history and atomic chat exchange/config persistence.
- ARCH-AI-003 TESTED — core owns Trainer AI permissions, persistence, model allowlist, message and image attachment normalization; Trainer Panel is a streaming provider/HTTP adapter. Live provider smoke still not run.
- ARCH-REMINDER-001 TESTED — timezone/day/time policy in core.
- ARCH-REMINDER-002 TESTED — durable per-local-day delivery lease, crash reclaims, completed-send acknowledgement and real PostgreSQL concurrency tests; push-subscription DB operations in core.
- ARCH-RENEWAL-001 TESTED — stored plan plus retry/idempotence/money policy in core.
- ARCH-RENEWAL-002 TESTED — core owns billing candidate selection, payment-attempt state machine, idempotence, failure/retry/cancellation, amount response classification, request payload, partner commission/NPD receipt finalization; worker owns advisory batch lock, HTTP credentials and YooKassa transport. Full 15 unit tests PASS; live YooKassa/NPD staging payment smoke not run.
- ARCH-AVATAR-001 TESTED — CDN outside DB transaction, compensate on DB failure.
- ARCH-CORE-001 TESTED locally — all app/worker runtime and the reengagement, statistics, feed-server, gallery-server domain adapters have no direct Prisma access. Auth domain credential/session, VK and password reset logic is in core; webpush immediate notification lifecycle in core. CI AST gate checks seven adapters and permits exactly six existing framework/provider infrastructure persistence seams (NextAuth PrismaAdapter, mailer send/event journals, webpush subscription/invalid-endpoint cleanup). Two opt-in SQL worker diagnostics are separately excepted. Strict 0-ORM-in-transport for the whole monorepo still not claimed.
- ARCH-GRAPH-001 TESTED — 36 workspace graph projects; no cycles, CI guard added.
- ARCH-CLEAN-001 TESTED — removed grandfathered app Prisma baseline; now strict guard.

Tests and release blockers are recorded separately. No production deployment or push was performed.

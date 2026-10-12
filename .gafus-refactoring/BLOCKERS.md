# Current local release and architectural exceptions — 2026-10-11

## Verified implementation
- All app runtime code and all scheduled Worker runtime code: zero direct Prisma imports; two explicit opt-in SQL diagnostics are excluded from the worker gate.
- Legacy adapters @gafus/reengagement, @gafus/statistics, @gafus/feed-server and @gafus/gallery-server now import core for business decisions and DB binding, and have zero direct runtime Prisma imports.
- @gafus/auth now delegates credential checking, session freshness/revocation, password resets, phone lookup and VK LOGIN grants to core. Both email-link and short-code password resets atomically revoke existing sessions and refresh tokens. NextAuth framework PrismaAdapter remains an explicit infrastructural Prisma seam.
- @gafus/webpush immediate notification persistence/enqueue moved to core. Provider transport and invalid endpoint cleanup remain in webpush as infrastructure.
- @gafus/mailer retains external-provider network, delivery attempt journal and webhook event journal. Mail/send state is infrastructure.
- New CI AST guard blocks new runtime Prisma imports across seven external adapter packages; exactly six well-documented infrastructure exceptions remain: packages/auth/src/auth.ts, packages/mailer/src/resend.ts and webhook.ts, packages/webpush/src/db.ts, expoPush.ts and rustorePush.ts.
- Core business owns renewals, NPD and partner ledger, chat/community/feed, booking, Trainer AI config/stream policy, notifications, reminders and avatar lifecycle.
- Ranked Moments feed keyset cursor now uses UTC-naive TIMESTAMP(3) SQL comparison, preventing repeated first-page loops on PostgreSQL servers with non-UTC timezone. Fixed and verified by real PG tests.
- Disposable PostgreSQL 14 fresh bootstrap verified: 133 historical migration records baselined, 54 CHECK constraints, five triggers, two partial indexes and zero Prisma schema drift. Bootstrap refuses existing DBs. CI PostgreSQL 16 regression authored, not run on GitHub.
- Local suites verified independently: 69 PG integration tests (six modules), further 5 consultation, 2 registration, 7 profit, 3 account deletion; 6 PG race tests including NPD; root Turbo tests now 50/50 passing (49 cache hits), Core 1312 tests passing / 91 skipped by normal default, Worker 67 freshly passing, auth package 34, core auth 83.
- Current code lint passes all six linted Turbo projects with nonblocking historical warnings; root typecheck passes 57/57 (cached). Monorepo production build 36/36 PASS. Android/iOS Metro offline Hermes exports both PASS. The latest Header client-only entrypoint was added after the successful root build, so a final-tree rebuild remains desirable.

## What is NOT validated by local tests
1. No GitHub Actions execution of newly authored CI checks, no staging deploy/test, no production migration/deployment/monitoring, no Android/iOS native release build or native-device smoke. Native Android debug assemble has been initiated but is not counted as PASS until Gradle exit and APK artifact are verified.
2. No live external YooKassa/NPD sandbox charge/webhook or production accounting reconciliation, nor external SMS, SMTP/Resend, Expo/RuStore/WebPush and Trainer AI provider smoke. Local mocked HTTP tests cannot replace these.
3. Existing production DB migration status, checksums, snapshots and backups have not been inspected. Never run fresh-only bootstrap on existing database; deployed DBs must use Prisma migrate deploy after reviewed backup and staging migration.
4. 6 infrastructure-only Prisma exceptions in seven adapter packages remain. They are explicitly CI guarded; literal zero Prisma imports across the whole monorepo is not fully achieved. Worker has 2 isolated diagnostic exceptions.
5. Not all 91 normally skipped core integration cases have been executed; multiple high-impact suites were run explicitly against isolated databases and passed.
6. Local Mac has 8 GiB RAM and ~8 GiB free disk during native Android CMake/Gradle compilation, insufficient headroom for safely running full parallel Xcode native builds. Xcode workspace/scheme enumeration succeeded; actual iOS native compilation still unverified.

No bypass of tool safety controls. No commit, push, production data access or deployment took place; all changes are local.

## Post-reconnection release blockers (2026-10-11, AI Commander)
- Native Android **debug** Gradle build has now PASSED, exit 0; prior offline error was missing Maven AAR cache and resolved using normal online Gradle. No APK signing/format error; release AAB remains not built.
- Mac only ~3.4 GiB free after Android native build (8 GiB RAM). Do not attempt concurrent native iOS or further large release builds without safe disk space; do not delete pre-existing files/caches without user review.
- Local `main` commit `18fb261f` is **one commit behind** remote `05c5b67f` (Resend delivery journaling). 13 files overlap uncommitted refactor; reconciliation and conflict-safe integration needed before pushing. No commit, push, stash/reset, merge or rebase attempted.
- Fresh all-workspace test/typecheck/lint/architecture checks PASS. Last full production-style Web build predates final Header client-only export; refreshed TS/lint both PASS, but need another Web build before release when enough free disk exists.
- GitHub CI `38144068710` was cancelled, so new gates have not run on the hosted runner. Provider sandboxes, real mail/SMS/push/Trainer AI, migrations/staging and production release remain unverified.

## Resend overlap now resolved (2026-10-11)
- Earlier blocker: local `main` lagged upstream by one Resend commit with 13 tracked and 6 untracked overlapping paths. **RESOLVED locally**: all 19 upstream-touched paths were already incorporated in working tree; HEAD/index advanced safely to `05c5b67f`; all prior local edits preserved. Backups inside `.git/gafus-backups/gafus-resend-merge-20261011T233852/`.
- Local verification after integration PASSED 85/85 Turbo tasks uncached, Prisma validation, YAML parse and architectural guards. Real GitHub CI, staging, native release build and provider smoke remain separate incomplete release gates.

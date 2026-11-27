# Stage 2 / 12 independent local acceptance (2026-11-28)

Base: 850874bf306d6aa96629e704ca256033ef1d99f2. Branch:
qa/stage2-12-di-contracts-20261128. Separate worktrees, disposable
loopback PostgreSQL 18.4 / Redis 8.2.1, synthetic users, no provider calls.
No production operations or physical-device testing.

## Runtime DI and reliability

The real API now has a createApp factory and independently captured
registration, reminders and wallet ports. Production default export is
preserved. Protected session lookup infrastructure failure is classified
as AUTH_UNAVAILABLE (503/no-store), not invalid token (401). Default
verifyAccessToken callers elsewhere retain the previous null-on-error behavior.

Reproducible harness:

```sh
pnpm --filter @gafus/auth build
GAFUS_DI12_QA=1 bash scripts/qa/stage2-12-di-http-isolated.sh
# Optional: previous QA worktree, built with its own auth and matching
# workspace package artifacts:
GAFUS_DI12_QA=1 DI12_ROLLBACK_ROOT="$HOME/Desktop/gafus-qa-di12-rollback-20261128" \
  bash scripts/qa/stage2-12-di-http-isolated.sh
```

The wrapper requires explicit consent, allocates its own ports and processes,
blocks non-loopback Node networking, uses a fresh schema (db push, not a
migration replay), checks the DB identity, injects synthetic MX only, disables
mail, and removes owned resources.

Observed r5 cases: registration replay one user/three consents/one receipt;
reminders keyed replay one receipt, keyless legacy DTO, mismatch 409 and
foreign lookup/update 404; wallet one spend/one access grant, balance 2 -> 1,
foreign history empty, forged owner 400; PG stop 503, bounded retry after
restart without duplicate writes; Redis SIGSTOP/SIGCONT and read retry 200.
The r5 runner then failed while trying to parse a plain-text 429 as JSON;
the harness was corrected to accept that specific response format. The
full final runner outcome is recorded below.

DTO clients executed from source tags, with only their common HTTP transport
replaced by a real loopback request adapter:
- iOS 1.7.5 (101): f6e6994e1167e9dbdf4c9ab13bbfbcaa7168c9d2
- RuStore 1.7.5 (17507): 3d57cf0963b9351dd241dd28eed5d0c92c0e7369
- Google Play 1.7.6 (17603): db6a46fc4878278a7a339c039559ee92d5482507
- QA current: 850874bf306d6aa96629e704ca256033ef1d99f2

All four returned two reminders and one wallet history record. These are
release-source tags, not evidence that these exact builds are currently
deployed; no native signed binaries, all DTOs, or old transport refresh
behavior are claimed. Rollback target is the previous QA candidate
2f485a3947fa4adab4c65f19543d1a0ec0921b16, not the pre-refactor production API.

Auth middleware regression 32/32, DI/route regressions 32/32 (10 files total).
DI scope is the three selected domains; other router singletons and
shared infrastructure are not proven independently injectable.

## Stage 12

- built exports: 389/389, 67 packages, 2754 references, 312 used subpaths.
- workspace graph: 67 projects, zero existing/new cycles.
- client/server transitive Core boundary: 995 modules.
- Mobile boundary: 919 files; Web boundary: 588 files.
- Vite production build: exit 0 (1222 transformed modules).
- Vite source-map scan: 131 maps / 863 mapped source paths / 0 matching
  forbidden server markers; not proof concerning unmapped sources.
- fresh Android Metro export: timeout after 600 seconds, no final artifact.
  Existing historical iOS and Android HBC files have no source maps and
  no verified exact candidate provenance; a byte-string marker scan found
  no Prisma/Auth/Core server/queue/Mailer markers. Complete Metro proof
  remains BLOCKED, not PASS.
- Fresh offline frozen installation timed out. Third-party pnpm store was
  reused; relative workspace links point to the separate worktrees and
  existing dist artifacts were copied only for unchanged workspace sources.
  Auth was rebuilt. This is not an independent full clean dependency build.

Commands:
```sh
node scripts/check-workspace-public-exports.mjs --built
node scripts/check-workspace-graph.mjs
node scripts/check-core-client-boundary.mjs
node scripts/check-mobile-core-boundary.mjs
node scripts/check-web-core-boundary.mjs
(cd apps/web-vite && env -i HOME="$HOME" PATH="$PATH" GAFUS_PRIVATE_MAPS_ENABLED=false pnpm exec vite build --config vite.config.mjs --sourcemap --outDir /tmp/gafus-di12-evidence/web-dist)
(cd apps/mobile && env -i HOME="$HOME" PATH="$PATH" CI=1 EXPO_OFFLINE=1 EXPO_NO_TELEMETRY=1 EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:1 pnpm exec expo export --platform android --dump-sourcemap --output-dir /tmp/gafus-di12-evidence/metro-android)
pnpm --filter @gafus/api typecheck
```

Local evidence directory: /tmp/gafus-di12-evidence/ (not tracked).
Relevant logs: built-exports.log, workspace-graph.log, core-client-boundary.log,
mobile-boundary.log, web-boundary.log, vite-source-map-scan.log,
metro-android.log, metro-existing-strings.log, di-http-r3.log through
di-http-r6.log, auth-build.log, auth-regress-r2.log, di-regress.log,
rollback-prepare.log, typecheck-r2.log.

## Final runner / disposition

r6 failed with REGISTRATION_UNAVAILABLE: Prisma P2028, existing 10000 ms
transaction timeout exceeded under concurrent local load. No timeout increase
was made. r7 ran separately from the other heavy jobs in this worktree and
exited 0: 151 real HTTP requests, two candidate instances, real PG/Redis,
all assertions including 429/private no-store and listener switch to the
previous QA worktree passed. Rollback preserved two reminders, one history
entry, and one spend after replay. Owned resources removed.

Final r7 job ID: a63249a4da1586711ecc510e3678f7927e6f714c285384b1.
Evidence: /tmp/gafus-di12-evidence/di-http-r7.log.
PG stop/restart and transient Redis pause/resume PASS. Full Redis process
restart/persisted-state recovery is not tested. API typecheck timed out twice
(240 s each, no final compiler result), BLOCKED. Auth build and 64 targeted
regressions PASS. No claim of global DI/runtime isolation or all wire contracts.
Stage 2 scoped mounted acceptance PASS; full stage 12 remains BLOCKED on
exact-SHA Metro dependency artifact and full API typecheck; broader deployed
version compatibility is not established. Registration timing failure is
retained as an observation, not attributed to a confirmed production defect.

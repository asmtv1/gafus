# GAFUS — authenticated Hono HTTP + SQL acceptance, 19 November 2026

**Status: PASS in an isolated, informational QA profile only. NOT release-ready.** No existing user, server, Redis, PostgreSQL, browser process, production provider, CI workflow or release gate was operated. No commit, push or deployment.

## Reproduce / proof

```bash
pnpm test:api-acceptance
node scripts/qa/test-system.mjs plan --profile api-acceptance --plan-only
node scripts/qa/test-system.mjs report --run-id qa-3536c505-6b58-4aeb-8346-11bd1599c346
pnpm test:system:contract
pnpm --filter @gafus/api typecheck
```

- Registered scenario: `api.authenticated-http`, check `api.authenticated-http.pg` (`kind: api-acceptance`); excluded explicitly from `ci`, `full`, `integration`, `recovery`, `faults` and `coverage-risk` plans.
- Final passing run: `.qa/testing/qa-3536c505-6b58-4aeb-8346-11bd1599c346/summary.md`, `summary.json`, `plan.json` and `tasks/*/{tests.json,api-http.json,resources.json,receipt.json,output.log}`.
- Result: **REPORT 0; 1/1 checks; 9/9 named HTTP+SQL cases; 33 real HTTP requests and 9 case-specific SQL observations**; no missing cases, skips or failed responses.
- Main implementation: `apps/api/src/test/qa-authenticated-http.acceptance.mts`; disposable service wrapper: `scripts/qa/api-authenticated-http-isolated.sh`; strict evidence verifier: `tests/support/api-auth-http-report.mjs`.

## Measured scenarios

| Area | Real HTTP observations | PostgreSQL observations |
| --- | --- | --- |
| Anonymous / invalid bearer | `GET /auth/me`, `/user/profile`, `/training/day`, `/admin/users`: 401; forged bearer: 401 | 0 SQL refresh sessions |
| Invalid login | `POST /auth/login`: 401 | 0 SQL refresh sessions |
| Login for `USER` (2), `TRAINER`, `ADMIN` | Four `POST /auth/login`: 200; unique JWT and expected role/owner in each response | Four durable, distinct refresh token-hash rows with `revokedAt=NULL` |
| Authenticated identity / profile | Three `GET /auth/me` and three `GET /user/profile`: 200, each mapped to the bearer owner | Three actor rows cross-checked; no other owner's username/ID returned |
| Private training day | `GET /training/day`: enrolled user 200; other user 403 `FORBIDDEN` | Exactly one `CourseAccess` grant and zero progress writes during reads |
| Role authorization | `USER` trainer panel: 403; `USER` admin users: 403; `TRAINER` admin users: 403; `TRAINER` own days: 200; `ADMIN` users: 200 | Database roles `USER`, `TRAINER`, `ADMIN` verified |
| Foreign mutation / legitimate progress | Other learner `POST /training/step/start`: 403; assigned learner: 200 | Only one `UserTraining` and bound step `IN_PROGRESS` created for owner, **zero** for other learner |
| Normal logout | `POST /auth/logout`: 200; immediate `POST /auth/refresh` replay: **409 `REFRESH_CONFLICT`**; previously linked `GET /auth/me`: **401** | Refresh row `revokedAt` populated; access JWT refers to revoked session, so fails on next request |
| Logout all | After a fresh successful login, `POST /auth/logout-all`: 200; old bearer: 401; separate user's bearer: 200 | Both owner's refresh rows revoked, `sessionsRevokedAt` recorded, other user's access unaffected |

**Important:** the actual logout behavior is **not** “logout only revokes the refresh token while access JWT continues working.” The access JWT contains a session ID; the real `sessionIsCurrent` SQL check rejects revoked sessions. The immediate revoked refresh replay is returned as **409** for a recent conflict, not 401. These statuses were measured and asserted instead of assumed. This is a check of the signed bearer flow; browser cookie/CSRF flows are **not** included.

## Isolation and cleanup

The wrapper requires a new report destination under `.qa/testing/qa-.../tasks/.../tests.json` *before any startup*. It unsets inherited DB, Redis, JWT and provider credentials. The disposable PostgreSQL 18 cluster uses an owned `/tmp/gafus-qa-api-http.*` directory, fresh `archqa_http_<12hex>` database, and a random `127.0.0.1` port. Redis runs on another random loopback port with no persistent shared data. JWT access/refresh signing secrets are randomly generated for this run. All four accounts, the private course/day/step, the access grant and the real progress row exist **only** in this disposable database.

The original `apps/api/src/app.ts` Hono app is imported and served over a **real HTTP TCP socket** by `@hono/node-server`, bound to `127.0.0.1` with an ephemeral port. No production API entrypoint or process manager is started, no environment-specific fixed port is reused. All requests use Node's HTTP `fetch`, not `app.request` and not mocked route handlers. Middleware, original JWT verification, rate limiting and DB lookups are live. The child exits after closing its own listener and Prisma/Redis handles. The shell trap stops only the Redis PID it launched and PostgreSQL via its **own** `pg_ctl -D` directory, then deletes its private temporary directory. `resources.json` is written **only after** successful service teardown; the final check found zero remaining `/tmp/gafus-qa-api-http.*` directories. Invalid report destination is refused with exit 2 without starting services.

`report` verifies the exact full set of named cases, 33 ordered HTTP path/method/status values, every expected SQL count/status, identical database names across HTTP and cleanup receipts, active source SHA-256 hashes for the test, Hono app and shell runner, plus confirmed successful resource cleanup. On a **real completed run**, manually altered `sqlForeignProgress`, fake Redis cleanup, or forged Hono app source digest each produced `REPORT 2`; original receipts were restored and `REPORT 0` returned. The runner remains **informational** and cannot pass a failed or missing task as success.

## Evidence boundaries / blockers

- The test does **not** access production or reused local databases, external identity providers, real customer accounts, Apple/YooKassa, browser cookies, real mobile devices, rate-limit saturation, multi-instance JWT sessions, API deployment ingress, or background jobs. It verifies explicitly enumerated HTTP paths and SQL state only.
- PostgreSQL is bootstrapped with **`prisma db push`**, not clean `prisma migrate deploy`. The existing fresh-migration blocker (`P3018/42P01`, `20241108120000_exam_result_trainer_review`, missing `ExamResult`) remains open and is **not** bypassed for release.
- No clean-checkout GitHub Actions evidence, release-gate promotion or production readiness is implied. Authenticated bearer and SQL protections in these nine scenarios passed locally; other routes, role combinations and concurrency remain unmeasured.

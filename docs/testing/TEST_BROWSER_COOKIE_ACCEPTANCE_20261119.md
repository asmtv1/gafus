# GAFUS — existing-Chrome browser cookie/refresh acceptance, 19 November 2026

**Result: PASS — informational and strictly local, not a release gate.** Original Hono routes, real browser HTTP and PostgreSQL refresh-session rows were exercised in the **already open personal Google Chrome**, attached through **McpGo Playwright Extension**. No separate Chromium/profile, no production credentials, no production process, no commit/push/deploy. Browser tabs present before this test (Wikipedia and GAFUS/Vite) were not closed or navigated.

## Reproducible artifacts / orchestration

- Test profile: `browser-cookie`, scenario `api.browser-cookie-session`, catalog check `api.browser-cookie.chrome-pg-redis` (`chrome-extension`, `kind=browser-cookie`). Only `browser-cookie` selects this check; `ci`, `full`, `integration`, `recovery`, `faults` and `api-acceptance` **exclude** it.
- Checked original report: `.qa/testing/qa-990305a1-5369-4211-b818-49dbed73c2c1/summary.md` and `summary.json`. Same run's task receipts: `tasks/d62121cd804c721e7cc9/{browser-cookie.json,tests.json,resources.json,browser-ready.json,browser-progress.json,receipt.json,output.log}`. **`REPORT 0`, 1/1 check, 13/13 named cases, 29 real Chrome HTTP calls, 13 PostgreSQL snapshots**.
- Code: `apps/api/src/test/qa-browser-cookie-server.mts` (actual Hono TCP), `qa-browser-cookie-driver.js` (executed in Chrome page), `scripts/qa/api-browser-cookie-isolated.sh` (owned PG/Redis), `tests/catalog/browser-cookie-cases.json` (expected ordered steps), `tests/support/browser-cookie-report.mjs` (strict verifier), and guard test `apps/api/src/middleware/qa-browser-cookie-origin.guard.test.ts`.
- To independently re-check existing evidence: `node scripts/qa/test-system.mjs report --run-id qa-990305a1-5369-4211-b818-49dbed73c2c1`. To create a new run, use `pnpm test:browser-cookie` **with an actively connected McpGo Playwright Extension coordinator**: the run provides three unique origins in its `browser-ready.json`, then awaits the 13 ordered Chrome actions. A bare unattended command does not run the browser itself; it times out incomplete rather than inventing browser passes.

## Actual topology and browser isolation

The wrapper creates a fresh PostgreSQL 18 cluster and database `archqa_cookie_<12 random hex>` with `prisma db push`, plus a child `redis-server`; both use random `127.0.0.1` ports. It scrubs inherited DB, Redis, JWT and external provider credentials, creates random synthetic JWT secrets and exactly two synthetic `USER` accounts. The **real** `apps/api/src/app.ts` is mounted on an ephemeral loopback TCP port. No normal API `index.ts` process, global queue worker, production user, Apple/YooKassa payment request or existing local service is touched.

Three **new ordinary tabs in the existing Chrome default context** were navigated to `qa-a-<run>.localhost`, `qa-b-<run>.localhost`, and `qa-c-<run>.localhost` on the private Hono port. Chrome A and C represent **two independent browser cookies for the same account**; B is a different account. Distinct host-only cookie jars avoid touching the existing GAFUS tab's `127.0.0.1` cookies. All browser actions executed via `McpGo-Playwright.browser_evaluate`, not a new Chromium session. At the end, browser-cookie-probe values were false on all three hosts, the three newly created tabs were closed, and the original two Chrome tabs were still available.

A narrowly scoped `NODE_ENV=test` branch in `apps/api/src/middleware/cors.ts` and `apps/api/src/lib/browser-auth.ts` permits exactly these three non-production `qa-[abc]-<random>.localhost:<ephemeral>` origins, **only** with `GAFUS_QA_COOKIE_BROWSER_ACCEPTANCE=1`, `GAFUS_LOCAL_ISOLATED_API=1`, private-loopback PostgreSQL/Redis URLs and disabled Feed/Gallery. This does not change ordinary `development` or `production` origin allowlists. The original cookie attributes are retained: **HttpOnly**, **SameSite=Lax**, **Path=/api/v1**; test-only same-origin HTTP loopback sets `Secure=false`. Normal production/development retains the previous Secure policy. Three targeted middleware tests verify strict denial outside the QA preflight and unchanged production `Secure` behavior.

## Measured browser/HTTP/SQL transitions

| Step | What Chrome observed | What the disposable PostgreSQL recorded |
| --- | --- | --- |
| A sign-in | `GET /auth/me` 401 → cookie `POST /auth/login` 200 → `GET /auth/me` 200; both HttpOnly cookies appeared on the wire | A: 1 active, B: 0 |
| B sign-in | Independent cookie jar, initially empty; login 200, identity 200 | A: 1 active, B: 1 active |
| C sign-in as A | Independent same-user browser session; login 200, identity 200 | A: 2 active, B: 1 active |
| A refresh | `POST /auth/refresh` 200, identity 200, refresh-cookie fingerprint **changed** | A: 3 total / 2 active; previous refresh row revoked |
| A ordinary logout | `POST /auth/logout` 200, both cookies cleared, next `/auth/me` **401** | A: 3 total / 1 active; C's session still active |
| C after A logout | C cookie still present; `/auth/me` **200** | A still has 1 active |
| B after A logout | B cookie still present; `/auth/me` **200** | B still has 1 active |
| A login again | New browser cookies, identity 200 | A: 4 total / 2 active |
| A logout-all | `POST /auth/logout-all` **200**, A's cookies cleared, `/auth/me` **401** | **All 4 A sessions revoked**, `sessionsRevokedAt` recorded; B still 1 active |
| C after A logout-all | **Both cookies physically still present**, but `/auth/me` **401**, `/auth/refresh` **401** | C's cookie refresh hash resolves to **revoked A SQL row**; A active = 0 |
| B after A logout-all | B `/auth/me` **200**, `/auth/refresh` **200**, `/auth/me` **200**; cookie fingerprint rotates | B: 2 total / 1 active (old B token revoked), **not affected by A** |
| C cleanup | Cookie logout 200, subsequent identity 401, cookies cleared | A active = 0 |
| B cleanup | Cookie logout 200, subsequent identity 401, cookies cleared | B active = 0 |

**Proof is not based on cookie disappearance alone:** C remains cookie-bearing after A's logout-all, yet is rejected by real Hono JWT/session validation and SQL state. Another user's still-valid cookie both authorizes and successfully rotates afterward. Each step's HTTP method/path/status, browser origin and response identity, Chrome `Sec-Fetch-Site=same-origin`, cookie-presence fingerprints, HttpOnly script invisibility, actual `Set-Cookie` flags, and database refresh row ownership/revocation are recorded. Actual passwords, JWTs and HttpOnly cookie values are **not written to the evidence** (only short, synthetic-cookie fingerprints).

## Fail-closed verification and cleanup

The `report` implementation independently validates all 13 case names in order, all **29** HTTP request responses, every SQL snapshot, browser cookie fingerprint continuity and refresh rotations, B ownership vs A revocation, real `Set-Cookie: HttpOnly; SameSite=Lax; Path=/api/v1` attributes, three isolated browser origins, source SHA-256 digests and the owned PostgreSQL/Redis/Hono cleanup receipt. Seven deliberate **modifications of the actual completed QA artifacts**—forged logout-all SQL, forged other-user response, false HttpOnly, missing revoked-tab cookie, wrong source SHA, false Redis cleanup and missing named case—each returned **`REPORT 2`**. The original evidence was restored after every probe, and the final `report` returned **`REPORT 0`**.

The test runner's shell trap stops **only the processes it launched**, using its own child Redis PID and its own PostgreSQL data directory (`pg_ctl -D`), then removes `/tmp/gafus-qa-browser-cookie.*`. A success `resources.json` is generated only *after* teardown. Direct inspection found zero remaining matching temporary directories. Only the three newly opened QA tabs were closed; original Chrome tabs stayed in place. Git staged index stayed empty, HEAD unchanged; no commits, push, deploy, CI/release gate changes.

## Explicit exclusions / next coverage gaps

- No real user credentials, production session sharing, browser Vite proxy, actual Safari/Android/iOS webviews, third-party SameSite embeds, logout race between multiple API replicas, refresh-theft replay after the 10-second conflict window, or expired-session clock simulation.
- This is HTTP/SQL cookie acceptance for the **original Hono API** with two synthetic users and three unique same-profile Chrome cookie hosts. It is **not** a claim that the entire GAFUS web application or mobile login/logout user interface has been browser-tested.
- PostgreSQL was bootstrapped with `prisma db push`, **not** a complete clean `prisma migrate deploy` chain. The existing `P3018/42P01` `20241108120000_exam_result_trainer_review`/`ExamResult` migration blocker remains outstanding.
- Remains strictly **informational**. Do not turn this QA receipt into release readiness without separately validating all omitted production deployment and migration steps.

# INFRA032 / ROOT031 — separate local Hono + scratch PostgreSQL/Redis boot specification

2026-10-23 | **OFFLINE PREFLIGHT READY; REAL API BOOT BLOCKED.** This is a reviewed **future procedure**, not an executed container, database migration, dump restore, browser, Hono entrypoint, or SQL test. Production GAFUS Main/Next is out of scope and MUST NEVER be accessed from this project.

## 1. Exact current entrypoints and why the obvious boot is unsafe

- Source `apps/api/package.json`: `dev = tsx watch src/index.ts`; default `apps/api/src/index.ts` computes `API_PORT || 3001`, calls `serve({fetch:app.fetch,port:PORT})` **without a loopback host**, imports `@gafus/queues` (ioredis instantiated during import) and calls `startMediaCdnMonitor(redis)` after starting HTTP. The media monitor can schedule Redis lease writes and signed public CDN fetches if enabled. This entrypoint has **no verified local-only side-effect mode or bind guard**. **DO NOT RUN `pnpm --filter @gafus/api dev`** with any real data or unspecified env merely because `DATABASE_URL` is local.
- `packages/prisma/schema.prisma` datasource uses `env("DATABASE_URL")`; `packages/prisma/src/client.ts` constructs a PrismaClient from that variable, with no scratch-role/schema check. Existing `packages/prisma/package.json` exposes `db:migrate:deploy = prisma migrate deploy` and `db:generate`; the migrations include a Course.version trigger, but ONLY isolated prior scratch PG proof has been accepted. No migration/seed is authorized now.
- `packages/queues/src/redis.ts` uses `REDIS_URL` **or fallback `redis://127.0.0.1:6379`**, then initializes ioredis on import. Its barrel exports BullMQ queues for push, mails, media, cleanup, reminders, chats. An isolated Redis instance+logical DB prevents accidental shared queue names, but does **not** prove an API request cannot enqueue jobs; workers and external consumers must be separately disabled/isolated.
- `apps/api/src/app.ts` eagerly imports public/private routers incl payments/auth/chat/media/webhooks, Redis-backed rate limiter and real auth. The presence of these imports is not evidence of harmless import-time effects or of disabled outbound side effects. Existing auth middleware verifies JWT from configured `JWT_SECRET`/`JWT_REFRESH_SECRET`, registration completion via Core DB, and rejects cookie mutations from browser Origins not in `ALLOWED_BROWSER_ORIGINS` (HTTPS production-only). DO NOT bypass Origin/JWT/security gates or fabricate test identities.
- `apps/web-vite/vite.config.mjs` serves Web at `127.0.0.1:5173`, but `scripts/refactor/dev-api-config.mjs` only accepts mock `http://127.0.0.1:4174`, and proxies `/api/v1` to that target; trying a real Hono local API URL is currently deliberately rejected. Trainer and Admin Vite preparation configs set loopback ports **4178** and **4179**, respectively, but they are source-only opt-in interfaces and do not establish real auth/write. Existing development mock must remain unchanged; wiring interfaces to real API is a separately owned secure UI/auth decision.
- Existing Hono unauthenticated `GET /health` reports an API process, not DB/Redis readiness; `GET /ready` actually checks Core DB + Redis (would make DB calls). Both require a future authorized local service boot. Neither was called during this packet. A process `health=ok` must never be used to approve writes or production readiness.

## 2. Reproducible OFFLINE-only scratch-target validation (READY NOW)

Existing project root: `/Users/asmtv1/Desktop/gafus-refactor`; branch `vite`. No env files or dumped data are consumed. The proposed API, PostgreSQL, Redis TCP ports are deliberately **NOT assumed**. An operator chooses three currently free, distinct nondefault ports at actual provisioning time; source-defined reserved ports include API 3001, mock 4174, Web 5173, Trainer 4178, Admin 4179, preview 4175 and ordinary service defaults PG5432/Redis6379. The synthetic test's numbers are **fixtures, not deployed/listening services**.

The pure function `assertIsolatedLocalTargets(env)` in `scripts/refactor/local-development-preflight.mjs` requires:

- `NODE_ENV=development`, `API_HOST=127.0.0.1`, explicit nonreserved `API_PORT` — this checks the **configuration intention**, but current `apps/api/src/index.ts` DOES NOT USE `API_HOST` and cannot safely boot yet.
- Explicit `DATABASE_URL=postgresql://gafus_refactor_local_<role>:<scratch-password>@127.0.0.1:<PG_PORT>/gafus_refactor_local_<database>` with local scratch role+DB only, no URL query, fragment, nonloopback hostname or reused default port.
- Explicit `REDIS_URL=redis://127.0.0.1:<REDIS_PORT>/<db-index>` with index 1–15 and a nondefault, unique port; existing Redis fallback is not accepted. Redis must be a **separate local instance** and not merely shared Redis DB1 on somebody else's running instance.
- `CDN_HEALTH_MONITOR_ENABLED=false`, `GALLERY_ENABLED=false`, `FEED_ENABLED=false`, and NO populated known payment/mail/push/media/cloud-provider secret env keys. This deliberately rejects several supported integrations. **It is not a complete exhaustive guarantee** against other side effects of imported modules: no real startup allowed before the system gate.

Pure synthetic check (allowed and already tested):

```sh
cd /Users/asmtv1/Desktop/gafus-refactor
node --test scripts/refactor/local-development-preflight.test.mjs
```

Once a **fresh scratch-only shell** with fake credentials and explicitly selected local ports exists, invoke the CLI in a sanitized environment. Place all secret material in that isolated temporary _local_ environment, never in command history, docs, Git or stdout. The CLI accepts only `--dry-run`, never boots a service, never tests credentials or opens a port:

```sh
# Run ONLY with correctly provided scratch values from an isolated environment.
# Environment variables required: NODE_ENV API_HOST API_PORT DATABASE_URL REDIS_URL
# Optional explicit disabling flags: CDN_HEALTH_MONITOR_ENABLED GALLERY_ENABLED FEED_ENABLED
node scripts/refactor/local-development-preflight.mjs --dry-run
```

`LOCAL_RESOURCE_PREFLIGHT_PASS; API_BOOT_BLOCKED_PENDING_SYSTEM_GATES; NO_CONNECTION_ATTEMPTED` is only a static target check. The CLI **intentionally rejects** `--boot`. It prints no URLs, passwords or IDs. This source check cannot verify that localhost ports are free or that a process actually owns the database; these are separately required future system/runtime checks.

## 3. Next-stage scratch PostgreSQL provisioning specification — NOT EXECUTED

Prerequisites: explicit approval for a separate local PostgreSQL service/instance, chosen free loopback `PG_PORT`, independent scratch role and databases (example reserved prefixes, not existing names), installed local `psql`, `createdb`, `pnpm` and Prisma, no symlinks outside project or external DB connections. Do not launch containers/services from this proposal alone.

1. In an **approved, isolated local PostgreSQL instance bound to 127.0.0.1** create an independent least-privilege role named with prefix `gafus_refactor_local_` and a unique password, plus two _distinct_ new databases: `gafus_refactor_local_dev` and `gafus_refactor_local_test`. The scratch test DB is intentionally separate because destructive test transactions/truncate/reset must NEVER run in the dev DB. No duplicate existing/shared/prod role, socket fallback or `DATABASE_URL` from legacy `.env` is permitted.
2. Before any migration, verify the database's actual server address/role/catalog name via an approved **read-only** local verification command (`SELECT current_database(),current_user,inet_server_addr(),inet_server_port()`), and validate its URL with the preflight. A PostgreSQL UNIX socket or nonloopback returned address does NOT automatically satisfy the guard. DO NOT issue a destructive migration before this positive verification and permission.
3. Only after separate migration/runtime approval and a newly created empty scratch database, source-backed executable root command: `pnpm --filter @gafus/prisma db:migrate:deploy` with **only the scratch** `DATABASE_URL` exported. Inspect pending migrations and effects first; do not use `prisma db push`, `migrate reset`, `migrate dev` or any `seed.ts` with imported data automatically.
4. Optional future imported dump MUST already be anonymized and encrypted or otherwise appropriately protected before being placed at `scripts/refactor/local-development-data-inbox/<approved-sanitized-dump>.dump` (inbox's `.gitignore` excludes contents). Verify it has **no** real account details, auth tokens, email/phone identifiers, private notes, media signed URLs, payment records, push subscriptions, webhook secrets or production service configuration; if anonymization is not independently verified, **STOP**. First restore to a newly created **scratch-only test** DB after explicit separate permission, NOT the dev DB; inspect `pg_restore --list` offline first. Never blindly replay extensions/roles/owners/triggers against an existing DB; never use `--clean` without independent review. No dump/path exists in this packet and none was read.

## 4. Next-stage local Redis / API / interface runbook — BLOCKED, NOT RUN

- New, dedicated local Redis process bound to loopback on a user-selected port not 6379, with no workers or external subscribers/consumers; choose its nonzero logical database explicitly. Validate via an approved local `redis-cli -h 127.0.0.1 -p "$REDIS_PORT" -n "$REDIS_DB" PING` ONLY after the service and runtime scope are approved. Do not assume this proves all push/mail/media side effects disabled.
- After an approved minimal **API entrypoint change** that uses `API_HOST=127.0.0.1` rather than unspecified bind address and **guarantees no media monitor/queue/worker/external side-effect activation**, repeat the preflight with strictly scratch Postgres/Redis, then the intended existing Hono development command is `pnpm --filter @gafus/api dev` with this approved environment. This command is **NOT SAFE TODAY**, must not be executed without fixing/reviewing the blockers below. No alternative app entrypoint or bypass is silently substituted.
- With a separately approved Vite/local authentication and Origin policy, Web's existing source-defined command is `pnpm --filter @gafus/web-vite dev` on `127.0.0.1:5173`; currently only the existing mock `127.0.0.1:4174` is allowed by `VITE_API_BASE_URL` guard. Trainer and Admin Vite configs are `apps/trainer-panel/src/vite-preparation/vite.config.ts` (127.0.0.1:4178) and `apps/admin-panel/src/vite-preparation/vite.config.ts` (127.0.0.1:4179); these are **not** activated or proven as authenticated real Hono consumers. Do not use the old Next dev commands for either production or as a substitute for new Hono.
- Future smoke checks after explicit runtime grants: from loopback verify `/health`, then `/ready` with scratch-only Postgres/Redis, login via the existing authorized/test-only auth flow (never bypass cookie Origin), and only then one read-only end-to-end Web/Trainer API query on synthetic records. Future real writes and CourseForm enablement remain separate grants. Running these requests here would be unauthorized and was NOT done.

## 5. Exact _future-only_ commands and placeholders (do not execute now)

The operator must first verify the running local instances are separately provisioned and all system gates below approved. None of these commands were executed here. Choose three separate unused local ports; no checked ports or user credentials have been guessed. The examples use only placeholders, not a production connection:

```sh
# Precondition: the local PostgreSQL administrator is authorized; role/database do not exist yet.
# Never run against an existing catalog or a production socket; PG_PORT and PG_ADMIN are explicit.
createuser -h 127.0.0.1 -p "$PG_PORT" -U "$PG_ADMIN" \
  --no-superuser --no-createdb --no-createrole --pwprompt gafus_refactor_local_dev
createdb -h 127.0.0.1 -p "$PG_PORT" -U "$PG_ADMIN" \
  --owner=gafus_refactor_local_dev gafus_refactor_local_dev
createdb -h 127.0.0.1 -p "$PG_PORT" -U "$PG_ADMIN" \
  --owner=gafus_refactor_local_dev gafus_refactor_local_test
# Verify target identity READ-ONLY, and refuse unexpected catalog/server/port:
psql -h 127.0.0.1 -p "$PG_PORT" -U gafus_refactor_local_dev \
  -d gafus_refactor_local_dev -v ON_ERROR_STOP=1 \
  -c 'SELECT current_database(), current_user, inet_server_addr(), inet_server_port()'
# Separate local Redis instance must already be bound to 127.0.0.1 on REDIS_PORT:
redis-cli -h 127.0.0.1 -p "$REDIS_PORT" -n "$REDIS_DB" PING
```

Even these **provisioning** commands are **not authorized by the current preparation scope**. Use an independent scratch role for destructive tests if test permissions need stronger isolation; never restore or run truncate tests in `gafus_refactor_local_dev`. Prisma command ONLY after authorized migrations, schema review and positively checked scratch credentials:

```sh
# BLOCKED until reviewed isolated DB + migration approval:
pnpm --filter @gafus/prisma db:migrate:deploy
# BLOCKED until API bootstrap, queue/media safety, cookie/Origin and local DB verification:
pnpm --filter @gafus/api dev
# Existing mock-only Web Vite, NOT a real local Hono integration:
VITE_API_BASE_URL=http://127.0.0.1:4174 pnpm --filter @gafus/web-vite dev
```

The exact Trainer/Admin Vite config paths are listed in section 4, but these packages **do not own a direct Vite package dependency**, so an executable trainer/admin Vite command cannot honestly be claimed installed or tested in this scope. Approve/check a supported package-scoped Vite runner before starting these clients; never fall back to their Next dev scripts. The live API browser path also requires a separate secured local-origin/auth/proxy design.

## 6. Concrete system blockers and minimal owner decisions

| Owner                                      | Source-based blocker                                                                                                                                          | Minimal separate requested gate                                                                                                                                                               | Status      |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| AG1 API entrypoint / security review       | `apps/api/src/index.ts` ignores `API_HOST` and binds without verified loopback host.                                                                          | Review one exact loopback-only listen parameter and fail-closed boot preflight integration **before imports/serve** (cannot apply existing guard after top-level queued imports).             | **BLOCKED** |
| AG1/infra + separate queue/media ownership | `@gafus/queues` instantiates Redis and BullMQ; CDN monitor can poll/fetch/Redis-write; app imports side-effectful routers.                                    | Prove/import-time isolation and disabled external sends/notifications/webhooks/media/queue workers **without altering denied modules**; approve bounded bootstrap design, or explicitly stop. | **BLOCKED** |
| Auth/security owner + frontend             | Browser credentials require trusted HTTPS Origins, while Vite Web proxy currently forces mock 4174. Trainer/Admin opt-in lack verified real Hono auth wiring. | Review isolated local auth/Origin/browser proxy design with explicit domain restrictions, using unchanged security guarantees; no cookie-auth bypass or production secrets.                   | **BLOCKED** |
| DB/infra owner                             | No inspected/approved scratch PostgreSQL+Redis actual service/role/database/ports; no dump; real migrated schema+trigger not verified.                        | Provision separate approved loopback services and verify identity; approve scratch-only migration and separate tests.                                                                         | **BLOCKED** |

**Current allowed result:** offline preflight+synthetic acceptance only. **No unconditional `API_BOOT_READY` claim.** Do not run `pnpm --filter @gafus/api dev` or source a project's `.env` to "try it". Production Next, production DB/S3/CDN/queue/payments and any real identities remain strictly off limits.

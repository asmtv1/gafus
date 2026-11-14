# GAFUS → Uptrace Cloud: verified Nonprod rollout gates

Checkpoint: 13 November 2026. GAFUS Production = 9378, GAFUS Nonprod = 9383.
The ingest credentials differ. Nonprod private DSN is stored only in
~/.config/gafus-observability/uptrace-nonprod-ingest.dsn (mode 0600).

## Cloud and local tests already passed

- node scripts/observability/uptrace-nonprod-acceptance.mjs:
  sends synthetic OTLP traces/logs/metrics and Prometheus Remote Write,
  then verifies readback of this run's synthetic trace/log ID and fresh
  metrics in Uptrace project 9383. Four signals PASS, exit 0.
- pnpm --filter @gafus/worker exec tsx ../../scripts/observability/gafus-nonprod-adapter-canary.ts:
  real Logger SDK spans, ordinary logger.error() via the new sanitized OTLP
  bridge, Worker synthetic Android fatal. Viewer found these events.
- GAFUS_NONPROD_E2E_ENABLED=true bash scripts/observability/run-isolated-telemetry-pg.sh:
  real Hono grant 201, durable Postgres ACK 200, replay dedup,
  Worker fenced lease, Uptrace OTLP log ACK, EXPORTED payload cleared.
  Disposable Postgres listens ONLY on 127.0.0.1:65493 and auto-stops.
  Five isolated PostgreSQL tests PASS.
- Bull Board: pnpm --filter @gafus/bull-board build and
  pnpm --filter @gafus/bull-board exec tsx --test src/telemetry-page.test.ts
  pass seven tests, including installed vendor EJS HTML compatibility.
- Scoped regression job 8fa6e794cce230f7f3460381d6dea11e567ac416ac4a486a
  exited 0: Logger, Mobile OTA server, Browser, Bull Board, API/Worker
  tests, API/Worker/Mobile/Bull typechecks and architecture boundaries.
- Alloy candidate parses with real Alloy v1.8.2. This is syntax-only,
  NOT graph validation or a deployed private durable collector.
- Production Alloy, Yandex, AppTracer, AppMetrica and OTA unchanged.

## Explicit hold points before any deployment

1. Nonprod must use separate PostgreSQL, Redis, network and env secrets.
   NEVER mount or query the production DB/Redis for a preview test.
2. Nonprod Alloy candidate currently carries the production Yandex
   remote_write path. Build a separate Nonprod-only graph WITHOUT Yandex
   credentials, validate its component graph, isolate ports, and persist
   exporter queues/WAL. Test 401, 403, 429, 503, restarts and disk limits.
3. API preview requires GAFUS_TELEMETRY_ENVIRONMENT=preview,
   GAFUS_TELEMETRY_WEB_INGEST_ENABLED=true and strict
   GAFUS_WEB_TELEMETRY_RELEASES service/version/build allowlist.
   Client bundles NEVER receive UPTRACE_DSN or Viewer token.
4. Worker preview requires GAFUS_TELEMETRY_EXPORT_ENABLED=true,
   GAFUS_UPTRACE_LOGS_ENABLED=true, approved Nonprod-only DSN
   (secret-manager injection), and OTLP logs/traces endpoints.
   Do NOT set GAFUS_TELEMETRY_PRODUCTION_APPROVED before cutover gates.
5. Web, admin and trainer preview builds require immutable
   VITE_GAFUS_BUILD_ID, matching backend release registry and
   VITE_GAFUS_TELEMETRY_ENABLED=true. Check old tabs, CORS, offline,
   retries and private source map sealing.
6. Bull Board preview additionally requires
   GAFUS_BULL_BOARD_TELEMETRY_ENABLED=true,
   GAFUS_BULL_BOARD_APP_VERSION and 40-hex GAFUS_RELEASE_SHA.
   Its EJS is unmodified; own JS bundle and HTML bootstrap are opt-in.
7. Expo Observe 57 native module is NOT installed in main Mobile.
   Its native release dispatch may default to Expo servers without
   an explicit GAFUS endpoint. Do not add to production manifest until
   isolated native preview builds, actual iOS/Android crashes, ANR/OOM,
   symbolication, dSYM/Hermes/R8/ELF and fallback behavior are proven.
8. Uptrace browser session currently appears as Guest.
   Two local YAML drafts are NOT cloud-imported:
   gafus-nonprod-telemetry.v2.yml (3 sections, 8 charts, 2 paused alerts)
   and gafus-production-operations.v2.yml (12 sections, 24 charts).
   Import, validate MQL, test routing and real on-call notifications
   only after a privileged authenticated session is restored.
9. Production cutover requires Nonprod acceptance, privacy/billing,
   load/rollback and native crash gates, then 14 full measured days
   of Yandex/Uptrace overlap and 7 full days of post-cutover monitoring.
   A single synthetic HTTP 200 or a working test cannot replace this.

## Rollback

Leave current production images, env, Alloy config and legacy sources
untouched. On Nonprod failure turn off the new ingest/export flags,
stop only the dedicated preview collector and preserve the durable
spool for replay. Never delete production DB, backups, OTA, analytics,
AppTracer or Yandex to clean up a test.

Status of full migration A–M: INCOMPLETE until every external gate passes.

## Auth-loss mitigation update — 13.11.2026 late session

The earlier note that Alloy has only syntax verification is superseded.
Grafana Alloy v1.22.0 graph validate, local runtime, Cloud Nonprod 9383
trace/log/metric readback and durable-restart tests have passed.
The standalone Alloy v1.22.0 collector permanently drops already
received events on Uptrace 401 and 403; this is now reproduced.

A separate loopback ACK gateway, with a private internal token distinct
from the Uptrace DSN, maps Uptrace 401/403 and partial/ambiguous ACKs
to retryable 503 so Alloy retains records in its file-backed queue.
Hermetic 401 and 403 forced-restart recovery both passed. A real
shielded exporter → GAFUS Nonprod Cloud readback also passed.
The gateway and shielded Alloy graph remain UNDEPLOYED. A sidecar
network namespace, independent credential outage alerting, hard disk
quota, restart policy, load/soak tests and production migration gates
must be completed before activation.

A real Nonprod cloud dashboard exists at:
https://app.uptrace.dev/metrics/9383/55170
Two ingestion charts were imported and verified. Other draft
dashboards/alerts remain unverified and inactive.

Native Expo Observe startup metrics were implemented as preview-only
strictly sanitized server ingress and verified through isolated real
PostgreSQL and real Uptrace Nonprod. The SDK-native crash pipeline itself
has NOT been activated or proved on actual signed devices.
No 14-day Yandex/Uptrace overlap nor 7-day post-cutover period exists.
Production migration stays INCOMPLETE; AppTracer, AppMetrica, Yandex
and all production services remain untouched.

Dashboard 55170 four-panel update: Uptrace UI accepted the exact
locally checked four-chart YAML model and displayed Alloy canary 1
and Expo startup 452ms. Save was invoked and Edit mode ended. The
Chrome relay disconnected during subsequent reload, so consider
the post-reload persistence check unverified. Alert delivery, quota,
real mobile errors and production dashboards are still pending.

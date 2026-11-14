# GAFUS → Uptrace Cloud: подготовленный canary

Файл ci-cd/docker/prometheus/config.uptrace-canary.alloy — отдельный
**неактивный** кандидат для Nonprod. Текущий config.alloy и Yandex Monitoring
не изменены. Серверные OTLP-записи должны быть очищены от PII до приёма.

Перед включением: отдельный проект Nonprod, отдельный ingest DSN, зафиксированный
digest Alloy и проверка совместимости; allowlist OTLP атрибутов,
только приватная Compose-сеть (без host ports), сохранение WAL/queue после recreate,
лимиты памяти/диска, отказные тесты и rollback. Это **не** production-конфигурация.

Read-only smoke, Viewer token хранить только в файле с правами 0600:

    UPTRACE_VIEWER_TOKEN_FILE="$HOME/.config/gafus-observability/uptrace-read.token" node scripts/observability/uptrace-read.mjs spans 10080
    UPTRACE_VIEWER_TOKEN_FILE="$HOME/.config/gafus-observability/uptrace-read.token" node scripts/observability/uptrace-read.mjs up
    node --test scripts/observability/uptrace-read.test.mjs

Exit codes: 0 — данные найдены; 2 — auth/scope; 3 — timeout/no-data;
4 — несовместимый контракт. Не выводятся raw body, headers, DSN или Viewer token.

## Nonprod smoke (2026-11-13)

Uptrace Cloud project **GAFUS Nonprod 9383** создан отдельно от Production 9378. Три OTLP HTTP сигнала, Logger API/Worker diagnostic log и полный локальный Hono → ephemeral PG → Worker → Nonprod cloud сценарий прошли с HTTP 200 и подтверждением readback. Секрет хранится только в `~/.config/gafus-observability/uptrace-nonprod-ingest.dsn` (0600). Команды: `node scripts/observability/uptrace-nonprod-canary.mjs`, `pnpm --filter @gafus/worker exec tsx ../../scripts/observability/gafus-nonprod-adapter-canary.ts`, `GAFUS_NONPROD_E2E_ENABLED=true bash scripts/observability/run-isolated-telemetry-pg.sh`. Нельзя запускать внешний E2E без приватного Nonprod DSN. Базовый источник истины — [implementation-progress-20261113.md](./implementation-progress-20261113.md). Production ingress не включён.

## Continuation: YAML and private preview-only logs

Prepared but not imported: gafus-nonprod-telemetry.v2.yml and
gafus-production-operations.v2.yml. Validate with
node --test scripts/observability/uptrace-yaml-templates.test.mjs.
Do not activate paused alarms or prod dashboard until live
MQL/series/notification checks pass.

Node-only server logs are off by default. Dedicated preview needs
GAFUS_UPTRACE_LOGS_ENABLED=true,
GAFUS_TELEMETRY_ENVIRONMENT=preview,
OTEL_EXPORTER_OTLP_LOGS_ENDPOINT=https://api.uptrace.dev/v1/logs,
and private UPTRACE_DSN. The credential is never bundled in browser
or source control.

Prometheus remote_write smoke is independent of a running Alloy:
node scripts/observability/uptrace-nonprod-remote-write.mjs.
Requires only the chmod-0600 Nonprod credential and must be verified
by Viewer read-back, not HTTP status alone.

External watchdog missing-ingest paging stays disarmed until
GAFUS_WATCHDOG_INGEST_EXPECTED=true after schedule/cutover approval.

## Verified Nonprod fresh readback (13.11.2026)

Run node scripts/observability/uptrace-nonprod-acceptance.mjs to
send 4 harmless synthetic signals to project 9383 and independently
read them back. Requires 0600 private Viewer and Nonprod credentials.
Fresh trace+log must share a synthetic run trace ID; both metric
samples must be recent. Production is never an acceptable target.

Bull Board's browser diagnostic bundle is off by default and requires
a matching immutable release allowlist. Ordinary API/Worker
logger.error/fatal now reports bounded error classifications over
server-only OTLP in preview mode. No arbitrary stack/message/raw URL.

Complete deployment hold points are in:
NONPROD-ROLLOUT-GATES-20261113.md

## ACK gateway (Nonprod-only, not deployed)

An isolated ACK gateway protects telemetry sent by Grafana Alloy
from silent permanent loss on upstream authentication failures.
A directly connected Alloy exporter dropped accepted trace/log
events on both 401 and 403; this was reproduced in a local mock.
The new gateway maps every upstream non-2xx or incomplete/ambiguous
ACK to 503 and reports local health failure, so Alloy retries from
its private durable queue/WAL. The gateway does not store telemetry.

Files:
- scripts/observability/uptrace-ack-gateway.mjs
- ci-cd/observability/uptrace/alloy.nonprod-ack-gateway.alloy
- scripts/observability/uptrace-ack-gateway.test.mjs

Verification:
- node --test scripts/observability/uptrace-ack-gateway.test.mjs
- node scripts/observability/uptrace-alloy-queue-restart.mjs 401 --shield
- node scripts/observability/uptrace-alloy-queue-restart.mjs 403 --shield
- node scripts/observability/uptrace-alloy-local-e2e.mjs --shield

Preview secrets are owner-only 0600 files under
~/.config/gafus-observability. The gateway listens only at
127.0.0.1:54319 and runtime startup is restricted to Preview.
The standalone candidate requires a dedicated deployment topology,
external auth watchdog, persistent limited disk volume, proper
restart handling and credentials rotation testing before a rollout.
There is NO production deployment and old monitoring stays enabled.

## Isolated ACK sidecar candidate — 14.11.2026 local QA

The preview-only Compose topology is now in
`docker-compose.nonprod-ack.yml` with `alloy.nonprod-sidecar.alloy`.
The gateway and Alloy share one private network namespace without host ports,
production DB/Redis, Yandex exporters or any production credentials. The
shared ACK token is sourced from two owner-only 0600 bind-mounted files,
never an environment variable. The private Alloy token file is marked secret;
Alloy 1.22 requires explicit `convert.nonsensitive` to trim its final newline
for the local loopback HTTP header. Do not expose Alloy's debug endpoint.

The gateway now has distinct `/livez` (process liveness) and `/healthz`
(upstream acknowledgement readiness): do not restart the gateway simply
because upstream 401/403 temporarily blocked delivery. Upstream ACK responses
are streamed with a hard 8 KiB cap and unexpected partial results never ACK.

Read-only preflight:

```bash
node scripts/observability/uptrace-nonprod-sidecar-preflight.mjs
node --test scripts/observability/uptrace-ack-gateway.test.mjs \
  scripts/observability/uptrace-nonprod-sidecar-preflight.test.mjs
```

Local Docker QA: exact two 0600 Nonprod files accepted; gateway and Alloy
started on Docker Desktop with zero restarts, internal `/livez` and Alloy
`/-/ready` both HTTP 200, network has no published ports. The containers
were stopped after smoke; production was not touched. This confirms the
preview runtime topology only, NOT a permanent reliable Nonprod deployment.

**HOLD:** Docker named volumes do not enforce a strict hard disk quota.
Before unattended deployment, provision and prove a platform-enforced
persistent WAL cap, an off-host independent watchdog and real 401/403/429/503
soak under resource and restart constraints. Verify pinned image digests,
rotation, signed device crashes, cost/alerts and 14+7 day parity gates.
Never use `up -d` as a way around these blockers.

## GitHub Actions integration (source complete, production disabled)

All release entry points are now covered: automatic CI/CD, GHCR images,
reusable production deployment, manual single-container release, Deploy Only,
SDK57 QA, verified signed preview OTA, manual secret-bearing Nonprod Cloud
acceptance, and manual zero-secret Alloy 401/403/429/503 injection.

The precise GitHub Environment, variable/secret names and approval gates are
documented in WORKFLOWS-AND-SECRETS.md. No GitHub Actions credential has been
configured, and no release has been started from this code-only task.

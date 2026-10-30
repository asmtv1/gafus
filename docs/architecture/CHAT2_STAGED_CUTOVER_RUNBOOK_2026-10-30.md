# Chat2 first-install staged acceptance (Refactor only)

**Scope:** `/Users/asmtv1/Desktop/gafus-refactor`. This runbook is for a local isolated first-install acceptance. It **does not authorize** production deployment, editing production `.env`, use of GAFUS Main, or database/S3 migrations. Do not use production credentials for these checks.

## Why two phases are necessary

`CHAT2_API_ENABLED=enabled` and a running generic Worker `/health` are not evidence that messages deliver. Legacy Chat `410` is permanent; a first install cannot meet an already-running **new** worker/API release-gate if the new containers have not been installed yet. We now separate **staged** intent from **cutover**:

- **Staged:** `CHAT2_API_ENABLED=enabled`, `CHAT2_WORKER_ENABLED=enabled`, `CHAT2_PRIVATE_MEDIA_ENABLED=enabled`, `COMPOSE_PROFILES=chat2`, `CHAT2_LEGACY_RETIRE_ENABLED=disabled`. The Chat2 API can be started and validated, but legacy routes MUST keep returning retryable `503`, never `410`. `--staged` checks only the intended configuration; it prints `runtime NOT VERIFIED` and does not pretend that an unavailable worker is ready.
- **Cutover:** only a separate release, after new components are running and independent QA sign-off, may use `CHAT2_LEGACY_RETIRE_ENABLED=enabled`. `--release` never accepts the staging flag and never treats old `READY=YES` lines as an approval. It inspects the **actual destination** Compose `.env` and running API/worker/broker containers, checks API `/ready`, worker's authenticated `/internal/chat2/ready`, broker's authenticated `/api/info` and public WSS HTTP `101` + correct `Sec-WebSocket-Accept`. Missing or stale worker polls, failed broker auth, bad credentials or timeouts block.

## Reproducible local first-install acceptance

Run from the Refactor root only. The following script creates uniquely named, ephemeral Docker containers for Redis, Centrifugo and an HTTP/WebSocket client in an **internal-only** Docker network. It uses locally present images (no pull), randomly generated **synthetic** keys, and no host port exposure. It validates the actual Centrifugo v6 configuration, HTTP `200`/`{}` health, authenticated `POST /api/info`, refusal of an invalid API key and WebSocket `101` handshake. Its trap destroys **only its own** containers and network.

```bash
cd /Users/asmtv1/Desktop/gafus-refactor
bash scripts/qa/chat2-staged-broker-isolated.sh
```

The following CLI validates **staged configuration only**, using new ephemeral QA-only keys. It never accesses or changes production and does not issue a readiness claim:

```bash
CHAT2_CENTRIFUGO_TOKEN_SECRET="$(openssl rand -hex 32)" \
CHAT2_CENTRIFUGO_API_KEY="$(openssl rand -hex 24)" \
COMPOSE_PROFILES=chat2 CHAT2_LEGACY_RETIRE_ENABLED=disabled \
CHAT2_API_ENABLED=enabled CHAT2_WORKER_ENABLED=enabled \
CHAT2_PRIVATE_MEDIA_ENABLED=enabled \
CHAT2_PUBLIC_WS_URL=wss://gafus.ru/connection/websocket \
CHAT2_CENTRIFUGO_HTTP_API=http://chat2-centrifugo:8000/api/publish \
node scripts/refactor/check-chat2-prod-boundary.mjs --staged
```

The WSS URL in this specific command is a **validated literal only**; `--staged` does not connect to it. The broker-only smoke by itself is not a full API/worker integration. A subsequent **full local real integration** is documented below; that evidence does not establish independently booted production images or external TLS/WSS. Do not connect existing production or shared development data just to make the gate green.

Targeted local tests (no production):

```bash
pnpm --filter @gafus/api exec vitest run src/lib/chat2-cutover.real-http.test.ts src/lib/chat2-legacy-retirement.test.ts
pnpm --filter @gafus/worker exec vitest run --config vitest.config.ts src/chat2-readiness.test.ts src/chat2-readiness.http.test.ts
node --test scripts/refactor/chat2-release-readiness.test.mjs ci-cd/scripts/refactor-vite-release.test.mjs
pnpm --filter @gafus/api typecheck
pnpm --filter @gafus/worker typecheck
```

The first command exercises the **actual registered Hono legacy routes via real TCP localhost** for staged/disabled, unavailable API, dead worker, denied broker auth and simulated-ready dependency responses. Only replacement probes are faked; this is not a successful live broker+worker integration. The second command tests an actual worker HTTP server and expiration of its in-process outbox heartbeat; test-driven artificial heartbeat is **not a real PostgreSQL outbox poll**.

## Source-only staged preflight — first-install wiring, no deployment

The **active** HTTPS entrypoint is the `nginx` service in `ci-cd/docker/docker-compose.prod.yml`, which mounts `../nginx/conf.d` into `/etc/nginx/conf.d:ro`. The earlier check inspected only `ci-cd/docker/nginx-vite-refactor.conf`, an **inner Web container config**; this was not sufficient to prove routing from `wss://gafus.ru/connection/websocket`. The actual edge file `ci-cd/nginx/conf.d/gafus.ru.conf` now has an exact `location = /connection/websocket` with `Upgrade`, `Connection: upgrade`, Origin forwarding, cache disabled and **variable-based DNS** (`resolver 127.0.0.11`, `chat2-centrifugo:8000`). With the optional Chat2 profile OFF, Nginx can still parse/start: it does not resolve the absent broker at startup. A WSS request without a running broker may return `502`; this is **not** readiness or a reason to return legacy `410`. This source change is not deployed until a separately approved release.

A new **blocking source-only stage check in the existing `ci-cd.yml` security job** uses fresh synthetic non-production signing strings, explicitly sets `COMPOSE_PROFILES=chat2`, all three replacement flags to `enabled` and `CHAT2_LEGACY_RETIRE_ENABLED=disabled`, then calls the existing static/staged boundary:

```bash
cd /Users/asmtv1/Desktop/gafus-refactor
CHAT2_CENTRIFUGO_TOKEN_SECRET="$(openssl rand -hex 32)" \
CHAT2_CENTRIFUGO_API_KEY="$(openssl rand -hex 24)" \
COMPOSE_PROFILES=chat2 CHAT2_LEGACY_RETIRE_ENABLED=disabled \
CHAT2_API_ENABLED=enabled CHAT2_WORKER_ENABLED=enabled \
CHAT2_PRIVATE_MEDIA_ENABLED=enabled \
CHAT2_PUBLIC_WS_URL=wss://gafus.ru/connection/websocket \
CHAT2_CENTRIFUGO_HTTP_API=http://chat2-centrifugo:8000/api/publish \
node scripts/refactor/check-chat2-prod-boundary.mjs --staged
```

This check reads only tracked source/config. It does **not** inspect/write production `.env`, connect to public WSS, run Docker, SSH, pull images, create/change databases or contact providers. `--staged` says `runtime NOT VERIFIED`, does not use historical QA approval and is **not an alternative `--release`**. The static checker now verifies *both* inner and actual edge Nginx, the Compose-mounted edge file, docker DNS service names, worker `WORKER_HEALTH_PORT=3003`, API `API_PORT=3001`, disabled default for legacy retirement, and broker API-key wiring. Malformed active edge route/service/port fails the source gate even if inner Web proxy still looks correct.

**Exact source/port compatibility checklist:** the API container listens at `127.0.0.1:3001` internally and `GET /ready` must report `{status:"ready"}`; its cutover check accesses `http://worker:3003/internal/chat2/ready` (Docker **service** alias `worker`, despite container_name `gafus-worker`) with `X-Chat2-Readiness-Key`; generic `/health` is not sufficient. Worker binds health port 3003 and requires a fresh outbox poll, enabled `CHAT2_WORKER_ENABLED` and an authenticated `POST http://chat2-centrifugo:8000/api/info` using the shared private key. Worker publish URL stays `http://chat2-centrifugo:8000/api/publish`. The broker is the Compose service `chat2-centrifugo` under profile `chat2`, uses the same token/API secrets and Redis service `redis:6379`. Public WSS must negotiate **real HTTP 101 with correct Sec-WebSocket-Accept** through `gafus.ru` edge. These are source contracts; the local 4/4 real integration below is a separate environment, not proof of a real destination HTTPS or image startup.

**Unimplemented operational first-install stage (coordinator-owned blocker):** production reusable workflow still runs `--release --destination-env ci-cd/docker/.env` **before** pulling images and before starting `chat2-centrifugo`. Its later Compose `up` commands do **not** explicitly start the optional `chat2-centrifugo` profile service; simply setting `COMPOSE_PROFILES=chat2` does not cause `docker-compose up -d postgres redis` or `up -d --no-deps ... nginx` to start the broker. It would therefore be incorrect to point the currently deployed WSS location at a nonexistent broker and declare Chat2 ready. A future **separately approved** two-phase deployment design must (1) preserve previous image/config for rollback, (2) stage API/worker/broker with `CHAT2_LEGACY_RETIRE_ENABLED=disabled`, intentionally create the broker service, (3) verify isolated new runtime/PG/Redis permissions and live broker/WSS/actor delivery without mutating production data through QA, (4) obtain independent `READY=YES`, and only then (5) execute an independently approved cutover with the full existing live `--release` gate. No production workflow bypass, image deployment, provider operation, seed, migration, or first-stage attempt has been implemented in this package.

Local **source-only** check evidence (2026-10-30): `--staged` exit **0**, `--release` with no destination exit **1** (expected fail-closed), locally extracted edge location `nginx -t` exit **0**, negative mutation and CI workflow integration tests **PASS**. None of this constitutes a live production WSS or production Compose rollout.

## Production blockers and proof levels

The existing `production-deploy-reusable.yml` intentionally invokes `--release` **before any image pull or mutation**. It remains **blocked on a first installation** because actual new containers do not yet exist. Do **not** bypass this gate or change production scripts to turn the switch on prematurely. Before an independently authorized real cutover, the coordinator must design/review a separate staged rollout deployment that installs the new containers **with retirement disabled**, verifies real private PostgreSQL/Redis/worker + Centrifugo, public WSS and clients, then obtains QA approval and performs a separately authorized activation. No such production stage was executed or approved by this local runbook.

Local real API+PostgreSQL+outbox+broker+signed WebSocket/ACL delivery is verified below; **separate immutable production images and end-to-end deployed routing remain unverified**. Also unverified: externally served WSS, native clients/devices, production CDN/S3 and an approved first-install deployment. `READY=NO` remains a hard release veto.

## Full real isolated Chat2 cutover acceptance — 2026-10-30 (Agent 2)

The previous **broker-only** limitation is now closed **for local acceptance**, independently of any existing `.local-pg-scratch/chat2-db`, Refactor WORK snapshot or manually running Chat2 worker. Use the new locally reproducible runner:

```bash
cd /Users/asmtv1/Desktop/gafus-refactor
zsh scripts/qa/chat2-full-isolated-acceptance.sh
```

This runs without production credentials, production traffic, external providers or mocks of authentication/authorization. It requires preinstalled native `initdb`, `pg_ctl`, `createdb`, `psql`, `redis-server`, `curl`, `python3`, local Centrifugo v6 at `.local-pg-scratch/chat2-bin/centrifugo`, installed workspace dependencies and PostgreSQL Prisma client. It **never installs, pulls or modifies global tooling**, changes common manifests, or restarts existing services. If an expected local tool is missing or one of the reserved ports is busy, it refuses to run. Ports, all loopback-only: PostgreSQL `55445`, Redis `56339`, Centrifugo `58339`, Hono `58341`, Chat2 worker private health `58342`.

The script creates a **unique private** `.local-pg-scratch/agent2-chat2-full-XXXXXX/` directory, calls `initdb` for its own fresh PostgreSQL data directory, creates only the disposable `chat2_agent2_qa` database and executes Prisma `db push --skip-generate` **only against that database**. It runs a new disposable Redis, a new Centrifugo configured from the existing `infra/chat2/centrifugo.json` with an isolated Redis address and health endpoint, and generates unique synthetic JWT/Redis/Centrifugo signing credentials without writing them to logs, code or Git. It runs `apps/api/vitest.chat2-full-isolated.config.ts` with `setupFiles: []`, rather than the default mocked queues/ioredis setup.

The test `apps/api/src/modules/chat2/chat2.full-isolated.http.test.ts` imports the real Hono app and binds a real local TCP HTTP listener, starts the actual Chat2 outbox worker loop and actual worker HTTP readiness. It uses the project's **real JWT signer and verifier**, `authMiddleware`, `sessionIsCurrent`, `registrationPending` checks, room ACL, Prisma transactions/outbox, real Redis queues, signed broker connection/subscription JWTs and a real Centrifugo WebSocket client.

The acceptance checks: anonymous `401`, creator creates a private group, nonmember `404` for messages/subscription/post, a separately authenticated invited participant can read; legacy `503` before readiness and even after retirement opt-in until a live worker poll succeeds; then `410` when API `/ready`, worker authenticated `/internal/chat2/ready`, and broker `/api/info` all report real readiness. A sender's **registered HTTP message route** creates one PostgreSQL message/outbox event, the running worker publishes and marks the event delivered, another participant's signed WebSocket receives the message ID, and authenticated GET history reads it back. A duplicate `clientMessageId` yields the **same** message without another outbox row. Finally, stopping the worker loop immediately returns legacy `503` and remains `503` beyond 10 seconds while generic worker `/health` stays `200`. A UTF-8 multibyte malformed worker readiness header receives `404`, with the worker HTTP server still alive.

For this explicit local proof alone, `apps/api/src/lib/chat2-legacy-retirement.ts` has a **literal, non-configurable** allowlist for the 5 reserved test ports and exact disposable DB/Redis URLs. This branch additionally requires **both** `NODE_ENV=test` and `GAFUS_CHAT2_FULL_ISOLATED_ACCEPTANCE=1`; changing any expected address disables this exception. Production URLs, required secrets, worker freshness and broker authentication checks remain unchanged. This exception is **not** a way to connect a different development or production service to the retirement gate.

**Recorded acceptance:** durable OneShot job `477c1d91de81f993cf420e53957307d9fc859d8b55a60ea2` **exit 0**, Vitest **4/4 PASS** with `CHAT2_FULL_REAL_ISOLATED_PASS`. The first attempts failed and stopped safely: Prisma missing explicit local username (P1010), wrong local broker CLI port switch, and omitted `CHAT2_LOCAL_WORKER_PORT` variable preventing healthy `410`. Each was corrected and the final full run passed. `trap` verified cleanup of all five reserved ports and of its unique temporary directory; unrelated Chat2 development processes remained running.

**Evidence boundaries:** real **local** API+PG+worker+broker+WebSocket integration is accepted. It does not approve first installation in production, external DNS/TLS/WSS, native signed Mobile, app-store delivery, Cloud.ru/Beget CDN or actor-scoped real S3 permissions. The production `--release` stage remains fail-closed; `READY=NO` is not changed. No production staged rollout was executed.

### Qualification and latest regression evidence

The real API TCP server and actual outbox timer run in the **same dedicated isolated Vitest Node process**; PostgreSQL, Redis and Centrifugo are separately launched disposable services. This is deliberately not a Docker release-image boot test; production worker/image and Docker service discovery are still unverified. The test **does not replace** JWT, ACL, DB, Redis, broker or WebSocket calls with mocks.

After the final real acceptance, targeted `@gafus/api` and `@gafus/worker` TypeScript typechecks both returned **exit 0**; prior runtime-cutover unit tests **9/9 PASS**, worker readiness and malformed-header unit/HTTP tests **12/12 PASS** (durable job `97a4c5bf4abaf727f0d4988d054d91d201da3eaf41ff6d2d`, exit 0). These tests do not authorize production.

## Real external-edge local WSS acceptance — dedicated disposable Docker (2026-10-30)

The prior staged source check did not establish that the **real outer Nginx** could start before `chat2-centrifugo` or dynamically resolve the broker after it came online. That gap is now covered by a **separate repeatable local** full edge runtime harness, not a production cutover:

```bash
cd /Users/asmtv1/Desktop/gafus-refactor
bash scripts/qa/chat2-edge-nginx-wss-isolated.sh
```

The script requires four **already cached** small images (`nginx:1.27-alpine`, `mirror.gcr.io/library/node:20-alpine`, `redis:7.4-alpine`, `centrifugo/centrifugo:v6.9.7`) and Docker Desktop. It refuses uncached images (`--pull=never`); no build or shared prune. It mounts **unchanged** `ci-cd/nginx/nginx.conf` plus the **entire actual** `ci-cd/nginx/conf.d/` configuration read-only, uses a synthetic **self-signed** local cert (never production certs), a unique disposable Docker network, synthetic upstream names and one host-loopback-only port `127.0.0.1:58355`. A default-deny `--internal` Docker network cannot publish a host-loopback service under the local Docker Desktop version, so the harness uses a **distinct normal Docker bridge**, but makes **no external network requests**. If the port is already used, if required images are absent or if the disk is critically full, it refuses startup. `trap` cleans only its own temporary network/containers/fixtures.

The checks run against `https://127.0.0.1:58355/` (`Host: gafus.ru`) and its `wss://127.0.0.1:58355/connection/websocket` route. A broker-free startup yields main-site `200` and WebSocket `502` (never a fake SPA `200` or `101`). The same Nginx **without reload** then serves real `101` upgrades when a synthetically configured Centrifugo starts; wrong Origin gets `403` and a signed `chat2:<room>` subscription receives a unique event actually published through broker's authenticated private API. After broker removal, WebSocket reverts to `502` while the main site stays `200`; recreating broker on the same alias after DNS cache expiration succeeds again with `101` and a second event. The harness verifies the active Nginx `-T` exact `location` block against repository source, `Host`/`Origin`/`Upgrade` forwarding, `proxy_read_timeout`/`proxy_send_timeout` and caching/buffering flags. It does **not** call any production endpoints.

**Receipt:** OneShot `1e02f2c89f9ae2feb41a0319f9373283b08ba1bf19409889` **exit 0**, `EDGE_FULL_REAL_EXTERNAL_NGINX_WSS_ACCEPTANCE_PASS`. Zero own containers, networks, temp folders or bound host ports remain afterwards. This confirms only local cached-container edge routing and DNS reconnect; **public production TLS/DNS/WSS, API/Worker immutable images, Hono actor/room ACL, outbox/PG integration and mobile clients are not established by this particular harness**. No `READY=NO` override, staged production deployment or cutover has occurred.

## Final optimized API/Worker OCI first-boot acceptance — separate real containers, local only (2026-10-30)

After **both** images have been built, locally loaded and their actual on-image exports checked, perform independent real-entrypoint first boots (all scratch PG/Redis and Docker network are disposable):

```bash
cd /Users/asmtv1/Desktop/gafus-refactor
bash scripts/qa/agent2-oci-entrypoint-isolated.sh worker
bash scripts/qa/agent2-oci-entrypoint-isolated.sh api
bash scripts/qa/agent2-chat2-oci-replacement-isolated.sh
```

These scripts require existing images `gafus-refactor-agent2-{worker,api}-local:20261030` built for `linux/arm64`, installed local `initdb`, `pg_ctl`, `redis-server`, Prisma dependencies, and for the last command the existing native Centrifugo `.local-pg-scratch/chat2-bin/centrifugo`. They run no Docker build, image pull, migrations of a shared DB, production calls or releases. Each starts only its own temporary native PostgreSQL, Redis and uniquely named Docker containers; the last script also starts native Centrifugo and exercises separately running actual Worker and API runtime images. No container port is published on the host. Docker Desktop cannot reach native Mac localhost from an `--internal` network or `--network host`, so a disposable unique bridge plus explicit synthetic host aliases is used; external DNS is disabled (`--dns 127.0.0.1`) and no production credentials are passed. `trap` deletes only own scratch/containers/network and stops only its native child services.

**Recorded image digests and proof:** Worker `sha256:4983c109471f180a82000338f79f95522543e76de9ea39208e2f5dd9b9a482c3` build OneShot `04e91cf41f6ae590483d614daf7a7cae9a1bf352c9508e39` **exit 0**, separate CMD startup `5a96cc308539d568e6dd22077ad9c0e651bcd49670e1ac6e` **exit 0**. API `sha256:6b7bd4104f4e75d88d5548945148d9eba91af3a84585ba39e845d69d0336b94c` build OneShot `84a5153242f01d8c5e77233b9389c6a39521e327ab759101` **exit 0**, separate CMD startup `5b2ce72ddf85499b8dac27bdf266d750318a7ff0524b383a` **exit 0**. Both on-image checker calls individually **exit 0, 9/49 emitted JS+declaration targets**. Real combined image-based Chat2 test `4e1d8d506b13f245483b5fcfa27a7e989172b3f3a2452eee` **exit 0**: Worker authenticated fresh outbox readiness 200, API readiness 200, legacy retirement 410 **only inside this synthetic test**, anonymous Chat2 401. It does **not** send a user message through the two images or test production external WSS; earlier separate local Chat2 delivery acceptance and external-edge test cover distinct boundaries. These are **local `linux/arm64` images, not verified `linux/amd64` release images, and no image has been pushed or deployed**. `READY=NO` still blocks production.

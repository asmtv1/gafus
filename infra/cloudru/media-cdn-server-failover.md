# Media CDN server-side failover (GAFUS Main)

## Runtime

- `apps/api/src/lib/media-cdn-monitor.ts` is started by the API process when
  `CDN_HEALTH_MONITOR_ENABLED=true`, and the respective media fallback feature
  and Cloud.ru S3 endpoint are enabled.
- Every 15 seconds, an elected API process (14-second Redis leader lease) makes
  a *fresh, signed* HTTPS GET to Gallery and Feed CDN independently.
- The path is a unique syntactically valid but intentionally absent object key.
  HTTP 404 shows that a correctly signed CDN request reached the origin;
  HTTP 5xx, TLS/network error or timeout indicate an outage. HTTP 403, 200,
  redirects and other statuses are *unknown*, never positive evidence.
- Two consecutive failures set that resource to `cloudru`; two successful
  probes restore `cdn`. Only the public state and short counters are stored in
  Redis key `gafus:media-delivery:health:v1` (TTL 65 seconds). Clients treat
  records older than 55 seconds as unavailable, preferring normal CDN + local
  fallback. Redis failures never authorize direct access to private S3.
- Web and Mobile query non-sensitive `/api/v1/media-delivery/status` state
  (coalesced once per 15 seconds per process) *before* loading supported images
  and videos. On `cloudru`, each object requests a fresh signed S3 URL through
  the existing authenticated Gallery/Feed API which rechecks media ACLs. The
  client-side 504/5xx circuit breaker stays in place for regional edge failures.

## Production release controls

- Reusable production deploy currently writes `CDN_HEALTH_MONITOR_ENABLED=true`;
  `docker-compose.prod.yml` passes it to the API only, default `false`.
- If backend health has an issue, disable only `CDN_HEALTH_MONITOR_ENABLED` on
  the next deployment without removing client-side fallback.
- Checks are read-only: no Cloud.ru S3 objects are uploaded, modified or deleted.
- **Limit:** a signed 404 probe verifies CDN-to-origin reachability, not the
  correctness or bytes of an existing media object. Continue the release
  script's byte-exact signed Gallery + Feed media acceptance checks. Production
  end-to-end tests remain mandatory before claiming media is fully restored.
- Read-only diagnostics: GET API/Web `/api/v1/media-delivery/status` returns
  `{"success":true,"data":{"gallery":"cdn|cloudru","feed":"cdn|cloudru"}}`.
  It exposes no tokens, object keys or session information.

## CDN activation during 5xx outages

- The main push workflow still blocks BEFORE deploy on invalid CDN signing key,
  origin header/TLS/SNI, missing S3 permissions, invalid images or unhealthy
  protected Origins. Gallery and Feed are activated in separate steps.
- If and only if a CDN **edge returns HTTP 5xx**, the activation job can report
  `CLOUDRU_YANDEX_CDN_CUTOVER=DEGRADED_S3_FALLBACK` with a GitHub warning,
  after proving exact-byte reads from both protected Origin and a fresh,
  presigned Cloud.ru S3 URL (including actual FFmpeg MPEG-TS for Feed).
- The API and Web health checks remain mandatory even in degraded mode.
  When edge health is restored, the normal signed-GET/HEAD/Range and forged/
  expired-signature checks still run. Invalid signature acceptance, unexpected
  4xx, wrong bytes and any network/TLS/transport failure are NOT degradable.
- The feature is enabled only on the two `--activate` steps via
  `CDN_EDGE_DEGRADED_OK=true`; read-only preflight and Origin/S3 preparation
  never use a soft-success policy. CDN failure cannot be used to hide
  application or database deploy failures.

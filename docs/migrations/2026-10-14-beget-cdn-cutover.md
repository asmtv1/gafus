# GAFUS Main — Beget/CDNvideo cutover preparation (2026-10-14)

**State: NOT RELEASED.** This file is a release checklist, not permission to deploy. No DNS, Beget, Cloud.ru or Yandex resource was modified by this preparation. Only Gallery/Feed and existing consumers of their signing infrastructure are in scope.

## Approved destinations

| Scope | Beget CDN | Protected Cloud.ru Origin | Private bucket |
| --- | --- | --- | --- |
| Gallery | `https://mepsuduyokabib.begetcdn.cloud` (Gallery production v2) | `https://gafus-gallery-origin.containerapps.ru` | `gafus-gallery-private` |
| Feed | `https://garaquachegasourn.begetcdn.cloud` | `https://gafus-feed-origin.containerapps.ru` | `gafus-feed-private` |

The older `sretesneruminol.begetcdn.cloud` is broken, excluded. **Do not delete old resources or change production DNS as part of preparation.** These technical Beget hostnames need no new custom DNS.

## In-code release behavior

- Server-side URL: `https://HOST/md5(BASE64URL(MD5(secret + /final/key + expires)),expires)/final/key`. No query signature, no IP binding. Only trusted final object keys can be signed. Origins remain protected by CDN-provided `x-gallery-origin-secret` or `x-feed-origin-secret` headers; never send these to clients.
- Ordinary Gallery, Feed image and poll previews: 300-second maximum signed URLs; 30-second expiry slots yield >=270s remaining. Repeated authorized reads inside one slot reuse identical signatures and cache keys. HLS segment tickets remain authorized per playback session for <=120s and must be renewed.
- Gallery/Feed mobile `expo-image` now uses disk/memory caching for approved signed images with account+immutable object path+180-second slot keys. This bounds reuse but **does not guarantee the native SDK physically deletes disk bytes after 180s**. Gallery auth cleanup clears native memory **and disk** on logout; verify physical 180-second expiry and account-switch behaviour on actual devices.
- Browser policy must be verified at the **actual Beget edge**. Required `Cache-Control: private, max-age=180, must-revalidate` for successful media; 403/404/5xx, API authorization, lists and account data must not use this policy. The observed edge header previously contained only `max-age=180`. Edge HIT and private client policy are both required; do not set `private` on Origin if CDNvideo then stops caching.
- Existing media keys are immutable per Gallery photo ID and Feed media asset ID; confirm all replacement/revision paths and consumers against actual objects, including covers and video posters. Refresh Web/Mobile query data after replacement; already-open other users' feeds require their existing refetch/polling mechanics.
- Direct Cloud.ru fallback must be confirmed with genuinely owner-authorized Media API calls. Never use Yandex as fallback and never create public buckets or permanent links.

## Production release gate: Beget-only, no alternative CDN

**Gallery and Feed now support Beget/CDNvideo only.** `production-deploy-reusable.yml` requires explicit `GAFUS_MEDIA_CDN_TARGET=beget` and `BEGET_CDN_RELEASE_CONFIRM=reviewed-gallery-feed-beget-cutover`, plus validated purge and live smoke gates. If these conditions are missing, deployment fails closed **before writing a new runtime configuration or replacing running containers**. The deployment script may have already synchronized the repository and created a backup directory. Neither the deployment workflow nor Docker Compose has an automatic Yandex route, fallback, or rollback. After separate cutover approval, rollback can only use a verified private Cloud.ru signed-URL delivery path, not Yandex CDN. The existing production deployment is not modified by local source editing.

For an explicitly approved release, the workflow and environment for all affected runtime services are already prepared for an atomic Beget-only switch. Verify all containers use matching values:

- `GALLERY_CDN_BASE_URL=https://mepsuduyokabib.begetcdn.cloud`
- `FEED_CDN_BASE_URL=https://garaquachegasourn.begetcdn.cloud`
- `GALLERY_CDN_PROVIDER=beget` and `FEED_CDN_PROVIDER=beget` (both signer and cleanup worker)
- Reuse the same **existing production values** `GALLERY_CDN_SECRET` and `FEED_CDN_SECRET` for CDNvideo; only provider, host, signature algorithm and URL syntax change. The workflow already references these GitHub `production` environment Secrets. Compose uses **only** the canonical `GALLERY_CDN_SECRET` and contains no CDN-secret alias. Do not emit secret values in workflow logs or Git. `GALLERY_ORIGIN_SECRET` and `FEED_ORIGIN_SECRET` must continue matching the headers configured in Beget/Cloud.ru; they are distinct from CDN signing secrets and never reach clients.
- Cloud.ru private S3 endpoints and existing production Origin HTTP headers unchanged.
- `GALLERY_MEDIA_FALLBACK_ENABLED`, `FEED_MEDIA_FALLBACK_ENABLED`, `CDN_HEALTH_MONITOR_ENABLED` only after direct signed Cloud.ru fallback acceptance.
- For account purge through Beget, separately verify `BEGET_CDN_API_TOKEN` (Beget Cloud Bearer token), per-scope service IDs, and operational semantics **on disposable objects** before setting `BEGET_CDN_PURGE_API_VERIFIED=true`, `BEGET_CDN_CACHE_KEY_VERIFIED=true` and `BEGET_CDN_PURGE_PROPAGATION_VERIFIED=true`. Provider response `cdn` is an acknowledgement, not edge-purge proof. Completion additionally requires >=5 minutes and fresh signed HEAD **and** GET 404 for every deleted key; 200/403/410 never confirm deletion. Exact path cache-key semantics with `/md5(...)` prefix remain UNVERIFIED; do not enable cleanup flags on the strength of unit mocks.

The workflow and Compose now carry a **Beget-only** route, including the dedicated per-object CDN purge Worker. `GAFUS_MEDIA_CDN_TARGET` must be **explicitly** `beget`; there is no Yandex CDN default or runtime backup. For an approved Beget release the protected environment must also set `BEGET_CDN_RELEASE_CONFIRM=reviewed-gallery-feed-beget-cutover`, **existing** `GALLERY_CDN_SECRET` and `FEED_CDN_SECRET` production Secrets (no regeneration), and a **separate API credential** `BEGET_CDN_API_TOKEN` for purge operations, service IDs, all three Beget purge verification flags and `BEGET_CDN_LIVE_SMOKE_VERIFIED=true`. Any omitted prerequisite fails the deploy script rather than picking a different CDN. No Yandex CDN fallback exists. Deletion of old Yandex resources requires its own reviewed list and permission.

## Automatic deployment chain (Beget only)

As of this code preparation, `.github/workflows/ci-cd.yml` no longer calls `production-cdn-release.mjs --preflight`, `--prepare` or `--activate`. No Yandex CDN CLI is installed by the deployment jobs. `beget-readonly-preflight` checks protected GitHub environment variables and performs the **live read-only** Beget edge smoke **before** `cloudru-build-media-images` can publish any images. `cloudru-prepare-media` then verifies Cloud.ru private S3 and updates only the existing protected Origins/processor jobs. `deploy-production` reuses the same gate and runs Beget smoke **before SSH**, covering manual `Deploy Only`. Finally `beget-verify-after-deploy` repeats the read-only edge smoke. A failing gate blocks or fails the release; it never rewires CDN resources and never falls back to Yandex. No code push or deployment has happened as a result of local edits.

### Authenticated Beget API verification (2026-10-15, read-only)

The existing `BEGET_CDN_API_TOKEN` is present in the repository-root ignored `.env` and as a **GitHub repository-level Secret**. An Environment Secret of the same name is not required if there is no override; the production workflow's `secrets.BEGET_CDN_API_TOKEN` resolves repository-level secrets. No token value has been logged or copied.

- `GET https://api.beget.com/v1/cloud`: **200** (3 CDN services listed).
- `GET https://api.beget.com/v1/cloud/cdn/source-domains`: **200**.
- `GET /v1/cloud/0a8e97d5-3a65-4e90-99a6-c7f61131a461`: **200**, Gallery production v2 service type CDN.
- `GET /v1/cloud/becd9e5d-4fa8-47da-878c-9b80ded74e71`: **200**, Feed production service type CDN.
- The old Gallery production service is present but must not be used as a CDN fallback or deleted without separate review.
- **Important mismatch:** GitHub Environment Variables `GALLERY_BEGET_CDN_SERVICE_ID` and `FEED_BEGET_CDN_SERVICE_ID` still contain human-readable panel slugs, not UUIDs. The attempted change from this session was blocked by tooling; remote values were read back and **remain unchanged**. Update the GitHub variables to the UUIDs above **before release**. Local `packages/cdn-upload/src/begetCdnPurge.ts` and `infra/cloudru/beget-release-readiness.mjs` now require those real API UUIDs; unit tests and TypeScript typecheck pass.
- `GET 200` proves the token can read protected Beget resources; it does **not** prove that `POST /v1/cloud/cdn/{uuid}/purge-cache-by-paths` is authorized or invalidates a warmed CDN edge. This remains a separately gated destructive test on explicitly approved disposable final-object fixtures, not user content.

### GitHub `production` configuration (partial provisioning, 2026-10-15)

Configured and **confirmed via GitHub Environment variable read-back**:

- `GAFUS_MEDIA_CDN_TARGET=beget`.
- `GALLERY_BEGET_CDN_SERVICE_ID=gafus-gallery-production-v2` and `FEED_BEGET_CDN_SERVICE_ID=gafus-feed-production`, taken from the explicitly identified working production Beget service URLs. Note: a Beget Cloud API ID/permission check for the purge endpoint is still required; a service-panel slug alone does not prove purge API compatibility.
- `BEGET_CDN_RELEASE_CONFIRM=pending-explicit-production-approval` **not the approved cutover value**, so a push cannot authorize an unreviewed production switch.
- `BEGET_CDN_PURGE_API_VERIFIED=false`, `BEGET_CDN_CACHE_KEY_VERIFIED=false`, `BEGET_CDN_PURGE_PROPAGATION_VERIFIED=false`, `BEGET_CDN_LIVE_SMOKE_VERIFIED=false`. These flags must remain false until each real external test succeeds. Do not change flags based on offline unit mocks.

GitHub Secrets already available without rotation: `GALLERY_CDN_SECRET` and `FEED_CDN_SECRET` in the `production` environment, `GALLERY_ORIGIN_SECRET` and `FEED_ORIGIN_SECRET` at repository level. They must continue matching Beget and Cloud.ru. Existing Cloud.ru S3 and internal HMAC secrets are unchanged.

**Still missing; do not insert guessed credentials or misleading fake fixtures:**

- `BEGET_CDN_API_TOKEN`: a **genuine** Beget Cloud purge API token, stored as a GitHub **Production Environment Secret**. Its semantics and privileges require verification against the Beget provider before any `*_VERIFIED` flag is enabled. It cannot be recovered from other GitHub Secrets via API.
- `BEGET_GALLERY_SMOKE_FINAL_KEY`, `BEGET_GALLERY_SMOKE_SHA256`, `BEGET_FEED_SMOKE_FINAL_KEY`, `BEGET_FEED_SMOKE_SHA256`: real immutable synthetic WebP paths under the **normal final key namespaces** in the two private Cloud.ru buckets, and matching exact file SHA-256 digests. Existing `/staging/` diagnostic files are not valid; provisioning production synthetic objects needs separate authorization and controlled cleanup.
- Real signed Beget GET/HIT, security headers, cache policy, HEAD/Range and **per-key purge propagation** evidence. No such acceptance proof was fabricated.
- Explicit production release approval after these checks: only then change `BEGET_CDN_RELEASE_CONFIRM` to `reviewed-gallery-feed-beget-cutover` and set individual `*_VERIFIED=true` flags whose corresponding tests actually passed.

The `beget-readonly-preflight` job fails **before publishing Cloud.ru production images** if any gate or read-only smoke fails. The shared release fails before SSH, including manual `Deploy Only`. No Git push, DNS/Cloud.ru mutation or production deployment happened during GitHub variable provisioning.

## Preflight and acceptance

1. Read-only production inventory: distinguish Gallery and Feed DB object keys from known test fixtures; verify actual S3 object existence in Cloud.ru, byte counts and representative ETags/contents (especially video segments). The existing `infra/cloudru/production-media-mirror.mjs --verify` is CI-gated and requires separately scoped production credentials; a working Origin on a test key alone is not inventory proof.
2. Read-only Beget smoke: inject production secrets through a protected runner environment; run `node infra/cloudru/beget-production-smoke.mjs`. It reports only statuses and headers (never signed URLs). The two existing 62-byte diagnostic WebPs under `/staging/` are **not final objects and are not readable through the private Origins**; they remain untouched and cannot serve as this smoke's fixtures. For read-only smoke, provision two separately authorized synthetic final-key WebPs and SHA-256 expectations through `BEGET_GALLERY_SMOKE_FINAL_KEY` / `BEGET_GALLERY_SMOKE_SHA256` and `BEGET_FEED_SMOKE_FINAL_KEY` / `BEGET_FEED_SMOKE_SHA256`. This requires separate permission to create test objects in private production buckets. The script never uploads or deletes anything. If `*_CDN_SECRET_MISSING` or `*_SMOKE_FINAL_OBJECT_MISSING` appears, no live signature acceptance was performed.
3. Required edge evidence: unsigned direct CDN denied, expired/forged token denied after cache warm, valid GET 200, repeat HIT, HEAD 200, Range 206, byte identity and MIME, private 180s browser header, CORS and `nosniff`, different IP/proxy paths where available, stable repeated requests and practical latency.
4. Authenticated functional tests (not a substitute for unit tests): owner and unauthorized users; Gallery upload/process/list/change cover/delete/replace; Feed image/poll/video HLS/edit/replace/delete; Web and physical iOS/Android; logout/account switch; signed URL renewal; degraded CDN recovery; no Yandex CDN traffic; no access to unpublished originals.
5. Confirm precise Beget cache purge for a **disposable signed, warmed object**. No user object deletion for experiments. Current Beget adapter requires a real API acknowledgement, a 5-minute propagation guard and fresh signed edge HEAD/GET 404 for each exact key. Its real-world semantics and geographic propagation remain unverified. Per-item deletion/revocation and full account erasure remain separate **live** acceptance checks. For individual Gallery `delete` and Feed `delete_keys` callbacks, an independent durable `MediaCdnPurge` database outbox is now inserted transactionally after verified S3 deletion. A worker (flag `MEDIA_CDN_PURGE_WORKER_ENABLED`, default false, enabled atomically with a reviewed Beget cutover) submits exact eligible final keys, checkpoints Beget responses, waits at least 5 minutes, then proves fresh signed HEAD+GET 404. It retries without discarding operation receipts and never treats 200, 403, or 410 as proof. Feed S3 delete jobs now retry beyond the old five-attempt cap. New migration `20261014222000_beget_media_purge` must be applied before deploying code with `GAFUS_MEDIA_CDN_TARGET=beget`.
6. Actual production release requires a separate explicit approval naming code version, environment/secret changes, and the verified Cloud.ru signed-URL recovery path. On failure, recover through private Cloud.ru links, not Yandex CDN. After rollout confirm browser + Mobile + HLS production traffic and monitor all errors; only then schedule Yandex cleanup by independently confirmed dependent-resource inventory.

## 2026-10-15 — user-authorized disposable Beget test preparation

The user approved creating **two temporary synthetic WebPs** in the Gallery and Feed private Cloud.ru buckets and testing signed delivery and exact-key Beget purge. No changes to user content, DNS, old CDN resources, production deployment or GitHub approval/verification flags were authorized.

**Completed read-only production observations:**

- Existing `BEGET_CDN_API_TOKEN` works against the protected Beget Cloud API; resource listing and both CDN UUID resource GET requests returned HTTP 200. Gallery production v2: `0a8e97d5-3a65-4e90-99a6-c7f61131a461`; Feed production: `becd9e5d-4fa8-47da-878c-9b80ded74e71`.
- Beget API reports both technical hosts correct, both CDNvideo signature keys enabled (IP binding disabled), both source connections pointing to Cloud.ru Origin, and both browser cache durations set to 180 seconds. **This is configuration evidence, not proof of HTTP response cache headers.** Secrets and generated signed URLs were not logged.
- Real signed **read-only HEAD** requests on guaranteed-absent UUID final-style keys returned exactly as expected on both Gallery and Feed: unsigned `410`, correctly signed nonexistent object `404`, expired signature `410`, forged signature `403`. This proves CDNvideo signer and rejection paths, not successful delivery of an existing file.
- From the permitted local Mac host, HTTPS TLS establishment to `s3.cloud.ru` and both `*.containerapps.ru` origins timed out. S3 `HeadBucket` attempts to both private buckets also timed out. The correct Cloud.ru S3 production credentials are not configured in repository-root `.env` as `CLOUDRU_S3_ACCESS_KEY_ID` / `CLOUDRU_S3_SECRET_ACCESS_KEY`; existing unrelated `AWS_*` credentials are **not** assumed to work. This is local-access evidence, not evidence that production storage is offline.

Created `infra/cloudru/beget-synthetic-purge-acceptance.mjs` for the already authorized test using production-scoped credentials in a suitable protected runner. `--plan` is side-effect-free. `--run` requires `BEGET_SYNTHETIC_PURGE_CONFIRM=approved-two-disposable-production-webps`, `CLOUDRU_S3_ENDPOINT=https://s3.cloud.ru`, genuine Cloud.ru S3 credentials, existing Gallery/Feed signing secrets, Beget API token and the **real UUID** service IDs. It preflights both buckets before writing, creates exactly two unique synthetic WebP objects (`IfNoneMatch=*`), verifies GET/HEAD/Range/content hash/client HTTP cache headers and actual edge cache HIT, deletes those exact S3 objects, calls path-scoped purge and verifies fresh signed GET/HEAD `404` before considering a purge successful. Cleanup attempts only its own UUID paths even on intermediate failure. It never touches user objects or GitHub flags.

**Not performed:** the side-effecting `--run` was not launched, because the necessary local Cloud.ru connectivity and Cloud.ru production S3 credentials were unavailable. Consequently no test objects were created, deleted or purged. Cache HIT, real final-media GET and live purge authorization/propagation remain unverified; all `BEGET_CDN_*_VERIFIED` flags must remain `false`.

GitHub `production` variables for the two service IDs were separately confirmed to still contain panel slugs, not Beget API UUIDs. An attempted automatic update was blocked by the integration; **do not claim they were updated**. Fix both values before any production deployment or purge worker enablement.

## 2026-10-15 — GitHub isolated Beget/CDNvideo acceptance results

The manually dispatched, **non-deploying** GitHub workflow `.github/workflows/beget-synthetic-acceptance.yml` was selectively published to `main` using commits `41019c6e` and `d1988686`, each with GitHub's `[skip ci]` commit marker. No regular CI production deploy ran as a result. Both protected GitHub `production` service UUID variables were first updated and read back, matching the real Beget Cloud CDN UUIDs.

- Offline plan: [GitHub Actions 38639794514](https://github.com/asmtv1/gafus/actions/runs/38639794514), **success**.
- Initial write/purge probe: [38640046264](https://github.com/asmtv1/gafus/actions/runs/38640046264), overall **failure** due to exact `Cache-Control` mismatch. Before stopping, both new synthetic final-style WebPs were uploaded, obtained signed HTTP 200 with matching bytes, were deleted from Cloud.ru S3 and both exact-path Beget purge requests were accepted. No original user content was accessed or purged.
- Extended diagnostics: [38640565106](https://github.com/asmtv1/gafus/actions/runs/38640565106), overall **failure** because both CDN responses returned `Cache-Control: max-age=180` rather than the reviewed `private, max-age=180, must-revalidate`. **For both Gallery and Feed** a synthetic 58-byte WebP was uploaded under a unique final-style UUID key; correct signed GET yielded 200 with correct file digest and MIME; all 5 subsequent GETs returned `x-cdn-edge-cache: HIT`; signed HEAD returned 200 and range GET returned 206 with matching bytes; both exact S3 objects were deleted and verified absent; Beget API accepted each exact-path purge; newly signed edge HEAD **and** GET returned 404 for each removed fixture. No user object keys were touched. Script cleanup was performed on test-only paths.
- Provider configuration **read-only** still advertises `caching_time_browser.enable=true`, `time=180`, and an enabled static response header of `Cache-Control: private, max-age=180, must-revalidate`. Nevertheless live delivery strips the `private` and `must-revalidate` directives. Beget documentation states that the built-in Browser Cache option sets `Cache-Control`; this is a plausible precedence conflict with the static custom response header but is not yet confirmed by a safe A/B experiment. Altering production CDN settings is **not** part of this isolated test approval.
- **Safety:** overall acceptance intentionally remains failed, because 180 seconds without `private`/`must-revalidate` is not the agreed private-media browser caching policy. Do not set `BEGET_CDN_LIVE_SMOKE_VERIFIED=true` or release confirmation. API accepted purge and both edges returned 404 shortly after, but geographic propagation and the *at least 5-minute* guard have **not** been proven; `BEGET_CDN_PURGE_PROPAGATION_VERIFIED` and related flags must remain false. Before deployment, verify a supported provider configuration that yields the full required HTTP header *without disabling authenticated CDN edge HIT*, and separately test long-tail deletion propagation.

## 2026-10-15 — renewed Beget header acceptance after disabling built-in browser cache

After the user disabled Beget's built-in browser Cache-Control override and preserved a custom `private, max-age=180, must-revalidate` response header for BOTH production CDN resources, authenticated read-only Beget Cloud API verification found:

- Both `caching_time_browser.enable=false` (its old time value remains 180 but is disabled).
- Both `static_response_headers.enable=true` with a stored `Cache-Control: private, max-age=180, must-revalidate` entry.
- Both edge TTL `caching_time=86400` and stale/always-online disabled.

Ran the already published **isolated manual** GitHub test with two new synthetic production final-style WebPs, no regular push/deploy: [GitHub Actions 38643302525](https://github.com/asmtv1/gafus/actions/runs/38643302525), **failure** only on exact HTTP client cache policy in the exercised scenarios. In each Gallery/Feed scope a signed real-object GET returned 200 and identical WebP SHA bytes, five warmed requests reported CDN `HIT`, and HEAD/Range succeeded. Each synthetic test file was deleted from its Cloud.ru private S3 bucket and its path accepted by Beget API purge. Both newly signed GET/HEAD after purge returned 404. Previously retained support fixtures were not touched.

**Critical discrepancy persists even after the settings update:** live Gallery and Feed `Cache-Control` returned **only** `max-age=180` rather than `private, max-age=180, must-revalidate`. This is not a production-ready private browser caching policy. Provider documentation warns that `Cache-Control: private` read as origin cache-control can disable CDN edge caching, and advertises separate headers to client; before changing anything further, establish whether the custom response header works for final client responses separately from origin caching logic. The provider may need to confirm precedence between browser-cache controls and static client response headers. Do not bypass this failure by weakening assertions.

The existing deployed synthetic tester checks purge 404 promptly (within approximately one minute), NOT after 300 seconds. Local-only improvements (not pushed) to `beget-synthetic-purge-acceptance.mjs` now demand (1) verified CDN `HIT` **after** S3 removal but before purge and (2) newly signed edge HEAD/GET 404 at least 300 seconds after purge acknowledgement, plus cleanup attempts after a timed-out S3 upload. The updated offline unit guard tests pass (4/4), but this updated live workflow has NOT run and >=5-minute propagation evidence remains absent. Keep all `BEGET_CDN_*_VERIFIED` variables `false`; separate production release approval still pending. No production CDN settings were modified by these checks.

## 2026-10-15 — repeat live header test (Feed fixed, Gallery pending)

User requested a fresh Beget acceptance check. Authenticated Beget API reads showed **both** services correctly configured: built-in browser caching override off, custom response `Cache-Control: private, max-age=180, must-revalidate` on, edge caching 86400 seconds, stale/always-online disabled. No Beget settings were modified.

Manually ran previously deployed synthetic GitHub workflow: [run 38644252632](https://github.com/asmtv1/gafus/actions/runs/38644252632). Overall conclusion **failure** due to Gallery `Cache-Control` mismatch, not broken credentials, origin access or purge.

- Gallery production v2: signed real fixture GET 200 and SHA bytes, 5/5 `x-cdn-edge-cache: HIT`, HEAD 200, Range 206, exact synthetic S3 key deleted and verified missing, targeted Beget purge accepted, newly signed HEAD+GET 404 after purge. Actual `Cache-Control: max-age=180` is still **wrong** (missing `private, must-revalidate`).
- Feed production: identical successful signed GET / 5-of-5 cache HIT / HEAD / Range / synthetic S3 deletion / exact-key API purge / immediate edge 404. Actual `Cache-Control: private, max-age=180, must-revalidate` now **correct**. This is first verified live Feed header and edge-HIT combination.
- Test touched only freshly generated unique synthetic private-bucket keys; existing support fixtures were not touched. No DNS change, CDN settings change, Git push or production deploy. The locally improved five-minute script was **not** published to GitHub and the deployed workflow checked 404 promptly after purge; the >=300-second post-purge condition remains **unverified**.
- Retain all `BEGET_CDN_*_VERIFIED` flags as `false` and hold production release until Gallery matches required header and long-tail deletion is proven in the updated standalone test.

## Known limits

- GitHub already holds the production `GALLERY_CDN_SECRET` and `FEED_CDN_SECRET` secret names, but its API cannot return secret values; a local protected runtime JSON is outside the allowed project and was **not accessed**. Real Beget credentials, purge proofs, final synthetic fixtures and readiness flags still block automatic release.
- Beget edge `Cache-Control` policy (private + must-revalidate), video HLS and per-path purge remain unverified in live traffic.
- Physical 180-second native disk removal, cross-account iOS/Android behaviour and automatic updates of other users' already-open feeds have not been end-to-end demonstrated.
- Beget CDN resource API service ID and account permissions must be verified on the authenticated account; panel slug alone is not authoritative. The current Beget adapter deliberately requires exact service IDs matching the provisional panel resource slugs and fails closed otherwise; adjust these reviewed bindings before release if the provider returns different IDs.
- Per-item deletion now writes the durable Beget `MediaCdnPurge` outbox from Gallery/Feed delete-job completions (tested with local mocks), and the background purge worker retries failures. Its effectiveness has **not** been tested against a real warmed Beget edge, and manual physical purge from all geographic points is not guaranteed. Do not declare live erasure validated before a disposable-object purge acceptance test; deletion of vet originals is direct private S3 and they never enter the CDN.
- **Connection check on 2026-10-14:** unsigned Beget Gallery and Feed returned 410 with valid TLS; unauthenticated direct Origin HEAD timed out from the Mac's network (not proof of Origin failure). Signed CDN GET/HIT and Origin access were NOT reverified because production credentials were not present under the permitted repository.
- The old `production-cdn-release.mjs` and Yandex CLI offline tests remain only for separately audited historical resource cleanup/rollback documentation. **No automatic CI/CD production job runs these scripts or activates Yandex CDN**. Deletion of historic resources must be separately authorized after verifying no remaining users and private erasure obligations.

## Local PostgreSQL queue smoke (no production changes)

The real database migration and Gallery/Feed edge-purge outbox SQL have been tested against both local PostgreSQL databases (`dog_trainer` and `dog_trainer_design_20261012`) using:

```bash
node --env-file=.env infra/cloudru/local-beget-postgres-smoke.mjs
node --env-file=.env.local infra/cloudru/local-beget-postgres-smoke.mjs
```

The script refuses non-loopback PostgreSQL hosts, creates an isolated schema inside a transaction, applies `20261014222000_beget_media_purge/migration.sql`, verifies idempotent enqueue, exclusive lease acquisition, invalid-token fencing, durable provider-operation checkpoints, retry and final completion, then rolls back all data and asserts that the temporary schema no longer exists. **Neither production nor existing development DB records are changed.**

Important: a local DB does **not** hold the Beget CDN signing secrets or authenticate the Beget Cloud API. The local tests prove queue persistence only. Live signature acceptance, browser/edge HIT, exact-path purge, and propagation are blocked until the **existing production Gallery/Feed CDN secret values** can be passed into the read-only smoke through an approved protected runner and separately authorized disposable final-key fixture objects are supplied. The values must be confirmed to match the ones configured in Beget; renaming is not secret rotation. Never save these secrets to PostgreSQL; do not claim a real CDN purge passed on the basis of this database smoke. The unauthenticated Beget Gallery and Feed endpoints answered `410` with valid TLS on 2026-10-14; that is useful signature rejection evidence but not proof of signed GET/HIT or purge.

## Existing production secrets (no rotation)

The protected runtime manifest that the operator identified lives outside the permitted GAFUS Main project directory. **Do not access it from this project session.** Do not substitute `TF_VAR_cdn_secret` from `.env` without provenance and provider verification. The GitHub `production` environment already contains `GALLERY_CDN_SECRET` and `FEED_CDN_SECRET` and the Cloud.ru credentials, but GitHub Secrets do not reveal plaintext. The workflow/Compose reuse existing production signing values only for Beget, and `infra/cloudru/beget-production-smoke.mjs` expects those exact standard environment variable names.

The Beget **purge API** credential remains distinct from the CDN signing secret and must be configured and tested separately. Do not confuse `origin_secret`, `cdn_secret`, S3 credentials, and internal job HMAC values. Preserve `TF_VAR_*` until dependent Terraform resources and scripts have been individually audited; no `.env` or cloud resources were changed as part of this refactor.

## No Yandex CDN fallback (explicit user decision)

The active Gallery/Feed CDN allowlist is strictly the two Beget service hosts. Signers emit only CDNvideo `/md5(...)` URLs; CDN monitor, Web proxy, Mobile scoped cache, veterinary previews, and Docker Compose accept no Yandex CDN addresses. Cloud.ru S3 remains private storage and is the only separately authorized temporary delivery path on CDN outages. Old Yandex CDN cleanup in account deletion is **not** a delivery fallback: it may exist solely to satisfy explicitly verified historical erasure obligations while stale cached copies could remain. Do not purge or remove old production CDN resources without a separate inventory and permission. Other unrelated Yandex services remain outside this media cutover.

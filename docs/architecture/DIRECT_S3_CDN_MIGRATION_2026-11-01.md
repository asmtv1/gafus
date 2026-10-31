# Direct CDN → Cloud.ru S3: media-origin retirement (2026-11-01)

## Scope and safety

This is an audit and a scoped change in `/Users/asmtv1/Desktop/gafus-refactor`.
No production Cloud.ru Container App, bucket policy, Beget CDN resource, customer
object, or database record has been changed or deleted. `gafus1` is untouched.
Do **not** delete media-processing Cloud.ru Jobs: they transform originals into
publishable images/video and are not origin proxy services.

## Current delivery per product area

| Media | S3 final delivery | Beget CDN | Origin Container App required? |
| --- | --- | --- | --- |
| Gallery albums | `gafus-gallery-private`, **private** | `mepsuduyokabib.begetcdn.cloud` (edge signed) | **Yes in current deployed configuration**: `gafus-gallery-origin`; suspended |
| Questions V2 | `gafus-questions-public`, public processed prefix only; incoming private | `ebiteskukingusk.begetcdn.cloud`, S3 fallback | **No**. Public finals directly in S3 |
| Moments Feed Media V2 | `gafus-feed-private`, published `media/v2/...` variants publicly readable; incoming must remain restricted | `quepraquiecebquomiel.begetcdn.cloud` | **Not needed for verified V2 public image delivery**. Current Beget diagnostic did not find old origin hostname |
| Chat 2.0 | `gafus-chat2-media-2026`, public finished variants only | `gonomudedoje.begetcdn.cloud`, S3 fallback | **No**. Ingestion and jobs are separate from delivery |

Beget API diagnostic on GitHub Actions run `41250147487` returned HTTP 200 for
both CDN resources; `containsExpectedOrigin=true` for Gallery, **false** for
Feed. This excludes the **old** Feed origin hostname from the returned service
payload, but does not independently reveal/verify the exact new upstream domain.
Treat the Feed origin *retirement itself* as needing a separate exact-upstream
check before deleting its Cloud.ru resource.

Read-only HEAD from the development Mac against an immutable, non-user Feed
smoke key `media/v2/beget-smoke-92217a1c0fea4b089382f6832b988c81/v1/image/s.webp`:
- `https://gafus-feed-private.s3.cloud.ru/...` → 200.
- `https://quepraquiecebquomiel.begetcdn.cloud/...` → 200.
The production host repeated the check and returned HTTP 200 for both.
This confirms existing test object delivery but not all user/video paths.

## Changes prepared locally

- Removed `gafus-feed-origin` from desired Cloud.ru Container Apps manifests.
- Removed obsolete Feed origin image build/publication from media workflow and
  registry publisher allowlist.
- Updated the manual, guarded media release helper to inspect/provision only
  the private Gallery origin. This does not stop or delete the existing Feed app.
- Preserved all Cloud.ru Jobs for processing and their exact resource constraints.

## Blocking constraint: private Gallery

Album ownership/access is enforced by the API, Gallery emits short-lived
signed Beget links, and the S3 bucket must **remain private**. Pointing Beget
at a private S3 hostname without origin-side authentication returns 403/404.
Making `gafus-gallery-private` public would bypass authorization: possessing an
S3 object URL would permit access outside the user's signed CDN link. **Do not
make this bucket public, even for only finalized variants, without an explicit
product privacy decision and a proved alternative.**

**Correction after reviewing the actual technical documentation provided by
Beget support:** Beget's CDN is backed by CDNvideo, whose current HTTP-resource
documentation explicitly offers **AWS authorization for origin requests** with
Access Key and Secret Key, *separately* from **code-word signed viewer URLs**:
https://doc.cdnvideo.com/Services_setup/http/#aws-avtorizatsiia
https://doc.cdnvideo.com/Services_setup/http/#avtorizatsiia-po-kodovomu-slovu
Cloud.ru S3 explicitly supports SigV4 signed GET/HEAD:
https://cloud.ru/docs/s3e/ug/topics/api__aws-sig-v4

Thus **direct protected Beget/CDNvideo → Cloud.ru private S3 is a viable candidate
and the preferred first option; a different CDN is NOT required by present
documentation**. The generic Beget CDN manual is not authoritative evidence
against this feature. Verify that the feature is available on the user's Beget
CDN resource, can sign Cloud.ru S3 requests correctly (region `ru-central-1`,
credential `tenant_id:key_id`, Host/SNI and bucket path), and works with the
existing MD5 path-token validation and CDN cache. Do not enter broad S3 keys
into an unverified third-party configuration; use dedicated read-only
bucket/prefix-scoped credentials if the provider supports them.

Before retiring Gallery Origin, run authenticated GET/HEAD/Range, cold/hot
cache, expiry/forged/unsigned token and anonymous S3 denial tests on a
synthetic private object. Check both old and v2 object key layouts and no
incoming/original exposure. If the existing CDN resource cannot change its
source, stage a new CDNvideo resource with the same secure feature and switch
application signing only after acceptance. Provider compatibility with the
specific Cloud.ru setup remains **unproven**; no production cutover is
authorized by this file.

## Production retirement gate

1. Read-only provider API: record *exact upstream host/path* for every CDN
   and prove it is Cloud.ru S3, not an origin container or another proxy.
   Never emit API tokens or signed image URLs in logs.
2. Independent S3 and CDN GET/HEAD/Range on immutable synthetic assets;
   verify exact bytes, MIME, cache policy, and browser CORS on all media types.
3. Confirm outgoing URLs and permission policy for real app sections while
   keeping originals/incoming protected. Verify 403/404 do not trigger
   unauthorized fallback; 410/5xx recovery still works.
4. Update per-environment CDN config only after provider acceptance. Maintain
   old CDN and resource for rollback until traffic has drained.
5. Only then stop old origin Container Apps one by one; confirm no traffic,
   0 origin dependencies, app delivery working, and permitted billing change.
   Delete them separately after a retention window. **Never** delete Jobs,
   buckets, or customer media during this operation.

`gafus-gallery-origin` was observed `suspended` by a GitHub read-only Cloud.ru
API check (`41249662933`). A start request returned HTTP 403 (`41249704435`).
The app was not started, changed, or deleted during this audit.

## Restored Gallery API redirect (local source changes, 2026-11-01)

**Source staged, not deployed and not cut over.** Recovered from Git history at
`0fe276914` and `dbbcee643`, especially
`docs/migrations/2026-10-18-gallery-cdn-s3-redirect.md` (prior real
synthetic 307→S3/WebP 200/HIT/HEAD/Range, but no permanent Hono production
cutover). The isolated Beget CDN used previously was
`fupiquafifeswu.begetcdn.cloud`, service ID
`96cd124e-767e-4af1-a568-c4d1f9b4e73f`. **Its present live status has not
been reconfirmed.**

- `packages/gallery-server/src/cdnRedirect.ts`: Hono-friendly API CDN origin
  handler for `/albums/*`, `/gallery/*` (V2), `/users/*` vet thumbnails.
  Requires strong `x-gafus-gallery-origin-secret` (not viewer-supplied) and
  `GALLERY_CDN_ORIGIN_ROUTE_ENABLED=true`; only GET/HEAD, only allowlisted
  final WebP keys, no queries, no original documents/incoming or open redirect.
  Returns 307 to 60-second Cloud.ru S3 SigV4, **no bytes through API**.
- `packages/gallery-storage/src/fallback.ts`, `config.ts`, `cdn.ts`, `index.ts`:
  separate new edge signing secret and hard-pinned Beget hostname; old secret
  and CDN retained until cutover.
- `packages/cdn-upload/src/begetCdnPurge.ts`: exact-path **dual** CDN purge with
  independently durable receipts and GET+HEAD 404 proof for both hosts.
  **Do not turn off `GALLERY_CDN_PURGE_DUAL_ENABLED` during rollback while new
  CDN deletion receipts remain.**
- `packages/gallery-storage/src/objects.ts`: cache only final WebP variants
  with `public, max-age=180, s-maxage=600, must-revalidate` **as HTTP metadata
  on private objects** when explicitly enabled. Incoming and attempts remain
  `no-store`; Cloud.ru gallery processing Job also needs that explicit flag.
- `infra/cloudru/gallery-redirect-release-gate.mjs`: read-only CDN API
  verification of `api.gafus.ru` origin, HTTPS, Secure Token, follow-307,
  static origin header, active domain and cache. Requires private S3/end-user
  synthetic smoke, S3 metadata readiness, dual-purge and browser/mobile tests
  before release. This gate does NOT prove live delivery on its own.
- `.github/workflows/production-deploy-reusable.yml`: legacy GitHub production
  variables from October still contain `GALLERY_CDN_REDIRECT_ENABLED=true` etc.
  **A separate NEW `GALLERY_CDN_REDIRECT_RELEASE_APPROVED=true` flag is mandatory
  for honoring them. It defaults off.** This prevents ordinary pushes or
  app-only deploys from accidentally switching the CDN.

**Still required before actual activation:** verify new Beget service still
exists with expected settings; verify both separate CDN signing and origin
header secrets match Beget; run permanent Hono canary on synthetic final WebP,
confirm CDN HIT without returning presigned S3 URL to browser, verify expired
and forged Beget viewer signatures rejected on HIT, Range, byte digest, S3
anonymous denial, GET/HEAD deletion 404 on both CDN resources, browsers/mobile
and old/new WebP Cache-Control. Re-audit existing user object metadata in
read-only mode before authorized cache metadata updates. Production origin
container must remain available as rollback, until acceptance.

### Live rollout dependency, blocked until independently verified

The existing `infra/cloudru/beget-release-readiness.mjs` and
`infra/cloudru/beget-production-smoke.mjs` intentionally still pin the OLD
Gallery CDN / Container App. They cannot be claimed as acceptance for the new
CDN. Stage a **separate canary** on the new CDN with old viewer URLs still
active; keep existing `GALLERY_BEGET_CDN_SERVICE_ID` for old CDN and assign
`GALLERY_BEGET_CDN_REDIRECT_SERVICE_ID` to the known isolated new CDN ID.
Do not set `GALLERY_CDN_REDIRECT_RELEASE_APPROVED=true` until the new service
and edge signing settings are read back; do not enable viewer redirect until
real Hono canary and deletion tests pass. A future cutover must update the
legacy pre/post-deploy read-only smoke to verify the new edge without
silently skipping security checks. Existing origin is currently suspended and
cannot be assumed live for old CDN fallback; restore a functional rollback
path before changing viewer delivery. None of these production dependencies
are proven or modified by local unit tests.

### 2026-11-01 external DNS verification (new blocking finding)

Read-only DNS A lookup via both system resolver and Cloudflare `1.1.1.1`:
`fupiquafifeswu.begetcdn.cloud` returned **NXDOMAIN**. An independent HTTPS
HEAD could not resolve it. The old `mepsuduyokabib.begetcdn.cloud` resolved
normally and returned the expected unsigned 410 edge denial. Therefore the
historic new CDN hostname is **retired/unusable as of this check**. The
historic resource ID must NOT be treated as live just because the old report
claimed it passed on October 18. **PRODUCTION GALLERY REDIRECT READY=NO.**

Before activating any of the protected feature flags, provision or restore an
isolated Beget CDN resource with correct origin/token/header/redirect config,
confirm authoritative and public DNS and API readback, then update the
**strictly pinned** resource hostname, ID, and mobile client allowlists in a
separate reviewed code change. Preserving the current old CDN delivery and
its rollback path takes precedence over removing a Container App. This task
has intentionally not performed any provider mutations or production deploy.

# Chat 2.0 — production S3/CDN delivery acceptance before a single coordinated release

Date: 2026-10-31. Scope: **read-only production checks** + local source fixes in
`/Users/asmtv1/Desktop/gafus-refactor`. No production deploy, no changes to
Cloud.ru Jobs, Beget configuration, PostgreSQL, Redis, S3 objects or credentials.

## Read-only production provider proof

Only the existing private *local credentials file* was used to issue Cloud.ru
S3 `ListObjectsV2`. No object keys, user IDs, media bodies or credentials were
printed. S3 and CDN GETs used small 0–255 byte HTTP ranges against pre-existing
ready **final** variants (no uploads, creates, copies or deletes).

- Direct S3 host: `https://gafus-chat2-media-2026.s3.cloud.ru` — DNS and
  HTTPS certificate valid. CDN host:
  `https://gonomudedoje.begetcdn.cloud` — DNS and HTTPS valid.
- Sample inventory: 18 existing objects under `chat2/`: 13 WebP finals,
  3 MP4 finals and 2 original sources. This is **not** proof that any particular
  production user's queued task has reached READY; objects may be older.
- Existing `v1/image/s.webp`, `v1/image/m.webp`, `v1/poster.webp`,
  `v1/video/360.mp4`: **both providers returned 206**, correct image/webp or
  video/mp4 MIME and matching content-range, matching length and SHA-256 hash
  of the returned bytes. S3 Access-Control-Allow-Origin was `https://gafus.ru`,
  CDN was `*`. CDN returned `Cache-Control: public, max-age=180,
  must-revalidate`; direct S3 returned `public, max-age=86400, immutable`.
  Some existing videos have no 720p rendition; client must use only the
  encoder's actual manifest, not assume two MP4 variants.
- CDN replay of an existing full WebP range request: **HTTP 206 / HIT** on
  three successive requests. No forced purge or cache writes (beyond ordinary
  read-through caching) were performed.
- An existing `incoming` original: anonymous HEAD **403** on both S3 and
  CDN. This confirms the checked original is not publicly readable.
- A deliberately nonexistent key: both providers returned HTTP 404. It does
  not prove an authenticated message/attachment readback.

### Exhaustive read-only final-object and source-policy audit (2026-10-31)

An additional read-only, single-pass S3 inventory enumerated **all 16 existing final
objects** (10 image WebP, 3 poster WebP and 3 MP4) and the two originals in
`incoming/`. For **16/16 finals**, both the S3 and the current CDN origin
returned HTTP 200, matching MIME, exact `Content-Length` and `Accept-Ranges`.
The checked 0–99 byte ranges for photo/poster/video each returned HTTP 206,
matching `Content-Range` and identical SHA-256 between S3 and CDN. All
16 finals returned CDN `Cache-Control: public, max-age=180, must-revalidate`;
S3 returned `public, max-age=86400, immutable`. Both remaining originals
returned **403 from both public S3 and CDN**. No media files were altered.

**Next-deploy config fix staged locally:** the reusable production deploy now
sets `CHAT2_V2_CDN_BASE_URL=https://gonomudedoje.begetcdn.cloud`, and the
production Compose API service passes this variable into Hono. Previously
production Compose omitted it, so even an activated Beget CDN could remain
unused by the API. The endpoint still receives the exact public S3 fallback
for authorized *final* objects; incoming originals are protected. No live
production environment variable has been changed. Contract coverage is added
to `ci-cd/scripts/cloudru-first-main-cutover-contract.test.mjs`.

### Production configuration and regression receipt

- Staged the exact, verified Beget HTTPS origin in the **next** production
  `.env` generator, and passed it through **API** Docker Compose service.
  `node --test ci-cd/scripts/cloudru-first-main-cutover-contract.test.mjs`
  completed **8/8 PASS**, including the new CDN-first delivery contract.
- Read-only comprehensive CDN/S3 audit: **16/16 existing final objects**
  correct HTTP 200/MIME/length/byte-ranges, no mismatch; HTTP 206 and equal
  SHA-256 on 0–99 byte slices for image, poster and MP4. Both `incoming/`
  originals: anonymous HEAD 403 on both destinations. No production writes.
- Full-object decode check (existing objects, GET only, in-memory): selected
  photo WebP 720×450 and poster WebP 640×360 decoded successfully via
  Sharp; selected MP4 decoded by ffprobe as H.264 640×360, duration 1.5s.
  Complete-object SHA-256 hashes matched between S3 and CDN for each
  sample. No downloaded media persisted to disk.
- Extended app/API/Worker validation with durable OneShot
  `fdd2d46afb681671db6d3fcfc82b6e0bc68cae35a783c907`, exit **0**:
  targeted Chat2 API delivery/queue tests, Worker Chat2 dispatch/trigger/
  recovery tests, Web production build, and typechecks for Chat media
  quality, Web and Mobile. Only Vite large-chunk advisory was reported.
- Separately confirmed 15/15 shared rendition/failover tests, 25/25 Web
  mounted chat tests and 3/3 Mobile video-preview tests, exit 0.

## Client code gaps fixed (Refactor only)

1. Web and Mobile formerly switched to direct S3 on **every** media-element
   error, including CDN 403/404; an `<img>` / `<video>` onError callback cannot
   distinguish HTTP status. Shared `chat2CdnS3FailoverAllowed` now makes a
   CORS-enabled HEAD against the exact allowlisted HTTPS Beget key and accepts
   fallback only on 410, HTTP 5xx or an explicitly timed-out HEAD. 403/404,
   200, unexpected/network/CORS failures, changed key, another host, query or
   fragment fail closed. No arbitrary client-provided URLs are synthesized.
2. Fallback must use the *same* variant (360/720 video or small/full WebP),
   not the generic `fallbackUrl` always pointing at the primary rendition.
   `chat2MatchedS3Variant` matches exact authorized API response URL pairs.
3. Web video now preserves the selected playback quality and switches its
   poster to S3 after a validated video failure. It also checks a failed
   CDN poster independently and uses its exact S3 poster if eligible.
4. Mobile video/poster and image errors use the same policy. Native image
   taps still open the high-resolution authorized URL, not the smaller preview.
5. Existing legacy signed/private media is unaffected: if the API supplies
   no Beget/S3 final-media pair, the new fallback cannot activate.

## Build and test receipt

Durable OneShot `9c752a44b72bb4a1ab7ef1934e8a4286a6fc4c3f1788f9af`, exit **0**:
- `@gafus/chat-media-quality`: TypeScript PASS, 15 tests PASS.
- Web Vite: TypeScript PASS, 25 mounted Chat2 tests PASS including actual
  rendered image/video error events for CDN 503 and 404, production Web
  bundle build PASS.
- Mobile: TypeScript PASS, 3 video-preview tests PASS.
- API Chat2 media delivery/jobs: 12 tests PASS.
- **55/55** selected tests PASS. Browser-mount suites printed some pre-existing
  React `act` warnings; Vite printed a pre-existing large-chunk warning.
- Previous scoped Chat2 Job dispatcher IAM fix is documented separately in
  `docs/operations/INCIDENT_2026-10-31_CHAT2_MEDIA_STUCK_IAM.md`.

## Remaining release gates (do not claim production fixed)

- AI Commander confirmed V2 API/Worker runtime flags earlier and 2 queued
  production Chat2 tasks, but repeated remote commands to inspect whether
  `CHAT2_V2_CDN_BASE_URL` is actually set **timed out**. **CDN host working is
  not evidence that production API currently returns CDN URLs**. Verify the
  current environment **without displaying secrets** before the release.
- Confirm all four Chat2 Cloud.ru Jobs are enabled, correctly scoped and can
  claim/complete actual pending tasks after the separately prepared Worker
  IAM v2 fix; do not modify Chat Jobs under a Feed-only authorization.
- After an **explicitly approved, coordinated** Web/API/Worker release,
  re-read the two queued tasks: QUEUED → PROCESSING → READY; then verify
  authorized API `/attachments/:id`, actual Web image and video render,
  browser image `srcset`, poster, MP4 seeking/range 206, 360/720 quality,
  CDN HIT, and CDN 503/410 fallback to **exact-key S3**. CDN 403/404 must
  *not* use the S3 fallback. Mobile requires a separately distributed native
  build and real-device confirmation; TS/tests alone are not a device E2E.
- Do not delete or re-upload existing user media for smoke checks. Use an
  existing consensually uploaded item and read-only verification first.

**Verdict:** Existing finalized media transport S3 ↔ CDN is verified; local
client fallback and display fixes are tested and ready to integrate into one
release candidate. The full production upload → Cloud Job → READY → authorized
message/display lifecycle is **not yet proven**, so production incident remains
open until the coordinated deployment and live readback.

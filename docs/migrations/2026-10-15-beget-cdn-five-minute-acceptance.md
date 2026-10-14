# Beget Gallery + Feed: production CDN acceptance (2026-10-15)

**Acceptance of the isolated disposable-media CDN test: PASS. Production cutover approval: NOT GIVEN.**

- Audited run: [GitHub Actions 38646083078](https://github.com/asmtv1/gafus/actions/runs/38646083078), attempt 1, final `success`, source commit `4f6607adb7165a1c5a0013f0cb98d98bce106f23`.
- This is the independent `workflow_dispatch` test, not a deployment. The code was published with `[skip ci]`, and no ordinary CI production pipeline ran as a result of that push.
- Beget Gallery production v2 (`0a8e97d5-3a65-4e90-99a6-c7f61131a461`) and Feed production (`becd9e5d-4fa8-47da-878c-9b80ded74e71`) were tested separately, each using **one unique synthetic WebP** placed under a valid final-key namespace of its Cloud.ru private bucket.
- Both passed signed GET 200, matching synthetic SHA-256 and `image/webp`, unsigned/expired/forged signature refusal, HEAD 200, valid Range 206, five successive `x-cdn-edge-cache: HIT` responses, and exact HTTP `Cache-Control: private, max-age=180, must-revalidate`.
- In **both** scopes, the test deleted the exact synthetic object from private Cloud.ru S3 and verified `HeadObject` 404; **before invoking purge**, the very same warmed signed URL still returned the expected image with `x-cdn-edge-cache: HIT`. This demonstrates that S3 deletion alone did not account for subsequent CDN 404 responses.
- Beget Cloud API then accepted a **path-scoped purge for only the disposable object**. Freshly signed edge HEAD and GET returned 404 shortly after purge, and **again >300 seconds after purge acknowledgement**: Gallery acceptance at 2026-10-14 22:14:50 UTC -> five-minute check 22:19:51 UTC; Feed 22:20:04 UTC -> five-minute check 22:25:07 UTC. Workflow printed `SIGNED_EDGE_POSTPURGE_5MIN_HEAD_GET_404_PASS` for **both** and terminal `BEGET_TWO_DISPOSABLE_OBJECTS_FULL_ACCEPTANCE=PASS`.
- The operation touched no user media or retained support fixtures and did not modify provider CDN configuration, DNS, production traffic routing, or running workloads. These edge observations apply to the GitHub Runner's reached CDN nodes, not an exhaustive global PoP survey.

## GitHub production release state

Verified and set to `true` **after** the successful external test:

- `BEGET_CDN_PURGE_API_VERIFIED`
- `BEGET_CDN_CACHE_KEY_VERIFIED`
- `BEGET_CDN_PURGE_PROPAGATION_VERIFIED`

**Intentionally still closed:**

- `BEGET_CDN_LIVE_SMOKE_VERIFIED=false`; final read-only production smoke with stable approved final-key test images and their SHA-256 values has **not** been completed.
- The four required variables `BEGET_GALLERY_SMOKE_FINAL_KEY`, `BEGET_GALLERY_SMOKE_SHA256`, `BEGET_FEED_SMOKE_FINAL_KEY`, `BEGET_FEED_SMOKE_SHA256` were **absent** on the last GitHub `production` inspection. Disposable objects from this acceptance are deliberately deleted and cannot serve as permanent smoke fixtures.
- `BEGET_CDN_RELEASE_CONFIRM=pending-explicit-production-approval`. Do **not** set `reviewed-gallery-feed-beget-cutover` or start a production deploy without a separate user authorization.
- The fail-closed gate `infra/cloudru/beget-release-readiness.mjs --check` must still validate all variables, signing/origin secrets, final smoke fixtures and their SHA values before any deployment. The separate read-only `beget-production-smoke.mjs` is mandatory.

**Final decision:** disposable CDN/purge acceptance **PASS**; complete release readiness **NO-GO until final smoke fixtures and explicit production approval**. No Yandex CDN fallback is part of the migration.

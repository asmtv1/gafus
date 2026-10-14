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

## 2026-10-15 — permanent fixtures, independent final smoke, production release blocker

**User gave explicit permission to complete the Beget production cutover.** This allows release execution **once the committed code and complete build have been verified**; it does not justify deploying the old committed Yandex CDN workflow or including unrelated uncommitted features.

Two permanent, uniquely named synthetic final-key WebPs were created with `IfNoneMatch=*` in existing `gafus-gallery-private` and `gafus-feed-private` Cloud.ru S3 buckets. An approval-gated **manual-only** GitHub workflow (`beget-final-readonly-smoke.yml`) ran with repo/production secrets and produced the four final fixture GitHub `production` Environment Variables: `BEGET_GALLERY_SMOKE_FINAL_KEY`, `BEGET_GALLERY_SMOKE_SHA256`, `BEGET_FEED_SMOKE_FINAL_KEY`, and `BEGET_FEED_SMOKE_SHA256`. All four were read back and verified. The files are intentionally retained as immutable synthetic monitoring fixtures; neither contains user media.

- [Provision + signed Gallery/Feed smoke 38648461570](https://github.com/asmtv1/gafus/actions/runs/38648461570): **success**. Both scopes confirmed signed GET 200, edge HIT, correct `private, max-age=180, must-revalidate`, HEAD 200, range 206, direct Origin unauthorized 403 and unsigned CDN denied 410.
- [Independent read-only verification 38648806579](https://github.com/asmtv1/gafus/actions/runs/38648806579): **success** using **only** the persisted GitHub `production` fixture paths and hashes, with **zero new writes**; the same checks passed for Gallery and Feed.
- The evidence-backed flag `BEGET_CDN_LIVE_SMOKE_VERIFIED=true` was set and read back. All four `BEGET_CDN_{PURGE_API,CACHE_KEY,PURGE_PROPAGATION,LIVE_SMOKE}_VERIFIED` flags are now `true`. Service UUIDs are the validated Beget Cloud UUIDs.

**NO-GO for application production deploy, despite the user approval and successful CDN tests.** An explicit audit of remote `main` showed:

1. The **committed** `.github/workflows/ci-cd.yml` still installs Yandex Cloud CLI and runs `production-cdn-release.mjs --preflight`, `--prepare` and `--activate gallery/feed`.
2. The **committed** `.github/workflows/production-deploy-reusable.yml` still generates Yandex CDN Gallery/Feed runtime values. Local changes to both workflows implementing Beget-only are **uncommitted**.
3. Critical cutover code is not in committed `main`: `infra/cloudru/beget-release-readiness.mjs`, `packages/cdn-upload/src/begetCdnPurge.ts`, `packages/core/src/services/mediaDelivery/purgeQueue.ts`, and Beget purge Prisma migration. These live only in the local dirty worktree along with many unrelated application changes (mail, course cache, profile/mobile UI). They must be isolated and fully tested before selective inclusion in a production commit.
4. There is **no successful, fully built release for the current `main` SHA**. `Deploy Only` explicitly requires provenance from a successful main build matrix; starting it with the current SHA is not a safe shortcut.
5. Therefore `BEGET_CDN_RELEASE_CONFIRM=pending-explicit-production-approval` is intentionally **not changed yet**, even though the user's authorization has been received, because publishing the release flag before proper code/build isolation could let unrelated future pushes trigger a production release through the wrong legacy workflow.

**Release preparation required before activating:** isolate the Beget-only code and migrations from concurrent work, build/test that exact staged commit (no Yandex route or fallback), push the reviewed release, confirm its full build and read-only smoke, then set `BEGET_CDN_RELEASE_CONFIRM=reviewed-gallery-feed-beget-cutover` at the appropriate guarded stage and deploy that exact image SHA. Do not deploy or modify DNS until all those conditions are met. No production deploy or traffic switch occurred in this step.

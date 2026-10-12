> **Update 2026-10-12 15:33 +04:00 (AI Commander):** The historical IAM-denied tables below describe the *initial* state before the user granted new roles. The subsequent live final state is documented in the "After IAM grant" section.

# GAFUS Cloud.ru Stage 2 — IAM, CORS, direct S3 acceptance

Checked **2026-10-12**, exclusively through AI Commander on `aic-mac`.
**Stage 2 recheck: IAM FIXED, S3 VERIFIED; synthetic OPTIONS preflight and Registry REST listing remain unresolved.** No Yandex CDN or production application rollout changes were made.

## Verified live

| Scope | Cloud S3 LIST | GetBucketCors | GetBucketVersioning | Bucket ACL / PolicyStatus / PublicAccessBlock |
|---|---|---|---|---|
| gafus-gallery-private | allowed | 403 | 403 | all 403 |
| gafus-feed-private | allowed | 403 | 403 | all 403 |
| gafus-documents-private | allowed | 403 | 403 | all 403 |

Live browser preflight for `https://gafus.ru` and `https://www.gafus.ru`: **not allowed** (gallery/feed POST and documents GET). The guarded CORS `--apply` failed at `CLOUDRU_CORS_READ_REQUIRED_gafus-gallery-private` *before any PutBucketCors*. No settings were modified.

Signed S3 smoke for random disposable validation keys: gallery/form POST HTTP 200, feed/form POST HTTP 200, documents server PUT succeeded; HTTPS presigned GET content matched for all three. Unsigned GET HTTP 400 `AuthorizationQueryParametersError` and never returned object bytes. This is a request-level denial but **does not verify bucket ACL, policy or public-access-block**, which still require scoped read rights. All test keys were deleted and verified absent. Source objects, courses, CDN, DNS and production flags were not touched.

Cloud.ru IAM API authorization: 200. Container Services and Jobs list requests: 200, zero resources. Artifact Registry list endpoint: **403**, so registry existence and read/write access unknown. Container create/run roles not established by successful list.

## One required console action from administrator

Follow official [service-account role editing guide](https://cloud.ru/docs/console_api/ug/topics/guides__service_accounts_edit-access). In `console.cloud.ru` open **Пользователи → Сервисные аккаунты**, identify the service account that owns `CLOUDRU_S3_ACCESS_KEY_ID` / `CLOUDRU_S3_KEY_ID` (use the existing key identity without disclosing secrets), select **Изменить права** and grant **scoped to these three buckets only**:

- `s3e.viewer-acl` — read GetBucketCors, GetBucketVersioning, GetBucketAcl, GetPublicAccessBlock, GetBucketPolicyStatus;
- `s3e.editor-acl` — PutBucketCors and other control-plane bucket ACL edits. Temporary grant to a separate operations account is preferable; do not grant project-wide `s3e.admin` or make buckets public.

Do not change existing storage `s3e.viewer` / `s3e.editor` data-path roles.

Artifact Registry: current Cloud.ru IAM account from `CLOUDRU_KEY_ID` requires at least `ar.registry.viewer` for reads and `ar.registry.editor` to push into an existing private Docker registry. If no registry exists, an administrator with `ar.admin` must create one and grant scoped `ar.registry.editor`. Official [Artifact Registry access](https://cloud.ru/docs/artifact-registry-evolution/ug/topics/security). Container Services/Jobs list already works; deploying staged apps requires `serverless-containers.editor` (may already be assigned; creation was deliberately not attempted in this Stage 2). Official [Container Apps access](https://cloud.ru/docs/container-apps-evolution/ug/topics/security).

Official [Object Storage roles](https://cloud.ru/docs/s3e/ug/topics/security__role), [CORS management](https://cloud.ru/docs/s3e/ug/topics/guides__cors).

## After roles are granted

Using the same operator key, rerun `infra/cloudru/media-readiness.mjs`; require CORS/versioning/ACL reads on all buckets. Do **not** guess versioning state. Run `node infra/cloudru/s3-cors.mjs --plan`, then exact gated `CLOUDRU_CORS_CONFIRM=approved-managed-buckets node infra/cloudru/s3-cors.mjs --apply` with `CLOUDRU_S3_*` environment in process. The apply script reads **all** existing bucket CORS configs before first write, keeps unrelated rules, rejects >100 rules, writes a private `/tmp/gafus-cloudru-cors-*/before.json` backup and verifies GET after every PUT.

Managed rule `gafus-browser-v1`:
- gallery/feed: `GET`, `HEAD`, `POST` for `https://gafus.ru` and `https://www.gafus.ru`;
- documents: `GET`, `HEAD` only for those origins;
- allowed request headers: `content-type`, `x-amz-*`, `if-none-match`; exposed: `ETag`, `x-amz-request-id`; preflight TTL: 300s; no wildcard origin or browser DELETE.

Re-test browser OPTIONS for **both** allowed origins, disallowed third-party origin, real signed POST/GET and anonymous read. Audit ACL grants, public status, public access block and versioning. If an API or IAM action fails, leave the gate red and fix scope. Do not enable production S3 media, CDN or delete historical data in Stage 2.

## Reproducible validation

- `infra/cloudru/media-readiness.mjs`: read-only snapshot including bucket privacy fields.
- `infra/cloudru/s3-cors.mjs`: `--plan` dry run and guarded two-phase `--apply`.
- `infra/cloudru/signed-browser-smoke.mjs`: requires `CLOUDRU_BROWSER_SMOKE_CONFIRM=disposable-uuid-only` and proper Cloud.ru storage environment. Only synthetic UUID keys, signed POST/GET, unsigned GET, both origin preflights and DELETE cleanup.
- `pnpm test:cloudru-media` — local no-network regressions.

Repo contains other unrelated uncommitted tasks; do not stage or commit the entire working tree.

## After IAM grant — live verified final state (12 October 2026)

**Current Cloud.ru S3 IAM:** `GetBucketCors`, `GetBucketVersioning`, `GetBucketAcl`, `GetPublicAccessBlock` and `GetBucketPolicyStatus` now work for **all three** private buckets. Bucket versioning is unset/disabled. ACL public grants: **0**; Bucket Policy absent. `ListObjectsV2` inventory showed **0 live objects** in every target bucket before disposable smoke testing.

**Private access enforced:** An explicit **Public Access Block** was successfully applied and verified for all three buckets: `BlockPublicAcls=true`, `IgnorePublicAcls=true`, `BlockPublicPolicy=true`, `RestrictPublicBuckets=true`. `infra/cloudru/private-bucket-guard.mjs` is a three-bucket allowlisted and opt-in-only, read-all-before-write, idempotent safety operation. Readiness `bucketPrivacyReadiness.*.verifiedPrivate=true` for all three. Second idempotency pass: 3/3 `changed:false`.

**CORS:** each bucket already had one correct console-managed CORS rule for `https://gafus.ru` and `https://www.gafus.ru`. Gallery and Feed allowed GET/HEAD/POST/PUT; documents GET/HEAD. The actual guarded `infra/cloudru/s3-cors.mjs --apply` read all three policies, saved a local ephemeral snapshot and exited successfully reporting `existing CORS already covers both origins; no change`. It performs no duplicate or destructive rewrite, retains PUT compatibility with older clients. This is a successful idempotent state reconcile (no PutBucketCors required).

**Actual signed browser-style traffic:** tested both origins independently via `infra/cloudru/signed-browser-smoke.mjs`: Gallery and Feed signed `multipart/form-data` POST => HTTP 200; signed GET response contents matched all 3 buckets; responses from signed POST/GET had the correct `Access-Control-Allow-Origin` for each of the 2 approved domains; unrelated `https://untrusted.example` was not CORS-approved. Unsigned GET never returned data (S3 `AuthorizationQueryParametersError` HTTP 400). Each test used independent UUID disposable objects only; each was deleted and HEAD-verified absent. Full test exit 0 for both origins, also **after** Public Access Block application.

**Remaining CORS caveat:** synthetic browser `OPTIONS` preflights still return `403 AccessDenied` with no ACAO, even with the matching bucket rules and both path-style/virtual-host requests. This is distinct from the successful signed simple multipart POST/GET. Actual Web gallery uses plain `FormData` with no custom headers, which ordinarily does not require a preflight, but this still needs live-browser acceptance and may block future non-simple headers. `media-readiness.mjs` now labels it `preflight-*-blocked` rather than falsely claiming actual simple signed GET/POST failed. Do not claim complete OPTIONS support.

**Registry:** `docker login gafus.cr.cloud.ru` using the existing deploy account key in a temporary Docker configuration returned `Login Succeeded`. The registry API `GET /v1/registries?projectId=...` still returns 403/code 7 despite new registry-scoped `ar.registry.viewer`. Registry push/pull access is **not yet confirmed**. If REST enumeration is necessary, verify `ar.registry.viewer` at **project-wide service scope**, rather than only the individual `gafus` registry. Container Services and Container Jobs GET list requests 200, with zero running/deployed resources. No creation/push/deployment was done.

**Tests:** `pnpm test:cloudru-media` PASS including no-duplicate CORS regression; live synthetic presigned POST/GET/ACL tests PASS for both domains; `git diff --check` PASS. Docker auth PASS. No CDN, DNS, production feature flags, existing user objects or Yandex courses were changed. No migration commit was created because the working tree contains many independent modifications.

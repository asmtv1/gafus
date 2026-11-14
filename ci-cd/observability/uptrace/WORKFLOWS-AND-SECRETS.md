# GAFUS / Uptrace — GitHub Actions and protected secrets

Status: workflows prepared locally. No GitHub secrets, variables,
environments, cloud infrastructure, or production deployment changed remotely.

## Automatic source-only release gates

The ci-cd.yml observability-contracts job runs on PR and push, with no
Uptrace credentials. It verifies source contracts, ACK gateway, private
source maps, preview API ingress and Worker exporter. Production image
publishing and production deploy both require its success.

The production-deploy-reusable.yml reusable workflow runs a source-only
pre-SSH gate (including Deploy Only, manual redeploy, rollback).
build-single-container.yml also enforces Uptrace source contracts and
private source-map sealing before an independent image build/push.

SDK57 QA remains source-only and does NOT certify real native device
crashes, physical app binaries, or native symbolication.

## Manual cloud acceptance: GAFUS Nonprod 9383 only

Workflow: .github/workflows/gafus-uptrace-nonprod-acceptance.yml

Trigger: workflow_dispatch only with approved 40-character source SHA
on origin/main and explicit confirmation gafus-uptrace-nonprod-9383.

Protected GitHub Environment: gafus-uptrace-nonprod.

| Kind | Name | Value |
| --- | --- | --- |
| Environment variable | GAFUS_UPTRACE_NONPROD_CI_APPROVED | true only after protection configured |
| Environment secret | UPTRACE_NONPROD_INGEST_DSN | Nonprod project 9383 only |
| Environment secret | UPTRACE_NONPROD_VIEWER_TOKEN | Read-only Viewer token for project 9383 |

Secrets are written to 0600 files in the ephemeral runner, never copied to
artifacts/containers/public bundles, and removed on completion.
Do not reuse Production Uptrace 9378 credentials or DSNs.

GitHub required reviewer availability depends on repository visibility/plan.
If reviewer protection is unavailable, keep the approval variable unset,
so cloud acceptance cannot be accidentally started with privileged secrets.

## Private Web/Admin/Trainer sourcemaps

Every main and manual single-container Vite build privately seals source maps
under the runner's 0700 temporary folder, generates SHA256 manifest and
checks that public dist has no *.map files. By default it performs only
a DRY RUN and discards private maps after the job.

Optional real S3 upload, BEFORE publishing images:
- Repository variable GAFUS_WEB_SYMBOLS_PRODUCTION_APPROVED=true
- Secret GAFUS_WEB_SYMBOLS_BUCKET: separate PRIVATE Cloud.ru bucket
- Secret GAFUS_WEB_SYMBOLS_ACCESS_KEY: least-privilege bucket key
- Secret GAFUS_WEB_SYMBOLS_SECRET_KEY: corresponding private secret

The endpoint is pinned https://s3.cloud.ru and region ru-central-1.
Do not reuse public Feed/Gallery/OTA buckets. Private Cache-Control and
a private-looking bucket name do NOT establish bucket privacy: verify
Cloud.ru IAM/bucket policy forbids anonymous GetObject/ListBucket and
configure lifecycle/retention/quota.

Uploaded objects are immutable and SHA256-verified with S3 HEAD + GET.
No production tracer/exporter is enabled merely by archiving maps.

## SDK57 verified native OTA Hermes maps

Workflow: .github/workflows/gafus-self-hosted-ota-preview.yml

The workflow first verifies registered signed native-release metadata,
source SHA, fingerprint and OTA update revision. Only after these checks,
if protected variable GAFUS_SYMBOLS_PREVIEW_APPROVED=true, it prepares
a private Hermes map archive and uploads to private S3 BEFORE marking
the OTA update READY. The existing ota-preview environment must be protected.

| Kind | Name | Value |
| --- | --- | --- |
| Variable | GAFUS_SYMBOLS_PREVIEW_APPROVED | true only after private S3 audited |
| Secret | SYMBOLS_S3_BUCKET | dedicated private bucket, different from OTA |
| Secret | SYMBOLS_S3_ENDPOINT | https://s3.cloud.ru |
| Secret | SYMBOLS_S3_ACCESS_KEY | private bucket key |
| Secret | SYMBOLS_S3_SECRET_KEY | private bucket secret |
| Variable | SYMBOLS_S3_REGION | ru-central-1 |

The native uploader rejects world-readable files, external S3 endpoints
and unverified releases. SDK57 source QA NEVER uploads maps by itself.
Real iOS/Android device crash, ANR/OOM, Hermes/dSYM/R8/ELF symbolication
still require separate signed native binaries and acceptance tests.

## Local verification and cutover

Local verification:
- actionlint the six modified/additional workflows
- node scripts/observability/check-workflow-release-gates.mjs
- node --test scripts/observability/check-workflow-release-gates.test.mjs
- node --test scripts/observability/*.test.mjs
- API/Worker preview ingress vitest and architecture boundary check

All production Uptrace exporters remain off. Never set
GAFUS_TELEMETRY_PRODUCTION_APPROVED=true or retire Yandex/AppTracer
without genuine native crash acceptance, independent 401/403 watchdog,
collector disk bounds, alert recipients, billing limits, 14 complete
measured days of dual-write and 7 post-cutover days. Synthetic 200
responses do not satisfy those requirements.

## Cloud.ru actual provisioned resources — 2026-11-14

Confirmed in the authenticated Cloud.ru Evolution console:

| Item | Value or observed state |
| --- | --- |
| Bucket | gafus-symbols-private |
| Cloud.ru bucket resource ID | 4aa6fa76-d4de-46c9-bc9d-bae01f2af633 |
| Project | Новый Проект |
| Bucket class | Стандартный (Standard) |
| Maximum bucket volume | 20 GB (enabled in console) |
| Global name and custom public domain | Neither set |
| Public Bucket Policy switch | Off |
| Versioning | Off at provision time |
| Publisher service account | gafus-symbols-s3-publisher |
| Publisher service account ID | 74a804d3-adc2-49fe-814f-a55841440535 |
| Verified persisted publisher grants | s3e.editor and s3e.viewer for gafus-symbols-private ONLY |
| S3 endpoint and region | https://s3.cloud.ru / ru-central-1 |
| Access key expiry setting | 365 days after creation; rotate before expiry |
| Uploaded maps | None yet; signed write/read verification NOT completed |

Separate dedicated S3 access key was generated for the publisher. The
one-time Key ID and Key Secret are stored ONLY in chmod-0600 local Mac files,
outside Git and this runbook:

- ~/.config/gafus-observability/symbols-s3-access-key
- ~/.config/gafus-observability/symbols-s3-key-secret

The first file already contains the required Cloud.ru tenant-ID/key-ID
access-key format. The browser clipboard was cleared. Never print these
values, copy them into this repository, attach them to chat, or use them in
Expo client/mobile env values. Private S3 keys are CI-only.

GitHub repository asmtv1/gafus WAS configured remotely as follows:

- Repository secret GAFUS_WEB_SYMBOLS_BUCKET = gafus-symbols-private
- Repository variable GAFUS_WEB_SYMBOLS_PRODUCTION_APPROVED = false
- Environment ota-preview secret SYMBOLS_S3_BUCKET = gafus-symbols-private
- Environment ota-preview secret SYMBOLS_S3_ENDPOINT = https://s3.cloud.ru
- Environment ota-preview variable SYMBOLS_S3_REGION = ru-central-1
- Environment ota-preview variable GAFUS_SYMBOLS_PREVIEW_APPROVED = false

Actual publisher credentials have NOT been propagated into GitHub: a local
signed S3 smoke request was blocked by the security boundary. Do not bypass
the restriction by routing the same keys through a different tool. Until the
owner explicitly supplies the key through GitHub's secure secret inputs,
both workflows must remain disabled. On the Mac, the owner may use GitHub's
authenticated secret settings and read the local 0600 files through a trusted
manual workflow (without sending values to an assistant):

Repository Secrets (used by automatic Web/Admin/Trainer image builds):
- GAFUS_WEB_SYMBOLS_ACCESS_KEY from the local access-key file
- GAFUS_WEB_SYMBOLS_SECRET_KEY from the local key-secret file

Protected ota-preview Environment Secrets (used by signed Expo OTA only):
- SYMBOLS_S3_ACCESS_KEY from the same local access-key file
- SYMBOLS_S3_SECRET_KEY from the same local key-secret file

Once credentials are installed in the protected GitHub settings, first run
a manually reviewed synthetic PutObject/HeadObject/GetObject and anonymous
read-denial check on THIS bucket, with SHA256 readback and cleanup of only
the synthetic test key. Until the signed readback is successful, retain
GAFUS_WEB_SYMBOLS_PRODUCTION_APPROVED=false and
GAFUS_SYMBOLS_PREVIEW_APPROVED=false.

No Lifecycle/automatic expiration has been set: the Cloud.ru API requires
s3e.editor-acl or s3e.admin, deliberately NOT granted to the publisher.
Do not delete still-active mobile release source maps on a fixed timer.
After observing genuine release retention needs, use a distinct owner role
for reviewed lifecycle/expiration (e.g. old preview artifacts only),
while retaining an overall 20 GB maximum bucket quota.

## S3 privacy smoke acceptance workflow — 2026-11-14

New manual-only .github/workflows/gafus-private-symbols-s3-acceptance.yml
uses the existing ota-preview environment (branch restriction: main).
GitHub variable GAFUS_SYMBOLS_PROBE_ALLOWED=true has been configured for
this manual synthetic probe ONLY. The existing real source-map upload
variables GAFUS_SYMBOLS_PREVIEW_APPROVED=false and repository
GAFUS_WEB_SYMBOLS_PRODUCTION_APPROVED=false remain unchanged.

After the owner installs the FOUR missing credentials through GitHub's
secure Secrets interface, and after task source files have been safely
integrated and pushed to main, dispatch this workflow with:
- source_sha: reviewed full main SHA containing this workflow
- confirmation: gafus-symbols-private-only

The job checks the exact main SHA, manual approval, production-off mode,
dedicated bucket, Cloud.ru endpoint/region, then uploads a small synthetic
JSON with If-None-Match, verifies signed HEAD+GET and SHA256, checks
unauthenticated object GET and bucket listing are denied, and deletes the
synthetic probe object. No real source maps are uploaded by the probe.
A failed probe cannot change either map-upload approval variable.
Acceptance is NOT complete until a real GitHub job finishes successfully.

Local source tests cover private config fail-closed, successful readback and
cleanup, public-read detection, hash mismatch, failed cleanup, HTTP 500
and a DELETE success without object disappearance (7/7 PASS). Workflow release contracts include main SHA and protected
Environment (11/11 PASS). No real signed S3 operation occurred.

Authenticated Cloud.ru console re-confirmed the bucket Public access switch
OFF (aria-checked=false), and after browser transport recovery confirmed the
bucket EMPTY. A synthetic upload through the Playwright file chooser was
interrupted, NOT successful. Anonymous bucket HEAD returned HTTP 400, which
alone does NOT establish that an uploaded object cannot be read. Therefore
actual private S3 end-to-end verification remains pending.

Cloud.ru documentation: Lifecycle requires the separate s3e.editor-acl or
s3e.admin role, neither granted to this least-privilege uploader. An eventual
Lifecycle retention policy must preserve still-supported signed release maps.
Do not grant lifecycle administration to the uploader solely for cleanup.


## VERIFIED Cloud.ru private symbols bucket — 2026-11-14

The two required Repository secrets GAFUS_WEB_SYMBOLS_ACCESS_KEY and
GAFUS_WEB_SYMBOLS_SECRET_KEY, and the two required ota-preview Environment
secrets SYMBOLS_S3_ACCESS_KEY and SYMBOLS_S3_SECRET_KEY are now present
in GitHub (names and update timestamps verified; plaintext never read from
GitHub). The earlier notes above about missing GitHub credentials are
historical and superseded by this checkpoint.

An isolated three-file diagnostic-only commit was published directly to
main, preserving all unrelated uncommitted Mac checkout changes:
0aec3b1ffd7bd523db7732db59254afe1349a5d7
https://github.com/asmtv1/gafus/commit/0aec3b1ffd7bd523db7732db59254afe1349a5d7

The commit has [skip ci] because CI/CD on main otherwise initiates a
production release. The repository's latest ordinary push CI run remained
on bd49e5137048, i.e. no automatic production CI was triggered by the
diagnostic commit.

The protected, manually dispatched acceptance job completed SUCCESS:
https://github.com/asmtv1/gafus/actions/runs/43528647081
The job verified exact main source SHA and manual approval, installed the
S3 dependencies, passed synthetic-source unit tests and performed REAL
Cloud.ru signed PutObject, HeadObject and GetObject with SHA256 readback.
The anonymous object GET and bucket LIST both returned HTTP 400; no
object data/list was exposed through those requests. The Cloud.ru Console
also independently shows Public access = OFF. The synthetic object was
deleted; the script additionally verified signed HEAD returned 404
after deletion, and reported objectsPersisted=0. GitHub concluded SUCCESS.

This proves the configured GitHub Environment S3 keys can execute the
signed S3 operations for gafus-symbols-private. It does NOT imply actual
private Web or SDK57 native source maps were uploaded: those workflows
and uploader code are not completely present on upstream main.
Keep repository GAFUS_WEB_SYMBOLS_PRODUCTION_APPROVED=false and
ota-preview GAFUS_SYMBOLS_PREVIEW_APPROVED=false until the full
reviewed source-map release implementation is safely integrated and
accepted. The manual GAFUS_SYMBOLS_PROBE_ALLOWED=true applies ONLY
to this isolated synthetic test and is not a production activation.

No other pending changes from the shared Mac tree were pushed.

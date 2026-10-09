# Nonproduction gallery infrastructure

This module is reproducible Terraform for Yandex Cloud, pinned to provider 0.237.0 with a committed provider lock. It rejects environments other than `dev`/`staging` and starts with the feature disabled. The first gallery-dev stage-1 apply was partial (October 2026): the remote state already tracks the photo bucket, service accounts, secrets, queues, origin and dispatch functions. Do not import or recreate them. Subsequent changes must be reconciled against remote state. Full API, environment and rollout contract: [gallery cloud delivery](../../docs/features/gallery-cloud.md).

The module creates a private bucket with explicit HTTPS POST CORS, separate storage identities, Lockbox payloads, a processing queue/DLQ, three source-only object triggers, a queue consumer and a five-minute maintenance timer. Processor/maintenance functions use Node 22, 1 GiB and 60 seconds. Origin uses 256 MiB/four seconds; dispatcher uses 128 MiB/15 seconds. No prepared instances are configured. Function invokers are specific trigger/gateway service accounts; gateway invokes the private origin with IAM. CDN adds the origin secret, uses no-IP secure tokens and overrides edge TTL independently of browser no-store headers.

Scaling limits are per availability zone, so one instance and one request per zone deliberately stay below five simultaneous invocations across the current three zones. Check the zone count/actual scaling behavior before enablement. See [Yandex scaling settings](https://yandex.cloud/en/docs/functions/operations/function/scaling-settings-add) and the pinned [provider function scaling schema](https://github.com/yandex-cloud/terraform-provider-yandex/blob/v0.237.0/website/docs/r/function_scaling_policy.html.markdown).

Runtime S3 access comes from bucket policies scoped to source/worker/final paths, without folder-wide storage roles. YMQ reader/writer roles are folder-scoped; use a dedicated nonproduction folder to contain that scope. Provisioner queue credentials need queue administration and are never passed to functions. Provider schema reference: [Yandex provider 0.237.0](https://github.com/yandex-cloud/terraform-provider-yandex/tree/v0.237.0/website/docs/r).

## Build and review

From the repository root, with existing workspace dependencies:

```sh
pnpm --filter @gafus/gallery-storage build
pnpm --filter @gafus/gallery-cloud build
node apps/gallery-cloud/scripts/package-linux.mjs
terraform -chdir=infra/gallery init -backend=false
terraform -chdir=infra/gallery fmt -check
terraform -chdir=infra/gallery validate
```

Packaging performs a separate locked npm ci with scripts disabled and explicitly selected Linux x64 glibc native packages. It does not reinstall or alter workspace dependencies. `--force` allows fetching explicitly declared Linux packages on macOS; no native installer is executed. Archives are in `apps/gallery-cloud/artifacts/{process,maintenance,origin,dispatch}.zip`; `runtime.json` records that Linux execution is unverified. Origin and dispatcher have no node_modules/native bundle.

Copy `example.tfvars` to a local ignored tfvars file and replace nonsecret placeholders. Supply sensitive variables through the operator's secret injection mechanism, without printing values. Provider auth uses renewed `YC_TOKEN` or the established provider service-account mechanism. Set `TF_VAR_internal_hmac_secret`, `TF_VAR_origin_secret`, `TF_VAR_cdn_secret` and provisioner YMQ credentials securely. Use protected encrypted remote Terraform state and restricted plan storage: sensitive variables/static keys/Lockbox versions/CDN secret headers still exist in Terraform state. Never publish state or plans.

### Isolated development state backend

`backend.tf` configures only this `infra/gallery` module. It stores the state at `gallery/dev/terraform.tfstate` in the private, versioned `gafus-gallery-dev-tfstate-b1gjbsvfnd1fl68k43g6` bucket and enables S3 `.tflock` state locking. The bucket's default KMS key is managed outside Terraform. The backend uses `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` from the **dedicated tfstate service account**; do not paste those keys into code, `*.tfvars`, CLI arguments or chat. Those keys only give storage access and do not grant Terraform provider permission to create cloud resources. Provider auth (`YC_TOKEN` or another explicitly authorized provider identity) is configured separately.

Run from the **repository root**, after placing the static storage keys in the ignored root `.env` as `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`:

```sh
node infra/gallery/scripts/terraform.mjs init -reconfigure -input=false
```

The wrapper reads the state credentials and the five gallery Terraform variables (`TF_VAR_*`) from the ignored root `.env`, redacts their values from its terminal output, and never puts them into command arguments. It automatically loads the Yandex provider authorized key from the ignored `infra/gallery/.secrets/gallery-dev-provisioner-key.json` file if present. Run cloud operations in the Mac's own Terminal when Bridge network isolation blocks DNS.

The `gafus-gallery-dev-tfstate` account is restricted to state storage. The distinct `gafus-gallery-dev-provisioner` account (ID `ajea07ae9l6d8anjknc0`) has folder-scoped `admin` only on `gafus-gallery-dev`, not on the main GAFUS folder. Yandex CLI's active default folder points elsewhere, so always use the explicit dev folder ID when issuing credentials:

```sh
mkdir -p infra/gallery/.secrets
yc iam key create --service-account-id ajea07ae9l6d8anjknc0 --folder-id b1gjbsvfnd1fl68k43g6 --output infra/gallery/.secrets/gallery-dev-provisioner-key.json
chmod 600 infra/gallery/.secrets/gallery-dev-provisioner-key.json
yc iam access-key create --service-account-id ajea07ae9l6d8anjknc0 --folder-id b1gjbsvfnd1fl68k43g6
```

The last command **prints a one-time static access key and secret to your local terminal**. Put them only into the ignored root `.env` as `TF_VAR_provisioner_ymq_access_key` and `TF_VAR_provisioner_ymq_secret_key`, never into chat or Git. Separately generate fresh random `TF_VAR_internal_hmac_secret` (at least 32 bytes), `TF_VAR_origin_secret` (32–128 URL-safe ASCII characters), and `TF_VAR_cdn_secret` (24–32 URL-safe ASCII characters). Never reuse the S3 state credentials for queue administration. The production API must receive the same HMAC secret through its actual secure deployment mechanism before the first scheduled maintenance invocation.

The development cloud resources use the *production* `https://api.gafus.ru` backend at the user's direction. The user requested `GALLERY_ENABLED=true` in the local production Docker Compose configuration, but this change has **not been deployed**. The existing DEV cloud functions are still disabled; a reviewed stage-3 plan enables four function flags. Deploy the approved migration and API first, then apply the reviewed cloud plan. The user explicitly accepted the backup risk; live end-to-end verification is still required. When deployed, the flag affects all users, not only the test account.

### Connecting the existing production API to Gallery DEV (prepared, not deployed)

The existing `api.gafus.ru` API and the existing GAFUS web application are
the only intended application endpoints. No separate test API or database is
created. DEV Object Storage/CDN/Cloud Functions are deployed; the existing
production database and Redis are reused only after an explicitly reviewed
migration and rollout.

The deployment wiring is prepared in `ci-cd/docker/docker-compose.prod.yml`
and both GitHub Actions workflows (`ci-cd.yml` and `deploy-only.yml`).
Both `web` and `api` receive the DEV bucket/CDN URL and private runtime
configuration. **Both are staged with `GALLERY_ENABLED=true`** in the local
Compose file, at the user's explicit request, but **not deployed**.
`GALLERY_PROCESSOR_READY=true` is also staged in both services.
The deployment and live worker readiness are not verified yet.
The production database migration has not been run by this preparation.

Before deploying, provision these **four GitHub Actions Secrets** in the
actual deployment environment (normally `production`) from the **DEV web
Lockbox payload**, secret ID `e6qfigir1hhj0o061p8d`:

| GitHub Secret | Source Lockbox payload entry |
| --- | --- |
| `GALLERY_S3_ACCESS_KEY_ID` | `GALLERY_S3_ACCESS_KEY_ID` |
| `GALLERY_S3_SECRET_ACCESS_KEY` | `GALLERY_S3_SECRET_ACCESS_KEY` |
| `GALLERY_CDN_SECRET` | `GALLERY_CDN_SECRET` |
| `GALLERY_INTERNAL_HMAC_SECRET` | `GALLERY_INTERNAL_HMAC_SECRET` |

Treat the values as secrets: do not put them into Git, Terraform arguments,
terminal logs, chat, plaintext manifests or GitHub Actions artifacts. The
HMAC value must exactly match the Cloud worker's existing Lockbox entry.
The production server runs in Docker and does **not** inherit the DEV service
account's Lockbox permissions; a deliberately authorized operator must copy
the secret values through a protected channel. No extra production folder
IAM grants are implied.

**Do not push to `main` yet:** the existing CI/CD automatically executes
`prisma migrate deploy` against the live database before restarting
containers. Review `20261007120000_gallery`, check its actual migration
status in production using read-only tooling, confirm a restorable backup,
and obtain a separate approval for that database/schema change and
deployment. The SQL adds new gallery tables/types/indexes/foreign keys;
local review is not proof of compatibility with the current live schema.
Check the four GitHub Secret names exist (values never displayed), then
complete DB/backup and cloud readiness gates **before** a separately approved
production deployment. The prepared Compose flags are `GALLERY_ENABLED=true` and
`GALLERY_PROCESSOR_READY=true` for both web and API. Verify end-to-end
processing after the actual production deploy and DEV-cloud activation.
A successful unauthenticated GET returning 405 on the internal route proves
the route exists, **not** that signed POST, Redis replay protection or the
database migration are operational.

Only after those gates may an explicitly authorized end-to-end gallery
smoke test run with a registered test account. `GALLERY_ENABLED=true` is a
global enablement, not a test-account-only switch; staging the flag in Git
does not mean it is safe to deploy or that the cloud processor is ready.

### Two-stage CDN deployment (Yandex provider 0.237.0)

The CDN `custom_host_header` depends on the generated API Gateway hostname. In provider 0.237.0, `CustomizeDiff` requires that hostname to be known at **plan time**. A one-pass first plan fails with `value must be known`, and its saved plan is **incomplete and must never be applied**.

Use the ignored `gallery-dev.tfvars` with `deploy_cdn = false` for stage 1; keep `enabled = false` throughout both stages. From the repository root, using Mac Terminal (Bridge network isolation may prevent cloud access):

```sh
node infra/gallery/scripts/terraform.mjs plan -var-file=gallery-dev.tfvars -input=false -no-color -out=gallery-dev.tfplan
node infra/gallery/scripts/plan-summary.mjs
# Only after "Plan complete: true", "Plan applyable: true", "Plan errored: false",
# and "Preliminary plan safety checks: PASS" may the saved plan be applied.
node infra/gallery/scripts/terraform.mjs apply -input=false -no-color gallery-dev.tfplan
```

### Recovering the partial DEV apply

The first apply has **already created** 31 tracked resources, including the photo
bucket. It failed at S3 CORS with HTTP 403 and while uploading two 7.9 MB
Linux/Sharp function archives inline (the provider's limit is 3670016 bytes).
Do not import the tracked photo bucket, reuse the old saved plan, or recreate
the completed functions.

The Yandex provider uses its own S3 credentials for CORS, bucket policy and
object uploads, distinct from the remote Terraform state backend credentials.
Before making a new plan, set provider S3 authentication to the **DEV
provisioner service account** whose static key was stored in the local ignored
root `.env`. Yandex provider 0.237.0 supports `YC_STORAGE_ACCESS_KEY` and
`YC_STORAGE_SECRET_KEY`; do not point these at the backend state account.
The Yandex CLI's default profile is a different identity and is not a valid
test of the provisioner's permissions.

The oversized function archives now go into a dedicated, private Terraform
managed bucket `gallery-dev-function-code-b1gjbsvfnd1fl68k43g6`; only
`process` and `maintenance` are deployed from these versioned object names.
The small `origin` and `dispatch` functions retain inline archives.
Never upload the function packages to the Terraform state bucket. Verify
anonymous bucket access remains disabled. The runtime worker must have
`storage.viewer` on the separate code bucket to download the ZIP package;
`yandex_storage_bucket_iam_binding.function_packages_reader` supplies it.

### Recovering the initial photo-bucket policy lockout

Yandex applies the bucket's access policy **in addition to IAM roles**. The
first failed apply likely installed the old bucket policy before failing
at CORS, inadvertently excluding the provisioner from policy grants.
Thus even the DEV folder-scoped `admin` role cannot read the bucket over S3;
the later plan fails with `error reading Storage Bucket: Forbidden 403`.
The Terraform module now includes a private `TerraformProvisioner` policy
statement for `var.provisioner_service_account_id`.

Generate a local recovery policy **from the existing remote state** (this
script does not send or print secrets, and does not modify the cloud):

```sh
node infra/gallery/scripts/prepare-recovery-policy.mjs
```

The output file is ignored by Git:
`infra/gallery/.secrets/gallery-dev-photo-policy-recovery.json`.
Inspect the policy IDs and ensure there is **no public Allow statement**.
To repair it through the Yandex Cloud control-plane API, an authorized
operator can try this Yandex CLI command, impersonating the DEV
provisioner rather than the unrelated default CLI profile:

```sh
yc storage bucket update \
  --name gafus-gallery-dev-photos-b1gjbsvfnd1fl68k43g6 \
  --folder-id b1gjbsvfnd1fl68k43g6 \
  --impersonate-service-account-id ajea07ae9l6d8anjknc0 \
  --policy-from-file infra/gallery/.secrets/gallery-dev-photo-policy-recovery.json
```

**CAUTION:** That command overwrites the bucket's entire access policy.
Use only the generated policy copied from the original state with the single
new provisioner statement. If the control-plane API also denies access, stop;
request Yandex Cloud support for recovery instead of exposing the bucket,
removing Terraform state or recreating it. Do not run Terraform plan/apply
until both the cloud policy and the desired module policy are reconciled.

Before rerunning Terraform, run `terraform validate` in the Mac's own
Terminal, then create a **fresh** `gallery-dev.tfplan` with the current
state and inspect it using `plan-summary.mjs`. A plan must include zero
deletes/replacements and no modifications outside the DEV folder. Do not
apply unless the fresh plan is complete, applyable and reviewed.

After a successful **first** apply and real API Gateway hostname assignment, change only `deploy_cdn = true` in the ignored `gallery-dev.tfvars`; then repeat `plan`, review, and `apply` to create the CDN resource in stage 2. Never create/enable the CDN with a guessed hostname or remove `custom_host_header`. This `deploy_cdn` switch is independent of the end-user `enabled` gallery flag. Always inspect any failed apply's state before retrying.

Review any existing local and remote state before initialising; never blindly migrate or overwrite state. Verify remote state and lockfile behavior before the first `plan`/`apply`. `terraform init -backend=false` is still the safe command for local syntax checks without connecting to Object Storage.

An authorized operator can review a nonproduction plan after credentials are renewed. Terraform does not automatically wire the repository's web deployment. Grant its actual identity access to the generated web Lockbox secret and inject the public bucket/CDN/internal URL configuration separately. Set readiness only after the gates pass. Keep runtime credentials separate; origin receives no HMAC/queue credential and, by default, no CDN signing key. Optional origin token checking requires explicit origin Lockbox/env additions by the operator.

## Smoke runner

Create a fresh upload through the authenticated core registration fixture using a test owner/album. Save the exact full presigned POST fields, source key/upload ID and final keys supplied by core into a local JSON manifest using `smoke-manifest.example.json` as a shape reference. The placeholders in that example are not valid credentials. Do not derive IDs or arbitrary destination keys in the smoke script. Use a small valid PNG/JPG/WebP; a POST expires in ten minutes. Keep the manifest private because it contains a temporary signed upload policy.

Provide these variables through secure environment injection:

- `GALLERY_SMOKE_ENV=dev` (or `staging`), `GALLERY_SMOKE_MUTATIONS=true`, `GALLERY_SMOKE_MANIFEST=/absolute/private/manifest.json`.
- `GALLERY_BUCKET`, worker S3 key variables, queue URL/producer key variables.
- `GALLERY_INTERNAL_BASE_URL`, HMAC secret, `GALLERY_SMOKE_ORIGIN_URL`, origin secret, CDN base URL/signing secret.
- Optionally `GALLERY_SMOKE_CACHE_HEADER` when the provider exposes cache status under a header other than `x-cache`.
- For the separate missing-event case: suppress only the nonproduction incoming triggers before upload and set `GALLERY_SMOKE_REQUIRE_RECOVERY=true`; restore them afterward. The queue consumer and maintenance must remain active.

Run from the repository root:

```sh
node apps/gallery-cloud/scripts/smoke.mjs
```

The runner requires an explicit nonproduction mutation opt-in and checks the POST destination against the dedicated bucket. It uploads without calling client confirmation, calls signed maintenance, enqueues recovered IDs and waits for final publication. It checks stale/tampered/replayed HMAC, exact ETag GET, create-if-absent PUT conflict, unchanged final bytes, closed anonymous storage, origin secret and encoded path denial, browser no-store, an observable CDN HIT, and absent/expired/invalid CDN tokens after that HIT. It delivers duplicate registered IDs and checks stable final ETags. It logs only a compact safe result, not tokens or provider error payloads.

`missingEventRecoveryVerified` is true only when maintenance actually returned this upload's ID; normal object delivery may win the race. The explicit recovery mode requires that result. `cloudColdStartVerified` is always false: perform the separate fresh-version CDN cold-miss gate, including worst-case latency across zones. The script does not establish DLQ or scheduled cleanup correctness; run those scenarios from the delivery document separately. Delete test photos through the authenticated owner path so core persists cleanup jobs. Do not delete arbitrary storage keys by hand.

## Billing and rollout gates

`budget-policy.json` specifies exactly 500 RUB/month notification with no automatic shutdown. Binding it to a billing account/notification recipient belongs to the root billing integration; this module does not claim that notification is live. YC credentials are currently expired. Linux runtime execution, provider conditional write behavior, actual CORS/IAM/trigger delivery, CDN secure authorization on HIT, cold origin latency and billing attachment remain external gates. Do not enable the gallery until they pass.

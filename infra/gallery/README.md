# Nonproduction gallery infrastructure

This module is reproducible Terraform for Yandex Cloud, pinned to provider 0.237.0 with a committed provider lock. It rejects environments other than `dev`/`staging` and starts with the feature disabled. Terraform init and validate passed locally; no plan/apply was run. Full API, environment and rollout contract: [gallery cloud delivery](../../docs/features/gallery-cloud.md).

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

Copy `example.tfvars` to a local ignored tfvars file and replace nonsecret placeholders. Supply sensitive variables through the operator's secret injection mechanism, without printing values. Provider auth uses renewed `YC_TOKEN` or the established provider service-account mechanism. Set `TF_VAR_internal_hmac_secret`, `TF_VAR_origin_secret`, `TF_VAR_cdn_secret` and provisioner YMQ credentials securely. Use protected encrypted remote Terraform state and restricted plan storage: sensitive variables/static keys/Lockbox versions/CDN secret headers still exist in Terraform state. Never publish state or plans. This module intentionally does not choose a shared backend for the repository.

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

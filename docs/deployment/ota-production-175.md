# GAFUS OTA production 1.7.5 — Android and iOS

Updated 2026-11-15. Expo SDK 57, `appVersion=runtimeVersion=1.7.5` on BOTH platforms. Uses signed self-hosted Expo updates through GAFUS API + Cloud.ru S3. This is not Expo EAS Update. Never reuse a native binary for a different runtime.

## Production deployment when `main` is pushed

The existing approved production deployment must install the new API, Prisma migrations and edge Nginx configuration. In `.github/workflows/production-deploy-reusable.yml` it sets `MOBILE_OTA_DELIVERY_ENV=production`, verifies live API `/ota/manifest` (expects HTTP 406 without Expo headers), and refuses to proceed without both 32+-character production Secrets `MOBILE_OTA_CI_CALLBACK_TOKEN`, `MOBILE_OTA_INSTALLATION_HASH_KEY`. `MOBILE_OTA_ASSET_ORIGIN` remains `https://global.s3.cloud.ru/gafus-ota-updates`. Signed manifest endpoint `https://gafus.ru/ota/manifest` and device telemetry `/ota/telemetry` are routed by edge Nginx to Hono, not to SPA.

**No OTA update is auto-published by `main` push.** The API delivery endpoint can be active but will only serve manually published, signed updates to an approved verified native fingerprint/runtime. The rollout starts paused. This allows safe staging without affecting existing Store binaries.

Set up a separate GitHub Actions environment **`ota-production`**, restricted to `main`, with Secrets: `OTA_SIGNING_PRIVATE_KEY_PEM`, `OTA_S3_ENDPOINT`, `OTA_S3_BUCKET`, `OTA_S3_ACCESS_KEY`, `OTA_S3_SECRET_KEY`, `SYMBOLS_S3_ENDPOINT`, `SYMBOLS_S3_BUCKET`, `SYMBOLS_S3_ACCESS_KEY`, `SYMBOLS_S3_SECRET_KEY`, `MOBILE_OTA_CI_CALLBACK_TOKEN`. Environment variables: `OTA_S3_REGION=ru-central-1`, `OTA_S3_TENANT_ID=<Cloud.ru tenant UUID>`, `OTA_PUBLIC_ASSET_ORIGIN=https://global.s3.cloud.ru/gafus-ota-updates` (optional `SYMBOLS_S3_REGION=ru-central-1`). `MOBILE_OTA_CI_CALLBACK_TOKEN` must match the API production secret; private-symbols bucket must differ from public OTA bucket.

Production RSA-3072 private signing key on Mac: `$HOME/.config/gafus/ota/production-20261115-private.pem` (mode 0600). **Transfer its contents directly into the scoped GitHub environment secret `OTA_SIGNING_PRIVATE_KEY_PEM`. NEVER put in git, chat, app bundle or regular repo variables.** Public X.509 certificate in `apps/mobile/ota-public-certificates/gafus-production-20261115.cert.txt`, signing key ID `gafus-production-20261115`. The separate preview signing key must not be reused.

## First native binary 1.7.5 (repeat for both platforms)

After pushing a clean source SHA, write outside git `/tmp/gafus-ota-175-android-config.json`:

```json
{
  "environment": "production",
  "platform": "android",
  "distribution": "internal",
  "buildNumber": "17501",
  "operationId": "gafus-production-175-android-registration-001",
  "sourceSha": "REPLACE_WITH_EXACT_CLEAN_40_CHAR_MAIN_COMMIT",
  "apiOrigin": "https://gafus.ru",
  "ciRunId": "local-android-175-build-001",
  "buildLogRef": "local-android-native-175"
}
```

For iOS change `platform`, unique `operationId`, build and provenance. First prepare candidate **from exact clean Git commit**:

```bash
node apps/mobile/scripts/prepare-self-hosted-native-build.mjs prepare \
  /tmp/gafus-ota-175-android-config.json /tmp/gafus-ota-175-android-candidate.json
```

Register candidate with authenticated `POST /api/v1/admin/mobile-ota/native-releases` (or admin UI). Capture returned `nativeReleaseId`, do **not** mark verified yet. Finalize:

```bash
node apps/mobile/scripts/prepare-self-hosted-native-build.mjs finalize \
  /tmp/gafus-ota-175-android-candidate.json /tmp/gafus-ota-175-android-native.json \
  <SERVER_ISSUED_NATIVE_RELEASE_UUID>
mkdir -p apps/mobile/.ota-certs
cp apps/mobile/ota-public-certificates/gafus-production-20261115.cert.txt \
   apps/mobile/.ota-certs/native.pem
```

Build with exact descriptor and certificate injected (replace filename and platform for iOS). In `apps/mobile`:

```bash
export GAFUS_OTA_NATIVE_RELEASE_DESCRIPTOR=/tmp/gafus-ota-175-android-native.json
export GAFUS_OTA_NATIVE_CERTIFICATE=.ota-certs/native.pem
pnpm check:ota:android:local
pnpm build:ota:android:local
```

For iOS change descriptor path/`GAFUS_OTA_TARGET_PLATFORM` and call `pnpm check:ota:ios:local` then `pnpm build:ota:ios:local`; iOS requires provisioning. **Do not call EAS Build directly for these 1.7.5 profiles** without independently confirming the resulting build number: the repo-wide EAS `cli.appVersionSource=remote` causes EAS to ignore local `ios.buildNumber`/`android.versionCode` (source: https://docs.expo.dev/build-reference/app-versions/). The local wrapper uses `expo run:android --variant release` or `expo run:ios --configuration Release`, avoiding the remote version override. The profile and native descriptor stamp the precise `buildNumber` into the generated native config. For Android find the resulting release APK under `apps/mobile/android/app/build/outputs/`; for iOS the device install is not a signed `.ipa` archive, so make and distribute a matching signed `.ipa` archive before running the verification helper. The generic `production` EAS build profile is **not** the self-hosted OTA binary.

On a real device validate install/distribution, cold launch, background/foreground and update checks. Put *truthful* `physicalDeviceVerified:true`, `distributionVerified:true`, unique `operationId`, `reason` (at least 16 chars), and meaningful `reference` into separate JSON evidence. The helper hashes the real signed IPA/APK:

```bash
node apps/mobile/scripts/prepare-self-hosted-native-verification.mjs \
  /tmp/gafus-ota-175-android-native.json /absolute/path/actual-signed-175.apk \
  /tmp/gafus-ota-175-android-human-evidence.json /tmp/gafus-ota-175-android-verify.json
```

Send resulting signed artifact verification payload to authenticated `POST /api/v1/admin/mobile-ota/native-releases/:id/verification`, or use the corresponding admin UI. Do not fabricate physical-device verification. Repeat for iOS.

## Test a JS-only number change via OTA

After the native binary is registered and verified, commit a **JS/TS-only UI number change** to `main`. Do not change fingerprinted native inputs (`apps/mobile/app.json`, `apps/mobile/package.json`, native plugins, lockfile, native directories/configs, signing cert). OTA source SHA can advance; native base source SHA must be its ancestor and native fingerprint must be unchanged.

Manually trigger `.github/workflows/gafus-self-hosted-ota-production.yml` on `main` as `asmtv1`, filling `source_sha` (new exact main commit), verified `native_release_id`, `platform`, `runtime_version=1.7.5`, revision (`1` first), unique `update_id` UUID, unique `operation_id` and UTC `created_at`. The workflow pins native RSA trust, exports revisioned Hermes, verifies payment graph, signs immutable manifest, uploads Cloud.ru public assets and separate **private** SDK57 source maps, checks readback, and registers **READY / NOT PUBLISHED**. Use the admin OTA UI to publish to a 1% rollout and verify actual device update/launch, only then increase 10/50/100%.

The production OTA workflow is manual and fail-closed. Until GitHub environment signing/S3 secrets and a **real verified native binary** exist, an OTA delivery cannot be claimed successful. A good HTTP healthcheck or S3 upload is not proof of successful app OTA installation.

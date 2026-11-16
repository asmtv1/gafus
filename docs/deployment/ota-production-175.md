# GAFUS OTA production 1.7.5 — Android and iOS

Updated 2026-11-15. Expo SDK 57, `appVersion=runtimeVersion=1.7.5` on BOTH platforms. Uses signed self-hosted Expo updates through GAFUS API + Cloud.ru S3. This is not Expo EAS Update. Never reuse a native binary for a different runtime.

## Private OTA preview for `admin` and `asmtv1` (1.7.5)

**Do not ship a 1.7.5 native binary built before this entitlement code is included.**
The signed self-hosted binary must contain `refreshOtaTesterGrant()` so account-specific
rollout works on both iOS and Android. Existing EAS or older binaries are unaffected.

1. Build/register/verify an actual signed 1.7.5 binary per platform as described below.
   Run the manually approved signed OTA CI workflow; the release must be READY with
   verified assets, and the OTA deployment must be created from a verified native binary.
2. In the admin panel **Мобильные релизы → Публикации**, select the READY revision and
   click **«Только admin/asmtv1»**. This is a **0% public rollout**, but NOT a paused
   deployment: the anonymous manifest route serves the active revision only when it
   verifies a short-lived HMAC tester grant. All other installs stay on the previously
   published stable revision (or their embedded app if no prior OTA exists).
3. Sign in as exactly `admin` or `asmtv1` in GAFUS on a physical device. The app sends
   its installation UUID, platform, runtime and native fingerprint to the protected
   `POST /api/v1/mobile-ota-tester/grant` endpoint using its normal account JWT.
   The API checks the **current DB User.username**, never client-supplied username/role,
   then returns a 15-minute signed grant. Before each OTA check (launch and foreground)
   the app clears any previous grant and requests a new one; the manifest verifies HMAC,
   expiration, device UUID, platform, runtime and fingerprint. No extra secret is needed:
   the server derives a domain-separated HMAC key from the existing private
   `MOBILE_OTA_INSTALLATION_HASH_KEY`. Neither accounts nor grant tokens are sent to S3.
4. After physical QA of **both** platforms, click **«Расширить до 1% / 10% / 50% / 100%»**
   in the same deployment. The same signed OTA release is reused, no new native build
   is required. Testers remain included throughout the rollout. Manual **Пауза** stops
   new manifest delivery; it does NOT remotely undo an update already applied.

**Do not enable the global required-OTA feature flag while the revision is tester-only**:
ordinary accounts cannot fetch it and a mandatory update gate would block them.
Wait until the relevant platform is rolled out to 100% before setting a global
mandatory revision.

**Important:** OTA updates the **installed application**, not an account sandbox.
A tester who installs an OTA then logs in with a different account on that device
will keep the already loaded JS revision until a later eligible update or reinstall.
A tester-only rollout limits who may *fetch the new revision*, not access to downloaded
code or behavior on a device that already has it. Test on separate physical devices
if account isolation matters. During a network/auth outage, new tester grants fail
closed, while previously published stable OTA remains available to ordinary clients.

## Production deployment when `main` is pushed

The existing approved production deployment must install the new API, Prisma migrations and edge Nginx configuration. In `.github/workflows/production-deploy-reusable.yml` it sets `MOBILE_OTA_DELIVERY_ENV=production`, verifies live API `/ota/manifest` (expects HTTP 406 without Expo headers), and refuses to proceed without both 32+-character production Secrets `MOBILE_OTA_CI_CALLBACK_TOKEN`, `MOBILE_OTA_INSTALLATION_HASH_KEY`. `MOBILE_OTA_ASSET_ORIGIN` remains `https://global.s3.cloud.ru/gafus-ota-updates`. Signed manifest endpoint `https://gafus.ru/ota/manifest` and device telemetry `/ota/telemetry` are routed by edge Nginx to Hono, not to SPA.

**No OTA update is auto-published by `main` push.** The API delivery endpoint can be active but will only serve manually published, signed updates to an approved verified native fingerprint/runtime. The rollout starts paused. This allows safe staging without affecting existing Store binaries.

Set up a separate GitHub Actions environment **`ota-production`**, restricted to `main`, with Secrets: `OTA_SIGNING_PRIVATE_KEY_PEM`, `OTA_S3_ENDPOINT`, `OTA_S3_BUCKET`, `OTA_S3_ACCESS_KEY`, `OTA_S3_SECRET_KEY`, `SYMBOLS_S3_ENDPOINT`, `SYMBOLS_S3_BUCKET`, `SYMBOLS_S3_ACCESS_KEY`, `SYMBOLS_S3_SECRET_KEY`, `MOBILE_OTA_CI_CALLBACK_TOKEN`. Environment variables: `OTA_S3_REGION=ru-central-1`, `OTA_S3_TENANT_ID=<Cloud.ru tenant UUID>`, `OTA_PUBLIC_ASSET_ORIGIN=https://global.s3.cloud.ru/gafus-ota-updates` (optional `SYMBOLS_S3_REGION=ru-central-1`). `MOBILE_OTA_CI_CALLBACK_TOKEN` must match the API production secret; private-symbols bucket must differ from public OTA bucket.

Production RSA-3072 private signing key on Mac: `$HOME/.config/gafus/ota/production-20261115-private.pem` (mode 0600). **Transfer its contents directly into the scoped GitHub environment secret `OTA_SIGNING_PRIVATE_KEY_PEM`. NEVER put in git, chat, app bundle or regular repo variables.** Public X.509 certificate in `apps/mobile/ota-public-certificates/gafus-production-20261115.cert.txt`, signing key ID `gafus-production-20261115`. The separate preview signing key must not be reused.

## Quick path for internal 1.7.5 builds (recommended)

After **committing AND pushing** the final native source to `origin/main` (the working tree must be clean), run on the Mac:

```bash
cd /Users/asmtv1/Desktop/gafus-refactor/apps/mobile
pnpm ota:175:prepare
```

This generates *two* validated, idempotent native registration candidates under `~/.config/gafus/ota/native-175/<commit SHA>/` and stages the public certificate. Neither action publishes OTA or uploads a binary. Open the authenticated admin panel **Мобильные релизы → Нативные сборки** and paste the contents of `ios-candidate.json` and `android-candidate.json` into **Регистрация нативной поставки**, registering each separately. Save each returned `nativeReleaseId` UUID. Both registrations remain UNVERIFIED.

Then finalize each native descriptor with the **actual** server-issued UUIDs:

```bash
pnpm ota:175:finalize ios <IOS_SERVER_ISSUED_NATIVE_RELEASE_UUID>
pnpm ota:175:finalize android <ANDROID_SERVER_ISSUED_NATIVE_RELEASE_UUID>
pnpm ota:175:check ios
pnpm ota:175:check android
```

The registered descriptors can now be used for physical-device builds with **no environment-variable copying**:

```bash
pnpm ota:175:build ios
pnpm ota:175:build android
```

iOS local prebuild also uses `plugins/withIosOtaBuildNumber.js` to synchronize the Gafus Xcode target `CURRENT_PROJECT_VERSION` (Debug and Release) with the signed build number; without it Expo left the target at `1` while `Info.plist` contained the correct version. The strict native validator checks both target values and `Info.plist`.

The `build` command re-applies signed Expo native config via `expo prebuild --no-install` and refuses to compile if generated iOS/Android points at the old Expo Updates URL, wrong runtime, missing RSA certificate or mismatched build number. These **local device** builds do not submit to App Store, TestFlight or Google Play. After a real signed IPA/APK has been built and tested on a physical device, use the independent native verification flow below and only then publish a signed JS-only OTA via the manual GitHub workflow. Simply installing a build does not activate OTA delivery.

**No direct EAS `production` build / ordinary `expo run:*` for this OTA test.** If `main` changes in any way after generating candidates, prepare and register new candidates from the final clean pushed SHA instead of reusing stale descriptors. The default internal build number is `17501`; pass a different unused integer to `pnpm ota:175:prepare <buildNumber>` if already allocated.

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

For iOS change descriptor path/`GAFUS_OTA_TARGET_PLATFORM` and call `pnpm check:ota:ios:local` then `pnpm build:ota:ios:local`; iOS requires provisioning. **Do not call EAS Build directly for these 1.7.5 profiles** without independently confirming the resulting build number: the repo-wide EAS `cli.appVersionSource=remote` causes EAS to ignore local `ios.buildNumber`/`android.versionCode` (source: https://docs.expo.dev/build-reference/app-versions/). The local wrapper uses `expo run:android --variant release` or `expo run:ios --configuration Release`, avoiding the remote version override. The profile and native descriptor stamp the precise `buildNumber` into the generated native config. The local build wrapper now reruns `expo prebuild --no-install --platform <ios|android>` before compiling and **fails closed** if the generated native runtime, signed manifest URL, release number, channel, certificate, or fingerprint differ from the descriptor. Do not bypass the wrapper with direct `expo run:ios`, `expo run:android`, or a generic EAS `production` build: existing ignored `ios/` and `android/` folders may still contain an older OTA URL. For Android find the resulting release APK under `apps/mobile/android/app/build/outputs/`; for iOS the device install is not a signed `.ipa` archive, so make and distribute a matching signed `.ipa` archive before running the verification helper. The generic `production` EAS build profile is **not** the self-hosted OTA binary.

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

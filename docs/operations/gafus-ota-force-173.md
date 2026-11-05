# GAFUS OTA Force Update — native 1.7.3

## Separation
- The Store Force Update gate uses `minimumSupportedVersion` and `storeUrl`; **not changed**.
- The **independent** OTA policy is stored in `MobileAppReleasePolicy`: `otaRequired` (default false), `otaVersion`, `otaPlatform`.
- Admin: **Флаги мобильного приложения → OTA-обновления**. Revision/CAS and ADMIN permissions are inherited from release flags.
- Public API `GET /api/v1/public/mobile-app` returns `ota: { required, version, platform, channel: "production" }`.
- Until new builds are published and the DB migration is applied, do **not** set `otaRequired=true`.

## Revisions
The native production build `1.7.3` embeds revision **0** from `src/shared/lib/otaRevision.generated.ts`. Leave this source at 0 for store builds; the guarded publisher temporarily changes and restores it. There is intentionally no `EXPO_PUBLIC_OTA_REVISION` build-profile variable.
OTA updates for this native runtime must be published with a positive `--ota-revision` argument to the guarded publisher. The publisher temporarily embeds a literal revision in `otaRevision.generated.ts`, then restores the native baseline of 0. This is intentional: with SDK 55, `--environment production` loads remote EAS variables and does **not** reliably include locally set `EXPO_PUBLIC_OTA_REVISION` values. Direct `eas update` remains compatible for optional OTA, but its bundle contains revision 0 and **must never** be designated a mandatory OTA.
For example `--ota-revision 1` means `1.7.3-ota.1`.
The forced gate checks iOS/Android, production channel, native appVersion, Expo runtimeVersion (must both be **1.7.3**) and the embedded revision. It does not try to install an incompatible runtime.

## Publishing
1. Publish the **1.7.3 native builds to stores** first, confirm availability on both platforms (the existing preflight enforces this).
2. Run preflight and release using a revision argument (this is intentionally not automatic):
   ```
   cd apps/mobile
   GAFUS_MOBILE_NATIVE_STORES_PUBLISHED=true GAFUS_MOBILE_NATIVE_PUBLISHED_VERSION=1.7.3 \
     eas env:exec production 'node ./scripts/publish-update-with-apptracer.mjs --branch main --environment production --ota-revision 1 --message "Кратко об изменениях"'
   ```
3. Confirm both platform-specific EAS update IDs are returned, app installs, launches with the new revision and public config is reachable.
4. Enter `1.7.3-ota.1` in admin and only then toggle **Обязательное OTA-обновление** on.
5. For rollback, turn mandatory flag off. Publish a fixed higher revision as needed; don't lower a minimum revision to roll back client code.

## Failure behavior
- Flag off → existing optional/background OTA logic still checks on cold start and foreground.
- Flag on → blocking screen, progress where Expo reports it, fetch/reload, retry for network or unpublished update.
- A persisted attempt marker prevents repeated automatic reload when an incorrect bundle was downloaded; manual retry still works.
- If backend/public config cannot be fetched, app is not blocked based on an unverified policy.
- Native store version enforcement takes precedence. No store update policy logic was changed.
- Admin does **not** validate EAS publication automatically: verify platform availability before enabling.

## Critical SDK 55 and Chat2 caveat
- EAS `production` channel currently maps to `main`, verified read-only on 2026-11-05.
- `EXPO_PUBLIC_CHAT2_API_ORIGIN` is **not present** in the server-side EAS production environment (read-only check, 2026-11-05). Release OTA bundles built with `--environment production` can omit this required variable and disable Chat2. The guarded publisher now rejects production OTA until EAS production `EXPO_PUBLIC_CHAT2_API_ORIGIN=https://api.gafus.ru`. It must be configured separately (no remote production change was made in this task).
- EAS server-side production environment also lacks `EXPO_PUBLIC_API_BASE_URL`; current API client safely defaults to `https://api.gafus.ru`, but explicit parity is preferable.
- EAS production `EXPO_PUBLIC_APP_VERSION` still reports `1.6.3` (read-only check 2026-11-05); update it to `1.7.3` before Store/OTA release so AppTracer reports the correct client version. The guarded OTA publisher refuses to publish if it still mismatches. The Expo runtime is controlled by `app.json`, not this tracer variable. Do not put tokens in this runbook.
- After publishing `1.7.3`, verify actual **installed** iOS and Android binaries report runtime `1.7.3` and channel `production` (not only `app.json`). The local native `ios/` and `android/` directories are gitignored and CNG may regenerate them.

## Old commands and safe usage
- Direct `eas update --branch main --environment production --message "..."` still publishes **optional** OTA to the correct channel, with embedded revision 0. Do not enable force-update for that unversioned OTA.
- Mandatory-capable OTA must use the guarded script and `--ota-revision N`, launched through EAS `env:exec production`; the script uploads AppTracer sourcemaps and requires store release attestations.
- Native directories are ignored by git (`apps/mobile/android`, `apps/mobile/ios`). Confirm the exact runtime/channel embedded in generated release artifacts before shipping.

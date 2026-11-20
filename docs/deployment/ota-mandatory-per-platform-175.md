# GAFUS 1.7.5+ — independent mandatory signed OTA for iOS and Android

## Why

`MobileAppReleasePolicy.otaRequired/otaVersion/otaPlatform` was a **single** legacy switch, so using it for iOS could replace Android's mandatory revision. From native runtime `1.7.5` onward, the protected authenticated `POST /api/v1/mobile-ota-tester/mandatory-policy` now reads **`MobileOtaMandatoryPolicy(platform, runtimeVersion)`**. No global iOS/Android toggle can substitute for this record.

For example, both records can coexist:

| Platform | Native runtime | Required | Minimum signed OTA |
|---|---|---:|---|
| Android | `1.7.5` | yes | `1.7.5-ota.6` |
| iOS | `1.7.5` | yes, **only after verified deployment and explicit admin command** | `1.7.5-ota.2` |

A native `1.7.6` can have its own policy and signing-compatible release; no `1.7.5` bundle is delivered to `1.7.6`. **Runtimes below `1.7.5` do not participate in this mandatory policy.** The old legacy config fields remain in the database for backward compatibility but are read-only in Admin; they do not authorize mandatory SDK57 OTA.

## Version-scoped publication

For a release registered by CI with a release title, use **Mobile releases → Release by app version**. Select the platform and verified native build. Its registered runtime determines the scope. The list shows signed revisions available to that build. Publish the revision first, then enable its mandatory policy with a separate action. The server checks the current publication and its signed assets again. The legacy mandatory policy tab remains available for deployment-managed revisions.

See [the multi-runtime payment OTA handoff](../payments/ota-yookassa-runtime-handoff-20261120.md) for supported profiles and the test matrix.

## Release semantics — important non-bypass requirements

- An authenticated installation cannot be blocked merely because the `required` flag is true. The server resolves the **exact same selected verified signed manifest** as its OTA endpoint for that installation, platform, runtime, fingerprint, signing key and rollout/tester entitlement.
- A client receives `required=true` only if the selected revision is at least the platform's configured minimum. An ordinary installation outside a 0% tester-only cohort must continue receiving its previous signed revision and **never be forced to download an update it cannot receive**.
- The gate blocks protected app content while a required OTA is missing; code-signature verification, download, applying and a native launch are required before it unlocks. If the policy request fails it stays closed and offers Retry. It cannot guarantee security against a compromised/repackaged device or eliminate the unauthenticated login screen, but it closes ordinary in-app bypasses. The physical iPhone test proved UI blocking, signed download, cold starts and fail-closed behavior with an isolated HTTPS test server.
- The admin's enabling command is denied until an active, non-paused READY signed deployment with verified native fingerprint and assets exists on the **same platform + runtime**. Controls have optimistic revision compare-and-swap, operation IDs, live admin-role check and an audit record. The admin does not receive a way to force an unverified/unavailable OTA.
- Disabling a platform's policy never changes the other platform's row. Read-only legacy UI directs operators to **Admin → Мобильные релизы → Обязательное OTA iOS / Android**.

## Safe deployment order

1. Review, test and commit this server/API/Admin/Prisma change; deploy it with migration `20261118101500_per_platform_mobile_ota_mandatory` **before** using the new Admin tab. The migration copies the currently enabled Android `1.7.5-ota.6` policy to its own row. It does **not** enable iOS if the legacy switch is Android-only.
2. Verify after deploy, read-only: Android `1.7.5` remains `required=true` at revision 6; iOS `1.7.5` is absent or `required=false`. Do not overwrite Android's row to configure iOS.
3. Build the intended signed iOS native distribution for runtime `1.7.5`, register it with exact fingerprint/certificate/source SHA, and verify the native candidate **only** with physical-device and matching distribution evidence. A locally re-signed Apple Development test `.app` is *not* Store/TestFlight distribution proof.
4. Publish a signed production iOS OTA through the approved source-pinned CI. Confirm Cloud.ru immutable assets, signature, update ID and READY state. Create and activate an iOS deployment at **0% public / tester-only**, without pausing it. Confirm the grant for `admin` and/or `asmtv1`.
5. In Admin → Мобильные релизы → Обязательное OTA iOS / Android choose `ios`, runtime `1.7.5`, and the *available* minimum signed revision, then enable. The API refuses to enable without a corresponding verified READY active deployment. Verify the iPhone gets `required=true`, full-screen gate and signed OTA, then returns to authorized Courses only after native launch; test a different non-tester installation remains unblocked. Keep Android required revision 6 unchanged.
6. Roll out only after production physical-iPhone QA. If intentionally increasing mandatory coverage, **expand delivery first**, confirm eligible signed manifests, then raise the minimum required revision; never set 100% requirement before signed delivery reaches that audience. Every future iOS and Android native runtime needs its own verified OTA deployment and policy row.
7. Check an offline/503 condition: once authenticated, protected content must remain inaccessible until the mandatory policy check succeeds. Keep login/authentication and legacy-store update policy separate.

## Local QA completed (2026-11-18)

- Prisma schema validates. Fresh isolated PostgreSQL migration preserved the Android `1.7.5-ota.6` policy with no automatic iOS requirement.
- Isolated real PostgreSQL integration: signed READY deployment prerequisite, paused/unverified asset rejection, iOS-only write and Android unchanged, stale revision rejection, non-admin denial, independent policy coexistence and audit all PASS.
- API mounted HTTP: 33 tests PASS, including platform isolation, old runtime exclusion and authenticated admin commands.
- Admin UI static render: 20 tests PASS. OTA server unit/regression: 9 tests PASS. TypeScript mobile-OTA server and Admin PASS; API full typecheck in isolated worktree differs by a pre-existing unrelated `chat-server/dist` test import; all new API source is otherwise clean when that unrelated test is excluded.
- No migration or new required-policy change applied to production. Public OTA rollout remains as before.
- Physical iPhone proof of signed OTA + mandatory gate is in `~/.config/gafus/ota/qa/ios175-sdk57-simulator-20261117/physical-iphone-20261118/PHYSICAL_IOS_MANDATORY_OTA_QA_20261118.md` (isolated mandatory-policy server; not proof of production publish).

# GAFUS — Voximplant video refactor: phase 1 compatibility gate

Date: 2026-10-12. Status: **IN PROGRESS — Expo/RN installed, native build and functional gates pending**.

This is the evidence-based entry gate for the Voximplant migration. Do not proceed to the domain model, booking refactor, or removal of Telemost before the Mobile gate in the supplied research has passed. All repository diagnostics were performed via AI Commander on `aic-mac`; no deployments or DB migrations were run.

## Current repository facts

- Repository: `/Users/asmtv1/Desktop/gafus1`, branch `main`, observed HEAD `05c5b67f`.
- Mobile `apps/mobile/package.json`: Expo `54.0.37`, React Native `0.81.5`, React `19.1.0`, Expo Router `~6.0.24`, `expo-dev-client` `~6.0.21`; no Voximplant React Native SDK installed.
- Native `apps/mobile/android` and `apps/mobile/ios` exist, `apps/mobile/ios/Pods` installed, Xcode `26.3`, Java and Android SDK available.
- `apps/mobile/app.json` has New Architecture enabled and Android CAMERA/RECORD_AUDIO permissions. `apps/mobile/ios/Podfile` currently has no Voximplant podspecs; iOS uses static frameworks with custom AppMetrica/Tracer integration.
- EAS has `development` and `development-device` profiles. Both native Android and iOS builds will need verification after upgrading Expo.
- The working tree has 387 modified/untracked files from other ongoing work, including modifications to consultation services, Prisma schema and root `pnpm-lock.yaml`. Never reset or overwrite these changes as part of the migration.

## External technical verification

- Voximplant React Native SDK is now split into `@voximplant/react-native-core` and `@voximplant/react-native-calls`; the official README requires React `^19.2.0`, RN `>=0.77 <1`, Android API 24, iOS 12. Expo 54's React 19.1 fails the declared requirement.
- Expo's official SDK 55 release notes pair React Native 0.83 with React 19.2 and change major versions for Expo SDK modules; SDK 55 also removes support for Legacy Architecture. Upgrading only React is not an acceptable substitute for an Expo upgrade.
- Official Voximplant README requires three iOS podspec dependencies for SDK 2.0.0: VoximplantCore, VoximplantCalls, VoximplantWebRTC (native version 3.3.0). Add them only after package installation and version verification.
- Voximplant's documented RN requirements are not proof that this GAFUS project builds/runs under Expo 55/New Architecture. Android/iOS builds, real SDK login, camera, microphone, conference/remote video and reconnect must be tested. No production adapter is authorized by compatibility claims alone.

References: https://github.com/voximplant/react-native-voximplant ; https://expo.dev/changelog/sdk-55 ; https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/

## Baseline checks (before modifications)

| Check | Result |
| --- | --- |
| `pnpm --dir apps/mobile typecheck` | PASS, exit 0 |
| `pnpm --dir apps/mobile lint` | PASS, exit 0, 291 pre-existing warnings |
| `pnpm --dir apps/mobile test` | PASS, 52 files, 226 tests |
| `git diff --check` | PASS at audit time |
| Outbound `curl` HTTPS to registry.npmjs.org, expo.dev, github.com, google.com | FAIL: SSL connection timeout |
| `npm view @voximplant/react-native-core ...` | FAIL: ECONNRESET |
| Locally installed Voximplant RN packages | Not found |

## Blocker and next actions

**Blocker 1 (environment, confirmed):** The Mac cannot establish outbound HTTPS connections to package registries, Expo, GitHub or Google. As of this audit, it is impossible to safely use `expo install` / `pnpm add`, resolve a complete lockfile, fetch CocoaPods, or compile a real upgraded native development build. Do not edit Expo package versions by hand or mark the compatibility gate complete.

**Blocker 2 (acceptance, future):** For functional connect/login/video testing, a staging Voximplant app, credentials with appropriate permissions and test devices/accounts will be needed. Do not embed credentials in source code, and do not use production credentials in an engineering spike.

Once the Mac's HTTPS connectivity is restored:
1. Preserve the current dirty tree and independently review the existing `pnpm-lock.yaml` changes; use `expo install` to align React, RN and Expo modules while upgrading from SDK 54 to 55.
2. Install both official Voximplant RN packages, record resolved versions, and add matching iOS podspecs; preserve existing custom native integrations.
3. Run Expo Doctor, TypeScript, ESLint and Mobile unit tests.
4. Run Android and iOS native dev builds (including real-device checks), then a temporary non-production video spike: connect/login, local preview, remote video, mute, camera switch, lifecycle/reconnect, release builds.
5. Remove any temporary engineering-only UI after acceptance. Mark phase 1 complete **only** after Android and iOS builds and functional checks pass, then begin phase 2.

Nothing here confirms native compatibility. No package/runtime source changes, migrations, database writes, deployment, commit or push have been performed by this phase-1 audit.


## Reattempt — implementation status (2026-10-12)

- Mac restored outbound HTTPS (HTTP 200 for npm/Expo/GitHub).
- Installed Expo `55.0.31`, React/React DOM `19.2.0`, React Native `0.83.10`, current Expo 55 native modules, Voximplant RN Core/Calls `2.0.0` in Mobile.
- `expo install --fix` revealed dynamic `app.config.js` cannot be rewritten automatically; added `expo-asset` and `expo-video` plugins manually to `app.json`.
- SDK55 config: removed `newArchEnabled`; moved notification icon into `expo-notifications` plugin; removed unsupported `expo-web-browser.experimentalLauncherActivity` in `app.config.js`.
- **Correction to research**: `apps/mobile/ios` and `apps/mobile/android` exist locally but are Git-ignored. Added checked-in `apps/mobile/plugins/withVoximplantIosPods.js` to regenerate three Vox SDK 3.3.0 podspec references on prebuild; three plugin tests pass. Do not rely on locally modified Podfile being committed.
- Removed **only three global pnpm overrides** in root package.json (`react`, `react-dom`, `@types/react`) to support separate Web 19.1 and Mobile 19.2 React versions. Kept user changes in root and lockfile.
- Synced `packages/analytics` RN/React devDeps with Mobile to avoid duplicate AppMetrica/RN native module. Adapted common `Input` ref type and paywall screen for React 19.2 TypeScript.
- Both `expo prebuild --platform android --no-install` and `expo prebuild --platform ios --no-install` succeeded without cleaning existing native directories.
- iOS `pod install --verbose` **PASSED**, 181 pods; VoximplantCore 3.3.0, VoximplantCalls 3.3.0 and VoximplantWebRTC 144.0.0 resolved. Local Podfile syntax OK.
- `expo install --check --pnpm`: PASS; Mobile and Analytics TypeScript: PASS; Mobile ESLint: PASS (297 warnings, 0 errors); Mobile Vitest: 52/52 files and 226/226 tests; Analytics: 4/4; iOS config plugin: 3/3; `git diff --check`: PASS.
- `expo-doctor`: **19/20 PASS**. Remaining warning is `react@19.1.0` and `react-dom@19.1.0` in `packages/queues/node_modules` (server code referenced transitively by core), versus Mobile's 19.2.0. Do NOT hide this check or change server package just to silence it without verifying real native build path.
- Android Gradle `:app:assembleDebug` first run (job `75220fbe450a360f`, `/tmp/gafus-vox-phase1-android-build.log`) failed after configuring Expo with `SDK location not found` because generated, Git-ignored `android/local.properties` was absent; this is a local environment issue, not a Voximplant compiler error. Confirmed existing SDK at `/Users/asmtv1/Library/Android/sdk`, wrote local-only `android/local.properties`. Retry job `5520f2b26b8b69a5` (`/tmp/gafus-vox-phase1-android-retry.log`) **failed** while resolving `ru.rustore.sdk:pushclient:1.0.0` (old RuStore Maven URL returned 404). Official new RuStore repository https://nexus-external.rustore.ru/repository/maven-rustore-exposed/ serves both `.pom` and `.aar` for that exact version with HTTP 200. Replaced URL in checked-in `apps/mobile/app.json` expo-build-properties, synced Android native project with `expo prebuild --no-install`, and removed obsolete URL left in local Git-ignored generated `gradle.properties` (incremental prebuild had accumulated both URLs). Android Gradle retry job `fff39a2fbc1bad85` is running; log `/tmp/gafus-vox-phase1-android-rustore-fixed.log`. **This third attempt is not yet accepted as PASS.**
- Android third attempt job `fff39a2fbc1bad85` **failed** at `:app:compileDebugKotlin` after 1015 tasks due SDK54 `expo.modules.ReactNativeHostWrapper` being removed in Expo55. Unlike the SDK issue, this was a real native source migration problem in existing ignored `android/app/.../MainApplication.kt`. All Voximplant Core/Calls Gradle Codegen, Java, resources passed in this attempt; RuStore Push passed after Maven URL fix.
- Verified modern native API **against the actual published `expo-template-bare-minimum@55.0.31` official template**: `expo.modules.ExpoReactHostFactory.getDefaultReactHost(context=applicationContext, packageList=...)`. Added checked-in idempotent Expo config plugin `apps/mobile/plugins/withExpo55ReactHost.js`, tests `withExpo55ReactHost.test.cjs` (3/3 PASS); registered in `app.json`. Adjusted the existing `withAppTracerNative.js` matching regex to accept both the old and new host property, preserving tracer settings and activity callbacks. Android `expo prebuild --no-install` **PASS**, generated `MainApplication.kt` uses new ReactHost factory, keeps AppTracer/lifecycle; SDK path and sole official RuStore Maven repo persist.
- **Android native Debug Build PASS**: job `acfb2bdff5b782bb` exited 0 after `BUILD SUCCESSFUL in 49s`, 799 Gradle tasks (86 executed, 713 up-to-date). APK `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`, size ~295 MiB, ZIP integrity PASS, APK signature v2 PASS, contains `lib/arm64-v8a/libvoximplantwebrtc.so`, 31 arm64 native libraries. Debug-only, not a production release, not tested on an actual device.
- iOS simulator **Xcode native Debug Build** job `e09a902254ac5019` started using `xcodebuild -workspace apps/mobile/ios/Gafus.xcworkspace -scheme Gafus -configuration Debug -sdk iphonesimulator -destination generic/platform=iOS\ Simulator`, signing disabled, index disabled, 2 parallel jobs, output `/tmp/gafus-vox-phase1-ios-simulator-build.log`, build products under `/tmp/gafus-vox-ios-derived`, disk safety guard to stop if free disk <6 GiB. **Build result currently pending**.
- First iOS simulator Xcode Debug build job `e09a902254ac5019` **failed exit 65** after compiling many pods: Voximplant RN Calls 2.0.0 source bug in `ios/CallModule/RNVICalls.mm` and `ios/VideoModule/RNVIVideo.mm`, fallback Swift include typo `react_native_voximplant_calls/react_native_voximplant_core-Swift.h` (nonexistent). Xcode output shows the actual generated Swift header `react_native_voximplant_calls/react_native_voximplant_calls-Swift.h` exists in pod framework. Only dependency source files affected, no app-code error.
- Added scoped, reproducible pnpm dependency patch `patches/@voximplant__react-native-calls@2.0.0.patch` fixing the two imports and registered it in root `package.json` `pnpm.patchedDependencies`; pnpm offline lockfile install and filtered Mobile install both PASS. Verified patched imports in physically installed package and patch hash in `pnpm-lock.yaml`. CocoaPods reinstall `pod install --no-repo-update` PASS (181 pods), SDK native pod versions unchanged. Avoid editing pnpm-managed package files without a persistent patch.
- iOS simulator Xcode build second attempt job `b44a11042df15d92` using existing derived data and disk guard (stops if free <6 GiB) currently running; log `/tmp/gafus-vox-phase1-ios-simulator-retry.log`; **no final iOS build PASS claimed yet**.
- Second iOS simulator Xcode Debug build job `b44a11042df15d92` **failed exit 65 at GAFUS Swift AppDelegate**, but the previously broken Voximplant `RNVICalls.mm` and `RNVIVideo.mm` now compile on **arm64 and x86_64**. Xcode reports Swift 6 ambiguous access for `import Expo` versus generated `internal import Expo` in `ExpoModulesProvider.swift`; GAFUS used legacy `@UIApplicationMain public class AppDelegate`.
- Verified official `expo-template-bare-minimum@55.0.31` AppDelegate uses `internal import Expo`, `@main`, and `class AppDelegate`. Added checked-in idempotent iOS Expo config plugin `apps/mobile/plugins/withExpo55IosAppDelegate.js` + 3 focused tests; registered in app.json. Extended existing `withAppTracerNative.js` class regex for legacy and Expo55 declarations. `expo prebuild --platform ios --no-install` **PASS**; generated AppDelegate modern imports/entry, AppTracer and service start preserved. All **9/9** plugin tests pass. No production or source data touched.
- Third iOS Simulator Xcode retry job `563c1000ef02aa3a`, log `/tmp/gafus-vox-phase1-ios-expo55-entrypoint-fixed.log`, **still running when recorded**. Reuses compiled Pods, signed code disabled, disk guard 6 GiB; no iOS app build PASS claimed until process exits 0.
- iOS simulator native compilation, real devices, Voximplant staging credentials and functional Web/Mobile conferencing: **NOT YET VERIFIED**. Phase 1 remains incomplete; **DO NOT START phase 2**.

No production publishing, Git commit/push, DB migrations, customer data writes/deletes, or Telemost cutover. The previous network blocker section above describes initial state only; it is now resolved.

## Follow-up — Web-first release readiness (2026-10-13)

Owner changed priorities: validate Web and prepare for a separate agreed push to `main`; defer additional Mobile functional/device work. **Web passing does not mean Voximplant consultation migration is complete.**

- Android Expo55 Debug APK built successfully (Gradle exit 0, integrity and v2 debug signature checked, Voximplant WebRTC native library included). No actual device test.
- iOS Simulator Expo55 Debug `.app` built successfully: AI Commander job `f372e05732265592`, exit 0, `** BUILD SUCCEEDED **` in `/tmp/gafus-vox-phase1-ios-link-finish.log`; universal app binary includes arm64/x86_64. No actual device, camera/mic or two-party call test. Mobile work deferred.
- Web `package.json`/pnpm-lock require React+React DOM 19.2.1, but earlier local symlinks resolved React 19.1.0. `pnpm install --filter @gafus/web --frozen-lockfile --ignore-scripts` repaired local symlinks, without changing the lockfile.
- First isolated Next build found incompatible duplicate `NextRequest` types from two Next.js pnpm peer instances (`@gafus/csrf` and Web). Reconciled only `@gafus/csrf` + `@gafus/auth` with the current frozen lockfile, so all three resolve exactly the same Next 15.5.24 instance. No security checks disabled, no user app route or CSRF logic altered. Web typecheck with generated isolated Next route types PASSED.
- **Web production build PASS** job `599b0e10b38e980d` exit 0, `/tmp/gafus-vox-web-prepush-build-fixed.log`. Next.js 15.5.24, 108 pages generated, CSS Autoprefixer warnings only. Opt-in `GAFUS_NEXT_DIST_DIR=.next-vox-prepush` avoids disruption to current `.next` dev instance. Generated Next type-path modifications in `apps/web/next-env.d.ts` and `apps/web/tsconfig.json` were selectively restored without overwriting pre-existing user changes. Isolated output ignored locally with `.git/info/exclude`.
- **HTTP smoke PASS** job `aac6046213f5c409`: built Next.js started temporarily at localhost:3198 and shut down; `/robots.txt`, `/sitemap.xml`, `/login`, `/register`: 200; protected `/questions`, `/consultations`, `/profile`, `/articles` unauthenticated: expected 307; GET on POST-only promo-code preview API: 405. No HTTP 500 in those probes; logged-in scenarios not yet tested.
- Core/Web business logic still uses **Telemost**, not implemented Voximplant Web/backend. There is no evidence yet for staging Vox two-party conference, reconnect or real-device camera/microphone acceptance.
- The Git worktree is extremely dirty (~404 modified/untracked paths, with thousands of untracked artifact files from multiple other changes); local `main` and `origin/main` match commit `05c5b67f`. Do not blindly `git add -A`, commit, push or change production. Prepare and review specific release scope before main push. This Web-only verification did not push, deploy or apply database migrations.

### Final Web regression checks (after dependency sync)

- AI Commander job `ba2975a58b227e44` **exit 0**. All command-level return codes are 0: `pnpm --dir apps/web typecheck`, `pnpm --dir apps/web test` (**50 test files, 208 tests**), `pnpm --dir apps/web lint` (**0 errors, 225 warnings**), `pnpm --dir packages/csrf typecheck`, `pnpm --dir packages/auth typecheck`, `git diff --check`. Logs `/tmp/gafus-vox-web-final-{tsc,test,lint}.log` and `/tmp/gafus-vox-{csrf,auth}-final-tsc.log`.
- Web production build job `599b0e10b38e980d` and HTTP smoke job `aac6046213f5c409` both exited 0. Git `main` push is **NOT performed**: this is a release gate, not permission to bulk stage unrelated worktree edits.
- No authorized Web end-to-end consultation was possible in this read-only local smoke. **Telemost remains production provider; no Voximplant Web or backend migration completed.**

# Stage 12 — exact-source native Metro bundle graph evidence

**PASS** for the requested local standard Metro JS graph residual.

Source SHA: `f77e07d0d608d51281b2d38653db79d663e9f4ac`. Separate branch `qa/stage12-metro-evidence-20261128`, worktree `~/Desktop/gafus-qa-stage12-metro-20261128`.
Source tree was clean before and after export/audit. No product sources changed.

## Isolation and provenance

- Source/lockfile equality: `git diff --quiet f77e07d0d -- apps/mobile packages pnpm-lock.yaml` in the final QA donor worktree returned 0 (donor HEAD 989584610). The local pnpm virtual store and unchanged package dist artifacts were APFS-cloned; workspace symlinks resolve inside the isolated worktree. No full dependency reinstall or unrelated build/test.
- Node 20.20.2, pnpm 10.12.4, Expo 57.0.33, React Native 0.86.3. Local Expo CLI invoked directly to avoid Corepack download and copied launcher NODE_PATH.
- Empty HOME, local TMPDIR, cleared environment, explicit offline/telemetry flags, no dotenv files, loopback API origins, and repo TCP/TLS blocking preload. No signing credentials, publish, OTA registration, production access, or device use.
- Standard local developer configuration (`APP_ENV=development`, native OTA disabled by the existing config), but production optimized JS (`NODE_ENV=production`, no --dev). No Hermes bytecode because the requested artifact is JS + external maps. Not a signed store/OTA artifact or the self-hosted special payment profile.
- First launch (both exit 1): empty HOME caused Corepack to attempt a pnpm download, denied by network guard. Direct local Expo CLI corrected this. Second launch (both exit 1): APP_ENV=production requires registered native descriptor and certificate; this protection was not changed or bypassed. Used the supported non-release profile for the final export.

## Actual successful command

```sh
cd ~/Desktop/gafus-qa-stage12-metro-20261128/apps/mobile
E=/tmp/gafus-stage12-metro-f77e07d0d
for p in ios android; do
  env -i HOME="$E/home" PATH="$PATH" TMPDIR="$E/cache" CI=1 \
    NODE_ENV=production APP_ENV=development EXPO_OFFLINE=1 \
    EXPO_NO_TELEMETRY=1 EXPO_NO_DOTENV=1 \
    EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:1 \
    EXPO_PUBLIC_CHAT2_API_ORIGIN=http://127.0.0.1:1 \
    EXPO_PUBLIC_TELEMETRY_ENABLED=false \
    NODE_OPTIONS="--require $PWD/../../scripts/qa/block-nonlocal-network.cjs" \
    node ./node_modules/expo/bin/cli export --platform "$p" \
      --no-bytecode --source-maps external --max-workers 2 \
      --output-dir "$E/$p" > "$E/$p-export.log" 2>&1
  echo "$?" > "$E/$p.exit"
done
python3 "$E/scan-metro.py" ios android
```

Sequential final export job `ab753803eb810495c26f4d4969f79abc3e966330a6b4eeaf`: exit 0; UTC 02:52:47–02:54:32 on 2026-11-28 (104.483 s total). iOS 48 s, Android 56 s (wall clock rounded). Graph audit job `2a7ba11525048cbe0916ee1fd77f2ba59eee5634b153697c`: exit 0.

## Results

| Platform | Export exit | JS / map pairs | Unique source entries | Workspace paths | Third-party paths | Metro virtual/context | Unresolved | Forbidden |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| ios | 0 | 1 | 3549 | 681 | 2863 | 5 | 0 | 0 |
| android | 0 | 1 | 3553 | 682 | 2866 | 5 | 0 | 0 |

All JS bundles are paired with an external v3 map with nonempty mappings and complete sourcesContent. Each map debugId appears in its JS bundle. Source paths are resolved against the exact worktree, including Expo server-root-relative /apps, /packages and /node_modules paths. All nonvirtual sources resolve to real files in this worktree. Actual package identities are taken from resolved workspace directories and last node_modules package segments (including scoped pnpm packages). No paths outside the worktree, missing or ambiguous sources. Five Metro-generated sources per platform: prelude, three named polyfills, and one app directory context. No filename substring scan of minified content used.

## Policy coverage

Policy: `scripts/check-core-client-boundary.mjs` at the source SHA. Exact forbidden sets are extracted from this file, plus explicit Auth server coverage consistent with the earlier stage-12 audit.

- Workspace forbidden: `@gafus/auth`, `@gafus/core`, `@gafus/logger`, `@gafus/mailer`, `@gafus/prisma`, `@gafus/queues`.
- All 32 `@gafus/*-server` workspace packages: `@gafus/achievements-server`, `@gafus/admin-reengagement-server`, `@gafus/admin-rewarded-ads-server`, `@gafus/article-server`, `@gafus/consent-server`, `@gafus/consultation-query-server`, `@gafus/consultation-server`, `@gafus/consultation-write-server`, `@gafus/course-progress-server`, `@gafus/course-read-server`, `@gafus/course-server`, `@gafus/entitlements-server`, `@gafus/exam-server`, `@gafus/feature-flags-server`, `@gafus/feed-server`, `@gafus/gafus-server`, `@gafus/gallery-server`, `@gafus/identity-write-server`, `@gafus/media-server`, `@gafus/mobile-intro-server`, `@gafus/mobile-ota-server`, `@gafus/notifications-server`, `@gafus/pets-server`, `@gafus/questions-server`, `@gafus/questions-write-server`, `@gafus/subscription-finance-server`, `@gafus/subscription-payment-server`, `@gafus/subscription-read-server`, `@gafus/subscription-trial-server`, `@gafus/subscription-write-server`, `@gafus/tracking-server`, `@gafus/trainer-ai-server`.
- External forbidden: `@prisma/client`, `bullmq`, `ioredis`, `nodemailer`, `pg`, `pino`, `prisma`, `sharp`, plus generated `.prisma` package paths.
- Node builtin source identities (node: and bare builtins) checked; client polyfill files are not the Node builtins themselves. This is artifact path membership, not a new static import or dynamic runtime audit.
- Actual workspace packages in both maps: `@gafus/analytics`, `@gafus/chat-media-quality`, `@gafus/consultation-shared`, `@gafus/core-client`, `@gafus/mobile`, `@gafus/types`.

**Zero matches in all checked forbidden categories on both platforms.**

## Artifact fingerprints

### ios

- JS: `ios/_expo/static/js/ios/widget-entry-d5f6d90dae63353f674e259cb7f62d7e.js` (7112381 bytes), SHA-256 `229feb827c20858db259795c09d5735ae59f750763668eebaa3cd1975ee5ef32`.
- Map: `ios/_expo/static/js/ios/widget-entry-d5f6d90dae63353f674e259cb7f62d7e.js.map` (23561938 bytes), SHA-256 `9e7f53cec91662748b045b0244caf0ddee9e5d79630823764970ae2b3ad66070`.
- DebugId: `34c09b70-c4a5-4d39-b5e5-4ee3697a6f9b`.

### android

- JS: `android/_expo/static/js/android/widget-entry-bf645c2077754665c47216159bcbaa23.js` (7204923 bytes), SHA-256 `11ad2ec5eb667fcef624a97a7b231616adf9d8dfa2cb084117853652e8cc8bef`.
- Map: `android/_expo/static/js/android/widget-entry-bf645c2077754665c47216159bcbaa23.js.map` (23762992 bytes), SHA-256 `932c2308fe9bb632a85bef4ac8c6b0c6b01d0e8a65abf8f8becb3601eb0e70e9`.
- DebugId: `ad2ad56f-0d72-46f1-a816-25d42233f63c`.

## Evidence location

Local private evidence root: `/tmp/gafus-stage12-metro-f77e07d0d/`. JS/maps are not tracked or uploaded. Files:

- `source-sha.txt` — SHA-256 `853a26e4ce4f7cee0c8d499492848f1726d575066d18cb036b521a5f3133f908`.
- `source-hashes.txt` — SHA-256 `a118fae4c35f80997f87ab3a7f2257be3b3dd8dcad3d7a2a6e5bfe4ac2ccdadc`.
- `toolchain.txt` — SHA-256 `b9be044df6df7df90463598a82b25ee8a0bb76c1b3644e1bc8b2e7e29fcf2c32`.
- `ios-export.log` — SHA-256 `afd9cf3b114719ad33bbee9ff133d1660fb1da8af0ac2469fea49d525c64acfc`.
- `android-export.log` — SHA-256 `185ce6b609d60ac85447181f2ba2520950a5202d3e62df69d0645a021c9ff79c`.
- `ios.exit` — SHA-256 `9a271f2a916b0b6ee6cecb2426f0b3206ef074578be55d9bc94f6f3fe3ab86aa`.
- `android.exit` — SHA-256 `9a271f2a916b0b6ee6cecb2426f0b3206ef074578be55d9bc94f6f3fe3ab86aa`.
- `ios-source-paths.txt` — SHA-256 `a809d8b967466919d1277329e613115785e5d95c77d3d84b36e18740161987b7`.
- `android-source-paths.txt` — SHA-256 `58ea56b37a3b7495c70af800e472e6b0fba815ce92897364afdf27f3e68ed358`.
- `scan-metro.py` — SHA-256 `c03f68d37d2c3250fadeb9bfa75315c5e8d1ca9930a228f59a1adc0ef9a5a170`.
- `graph-audit.json` — SHA-256 `23bae03986479e98997977dbe34bdc823efb8712dc9d343fd994a429158303f0`.
- `graph-audit.log` — SHA-256 `bb2d08b88e06a4d6b621a25e68ced0c152955bec3fc43763aaf1fee4eb245e11`.

The two initial launch error logs are retained as `*-launch-r1.log` and `*-launch-r2.log`.

Disposition: local standard Metro JS bundle dependency check PASS for both platforms on f77e07d0d. This report does not establish signed release/OTA integrity, alternate payment graph, native execution, or all other stage-12 gates. No other green checks repeated.

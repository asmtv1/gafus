# GAFUS iOS payments + signed self-hosted OTA: local checkpoint, 2026-11-12

## Scope and safety

- Git baseline: `0dcd18c13` (`gafus-refactor`, shared uncommitted worktree). No merge, push, production API deploy, EAS channel switch, App Store/TestFlight submission or OTA publication performed in this session.
- Payments: new iOS checkout is Apple IAP. Existing YooKassa **renewal cancellation** remains available for accounts with an older subscription; Web and Android continue their existing checkout. An optional private source-only recovery definition is **not** an OTA patch and cannot be published to an existing iOS binary.
- Self-hosted delivery: preview-only GitHub Actions workflow `.github/workflows/gafus-self-hosted-ota-preview.yml`, `@gafus/mobile-ota-server` persistence owner, protected HTTP, signed manifests, immutable assets, admin controls and native trust records.
- Own database changes are additive migrations `20261112180500_signed_mobile_ota_registry`, `20261112201500_mobile_ota_native_fingerprint_isolation` and `20261112211500_mobile_source_patch_operation_id`. Only the isolated local QA PostgreSQL received the last two migrations in this session.

## Changes confirmed in this continuation

1. iOS restore uses `restorePurchases()` (Apple StoreKit sync), then `getAvailablePurchases()` and server-verified signed JWS. Owner/auth-epoch checks block cross-account restoration. Product ID and nonempty token are enforced.
2. CI replay accepts a **different GitHub retry attempt** only when all other persisted identifiers, signed bytes, signature header, GitHub run ID, native release ID, AppTracer reference, checks and asset inventory exactly match. Changed metadata is an operation conflict.
3. Signed CDN asset paths must match `environment/gafus/runtime/platform/assets` for the native binary; even another validly signed platform's manifest is rejected.
4. Admin OTA candidates filter by the **actual native fingerprint**, not merely runtime/channel/signing key; PostgreSQL query exposes that fingerprint.
5. Private source patch registrations have a unique durable `operationId`; concurrent identical requests replay one persisted definition while conflicting inputs fail. The source-patch CLI performs preflight only in a disposable Git clone, never writes to the shared repository and never deploys an OTA.
6. Revoking native release trust stops new manifest delivery immediately, retaining the signed release history.
7. Preview OTA CI now fails closed without explicit nonproduction API/Chat2 origins and platform-specific + JS AppTracer public tokens. The signed Expo `extra.otaTracerVersion` is the exact update-specific source-map name, not an unreliable dynamic `process.env[key]` read; its EAS fallback remains intact.
8. Private source patch definition `operationId` is a unique indexed PostgreSQL column. Three simultaneous identical registration attempts return the same definition; reused operation ID with changed SHA is rejected.

## Local test evidence

| Check | Result / log |
| --- | --- |
| Mobile TypeScript | PASS, `/tmp/gafus-ota-typecheck-mobile-2110.log` |
| API TypeScript | PASS, `/tmp/gafus-ota-typecheck-api-2110.log` |
| OTA-server TypeScript and build | PASS, `/tmp/gafus-ota-typecheck-otaserver-2110.log` |
| Admin-panel TypeScript and production build | PASS; build job `23fc7734686fb43aac4740c2997bb285a026722684261a4f` |
| Architecture boundaries | PASS; job `df81bc1949a065f732224292ed93a326550c95b9c7ed4b6a` |
| Mobile subscription + tracer tests | 101 PASS / 17 files, `/tmp/gafus-ota-mobile-payment-tracer-2126.log` |
| API focused suite | 59 PASS / 5 files, `/tmp/gafus-ota-api-suite-2110.log` |
| Isolated real PostgreSQL OTA suite | 13 PASS / 2 files, `/tmp/gafus-ota-realpg-native-revoke.log` |
| Native fingerprint, source recovery, artifact and preview environment CLI tests | 25 PASS, `/tmp/gafus-ota-cli-contracts-2126.log` |
| iOS payment runtime import graph | PASS; 89 reachable local modules, no new YooKassa checkout, `/tmp/gafus-ios-payment-graph-final-20261112.log` |
| Actual Expo iOS/Hermes export with source maps | PASS, 116 assets, 7.1 MB `.hbc`, ~21 MB private `.map`, job `50a042826238350790200f00b7452303ee18624a86ed22d4` |
| Workflow YAML syntax | PASS, 12 preview steps; **workflow has not run on GitHub** |
| Prisma schema validation and additive migration on isolated QA DB | PASS; `gafus_ota_preview_qa` at `127.0.0.1:55673`, **not production** |

## Release blockers, not silently considered complete

1. Confirm Apple Sandbox on a **physical iOS device**, including new account with no `appleAppAccountToken`, StoreKit cancellation, timeout, restore, account switching, renewals, refunds and actual App Review submission. A Metro export is not a signed iOS binary.
2. Assemble an actual private recovery source patch from an **approved clean Git base** with SHA and applicability manifest; the preflight and registry currently have synthetic positive/negative tests, but no real customer-downloadable recovery file or new native review release exists.
3. Build and attest a **new native iOS and Android preview binary** with the self-hosted updates URL, matching native fingerprint, channel, runtime and pinned signing certificate. The existing EAS binaries must remain on EAS.
4. Configure a protected GitHub `ota-preview` environment (separate preview signing key and least-privilege CI/S3/AppTracer credentials), including required public variables `OTA_PREVIEW_API_BASE_URL`, `OTA_PREVIEW_CHAT2_API_ORIGIN`, `OTA_PREVIEW_TRACER_APP_TOKEN_JS`, `OTA_PREVIEW_TRACER_APP_TOKEN_IOS` and `OTA_PREVIEW_TRACER_APP_TOKEN_ANDROID`; then run the 12-step workflow on an approved clean commit. Its YAML validity alone is not evidence that live upload or callback succeeds.
5. Check actual Cloud.ru S3 and Beget CDN upload/readback, signed Expo protocol from physical devices, stable cache behavior, AppTracer source-map correlation, availability when offline and end-to-end rollback (new forward update ID). The isolated DB tests do not substitute for infrastructure/device QA.
6. Automatic admin-driven GitHub dispatch with durable job reconciliation, partial rollout/installation cohorts, direct telemetry of launched OTA, operational alerts and the full 33+5 / 18-scenario combined regression remain separate implementation/acceptance gates. Currently preview publication is deliberately explicit and 100%-or-paused; **do not promise 1%/10% rollout** without a stable installation cohort design.
7. Before merging, validate pnpm frozen lockfile and the combined API/Worker/Prisma compatibility against all other agents' current changes. The monorepo working tree is shared and several other files remain modified concurrently.

## Safe next command examples (local only)

```sh
pnpm check:core-boundaries
pnpm --filter @gafus/mobile typecheck
pnpm --filter @gafus/api typecheck
pnpm --filter @gafus/mobile-ota-server typecheck
pnpm --filter @gafus/admin-panel typecheck
node --test apps/mobile/scripts/source-recovery-preflight.test.mjs apps/mobile/scripts/native-source-fingerprint.test.mjs
```

Real PostgreSQL tests only with `GAFUS_OTA_TEST_ISOLATED=1`, `GAFUS_OTA_TEST_PG_URL` matching `DATABASE_URL` and the existing isolated `gafus_ota_preview_qa` database. Never aim these tests at a staging or production PostgreSQL instance.

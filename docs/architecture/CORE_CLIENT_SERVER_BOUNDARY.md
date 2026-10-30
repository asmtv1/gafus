# Core: server/client boundary

## Purpose

`@gafus/core` historically includes domain services, Prisma/database operations, queues, notification infrastructure, and presentation helpers in one package. Its root `index.ts` re-exports services and must **not** be imported at runtime by Web or React Native. Tree-shaking and `sideEffects: false` are not safety boundaries.

The incremental split introduces **`@gafus/core-client`**, a real independent workspace package whose runtime dependencies are restricted to `@gafus/types`, `zod`, `validator`, and `petrovich`. It may use standard browser/React Native JS APIs but never Prisma, Node builtins, logger, storage, queues or server services. Web and Mobile use this package directly. `@gafus/core` remains the server API and retains compatibility re-exports for migrated helpers. Never import `@gafus/core` root into a browser application.

## Current status (first wave, 2026-10-30)

21 production TypeScript modules (roughly 1,900 lines) are now in the dedicated client package. The first wave left approximately 55,000 source lines in Core; the second wave reduces that further by moving database-backed services. The **complete server-domain decomposition is not yet finished**. The contract and automated browser/server boundary are in place, so subsequent extractions can be performed independently.

## Migrated first wave

- `@gafus/core-client/utils` and `/utils/training`, `/utils/social`: age/date, pluralization, pets, social links, training status, video display/resume, transliteration. Server-specific `retry` **stays in Core**; pure name declension/personalization is in the client package.
- `@gafus/core-client/feed/publication-client`: platform-agnostic Moments publication state machine. HTTP/uploads are injected through adapters.
- `@gafus/core-client/media-delivery`: CDN health/status, URL classification, probe, short-lived outage circuit breaker. Signed URL and fallback authorization policies are unchanged.
- `@gafus/core-client/validation/{pet,auth-register,email-domain-suggestion}`: presentation-safe schema/validation. Prisma enum types are not imported by the client package. Compatibility wrapper in Core preserves the server's `RegistrationChannel` return type.
- `@gafus/core-client/auth/vk-auth-constants`: VK ID scope constants.

Existing Core subpaths delegate to the new implementations so server callers and tests keep their public imports. The migrated business logic is not duplicated. The split changes neither database contracts nor network endpoints.

## Dependency direction

```text
Web / Mobile  ->  @gafus/core-client  ->  @gafus/types
                                    ->  zod / validator
API / Workers ->  @gafus/core        ->  @gafus/core-client (compatibility layer)
                                    ->  prisma / queues / server packages
```

The dependency **must never point back** from `@gafus/core-client` to `@gafus/core` or `@gafus/prisma`, even via a type import. New UI-friendly logic belongs in `@gafus/core-client`; server orchestration stays in domain server packages or Core until extracted. API DTOs belong in `@gafus/types` or dedicated shared contract packages.

## Enforcement and checks

- `pnpm check:web-core-boundary` checks Web's legacy whitelist **and** the new client/server import boundary for Web, Mobile, and the shared client package.
- `pnpm --filter @gafus/core-client build`
- `pnpm --filter @gafus/core-client test`
- `pnpm --filter @gafus/core typecheck`
- `pnpm --filter @gafus/web-vite typecheck` and `pnpm --filter @gafus/web-vite build`
- `pnpm --filter @gafus/mobile typecheck`

The boundary script statically inspects production-source imports/re-exports/require/dynamic imports, rejects server imports in Web and Mobile, and rejects all unapproved runtime dependencies inside core-client. Test fixtures are excluded from runtime app scans. Keep direct package exports explicit; do not add wildcard exports.

## Next stages (without a flag-day move)

1. Inventory remaining `@gafus/core/services/*` consumers by area. Keep server public compatibility exports until each consumer is migrated.
2. Extract each cohesive domain service to its existing `@gafus/*-server` package (feed, gallery, questions, chat) or a new dedicated server package with no cyclic dependency. Move services and tests together, cut over API/workers, then remove only unused Core adapters.
3. Move stable DTOs/contracts to `@gafus/types`; use dependency injection for infrastructure ports. Keep authorization and storage writes exclusively server-side.
4. Verify independent build, typecheck and relevant tests after each domain. Delete old Core exports only after repository-wide import scans show zero consumers.

Do not bulk-move all service files: the Core package has a large set of coupled services and tests, and transactional behavior must remain unchanged. This boundary enables safe incremental migration and prevents new client/server coupling.

No production migrations, data writes, deployments, or operations on GAFUS Main are involved.

## Server domain decomposition — 2026-10-30, second wave

Six self-contained database/queue-backed domains were physically extracted from `packages/core/src/services` into **dedicated server-only workspaces**. The source of truth is now their own `src`; the old Core `index.ts` and individual module files are thin compatibility re-exports. There are no duplicate implementations.

| Core compatibility subpath | Canonical package | Responsibility |
| --- | --- | --- |
| `@gafus/core/services/achievements` | `@gafus/achievements-server` | Training dates, streaks, achievement statistics and achievement calculations |
| `@gafus/core/services/consent` | `@gafus/consent-server` | Consent logs, transactional registration consent and cleanup |
| `@gafus/core/services/mobileIntro` | `@gafus/mobile-intro-server` | Mobile first-run events and reporting |
| `@gafus/core/services/notifications` | `@gafus/notifications-server` | Timed step notifications, immediate push and delivery claims |
| `@gafus/core/services/appFeatureFlags` | `@gafus/feature-flags-server` | Feature flag rollout, mobile access switches and release controls |
| `@gafus/core/services/adminRewardedAds` | `@gafus/admin-rewarded-ads-server` | Rewarded-ads administrator reports |

The API achievements read composition and mobile-intro API routes now import the canonical packages directly. The consent cleanup Worker imports `@gafus/consent-server` directly. Other server callers continue to use the existing Core compatibility surface; they may be migrated independently once their tests and build configurations are updated. API authentication, response semantics, protected-data constraints and transaction boundaries were left unchanged. The notification implementation retains its existing queue behavior (including the Redis-dependent import initialization); this extraction does not redesign queue connection lifecycle.

### Dependency rules

- Each `*-server` package imports only its declared dependencies (`@gafus/prisma`, `@gafus/logger`, `@gafus/types`, `luxon` for rewarded ads, and `@gafus/queues` for notifications). No domain package imports `@gafus/core` or `@gafus/core-client`.
- The allowed direction is **API/Worker → domain-server → infrastructure**. Core → domain-server is permitted *only* for backwards compatibility.
- Web and Mobile must not import any `@gafus/*-server` entry point, Prisma, Node builtins, queues, or Core runtime modules. Existing client-side functionality is exclusively in `@gafus/core-client`.
- `pnpm check:core-boundaries` checks legacy Web boundaries, browser-safe module imports across Web/Mobile, and server-domain facade/dependency directions. Add the command to CI when adjusting pipeline configuration is authorized.

### Validation

- `pnpm --filter @gafus/{achievements-server,consent-server,mobile-intro-server,notifications-server,feature-flags-server,admin-rewarded-ads-server} build` (invoke each filter separately)
- All affected Core achievements, consent, notifications, feature-flags and rewarded-ads unit tests (Core adapters and canonical implementation)
- Selected API achievement/mobile-intro route tests and consent cleanup Worker test
- `pnpm --filter @gafus/core typecheck`, `pnpm --filter @gafus/api typecheck`
- `pnpm --filter @gafus/worker typecheck` (existing unrelated mailer attachment-path type error may block this global check; do not silently claim Worker PASS)
- `pnpm check:core-boundaries`

### Remaining extraction work

A large body of business logic still lives in Core, especially subscriptions/payments, training, feed, pets and consultations. Those domains have cross-service imports and transaction requirements. Before relocating each domain, first draw its dependency graph, break any Core back-reference into explicit interfaces/ports, migrate one consumer at a time, run unit/API tests and only then remove its Core shim. Do **not** move payment/media processing bulk code while old and new paths both run or touch production resources during architectural migration.

**Note:** All new server package manifests use `sideEffects: true` because Prisma, queue and logger modules can initialize resources at import time. They are not browser-safe or reliably tree-shakeable.

## Agent 1 follow-up — 2026-10-30

`@gafus/tracking-server` is the seventh extracted server-only domain. It owns re-engagement click tracking; the previous `@gafus/core/services/tracking/trackingService` path now re-exports it without modifying Prisma mutations, logging or return values. The server-domain boundary check enforces this facade and no dependency back to Core. Source and compatibility unit tests both pass (three cases each).

The browser boundary now traverses workspace runtime re-exports instead of trusting direct imports alone; the validator has seven fixture tests for allowed/type-only, Node builtin, package manifest and forbidden/transitive imports and participates in the existing `check:web-core-boundary` and `check:core-boundaries` scripts. Web/Mobile keep `@gafus/core-client` as an explicit runtime dependency and retain `@gafus/core` only for development/test type imports.

**Open cross-owner blocker:** `@gafus/types` root exports `./utils/logger`, which imports `@gafus/logger`; when `@gafus/core-client/utils/training` imports a runtime value from `@gafus/types`, this pulls a Node/Pino-oriented module into the browser graph. The strict check intentionally reports **FAIL** until the owner of `packages/types/src/index.ts` isolates this export. No blanket exception has been added. Type declaration output for `@gafus/types` must also be regenerated/verified by its owner; missing `dist/index.d.ts` initially prevented Core Client/Worker typechecks; after another agent refreshed this generated artifact, Core Client build and typecheck both passed. Worker was independently rechecked after the types rebuild and passed its full typecheck (exit 0). The sole remaining strict boundary check failure is the transitive logger route noted above. See `NIGHT_AGENT_1_2026-10-30.md` for verification evidence and the remaining Worker status.

## Browser-safe training entry and server-only logger — resolved 2026-10-30

The former `@gafus/types` root runtime barrel exported `./utils/logger`, which immediately imported Node/Pino-backed `@gafus/logger`. That polluted `@gafus/core-client` through the root training value import, including Web and Mobile transitive graphs. The **actual** dependency path was fixed rather than exempted:

- `@gafus/types/training-client` exposes narrow, browser-safe training status helpers, now used by `@gafus/core-client/utils/training`.
- The root `@gafus/types` barrel retains `Logger`/`LogMeta` as erased `export type`, not a runtime import. Its username availability and other business contracts remain unchanged.
- `@gafus/types/logger` remains an explicit **server-only** entrypoint providing unchanged synchronous `createLogger`, `silentLogger`, `shouldLog` helpers. All tracked workspace consumers were searched; none imported these helpers from the former root path. New server code should import this explicit entrypoint or the canonical `@gafus/logger` package. Root import of the runtime logger is intentionally no longer permitted.
- The dependency checker resolves and scans `@gafus/types` subpaths transitively, without allowing arbitrary server imports or omitting the root barrel. The additional regression fixture fails on a reintroduced root-logger import and passes on the safe training subpath.

`pnpm check:core-boundaries` now passes with **eight** extracted server domains. The eighth is `@gafus/admin-reengagement-server`: a read-only metrics service and its DTOs moved verbatim from Core; `@gafus/core/services/adminReengagement` remains a compatible adapter path. New package tests (including rate rounding), Core compatibility tests and the `/v1/admin/analytics` route contract tests pass without touching production data. See `NIGHT_AGENT_1_2026-10-30.md` for command exit codes and ownership limits.

## Standard enforcement and compatibility follow-up — 2026-10-30

`pnpm check:core-boundaries` is a prebuilt-dist-independent source gate, with both real workspace scans and 14 synthetic negative/positive fixtures. Root `pnpm test`, `test:all`, `typecheck`, `typecheck:all`, `build`, `build:all`, `build:ci`, and `build:packages` run it first and stop on failure. The standalone audit `scripts/check-types-logger-imports.mjs` forbids runtime logger-helper imports or bypasses from the private `@gafus/types` root **across all apps, packages, tests and scripts**, preserving `import type` and supporting server runtime via `@gafus/types/logger`.

**Migration contract:** Runtime logger utilities (`createLogger`, `silentLogger`, `shouldLog`) require `@gafus/types/logger`; erased types (`Logger`, `LogMeta`) remain available from root `@gafus/types`. The full monorepo AST scan found no legacy runtime consumers to migrate, including Admin, Telegram and Error Dashboard sources. Unknown external consumers of the private package are not claimed migrated.

All eight extracted server packages now expose classic Node10 `types`/`typesVersions` and conditional runtime/typing paths for every declared subpath. Source-side export completeness is checked before build; post-build TypeScript module resolution and Node runtime paths are verified separately. CI workflows invoking `pnpm turbo run` directly bypass the root script pre-gates; Agent 2 owns the required direct CI `pnpm check:core-boundaries` step. See `NIGHT_AGENT_1_2026-10-30.md` for the exact workflow integration request and check evidence.

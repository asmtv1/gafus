# Core appSubscription: first server read-model extraction — implementation handoff

**2026-10-30 · IMPLEMENTED (SOURCE/COMPAT PASSED, NEW OCI PENDING).** Coordinator explicitly dispatched this exact 157-LOC extraction after the frozen-image 9/49+runtime checkpoint. Agent 1 changed only the prescribed Types contract, Core facades, one new server package, scoped tests, Core workspace dependency and offline lock importers. The historical review/patch plan below is retained for traceability; no payment/authorization/provider/endpoint/transaction behavior, CI, Dockerfile/checker, or production resource was changed. Owner 2 owns post-change image packaging.

## Choice: one cohesive first package

**Extract the complete 157-line `packages/core/src/services/appSubscription/accessService.ts`** into one server-only package, provisionally `@gafus/subscription-read-server`, rather than splitting payment/finance or mixing in course policies. It implements exactly two public reads:

- `getAppSubscriptionAccess(userId, now = new Date()): Promise<AppSubscriptionStatusDto>`: owner-scoped status + composed chat/booking rights.
- `getCynologistEntitlements(userId, now = new Date())`: current database role and all active subscription periods, with overlap and trial rules.

They must stay together: `accessService.ts:148-156` passes the same `now` to the base status and entitlement reads through `Promise.all`. A tiny server package is justified by real API/Chat2/legacy consumers and a separate database-only read path, not by maximizing package count. It removes one leaf of Core; it is not a claim to remove the entire subscription service.

## Source graph and actual callers

A read-only TypeScript AST scan of all non-test files under `packages/core/src/services/appSubscription` found **35 runtime modules / 7,603 LOC** (`paymentService.ts` 2,893; `adminService.ts` 825), **zero local runtime import cycles**. The candidate is a leaf: runtime outbound **only** `@gafus/prisma` (`accessService.ts:1`), plus `import type { AppSubscriptionStatusDto } from './types'` (`:3`). `types.ts:1` in turn type-imports the plan code from `plans.ts`. Do not count that type-only edge as a runtime cycle; do not bring it across the future package boundary as a reverse dependency on Core.

**Inbound runtime:**

| Caller | Actual source / boundary |
| --- | --- |
| Core public barrel | `packages/core/src/services/appSubscription/index.ts:5` reexports `accessService`. Public import path remains `@gafus/core/services/appSubscription`. |
| Core payment cancellation | `paymentService.ts:15,1675-1690`: `await prisma.appSubscription.updateMany(...)` **before** `getAppSubscriptionAccess(userId)`; not inside a transaction. |
| Core legacy cynologist chat | `packages/core/src/services/cynologistChat/service.ts:11,63,130,150`: imports `getCynologistEntitlements` via `../appSubscription/accessService`. |
| API subscription status | `apps/api/src/routes/v1/app-subscription.ts:95-104`: Hono verified `c.get('user').id`, snapshot GET `/status`; no reconciliation. |
| API achievements | `apps/api/src/routes/v1/achievements.ts:29-41`: private access GET checks `hasActiveSubscription` if gating on; fail-closed `503`. |
| API offline download | `apps/api/src/routes/v1/offline.ts:90-108`: combines status with **separate plan-specific** offline entitlement. |
| API Chat2 | `apps/api/src/modules/chat2/service.ts:202,448`: checks `canUseCynologistChat`; must not import payments. |

**Web/Mobile:** Web `apps/web-vite/src/features/commerce/checkoutApi.ts:39-40`, achievements route and Mobile `apps/mobile/src/features/app-subscription/api/appSubscriptionApi.ts:86` consume `GET /api/v1/app-subscription/status`, not a Core runtime import. Web's `checkoutApi.ts` and `LegacyPremiumConnectedCard.tsx` import Core `types.ts` **type-only** through a relative path. Mobile defines its own wire `AppSubscriptionStatusDto`. No Web/Mobile client can directly import the new server package. **Worker:** its renewal, NPD, metrics, reconciliation and profit modules import other exports of the broad `@gafus/core/services/appSubscription` barrel; direct production calls to the *two selected getters* were **not found**. Preserve all Worker source imports; do not move the subscription barrel.

**Prospective package dependency DAG:** `@gafus/core → @gafus/subscription-read-server → {@gafus/prisma, @gafus/types}`; `@gafus/prisma → @gafus/logger`. Neither Prisma nor Types depends on Core. **Forbidden:** `subscription-read-server → @gafus/core` even `import type`, because it would introduce a Core/server package build cycle. Moving the status DTO type contract to shared Types is a necessary, bounded part of the future patch.

## Read-only and transaction boundaries — exact source proof

The candidate has **five read-query sites**: `prisma.user.findUnique` twice, `prisma.appSubscription.findMany` twice and `prisma.appSubscriptionPayment.findFirst` once. The status path (`accessService.ts:11-122`) reads the **current PostgreSQL role** before `ACTIVE/PENDING/PAST_DUE` rows ordered by `isLifetime DESC, currentPeriodEnd DESC`, chooses valid active or display-only pending, and on active reads the last `SUCCEEDED` payment. The entitlement path (`:125-145`) concurrently fetches role and **all** `ACTIVE` lifetime or unexpired periods with nested `SUCCEEDED` payment existence. The combined DTO is built in `Promise.all` (`:152-156`). There are **no** writes, `$transaction`, locks, provider API calls, NPD activity or background side effects. Missing rows return inactive, **not** optimistic access. A concurrent mutation may occur between these separate queries today; do **not** add a transaction, change isolation level, reuse a `tx` client or reconcile payments in the extraction.

Other subscription modules contain **26 syntactically explicit** `prisma.$transaction(...)` sites across 35 production files (including eight in `paymentService.ts`, four in `partnerService.ts`, two in `adminService.ts`, one in renewal finalization); this is a source marker count, not a full database transaction census. Transaction-owning and provider-writing services stay in Core. Especially `paymentService.ts:1675-1690`: the cancel **write** finishes before a separate snapshot read; moving the status read inside the mutation transaction would change observable behavior. API `GET /status` explicitly forbids payment/provider reconciliation on read (`app-subscription.ts:98-100`).

## Paid / FullAccess / BREAK / DIARY: policy matrix must not change

**The status DTO is not the FullAccess decision.** `checkCourseAccess` and `checkCourseAccessById` (`packages/core/src/services/course/courseService.ts:225-245`) delegate to `resolveCourseEntitlement`, not the subscription read model. `getTrainingDayWithMonetizedSteps` (`trainingService.ts:860-879`) uses that actual `hasAccess` for `fullAccess` / paid preview. Its write-side step completion at `:987-1004` has an independent private-course and BREAK/DIARY rule. These files are **outside the selected extraction**.

| Security case | Preserve source behavior and denial boundary |
| --- | --- |
| Public free / public paid | `contentAccess/policy.ts:33-47`: free public is open; paid public needs existing Premium/role/gating policy, not merely a status label. |
| Private course, private mini-guide | `contentAccess/policy.ts:33-39`, `contentAccess/index.ts:123-142`: explicit course assignment remains mandatory even with premium, partner, admin or Gafus. |
| BREAK/DIARY | `contentAccess/index.ts:5-6,143-146`, `trainingService.ts:987-1004`: remain **non-monetized** on public paid courses, including completion; **do not bypass private assignment**. |
| Daily, steps, Gafus | `contentAccess/index.ts:143-184`: daily is free; paid public step/guide/article target grants obey existing 7-day expiry and mini-guide shared-grant behavior. Unknown paid step types fail closed. |
| Article | `contentAccess/policy.ts:53-77`: article-specific active Gafus or premium, preserving platform parity. |
| Role / FullAccess | `contentAccess/policy.ts:24-47`, `contentAccess/index.ts:99-115`: privileged roles on their existing permitted paths; no role claim trusted from stale token, no authorization widening. |
| Subscription status | `accessService.ts:28-69`: `PENDING`, `PAST_DUE`, expired or revoked must never set `hasActiveSubscription=true`. `ACTIVE` + future end or lifetime does; partner status uses **current DB role**. |
| YooKassa trial vs paid | `accessService.ts:88-105,133-145`: saved card without `SUCCEEDED` payment is a trial; trial-only may be active for general status, **not** cynologist chat/booking. Concurrent paid 3-month period must survive trial overlap. |
| Cynologist chat / booking | `accessService.ts:137-145`: partner/lifetime or non-trial `MONTHLY/THREE_MONTHS` may chat; booking requires **non-lifetime paid `THREE_MONTHS`**. Weekly/two-week/trial alone do not grant. |
| Offline downloads | `apps/api/src/routes/v1/offline.ts:90-108`: active subscription **plus** plan inclusion; weekly/two-week do not become downloadable merely through `hasActiveSubscription`. |

Do **not** move or rewrite `contentAccess/index.ts`, `contentAccess/policy.ts`, `courseService.ts`, `trainingService.ts`, `rewardedCredits`, flags, Gafus grants, payment/provider/checkout, finance/NPD, Apple receipt, renewals, partner/admin, or authenticated API routes in this slice. These are regression **gate tests**, not extraction targets.

## Approved specification — applied to source after coordinator dispatch (historical pre-approval wording below)

**Prerequisite:** Agent 2 completes its current-snapshot Worker → API image builds with authoritative `exit_code=0` and Agent 1 independently verifies real image package guard, platform/digest and entrypoints. This patch would change the package graph, so the old frozen **9 packages / 49 exports** result would no longer be sufficient for a post-patch release. Do not patch while Agent 2 builds or stage anything automatically.

1. **Remove the only type boundary to Core, first.** New file `packages/types/src/contracts/appSubscriptionRead.ts` houses the **exact existing** status-only types `AppSubscriptionProvider`, `AppSubscriptionStatusCode`, `YookassaTrialUnavailableReason`, `AppSubscriptionStatusDto` (currently `packages/core/src/services/appSubscription/types.ts:3-40`) and the canonical four-plan `AppSubscriptionPlanCode` union. Add **type-only** exports to `packages/types/src/index.ts` (`export type {...} from './contracts/appSubscriptionRead'`; no runtime exports). In Core `types.ts`, import/re-export those status types from `@gafus/types` under **the same public names**, leaving `AppSubscriptionOfferDto` and all other contracts intact. In Core `plans.ts`, preserve `APP_SUBSCRIPTION_PLAN_CODES`, `PUBLIC_...`, promo codes, labels, intervals and prices **unchanged**; only import/re-export the `AppSubscriptionPlanCode` type from shared Types, with a *bidirectional compile-time equality test* that `typeof APP_SUBSCRIPTION_PLAN_CODES[number]` exactly matches the shared union. Include historical `WEEKLY`; public offers remain the original three. Do not make Types import Core. If a separate shared DTO contract is not approved, **do not create a server package that imports its types from Core**.
2. **Move the read leaf.** New `packages/subscription-read-server/src/accessService.ts` is the existing 157-line `accessService.ts` *without changing a branch/query/return field*. Replace exactly the original `import type { AppSubscriptionStatusDto } from './types'` with `import type { AppSubscriptionStatusDto } from '@gafus/types'`; keep `import { prisma } from '@gafus/prisma'`. `src/index.ts` only reexports `getAppSubscriptionAccess` and `getCynologistEntitlements`. New `package.json`, `tsconfig.json`, `vitest.config.ts` follow `packages/consent-server` TypeScript Node ESM compilation conventions; dependencies only `@gafus/prisma:workspace:*`, `@gafus/types:workspace:*`, and normal dev test/build tooling. `exports['.']` resolves built `./dist/index.js` / `./dist/index.d.ts`; no import from Core and no browser/client export or HTTP endpoint.
3. **Compatibility before cutover.** Replace **only** `packages/core/src/services/appSubscription/accessService.ts` contents with:

   ```ts
   export { getAppSubscriptionAccess, getCynologistEntitlements } from '@gafus/subscription-read-server';
   ```

   Keep `packages/core/src/services/appSubscription/index.ts:5` (`export * from './accessService'`) untouched, `packages/core/package.json`'s existing `./services/appSubscription` and `./plans` exports untouched, and the private relative imports from payment and cynologist chat untouched. Add only `@gafus/subscription-read-server:workspace:*` to `packages/core/package.json` dependencies; update `pnpm-lock.yaml` through a normal frozen-resolvable pnpm install after approval. API, Worker, Web, Mobile source imports and routes **do not move**. This preserves legacy imports and avoids two competing entitlement implementations. New runtime graph `core → subscription-read-server → types/prisma` must be **acyclic**.
4. **Do not drag payment writes through the new package.** No `paymentService`, `settingsService` (promo/Apple account token), `plans.ts` runtime implementation, `trialService`, content policy, Gafus target access, worker scheduler, DB migrations or provider connection changes. Prohibit introducing `prisma.$transaction` into status GET or using read model to decide private course assignment.

**File changes in the future implementation, exact scope:** one new server package directory (`src/index.ts`, relocated `src/accessService.ts`, `package.json`, `tsconfig.json`, `vitest.config.ts`, focused tests), one new shared type-only DTO file, `packages/types/src/index.ts` type export, two Core type facades (`appSubscription/types.ts`, `plans.ts` type reference only), one Core runtime facade (`appSubscription/accessService.ts`), one Core dependency line and lockfile. `packages/core/src/services/appSubscription/index.ts` and all consuming routes remain untouched. **If any unrelated source needs modifying, stop and expand the review before editing.**

## Required scoped tests / acceptance for that future patch

**Existing regression fixtures to preserve, not weaken:** `packages/core/src/services/appSubscription/__tests__/accessService.test.ts` (eight status scenarios), `cynologistEntitlements.test.ts` (provider × all four plans, trial overlap, trial denial, partner/lifetime, revocation); `packages/core/src/services/contentAccess/{policy,index}.test.ts`, `apps/api/src/routes/v1/{app-subscription.route,offline.route,g1-subscription-readonly.contract,g1-achievements-entitlement-jwt-guard.contract}.test.ts` where current filenames exist. Test statuses and error envelopes, not only that a function exists.

**Additional new-package negative fixtures:** expired end `<= now` fails, `PENDING/PAST_DUE` display-only, overlapping paid THREE_MONTHS not masked by YooKassa trial, no payment success ⇒ no chat/booking, lifetime-only cannot book, old partner JWT with revoked **DB** role cannot chat, missing owner never fabricates positive rights, `paidAt` and `nextChargeAt` keep old DTO, and the same caller-provided `now` reaches both queries. Assert exact `where` restrictions (`userId`, `status`, `currentPeriodEnd`, payment success), exactly zero mutations, zero provider imports and zero Core imports. Preserve the Core legacy-barrel and relative-module imported function identity/outputs. Add a compile-time canonical plan-code equality guard and an acyclic package import check.

**Commands after coordinator approval / source patch (NOT RUN now):**

```sh
pnpm --filter @gafus/types build
pnpm --filter @gafus/types test
pnpm --filter @gafus/subscription-read-server build
pnpm --filter @gafus/subscription-read-server test
pnpm --filter @gafus/core build
pnpm --filter @gafus/core exec vitest run \
  src/services/appSubscription/__tests__/accessService.test.ts \
  src/services/appSubscription/__tests__/cynologistEntitlements.test.ts \
  src/services/contentAccess/policy.test.ts src/services/contentAccess/index.test.ts --maxWorkers=1
pnpm --filter @gafus/api typecheck
pnpm --filter @gafus/worker typecheck
git diff --check
```

Then run the *specific* existing API `/status`, achievements, offline and chat2 authorization tests and Web/Mobile status DTO compatibility/typechecks; any real DB fixture must be **isolated, ephemeral and explicit**, never production. Only once the new source graph is accepted should Agent 2 schedule **new** sequential image builds and update/validate its image checker for the **new** runtime package/compiled-export count. Do not count the currently frozen 9/49 image guard as proof of the future ten-package graph. Do not run blanket full Web/Mobile suites without a dependency-driven reason.

**STOP conditions:** Any runtime Core import from new server pkg, TypeScript project cycle, changed plan-code union, changed transaction/write behavior, widened partner/role/private access, altered HTTP owner/auth boundary or altered BREAK/DIARY exemption is a **failed acceptance**, not an invitation to weaken expectations. Preserve current behavior until the coordinator makes a concrete decision; no patch in this documentation-only package.

## Pre-extraction characterization checkpoint — 2026-10-30, Agent 1 (baseline only)

**No subscription read-model implementation, Types, manifests, lockfile, config, Dockerfile or CI changes.** While Agent 2 independently builds the current API image, the narrow source coverage audit compared actual `accessService.ts:6-156` branches to `__tests__/accessService.test.ts` (8 tests), `__tests__/cynologistEntitlements.test.ts` (7 tests), and `g1-achievements-snapshot-access-source.test.ts` (7 tests). The existing tests already cover general expired access, empty history, PENDING/PAST_DUE, active/pending overlap, YooKassa saved-card trial status, successful payment timestamps, provider × plan rights, trial plus paid 3-month overlap, lifetime booking denial, partner and role revocation. **No copies of those matrix scenarios were added.**

**Concrete characterization gaps found and closed in exactly one new test-only file**, `packages/core/src/services/appSubscription/__tests__/accessService.readBaseline.g1.test.ts` (excluded from API/Worker Docker contexts by existing `**/__tests__/**` and `**/*.test.*` rules):

1. **Inclusive-time/null negative boundary:** Non-lifetime `ACTIVE` with `currentPeriodEnd === now` or `currentPeriodEnd=null` is *not* an active status and cannot grant chat/booking; no `SUCCEEDED` payment lookup is attempted. An earlier expired row was tested, but **exact equality and null** were missing. Assert both status and nested entitlement query restrictions, including DB `where.currentPeriodEnd.gt === now` and current `userId`.
2. **Composed snapshot vs independent overlapping rights:** status chooses an active YooKassa 3-month saved-card trial with **no** `SUCCEEDED` payment (thus `isTrial:true`, `paidAt:null`), while another paid 3-month row **with** a `SUCCEEDED` payment contributes valid chat/booking rights; the earlier overlap test called only `getCynologistEntitlements` and did not characterize the *combined DTO* under divergent status/rights. Assert exact `appSubscriptionPayment.findFirst` filter `{subscriptionId:'trial-status', status:'SUCCEEDED'}`, ordering and selected fields; assert nested entitlement `payments` filter status SUCCEEDED.
3. **Role revocation across complete DTO:** a DB `PARTNER` produces partner lifetime-style status and chat but *not* booking. Re-reading with the **same owner and clock** after current DB role becomes USER gives inactive status plus both rights false. Existing entitlement-only role-revocation test and separate status partner test did not establish this complete-DTO transition. No stale JWT role used, no writes.

New tests use a **synthetic** fixed `Date('2026-10-30T08:00:00.000Z')`, owner `synthetic-owner-A`, an explicit Prisma `findMany` mock that **models the SQL ACTIVE/currentPeriodEnd > now OR isLifetime predicate**, exact `user.findUnique({where:{id},select:{role:true}})` checks, exact candidate statuses `[ACTIVE,PENDING,PAST_DUE]`, `payments.status=SUCCEEDED`, and fail-closed denials; mock `updateMany` and `$transaction` must never be called. These are mock contract/characterization tests, **not real-DB transaction isolation tests**; no assertion of native-device, HTTP Hono or provider coverage is made.

**Authoritative focused OneShot:** `5a16a1a492e61804f01170d10486d3f5620d43df2fd2a489` = `state=exited, exit_code=0, timed_out=false`; invoked from `packages/core`:

```sh
pnpm exec vitest run --config vitest.config.ts \
  src/services/appSubscription/__tests__/accessService.readBaseline.g1.test.ts \
  src/services/appSubscription/__tests__/accessService.test.ts \
  src/services/appSubscription/__tests__/cynologistEntitlements.test.ts \
  src/services/appSubscription/g1-achievements-snapshot-access-source.test.ts \
  --maxWorkers=1
```

**Outcome: 4/4 test files PASS, 25/25 tests PASS** (`3 new + 8 original access + 7 original entitlement + 7 achievements snapshot`), no failed/skipped tests in these files. `git diff --no-index --check /dev/null <new-test-file>` **exit 0**. Read-only `shasum -a 256 packages/core/src/services/appSubscription/accessService.ts` remained `f09a015236f4d0cebac5a27bb7dc9624c68a51f9cea03bdb92645b64713a1ca0` before and after this QA task. No existing tests were weakened or edited. This improves evidence for the **unchanged** implementation handoff; it does not authorize its physical extraction.

**Next unchanged gate:** Agent 2 API image tag `gafus-refactor-agent2-api-local:20261030` still absent while its single `docker buildx build --platform linux/arm64 ...` was active at this snapshot; do not build/prune. Independently inspect and run the offline 9-package/49-export guard plus entrypoint syntax in the *actual finished API image* only after Agent 2 finishes and the image appears. Existing Worker image acceptance remains PASS on the current source snapshot. The full read-model extraction continues to wait for both images and coordinator dispatch.

## Approved source implementation checkpoint — Agent 1, 2026-10-30

**Coordinator approval received explicitly after frozen API+Worker arm64 OCI/Chat2 checkpoint. Physical extraction APPLIED; post-change OCI still PENDING owner 2.** This section supersedes the historical pre-dispatch “NOT APPLIED/NOT RUN” instructions above; it does **not** retroactively certify Docker images.

### Exact physical change set and frozen behavior proof

- `packages/subscription-read-server/src/accessService.ts`: **157 LOC**, exact copy of the prior `packages/core/src/services/appSubscription/accessService.ts` except `import type { AppSubscriptionStatusDto } from '@gafus/types'` (original was `./types`). **SHA-256 after restoring only that import:** `f09a015236f4d0cebac5a27bb7dc9624c68a51f9cea03bdb92645b64713a1ca0`, **exact old service SHA**. No changed condition, SQL `where`, rights matrix, clock, role, return DTO, billing transaction, provider, or side effect.
- New server `src/index.ts`, `package.json`, `tsconfig.json`, `vitest.config.ts`, `src/accessService.test.ts`. Runtime dependency names **only** `@gafus/prisma` and type-only `@gafus/types`; no `@gafus/core` import or dependency. `exports['.']` points to real compiled `dist/index.js`, `dist/index.d.ts`; no browser entrypoint. Node ESM isolated import and TypeScript build/typecheck PASS.
- Core old `appSubscription/accessService.ts`: one-line explicit re-export of the **two unchanged function identities** from `@gafus/subscription-read-server`. Core `appSubscription/index.ts` was **not edited** and still reexports `./accessService`; existing `@gafus/core/services/appSubscription` and `/plans` package exports remain unchanged. `paymentService.ts` and `cynologistChat/service.ts` still import the same old path. `packages/core/package.json` has the sole new workspace dependency. No new API/Worker/Web/Mobile imports or routes.
- `packages/types/src/contracts/appSubscriptionRead.ts` contains status-only DTO/provider/status/trial enums and canonical historical plan type union `WEEKLY | TWO_WEEKS | MONTHLY | THREE_MONTHS`. `packages/types/src/index.ts` adds only an `export type` (no runtime import). Core `appSubscription/types.ts` retains all other offer/promo contracts and compatibility type names via `export type` from Types; `plans.ts` retains all runtime definitions/prices/public offers and has compile-time **both directions** of union equality. All old Core DTO/plan types still resolve in a synthetic NodeNext ESM client.
- New scoped tests: `packages/core/src/services/appSubscription/__tests__/accessService.facade.g1.test.ts` tests identity of old Core path vs new package and old public barrel/export-map preservation; server `src/accessService.test.ts` checks negative owner/trial/lifetime/revoked role, exact SQL predicates, zero writes/transactions and forbidden backedges/provider code. **Original 25 baseline tests and contentAccess denials not modified.**
- `pnpm-lock.yaml`: two workspace importer-only changes (new `packages/subscription-read-server` importer with already locked installed versions; Core new `link:../subscription-read-server` dependency). An initial `pnpm install --offline --lockfile-only` failed because pnpm had no offline registry metadata for unrelated `vite@8.1.6` in `apps/admin-panel`; no registry/network calls were permitted. We therefore used the **already resolved** existing lockfile dependency versions/importer layout and validated the resulting YAML. Authoritative **`pnpm install --offline --frozen-lockfile --ignore-scripts --filter '@gafus/subscription-read-server...' --filter '@gafus/core'` exited 0**, selected **5/47 workspace projects**, lockfile resolution was **skipped**, generated Core/newpkg symlinks point to the new workspace. This is a real frozen/offline installation of the affected graph, not an unverified hand-edited lock.

### Exact post-change source, tests and NodeNext receipts

| Gate | Authoritative receipt | Result |
| --- | --- | --- |
| Types build + typecheck, emitted `dist/contracts/appSubscriptionRead.d.ts` / root `export type` | OneShot `2223359e1ec41eaad980995831c305e0d663db517f22da4e` | **exit 0** |
| New server build + typecheck, real Node ESM compiled import with both functions | `bdab64c4fa89df33c4a3a658c075e242e5ba7c16c714e0fb` | **exit 0** |
| New server negative+no-backedge/no-mutations tests | `c04bee8944617ec82fe32652fef603224efe27a8d5c47ecb`; repeat after added manifest backedge assertions `d22c7ae7d63d7ce96ce07880a24be8207fba8a710413be41` (test subprocess exit 0, overall wrapper exit 3 due to whitespace-check command handling; see below) | **4/4** |
| Core 25 frozen baseline + new facade identity + contentAccess policy/index | `c04bee8944617ec82fe32652fef603224efe27a8d5c47ecb` | **42/42** |
| Core built + typecheck | `2b60bbd0932a68a25e20a2ce199a9e3f1760ae66daf76494` produced both PASS markers; wrapper exit 1 due to subsequent parallel Node import diagnostic; sequential direct built import verified next | **build PASS / typecheck PASS** |
| NodeNext synthetic client compile using TS `module=NodeNext`, `moduleResolution=NodeNext`, strict type equality for old/new status DTO + plan code and both function entrypoints | ephemeral virtual `.mts` compiled in-memory, **no source file written** | **PASS** |
| Built Core facade identity vs built new server | sequential real Node ESM import, direct `node --input-type=module` exit 0 | **PASS** |
| API + Worker typechecks (sequential) | `3b24bbe61d3f8ebca8ace51c3f838836625f2da5078abfc9` | **both PASS / exit 0** |
| Targeted API route/status/achievements JWT and offline authorization | `3f9e7783aada711e7047bd830b6d4e81e7ccc28089b168d7` | **38/38** |
| Targeted Worker subscription plan/renewals/reminders | same OneShot | **32/32** |
| Local API `tsup` then Worker `tsc` sequential build, both entrypoints present | `4b735be719bb08dacfc31e1dc5235a745a74aa0cc3441d2a` | **both PASS / exit 0** |
| Scoped tracked/untracked whitespace + manifest DAG + on-disk compiled export targets | direct final command after fixing trailing blank in new shared type file | **PASS / exit 0** |

**Diagnostic transparency:** The first optional compiled Node ESM identity command used `Promise.all([import(Core),import(server)])` and hit Node 20 `ERR_INTERNAL_ASSERTION` in shared Prisma/logger ESM/CJS module initialization, after Core build and typecheck had already succeeded. **Sequential** real ESM module imports passed and function identity matched exactly, without source changes. A later wrapper with `git diff --no-index --check /dev/null <new-file>` returned a nonzero diff-status and detected one trailing blank line in the new shared type file; that whitespace was removed, and a dedicated tracked + all new files warning-free check returned exit 0. These transient wrapper failures are **not** package build, entitlement, or TypeScript failures.

### Post-change packaging contract — exact handoff to Agent 2 (Docker owner)

The **previous frozen** optimized images `gafus-refactor-agent2-{api,worker}-local:20261030` are strictly **old graph only**: `packages=9 compiled_exports=49`, with independent arm64 startup and Chat2 receipts. They cannot satisfy new source acceptance, even if the old tags still boot. The new source dependency closure is `Core → @gafus/subscription-read-server → {@gafus/prisma,@gafus/types}`. Existing `ci-cd/docker/check-runtime-package-exports.mjs` checks nine server packages and 49 exported subpaths; the new package has **exactly one** export key `.` with compiled `dist/index.js` and `dist/index.d.ts`. Therefore updated checker **must inspect ten server packages / fifty compiled export subpaths (10/50)**. The counting unit is `package.json.exports` **paths**, not two exported function symbols; do not report 10/51.

**Explicit request for Agent 2** (no Agent 1 Docker changes): after coordinating source-snapshot stability, add **`@gafus/subscription-read-server`** to the existing checker package array, preserve the realpath + JS/.d.ts on-disk checks, and do not weaken any existing nine guards. Confirm both optimized Docker contexts already use `!packages/**` plus exclusion of tests/secrets, so the new package directory should be included; verify pnpm frozen install and `pnpm deploy --legacy --prod --no-optional` carry the new Core-linked package. Build **new, distinctly tagged** API and Worker OCI images sequentially after current source graph is frozen, then independently check each finished image's `10/50`, OS/architecture, SHA-256 local image ID, nonroot user/CMD, `node --check` and real isolated startup without production connections. Use new tags: never overwrite or relabel the previous accepted 9/49 snapshots as post-change evidence. Let Agent 2 own checker, Dockerfile, image build, isolated Chat2 startup/real-message-flow revalidation; do not run competing builds/prune/stage/push/deploy.

**Residual gate:** Post-change actual API+Worker OCI **10/50 in-image checker, platform+syntax and isolated operational startup** not yet done. Production `linux/amd64`, external release QA, registry push and deployment remain separately unapproved. Source/test acceptance is not production release readiness.

**Exact checker hardening for Agent 2:** Current checker ends with `if (exportsChecked < 20)` (minimum coverage, **not exact cardinality**). The post-extraction 10/50 release gate must explicitly reject both fewer and unexpected additional packages/paths: keep the exact ten-name allowlist (including new server), assert `packages.length === 10` and `exportsChecked === 50` after checking real compiled targets, not merely print `10/50`. Restore strict `exit != 0` for a mismatch in both API and Worker image builds, with fresh image-local receipts. Agent 1 has **not** edited this checker.

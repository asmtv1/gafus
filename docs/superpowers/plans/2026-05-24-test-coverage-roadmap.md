# Test Coverage Roadmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the critical test gaps around API contracts, web/mobile state, payments, access control, and admin/trainer workflows, then document the rules that keep future refactors covered.

**Architecture:** Keep domain logic tests in packages, add contract tests at app boundaries, and avoid broad UI snapshot testing. Refactor only where a file cannot be tested without extracting a small pure adapter or handler.

**Tech Stack:** Vitest, Hono request tests, Next route handler tests, Zustand store unit tests, React Testing Library where needed, Playwright smoke tests only for end-to-end user paths.

---

## Current Coverage Snapshot

The repo already has solid service-level coverage in `packages/core`, plus focused tests in `packages/auth`, `packages/reengagement`, `packages/worker`, `packages/csrf`, `packages/video-access`, `packages/webpush`, and several mobile utility tests.

The highest risk gaps are:

- `apps/web`: no `test` script and no tests, despite critical API routes, server actions, payment callbacks, video access routes, and Zustand stores.
- `apps/api`: only 2 test files for large route files such as `auth.ts`, `training.ts`, `payments.ts`, `consultations.ts`, and `pets.ts`.
- `apps/admin-panel` and `apps/trainer-panel`: no tests around privileged workflows.
- Web/mobile stores: large state machines for training, timers, offline mode, push, courses, auth, and sync have little or no coverage.
- No repository-level policy that says which changes require tests.

## Coverage Policy To Add

Create a permanent standard in `docs/testing/TESTING.md` and a shorter checklist in `docs/testing/TEST_COVERAGE_POLICY.md`.

Required policy:

- Any change to auth, payments, subscription access, training progress, video access, consultations, pets, offline sync, push notifications, admin/trainer mutations, user deletion, or consent must include tests in the same PR.
- Pure business logic belongs in `packages/*` and must have unit tests beside the source file.
- HTTP route behavior must have contract tests covering status code, auth guard, validation failure, success response shape, and dependency error mapping.
- Zustand stores must test initial state, main mutation path, rollback/error path, persistence/hydration behavior when applicable, and cross-store side effects.
- UI components only need tests when they contain branching behavior, access decisions, form validation, payment/paywall behavior, or user-visible state transitions.
- Visual-only components do not require unit tests unless they guard critical actions.
- Every bug fix must add a regression test that fails before the fix.
- New packages/apps must expose `test` and, if they own critical logic, `test:coverage`.

## Files To Create

- `docs/testing/TEST_COVERAGE_POLICY.md`: concise testing rules and review checklist.
- `apps/web/vitest.config.ts`: web unit/route test config.
- `apps/web/src/test/test-utils.ts`: shared mocks for Next auth/session, Prisma, logger, request helpers.
- `apps/web/src/shared/stores/*.test.ts`: store tests for high-risk stores.
- `apps/web/src/app/api/**/route.test.ts`: contract tests for critical route handlers.
- `apps/web/src/shared/server-actions/*.test.ts`: tests for critical server actions that contain behavior beyond delegating to services.
- `apps/api/src/test/route-test-utils.ts`: Hono request helpers and auth mocks.
- `apps/api/src/routes/v1/*.route.test.ts`: API route contract tests.
- `apps/admin-panel/vitest.config.ts`: admin-panel test config.
- `apps/admin-panel/src/test/test-utils.ts`: admin auth and service mock helpers.
- `apps/trainer-panel/vitest.config.ts`: trainer-panel test config.
- `apps/trainer-panel/src/test/test-utils.ts`: trainer auth and service mock helpers.
- `apps/mobile/src/shared/stores/*.test.ts`: mobile store tests for auth, step, timer, offline, sync.
- `e2e/playwright.config.ts`: smoke test config if Playwright is not already present.
- `e2e/specs/*.spec.ts`: smoke paths for auth, course access, training progress, payments, consultation booking.

## Files To Modify

- `docs/testing/TESTING.md`: expand from mostly `@gafus/core` guidance into repo-wide testing docs and link `TEST_COVERAGE_POLICY.md`.
- `package.json`: add root scripts `test:web`, `test:api`, `test:mobile`, `test:apps`, and possibly `test:e2e`.
- `turbo.json`: make sure new `test` tasks include app test configs and do not require unnecessary builds for pure unit tests.
- `apps/web/package.json`: add `test`, `test:watch`, `test:coverage`.
- `apps/admin-panel/package.json`: add `test`, `test:watch`.
- `apps/trainer-panel/package.json`: add `test`, `test:watch`.
- `apps/mobile/vitest.config.ts`: include `src/**/*.test.tsx` if component behavior tests are added.
- `apps/api/vitest.config.ts`: include route test naming consistently, for example `src/**/*.route.test.ts`.

## Files Not To Delete

Do not delete existing unit tests in `packages/core`, `packages/auth`, `packages/reengagement`, `packages/worker`, or mobile app-subscription tests. They are useful and should remain the service-level safety net.

Only delete or move tests if a test is a duplicate of a new higher-level contract test and covers no unique behavior. If moved, keep the same assertions in the new location and mention the move in the commit.

## Refactor Rules

Refactor only when needed for testability:

- Extract pure decision logic from route handlers into small local helpers when mocking the full framework would make tests brittle.
- Keep extracted helpers beside the route or feature, not in a broad shared package, unless reused by both web and mobile.
- Do not move core business logic from `packages/core` into apps.
- Do not introduce global mocks that hide authorization or payment behavior.
- Prefer testing exported handlers through request objects. Test private helpers only when the route framework makes direct testing too fragile.

---

## Phase 1: Repository Test Standard

### Task 1: Add The Test Coverage Policy

**Files:**
- Create: `docs/testing/TEST_COVERAGE_POLICY.md`
- Modify: `docs/testing/TESTING.md`

- [ ] **Step 1: Create the policy document**

Add this structure to `docs/testing/TEST_COVERAGE_POLICY.md`:

```markdown
# Test Coverage Policy

## Mandatory Test Areas

Changes in these areas require tests in the same PR:

- auth and session handling
- payments, purchases, Apple IAP, YooKassa webhooks
- subscription access and paywall logic
- training progress, step status, exams, timers
- video manifest, segment, and playback URL access
- consultations, booking, cancellation, trainer availability
- pets, pet documents, prevention reminders
- offline cache, sync, downloaded course data
- push notifications and reminders
- admin and trainer mutations
- user deletion, consent, and personal data flows

## Required Test Level

- Pure functions: unit tests beside the source file.
- Services with Prisma or queues: mocked service tests in `packages/*/src/**/*.test.ts`.
- HTTP routes: contract tests for auth, validation, success, and error mapping.
- Zustand stores: state transition tests with persistence mocked.
- UI components: behavior tests only when they own branching or critical user actions.
- E2E: smoke tests for the few user journeys that combine auth, routing, server actions, and persistence.

## Pull Request Checklist

- [ ] I added or updated tests for changed critical logic.
- [ ] I added a regression test for each bug fix.
- [ ] I did not replace service tests with UI-only tests.
- [ ] I covered unauthorized and validation-failure paths for changed routes.
- [ ] I ran the narrow test command for changed code.
```

- [ ] **Step 2: Link the policy from the existing testing guide**

Add near the top of `docs/testing/TESTING.md`:

```markdown
> Репозиторный стандарт покрытия: см. `docs/testing/TEST_COVERAGE_POLICY.md`.
```

- [ ] **Step 3: Verify docs**

Run:

```bash
pnpm format:check docs/testing/TESTING.md docs/testing/TEST_COVERAGE_POLICY.md
```

Expected: either PASS or only formatting warnings fixed by:

```bash
pnpm prettier --write docs/testing/TESTING.md docs/testing/TEST_COVERAGE_POLICY.md
```

- [ ] **Step 4: Commit**

```bash
git add docs/testing/TESTING.md docs/testing/TEST_COVERAGE_POLICY.md
git commit -m "docs: define test coverage policy"
```

---

## Phase 2: Test Infrastructure For Apps

### Task 2: Add Vitest To `apps/web`

**Files:**
- Create: `apps/web/vitest.config.ts`
- Create: `apps/web/src/test/test-utils.ts`
- Modify: `apps/web/package.json`

- [ ] **Step 1: Add scripts to `apps/web/package.json`**

Add:

```json
{
  "scripts": {
    "test": "vitest run --config vitest.config.ts",
    "test:watch": "vitest --config vitest.config.ts",
    "test:coverage": "vitest run --coverage --config vitest.config.ts"
  }
}
```

- [ ] **Step 2: Create `apps/web/vitest.config.ts`**

```ts
import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/.next/**", "**/dist/**", "**/coverage/**"],
    setupFiles: ["./src/test/test-utils.ts"],
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@gafus/*": path.resolve(__dirname, "../../packages/*"),
    },
  },
});
```

- [ ] **Step 3: Create `apps/web/src/test/test-utils.ts`**

```ts
import { afterEach, vi } from "vitest";

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});
```

- [ ] **Step 4: Run empty web tests**

Run:

```bash
pnpm --filter @gafus/web test -- --passWithNoTests
```

Expected: command exits successfully with no tests found or all existing tests passing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/package.json apps/web/vitest.config.ts apps/web/src/test/test-utils.ts
git commit -m "test: add web vitest setup"
```

### Task 3: Add Vitest To Admin And Trainer Panels

**Files:**
- Create: `apps/admin-panel/vitest.config.ts`
- Create: `apps/admin-panel/src/test/test-utils.ts`
- Modify: `apps/admin-panel/package.json`
- Create: `apps/trainer-panel/vitest.config.ts`
- Create: `apps/trainer-panel/src/test/test-utils.ts`
- Modify: `apps/trainer-panel/package.json`

- [ ] **Step 1: Add scripts to both app package files**

Add to each `scripts` object:

```json
{
  "test": "vitest run --config vitest.config.ts",
  "test:watch": "vitest --config vitest.config.ts"
}
```

- [ ] **Step 2: Create matching Vitest configs**

Use this content for each app, changing only path aliases if the app already uses different local aliases:

```ts
import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/.next/**", "**/dist/**", "**/coverage/**"],
    setupFiles: ["./src/test/test-utils.ts"],
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@gafus/*": path.resolve(__dirname, "../../packages/*"),
    },
  },
});
```

- [ ] **Step 3: Add minimal test utils**

Use this content in both `src/test/test-utils.ts` files:

```ts
import { afterEach, vi } from "vitest";

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});
```

- [ ] **Step 4: Verify commands**

Run:

```bash
pnpm --filter @gafus/admin-panel test -- --passWithNoTests
pnpm --filter @gafus/trainer-panel test -- --passWithNoTests
```

Expected: both commands exit successfully.

- [ ] **Step 5: Commit**

```bash
git add apps/admin-panel apps/trainer-panel
git commit -m "test: add admin and trainer vitest setup"
```

### Task 4: Add Root Test Shortcuts

**Files:**
- Modify: `package.json`
- Modify: `turbo.json`

- [ ] **Step 1: Add root scripts**

Add:

```json
{
  "scripts": {
    "test:api": "pnpm --filter @gafus/api test",
    "test:web": "pnpm --filter @gafus/web test",
    "test:mobile": "pnpm --filter @gafus/mobile test",
    "test:apps": "pnpm --filter @gafus/api test && pnpm --filter @gafus/web test && pnpm --filter @gafus/mobile test"
  }
}
```

- [ ] **Step 2: Confirm `turbo.json` inputs include app tests**

Keep or add these inputs under `tasks.test.inputs`:

```json
[
  "src/**",
  "tests/**",
  "test/**",
  "**/*.{test,spec}.{js,ts,tsx}",
  "vitest.config.*",
  "package.json"
]
```

- [ ] **Step 3: Verify package scripts**

Run:

```bash
pnpm test:api
pnpm test:web
pnpm test:mobile
```

Expected: commands execute each app's Vitest suite.

- [ ] **Step 4: Commit**

```bash
git add package.json turbo.json
git commit -m "test: add app test shortcuts"
```

---

## Phase 3: API Contract Tests

### Task 5: Add Hono Route Test Utilities

**Files:**
- Create: `apps/api/src/test/route-test-utils.ts`
- Modify if needed: `apps/api/vitest.config.ts`

- [ ] **Step 1: Create request helpers**

```ts
export function jsonRequest(path: string, method: string, body?: unknown, headers?: HeadersInit) {
  return new Request(`http://localhost${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(headers ?? {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function bearerHeaders(userId = "user-1"): HeadersInit {
  return {
    authorization: `Bearer test-token-${userId}`,
  };
}
```

- [ ] **Step 2: Include route test files**

In `apps/api/vitest.config.ts`, make sure `include` contains:

```ts
include: ["src/**/*.test.ts", "src/**/*.route.test.ts", "__tests__/**/*.test.ts"],
```

- [ ] **Step 3: Run existing API tests**

Run:

```bash
pnpm --filter @gafus/api test
```

Expected: existing API tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/test/route-test-utils.ts apps/api/vitest.config.ts
git commit -m "test: add api route test utilities"
```

### Task 6: Cover Critical `apps/api` Routes

**Files:**
- Test: `apps/api/src/routes/v1/auth.route.test.ts`
- Test: `apps/api/src/routes/v1/training.route.test.ts`
- Test: `apps/api/src/routes/v1/payments.route.test.ts`
- Test: `apps/api/src/routes/v1/consultations.route.test.ts`
- Test: `apps/api/src/routes/v1/pets.route.test.ts`

- [ ] **Step 1: Auth route tests**

Cover:

- register validation failure returns `400`
- duplicate email/phone maps to conflict-style error
- login with invalid credentials returns unauthorized
- successful login returns the expected token/session shape
- password reset request never leaks whether the account exists
- VK auth missing consent/phone follows the documented branch

Run:

```bash
pnpm --filter @gafus/api test -- src/routes/v1/auth.route.test.ts
```

- [ ] **Step 2: Training route tests**

Cover:

- unauthorized request returns `401`
- invalid `courseType` or `day` returns `400`
- step start calls the service with current user id
- pause/resume/complete rejects another user's progress
- exam submit maps service validation errors correctly

Run:

```bash
pnpm --filter @gafus/api test -- src/routes/v1/training.route.test.ts
```

- [ ] **Step 3: Payments route tests**

Cover:

- create payment requires auth
- invalid course/payment payload returns `400`
- service success returns confirmation URL/payment id
- service errors do not expose secrets
- webhook signature/idempotency behavior is explicit

Run:

```bash
pnpm --filter @gafus/api test -- src/routes/v1/payments.route.test.ts
```

- [ ] **Step 4: Consultations route tests**

Cover:

- booking requires auth
- invalid slot returns `400`
- already booked slot maps to conflict
- cancellation respects ownership
- trainer availability mutations require trainer/admin permission

Run:

```bash
pnpm --filter @gafus/api test -- src/routes/v1/consultations.route.test.ts
```

- [ ] **Step 5: Pets route tests**

Cover:

- create/update validation
- list returns only current user's pets
- document upload/download requires pet ownership
- prevention entries require ownership
- delete maps not found and ownership failures correctly

Run:

```bash
pnpm --filter @gafus/api test -- src/routes/v1/pets.route.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/v1/*.route.test.ts
git commit -m "test: cover critical api route contracts"
```

---

## Phase 4: Web Route And Server Action Tests

### Task 7: Cover Web Payment, Video, Auth, And Training Routes

**Files:**
- Test: `apps/web/src/app/api/v1/payments/create/route.test.ts`
- Test: `apps/web/src/app/api/v1/payments/webhook/route.test.ts`
- Test: `apps/web/src/app/api/video/[videoId]/manifest/route.test.ts`
- Test: `apps/web/src/app/api/video/[videoId]/segment/route.test.ts`
- Test: `apps/web/src/app/api/auth/callback/vk-id/route.test.ts`
- Test: `apps/web/src/app/api/v1/training/step/start/route.test.ts`
- Test: `apps/web/src/app/api/v1/training/step/complete/practice/route.test.ts`

- [ ] **Step 1: Payment create route**

Cover auth required, invalid body, success response, and service error mapping.

Run:

```bash
pnpm --filter @gafus/web test -- src/app/api/v1/payments/create/route.test.ts
```

- [ ] **Step 2: Payment webhook route**

Cover valid event, invalid event, idempotency, and secret-free error response.

Run:

```bash
pnpm --filter @gafus/web test -- src/app/api/v1/payments/webhook/route.test.ts
```

- [ ] **Step 3: Video access routes**

Cover missing auth, denied access, manifest rewrite success, segment access success, and no path traversal.

Run:

```bash
pnpm --filter @gafus/web test -- src/app/api/video/[videoId]/manifest/route.test.ts src/app/api/video/[videoId]/segment/route.test.ts
```

- [ ] **Step 4: VK callback route**

Cover missing code, invalid state, successful existing user login, new user needs consent, and new user needs phone.

Run:

```bash
pnpm --filter @gafus/web test -- src/app/api/auth/callback/vk-id/route.test.ts
```

- [ ] **Step 5: Training step routes**

Cover unauthorized, invalid payload, service success, ownership failure, and validation failure.

Run:

```bash
pnpm --filter @gafus/web test -- src/app/api/v1/training/step/start/route.test.ts src/app/api/v1/training/step/complete/practice/route.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/api
git commit -m "test: cover critical web api routes"
```

### Task 8: Cover Critical Web Server Actions

**Files:**
- Test: `apps/web/src/shared/server-actions/auth.test.ts`
- Test: `apps/web/src/shared/server-actions/course.test.ts`
- Test: `apps/web/src/shared/server-actions/notifications.test.ts`
- Test: `apps/web/src/shared/server-actions/subscriptions.test.ts`
- Test: `apps/web/src/shared/server-actions/user.test.ts`

- [ ] **Step 1: Auth actions**

Cover register, login, password reset request, password reset confirm, email change, and account deletion auth checks.

Run:

```bash
pnpm --filter @gafus/web test -- src/shared/server-actions/auth.test.ts
```

- [ ] **Step 2: Course actions**

Cover favorites, reviews, paid access checks, and cache invalidation calls after mutations.

Run:

```bash
pnpm --filter @gafus/web test -- src/shared/server-actions/course.test.ts
```

- [ ] **Step 3: Notification and subscription actions**

Cover push subscription registration/removal, notification toggles, app subscription status, and unauthorized requests.

Run:

```bash
pnpm --filter @gafus/web test -- src/shared/server-actions/notifications.test.ts src/shared/server-actions/subscriptions.test.ts
```

- [ ] **Step 4: User actions**

Cover profile updates, username uniqueness, avatar update failure, and delete account service call.

Run:

```bash
pnpm --filter @gafus/web test -- src/shared/server-actions/user.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/shared/server-actions/*.test.ts
git commit -m "test: cover critical web server actions"
```

---

## Phase 5: Store And Client State Tests

### Task 9: Cover Web Zustand Stores

**Files:**
- Test: `apps/web/src/shared/stores/stepStore.test.ts`
- Test: `apps/web/src/shared/stores/timerStore.test.ts`
- Test: `apps/web/src/shared/stores/offlineStore.test.ts`
- Test: `apps/web/src/shared/stores/push/pushStore.test.ts`
- Test: `apps/web/src/shared/stores/courseStore.test.ts`

- [ ] **Step 1: Step store tests**

Cover initial state, start, pause, resume, complete, failed API rollback, and hydration from persisted state.

Run:

```bash
pnpm --filter @gafus/web test -- src/shared/stores/stepStore.test.ts
```

- [ ] **Step 2: Timer store tests**

Cover start, pause, resume, reset, completion callback, fake timer progression, and cleanup.

Run:

```bash
pnpm --filter @gafus/web test -- src/shared/stores/timerStore.test.ts
```

- [ ] **Step 3: Offline store tests**

Cover download state, update detection, failed download rollback, removal, and version mismatch.

Run:

```bash
pnpm --filter @gafus/web test -- src/shared/stores/offlineStore.test.ts
```

- [ ] **Step 4: Push and course store tests**

Cover permission state, subscribe/unsubscribe, unsupported browser branch, course filters, favorites, and cache updates.

Run:

```bash
pnpm --filter @gafus/web test -- src/shared/stores/push/pushStore.test.ts src/shared/stores/courseStore.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/shared/stores/**/*.test.ts apps/web/src/shared/stores/*.test.ts
git commit -m "test: cover web state stores"
```

### Task 10: Cover Mobile Stores And Critical Utilities

**Files:**
- Test: `apps/mobile/src/shared/stores/authStore.test.ts`
- Test: `apps/mobile/src/shared/stores/stepStore.test.ts`
- Test: `apps/mobile/src/shared/stores/timerStore.test.ts`
- Test: `apps/mobile/src/shared/stores/offlineStore.test.ts`
- Test: `apps/mobile/src/shared/stores/progressSyncStore.test.ts`
- Test: `apps/mobile/src/shared/stores/preventionSyncStore.test.ts`
- Modify: `apps/mobile/vitest.config.ts`

- [ ] **Step 1: Include TSX tests if component tests are added**

Set:

```ts
include: ["src/**/*.{test,spec}.{ts,tsx}"],
```

- [ ] **Step 2: Auth store tests**

Cover token set, token clear, user hydration, failed hydration, and logout reset behavior.

Run:

```bash
pnpm --filter @gafus/mobile test -- src/shared/stores/authStore.test.ts
```

- [ ] **Step 3: Training/timer store tests**

Cover step lifecycle, timer lifecycle, persistence, reset, and offline-safe branch behavior.

Run:

```bash
pnpm --filter @gafus/mobile test -- src/shared/stores/stepStore.test.ts src/shared/stores/timerStore.test.ts
```

- [ ] **Step 4: Offline and sync store tests**

Cover queued progress sync, retry, duplicate prevention, successful flush, failed flush, and prevention sync conflict.

Run:

```bash
pnpm --filter @gafus/mobile test -- src/shared/stores/offlineStore.test.ts src/shared/stores/progressSyncStore.test.ts src/shared/stores/preventionSyncStore.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/shared/stores/*.test.ts apps/mobile/vitest.config.ts
git commit -m "test: cover mobile state stores"
```

---

## Phase 6: Admin And Trainer Workflow Tests

### Task 11: Cover Trainer Panel Critical Mutations

**Files:**
- Test: `apps/trainer-panel/src/**/*.test.ts`
- Prefer specific targets after inspecting the app:
  - course create/update action tests
  - training day create/update/reorder tests
  - step create/update/reorder tests
  - video upload/access metadata tests

- [ ] **Step 1: Identify mutation entry points**

Run:

```bash
rg "server action|use server|export async function|POST|PUT|DELETE" apps/trainer-panel/src
```

Expected: list of action/route files that mutate course, day, step, or video data.

- [ ] **Step 2: Add tests for each critical mutation**

For every mutation file, cover unauthorized, wrong role, invalid payload, success, and service error mapping.

- [ ] **Step 3: Run trainer tests**

```bash
pnpm --filter @gafus/trainer-panel test
```

- [ ] **Step 4: Commit**

```bash
git add apps/trainer-panel
git commit -m "test: cover trainer critical mutations"
```

### Task 12: Cover Admin Panel Critical Mutations

**Files:**
- Test: `apps/admin-panel/src/**/*.test.ts`
- Prefer specific targets after inspecting the app:
  - user role/status changes
  - purchase/subscription adjustments
  - broadcast/reengagement actions
  - consultation admin listing/assignment actions

- [ ] **Step 1: Identify mutation entry points**

Run:

```bash
rg "server action|use server|export async function|POST|PUT|DELETE" apps/admin-panel/src
```

Expected: list of action/route files that mutate users, payments, subscriptions, broadcasts, or consultations.

- [ ] **Step 2: Add tests for each critical mutation**

For every mutation file, cover unauthorized, non-admin, invalid payload, success, and audit/cache side effects when present.

- [ ] **Step 3: Run admin tests**

```bash
pnpm --filter @gafus/admin-panel test
```

- [ ] **Step 4: Commit**

```bash
git add apps/admin-panel
git commit -m "test: cover admin critical mutations"
```

---

## Phase 7: Focused Refactors For Testability

### Task 13: Extract Route Helpers Only Where Tests Are Brittle

**Files:**
- Modify only route files that cannot be tested cleanly.
- Possible helper files:
  - `apps/web/src/app/api/v1/payments/webhook/parseWebhookEvent.ts`
  - `apps/web/src/app/api/video/[videoId]/validateVideoPath.ts`
  - `apps/api/src/routes/v1/training.helpers.ts`

- [ ] **Step 1: Before refactoring, write the failing route test**

The test must demonstrate why behavior is hard to verify through the route.

- [ ] **Step 2: Extract the smallest pure helper**

Example for path traversal:

```ts
export function isSafeRelativeSegmentPath(value: string) {
  return value.length > 0 && !value.includes("..") && !value.startsWith("/") && !value.includes("\\");
}
```

- [ ] **Step 3: Add helper unit tests**

```ts
import { describe, expect, it } from "vitest";
import { isSafeRelativeSegmentPath } from "./validateVideoPath";

describe("isSafeRelativeSegmentPath", () => {
  it("rejects traversal and absolute paths", () => {
    expect(isSafeRelativeSegmentPath("../secret.ts")).toBe(false);
    expect(isSafeRelativeSegmentPath("/secret.ts")).toBe(false);
    expect(isSafeRelativeSegmentPath("folder\\secret.ts")).toBe(false);
  });

  it("accepts expected HLS segment paths", () => {
    expect(isSafeRelativeSegmentPath("720p/segment-1.ts")).toBe(true);
  });
});
```

- [ ] **Step 4: Re-run route and helper tests**

```bash
pnpm --filter @gafus/web test -- src/app/api/video/[videoId]
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api apps/api/src/routes/v1
git commit -m "refactor: extract testable route helpers"
```

---

## Phase 8: E2E Smoke Coverage

### Task 14: Add Playwright Smoke Tests

**Files:**
- Create: `e2e/playwright.config.ts`
- Create: `e2e/specs/auth-course-training.spec.ts`
- Create: `e2e/specs/payment-access.spec.ts`
- Create: `e2e/specs/consultation-booking.spec.ts`
- Modify: `package.json`

- [ ] **Step 1: Add root e2e script**

```json
{
  "scripts": {
    "test:e2e": "playwright test -c e2e/playwright.config.ts"
  }
}
```

- [ ] **Step 2: Create smoke specs**

Cover only stable, high-value flows:

- login/register test user
- open available course
- start a training step and persist progress
- verify paid course access behavior
- book and cancel a consultation

- [ ] **Step 3: Keep e2e data isolated**

Use a dedicated test user from `.env.test` or a seed script. Do not run E2E against production data.

- [ ] **Step 4: Run locally**

```bash
pnpm test:e2e
```

- [ ] **Step 5: Commit**

```bash
git add e2e package.json
git commit -m "test: add critical e2e smoke coverage"
```

---

## Phase 9: Coverage Gates

### Task 15: Add Practical Coverage Thresholds

**Files:**
- Modify: `apps/web/vitest.config.ts`
- Modify: `apps/api/vitest.config.ts`
- Modify: `apps/mobile/vitest.config.ts`
- Modify: package configs only after baseline is known.

- [ ] **Step 1: Generate baseline coverage**

Run:

```bash
pnpm --filter @gafus/api test -- --coverage
pnpm --filter @gafus/web test:coverage
pnpm --filter @gafus/mobile test -- --coverage
```

- [ ] **Step 2: Add low but real thresholds**

Start with thresholds that match the baseline plus a small improvement target. Do not set unrealistic 80% gates on apps immediately.

Example:

```ts
coverage: {
  provider: "v8",
  reporter: ["text", "json", "html"],
  include: ["src/**/*.{ts,tsx}"],
  exclude: ["**/*.test.*", "**/*.d.ts", "**/.next/**"],
  thresholds: {
    lines: 20,
    functions: 20,
    branches: 15,
    statements: 20,
  },
},
```

- [ ] **Step 3: Document threshold policy**

Add to `docs/testing/TESTING.md`:

```markdown
Coverage thresholds for apps start from the measured baseline and increase only after critical tests are stable. Do not lower thresholds without explaining why in the PR.
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/vitest.config.ts apps/api/vitest.config.ts apps/mobile/vitest.config.ts docs/testing/TESTING.md
git commit -m "test: add app coverage baselines"
```

---

## Recommended Execution Order

1. Phase 1: policy and docs.
2. Phase 2: test infrastructure.
3. Phase 3: `apps/api` route contracts.
4. Phase 4: `apps/web` critical route and server action contracts.
5. Phase 5: web/mobile state stores.
6. Phase 6: admin/trainer privileged mutation tests.
7. Phase 7: small testability refactors only where blocked.
8. Phase 8: E2E smoke tests.
9. Phase 9: coverage thresholds.

## Definition Of Done

- `pnpm test:api` passes.
- `pnpm test:web` passes.
- `pnpm test:mobile` passes.
- `pnpm --filter @gafus/core test` still passes.
- Critical routes have auth, validation, success, and error tests.
- Critical stores have state transition and persistence tests.
- `docs/testing/TEST_COVERAGE_POLICY.md` exists and is linked from `docs/testing/TESTING.md`.
- New PR checklist language is present in the docs.
- No existing useful service tests were deleted.


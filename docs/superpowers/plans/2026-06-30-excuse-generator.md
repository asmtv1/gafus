# Excuse Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a public one-page `/otmazki` OpenRouter-powered excuse generator without persisting anything to the database.

**Architecture:** Add a focused feature module under `apps/web/src/features/excuse-generator` for shared situation data, OpenRouter request logic, normalization, and the client UI. Add a Next.js route handler at `apps/web/src/app/api/excuses/route.ts` that validates a situation id, rate-limits by IP, calls OpenRouter with the server-side `OPENROUTER_API_KEY`, and returns JSON. Add a public page at `apps/web/src/app/otmazki/page.tsx`.

**Tech Stack:** Next.js App Router, React client component, TypeScript, Vitest, CSS Modules, server-side `fetch`.

---

### Task 1: Server Generation Contract

**Files:**
- Create: `apps/web/src/features/excuse-generator/situations.ts`
- Create: `apps/web/src/features/excuse-generator/server.ts`
- Create: `apps/web/src/features/excuse-generator/server.test.ts`
- Create: `apps/web/src/app/api/excuses/route.ts`

- [ ] **Step 1: Write failing tests**

Create tests for invalid situation ids, OpenRouter calls, JSON parsing, and plausibility normalization.

- [ ] **Step 2: Run tests to verify RED**

Run: `pnpm --filter @gafus/web test -- src/features/excuse-generator/server.test.ts`
Expected: FAIL because the feature files do not exist yet.

- [ ] **Step 3: Implement server code**

Implement five allowed situations, prompt construction, OpenRouter call through `fetch`, JSON extraction, plausibility clamping to `35..96`, and short public error messages.

- [ ] **Step 4: Run tests to verify GREEN**

Run: `pnpm --filter @gafus/web test -- src/features/excuse-generator/server.test.ts`
Expected: PASS.

### Task 2: Public Page UI

**Files:**
- Create: `apps/web/src/features/excuse-generator/ExcuseGeneratorClient.tsx`
- Create: `apps/web/src/features/excuse-generator/excuse-generator.module.css`
- Create: `apps/web/src/app/otmazki/page.tsx`

- [ ] **Step 1: Implement client UI**

Build a client component with five situation buttons, generate button, loading/error states, generated text card, plausibility meter, tone label, and clipboard button.

- [ ] **Step 2: Add page metadata**

Create `/otmazki` page metadata and render the client component.

### Task 3: Verification

**Files:**
- Verify: `apps/web/src/features/excuse-generator/*`
- Verify: `apps/web/src/app/api/excuses/route.ts`
- Verify: `apps/web/src/app/otmazki/page.tsx`

- [ ] **Step 1: Typecheck web**

Run: `pnpm --filter @gafus/web typecheck`
Expected: PASS.

- [ ] **Step 2: Lint changed web source**

Run: `pnpm --filter @gafus/web lint`
Expected: PASS or only pre-existing unrelated issues.

- [ ] **Step 3: Build web if typecheck/lint are clean enough**

Run: `pnpm --filter @gafus/web build`
Expected: PASS.

# Separation Anxiety Screening Survey Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a separate 11-question yes/no separation-anxiety survey that shows one of three course recommendations in web and mobile course steps.

**Architecture:** Register the survey in the existing in-code survey template registry and store answers through the existing `SurveyResponse` flow. Put slug detection and recommendation calculation in a pure client-safe `@gafus/types` helper, then call that helper from both clients after submission and when rendering a saved response.

**Tech Stack:** TypeScript, Vitest, React, React Native, Next.js, Expo, Prisma-backed existing survey service.

---

### Task 1: Shared Survey Template And Recommendation

**Files:**
- Create: `packages/types/src/data/survey-screening.ts`
- Create: `packages/types/src/data/survey-screening.test.ts`
- Modify: `packages/types/src/data/index.ts`
- Create: `packages/core/src/services/survey/templates.test.ts`
- Modify: `packages/core/src/services/survey/templates.ts`

- [ ] **Step 1: Write failing tests for recommendation thresholds**

Add table-driven tests for `0`, `1`, `3`, `4`, and `11` `yes` answers. Assert the exact approved recommendation text and that unrelated survey slugs return `null`.

- [ ] **Step 2: Run the recommendation test and verify it fails**

Run: `pnpm --filter @gafus/core test -- screeningResult.test.ts`

Expected: FAIL because `screeningResult.ts` does not exist.

- [ ] **Step 3: Implement the pure recommendation helper**

Export `SEPARATION_ANXIETY_SCREENING_SLUG`, the three approved messages, and:

```ts
getSurveyScreeningResult(
  surveySlug: string,
  answers: Record<string, SurveyAnswerValue>,
): string | null
```

Count only values exactly equal to `"yes"`.

- [ ] **Step 4: Run the recommendation test and verify it passes**

Run: `pnpm --filter @gafus/core test -- screeningResult.test.ts`

Expected: PASS.

- [ ] **Step 5: Write a failing template registry test**

Assert that `separation-anxiety-screening` exists, has one section, has exactly 11 required `singleChoice` questions, and every question has only `{ value: "yes", label: "Да" }` and `{ value: "no", label: "Нет" }`.

- [ ] **Step 6: Run the template test and verify it fails**

Run: `pnpm --filter @gafus/core test -- templates.test.ts`

Expected: FAIL because the template is not registered.

- [ ] **Step 7: Register the new survey template**

Add the approved title, description, and 11 question texts to `surveyTemplates`. Keep existing `dog-home-alone` templates unchanged.

- [ ] **Step 8: Export and verify shared survey behavior**

Export the helper from `packages/types/src/data/index.ts`.

Run: `pnpm --filter @gafus/core test -- screeningResult.test.ts templates.test.ts`

Expected: PASS.

### Task 2: Web And Mobile Result Presentation

**Files:**
- Modify: `apps/web/src/features/training/components/SurveyStepBlock/SurveyStepBlock.tsx`
- Modify: `apps/mobile/src/features/training/components/SurveyBlock.tsx`

- [ ] **Step 1: Add recommendation calculation to both clients**

Import `getSurveyScreeningResult` from `@gafus/core/services/survey`. Calculate the result from the saved response when present, otherwise from current answers immediately after a successful submission response is stored.

- [ ] **Step 2: Render the result below the response status**

Show a clearly separated section titled `Результат анкеты` containing the exact recommendation returned by the shared helper. Do not show a result for other survey slugs or before submission.

- [ ] **Step 3: Verify client type safety**

Run:

```bash
pnpm --filter @gafus/web typecheck
pnpm --filter @gafus/mobile typecheck
```

Expected: both commands exit successfully.

### Task 3: Trainer Panel Survey Selection

**Files:**
- Modify: `apps/trainer-panel/src/features/steps/components/NewStepForm.tsx`

- [ ] **Step 1: Add the new selectable survey option**

Add:

```ts
{
  value: "separation-anxiety-screening",
  label: "Тревога расставания — быстрая диагностика",
}
```

Keep the two existing options unchanged.

- [ ] **Step 2: Verify trainer panel type safety**

Run: `pnpm --filter @gafus/trainer-panel typecheck`

Expected: command exits successfully.

### Task 4: Full Verification

**Files:**
- Verify all modified files.

- [ ] **Step 1: Run focused tests**

Run: `pnpm --filter @gafus/core test -- screeningResult.test.ts templates.test.ts surveyService.test.ts`

Expected: all focused tests pass.

- [ ] **Step 2: Run affected package typechecks**

Run:

```bash
pnpm --filter @gafus/core typecheck
pnpm --filter @gafus/web typecheck
pnpm --filter @gafus/mobile typecheck
pnpm --filter @gafus/trainer-panel typecheck
```

Expected: all commands exit successfully.

- [ ] **Step 3: Inspect the final diff**

Run: `git diff --check` and inspect `git diff --stat` plus the relevant file diffs. Confirm no database migration or unrelated file changes were introduced.

# Daily Course Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a trainer-panel flow that imports a month of daily course content from one markdown/text file and publishes the resulting schedule.

**Architecture:** Core owns parsing, validation, preview conflict detection, and transactional creation of steps, bundles, and schedules. Trainer-panel owns file upload UX, preview display, and confirmation action. Documentation defines the authoring format for future trainer notes.

**Tech Stack:** TypeScript, Next.js server actions, Prisma, Vitest, MUI.

---

### Task 1: Core Parser and Validation

**Files:**

- Create: `packages/core/src/services/dailyCourse/importParser.ts`
- Test: `packages/core/src/services/dailyCourse/dailyCourseImport.test.ts`

- [ ] Write failing parser tests for valid regular days, unsupported types, and examination questions.
- [ ] Implement minimal parser and validation helpers.
- [ ] Export parser types from `packages/core/src/services/dailyCourse/index.ts`.

### Task 2: Core Import Service

**Files:**

- Modify: `packages/core/src/services/dailyCourse/dailyCourseService.ts`
- Modify: `packages/core/src/services/dailyCourse/index.ts`
- Test: `packages/core/src/services/dailyCourse/dailyCourseImport.test.ts`

- [ ] Write failing service tests for preview conflicts and transactional import.
- [ ] Implement preview by querying schedules for parsed dates.
- [ ] Implement import by creating fresh `Step` rows, `DailyCourseBundle`, `DailyCourseBundleStep`, and published `DailyCourseSchedule`.

### Task 3: Trainer Panel Actions and UI

**Files:**

- Modify: `apps/trainer-panel/src/features/daily-course/lib/actions.ts`
- Modify: `apps/trainer-panel/src/app/(main)/main-panel/daily-course/DailyCourseClient.tsx`
- Create: `apps/trainer-panel/src/app/(main)/main-panel/daily-course/import/page.tsx`
- Create: `apps/trainer-panel/src/app/(main)/main-panel/daily-course/import/DailyCourseImportClient.tsx`

- [ ] Add preview and confirm server actions.
- [ ] Add import button from the course day schedule page.
- [ ] Build upload/preview/confirm UI with conflict replacement checkbox.

### Task 4: Operator Documentation and Verification

**Files:**

- Create: `docs/daily-course-import-format.md`

- [ ] Document file structure, supported types, duration rules, and examination question format.
- [ ] Run focused core tests.
- [ ] Run trainer-panel typecheck or lint where feasible.

### Task 5: Daily Course Cleanup

**Files:**

- Modify: `packages/core/src/services/dailyCourse/dailyCourseService.ts`
- Modify: `packages/core/src/services/dailyCourse/index.ts`
- Test: `packages/core/src/services/dailyCourse/dailyCourseImport.test.ts`
- Modify: `apps/trainer-panel/src/features/daily-course/lib/actions.ts`
- Modify: `apps/trainer-panel/src/app/(main)/main-panel/daily-course/DailyCourseClient.tsx`

- [ ] Write failing tests for cleanup preview and destructive cleanup safety.
- [ ] Implement cleanup preview with counts for schedules, bundles, safe daily-course steps, skipped daily-course steps linked to regular courses, and user progress.
- [ ] Implement cleanup in one transaction. Delete only `DailyCourseSchedule`, `DailyCourseBundle`, `DailyCourseBundleStep`, `DailyCourseUserTraining`, `DailyCourseUserStep`, and `Step` rows where `isDailyCourse = true`; never delete `Course`, `TrainingDay`, `StepOnDay`, or `Step` rows linked to regular days.
- [ ] Add trainer-panel actions for preview and confirmation with exact text confirmation.
- [ ] Add the "Очистить курс дня" UI to the daily course page with full and future-only modes.
- [ ] Run focused core tests and trainer-panel typecheck.

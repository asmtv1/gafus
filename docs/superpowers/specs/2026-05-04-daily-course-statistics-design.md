# Daily Course Statistics Design

## Goal

Add a separate trainer-panel section for detailed daily course statistics. Trainers need to open a specific daily course date and see only users who actually opened that day, including when they opened it, whether they started work, what they completed, and who opened the day without starting any step.

## Scope

In scope:

- Add a sidebar entry named `Статистика курса дня`.
- Add a page at `/main-panel/daily-course/statistics`.
- Let the trainer filter scheduled daily course days by date range and select one day.
- Show statistics only for `DailyCourseUserTraining` rows for the selected schedule.
- Count a user as `opened but not started` when a `DailyCourseUserTraining` exists and all related `DailyCourseUserStep` rows are `NOT_STARTED`.
- Show per-user step details for the selected schedule.

Out of scope:

- Listing users who never opened the selected day.
- Adding new tracking tables.
- Changing mobile or web user-facing daily course behavior.
- Exporting statistics.

## Data Model

The existing daily course progress tables are sufficient:

- `DailyCourseSchedule` identifies a concrete day.
- `DailyCourseUserTraining` means a user opened that concrete daily course day.
- `DailyCourseUserTraining.createdAt` is treated as the first opened timestamp.
- `DailyCourseUserTraining.status` is the day-level status.
- `DailyCourseUserStep` records per-step status, pause state, timer remainder, creation time, and update time.

No Prisma migration is required.

## Backend Design

Add a core service function in `packages/core/src/services/dailyCourse/dailyCourseService.ts`:

- `getDailyCourseScheduleStatistics(actor, { scheduleId })`

The function will:

- enforce the same daily course management permissions as schedule and bundle management;
- restrict non-elevated trainers to schedules whose bundle belongs to them;
- load the selected schedule, bundle, ordered bundle steps, user trainings, users, and user steps;
- return a DTO with schedule metadata, summary counts, and user rows.

Summary fields:

- `openedUsers`
- `startedUsers`
- `completedUsers`
- `openedWithoutStartUsers`

User row fields:

- `userId`
- `username`
- `openedAt`
- `status`
- `completedSteps`
- `totalSteps`
- `lastActivityAt`
- `currentStepTitle`
- `steps`

Step row fields:

- `bundleStepId`
- `stepId`
- `title`
- `order`
- `status`
- `paused`
- `remainingSec`
- `createdAt`
- `updatedAt`

## Trainer Panel Design

Add server actions in `apps/trainer-panel/src/features/daily-course/lib/actions.ts`:

- extend `getDailyCoursePageData` or add a statistics-specific loader for the date-range schedule list;
- add `getDailyCourseStatisticsPageData({ from, to, scheduleId? })`;
- reuse existing session and role checks.

Add page files:

- `apps/trainer-panel/src/app/(main)/main-panel/daily-course/statistics/page.tsx`
- `apps/trainer-panel/src/app/(main)/main-panel/daily-course/statistics/DailyCourseStatisticsClient.tsx`

Add a sidebar link in `apps/trainer-panel/src/app/(main)/main-panel/layout.tsx`:

- label: `Статистика курса дня`
- route: `/main-panel/daily-course/statistics`

The page UI will include:

- date range filter (`from`, `to`);
- schedule selector for the loaded range;
- summary cards for opened, started, completed, and opened-without-start counts;
- user table with opened time, status, completed step count, current/last active step, and last activity;
- expandable user rows for per-step detail.

If no schedule is selected, the page shows the schedule selector and an empty-state message. If the selected schedule has no opened users, it shows zero summary counts and an empty-state message.

## Error Handling

- Unauthenticated users redirect to login, matching current daily course pages.
- Users outside `TRAINER`, `ADMIN`, and `MODERATOR` redirect to `/main-panel`.
- Missing or inaccessible schedules return a not-found style empty state rather than exposing whether another trainer's schedule exists.
- Server action errors are logged through the trainer-panel logger and displayed as a generic load error.

## Testing

Add focused tests for the core service:

- counts users who opened, started, completed, and opened without starting;
- maps per-step statuses in bundle order;
- prevents a non-elevated trainer from reading another trainer's daily course schedule statistics.

Run package checks that cover the touched code, at minimum:

- daily course core service tests;
- trainer-panel TypeScript or lint check if available.

# Daily Course Statistics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a separate trainer-panel section that shows detailed statistics for a selected daily course day, limited to users who opened that day.

**Architecture:** Add a read-only statistics query to the existing daily course core service, expose it through trainer-panel server actions, then render a new `/main-panel/daily-course/statistics` page and sidebar link. The feature reuses existing `DailyCourseSchedule`, `DailyCourseUserTraining`, and `DailyCourseUserStep` data, so no Prisma migration is needed.

**Tech Stack:** TypeScript, Prisma models via `@gafus/prisma`, Next.js App Router, React client components, MUI, Vitest.

---

## File Structure

- Modify `packages/core/src/services/dailyCourse/dailyCourseService.ts`: define statistics DTO types and implement `getDailyCourseScheduleStatistics`.
- Modify `packages/core/src/services/dailyCourse/index.ts`: export the new service and DTO types.
- Modify `packages/core/src/services/dailyCourse/dailyCourseService.test.ts`: add unit coverage for summary counts, ordered step mapping, and trainer access control.
- Modify `apps/trainer-panel/src/features/daily-course/lib/actions.ts`: add `getDailyCourseStatisticsPageData`.
- Create `apps/trainer-panel/src/app/(main)/main-panel/daily-course/statistics/page.tsx`: server page with auth guard and query param parsing.
- Create `apps/trainer-panel/src/app/(main)/main-panel/daily-course/statistics/DailyCourseStatisticsClient.tsx`: client UI for date filter, schedule selector, summary cards, user table, and step detail accordion.
- Modify `apps/trainer-panel/src/app/(main)/main-panel/layout.tsx`: add the sidebar link.

---

### Task 1: Core Daily Course Statistics Service

**Files:**
- Modify: `packages/core/src/services/dailyCourse/dailyCourseService.test.ts`
- Modify: `packages/core/src/services/dailyCourse/dailyCourseService.ts`
- Modify: `packages/core/src/services/dailyCourse/index.ts`

- [ ] **Step 1: Extend the Prisma mock and import the new service in tests**

In `packages/core/src/services/dailyCourse/dailyCourseService.test.ts`, add `getDailyCourseScheduleStatistics` to the import list and add a mock for `dailyCourseSchedule.findFirst` reuse is already present. The existing `dailyCourseScheduleFindFirst` mock is enough for the new service.

```ts
import {
  getDailyCourseCandidates,
  getDailyCourseBundleStepCandidates,
  getDailyCourseDayWithUserSteps,
  getDailyCourseScheduleStatistics,
  getMoscowDateKey,
  getTodayDailyCourse,
  updateDailyCourseStepAndDay,
  upsertDailyCourseBundle,
  upsertDailyCourseSchedule,
} from "./dailyCourseService";
```

- [ ] **Step 2: Write failing test for summary counts and per-user rows**

Append this test inside `describe("dailyCourseService", () => { ... })`:

```ts
  it("builds daily course schedule statistics for users who opened the selected day", async () => {
    const openedAt = new Date("2026-05-04T08:00:00.000Z");
    const startedAt = new Date("2026-05-04T08:05:00.000Z");
    const completedAt = new Date("2026-05-04T08:10:00.000Z");

    mocks.dailyCourseScheduleFindFirst.mockResolvedValue({
      id: "schedule-1",
      date: new Date("2026-05-04T00:00:00.000Z"),
      isPublished: true,
      bundle: {
        id: "bundle-1",
        title: "Morning routine",
        authorId: "trainer-1",
        stepLinks: [
          {
            id: "bundle-step-1",
            order: 0,
            step: { id: "step-1", title: "Warm up" },
          },
          {
            id: "bundle-step-2",
            order: 1,
            step: { id: "step-2", title: "Main drill" },
          },
        ],
      },
      userTrainings: [
        {
          id: "training-opened",
          userId: "user-opened",
          status: "NOT_STARTED",
          currentStepIndex: 0,
          createdAt: openedAt,
          updatedAt: openedAt,
          user: { id: "user-opened", username: "opened_only" },
          steps: [],
        },
        {
          id: "training-started",
          userId: "user-started",
          status: "IN_PROGRESS",
          currentStepIndex: 1,
          createdAt: startedAt,
          updatedAt: completedAt,
          user: { id: "user-started", username: "started_user" },
          steps: [
            {
              id: "user-step-1",
              bundleStepId: "bundle-step-1",
              status: "COMPLETED",
              paused: false,
              remainingSec: null,
              createdAt: startedAt,
              updatedAt: completedAt,
            },
            {
              id: "user-step-2",
              bundleStepId: "bundle-step-2",
              status: "IN_PROGRESS",
              paused: true,
              remainingSec: 45,
              createdAt: startedAt,
              updatedAt: startedAt,
            },
          ],
        },
      ],
    });

    const result = await getDailyCourseScheduleStatistics(
      { id: "trainer-1", role: "TRAINER" },
      { scheduleId: "schedule-1" },
    );

    expect(result).toMatchObject({
      scheduleId: "schedule-1",
      mskDate: "2026-05-04",
      title: "Morning routine",
      totalSteps: 2,
      summary: {
        openedUsers: 2,
        startedUsers: 1,
        completedUsers: 0,
        openedWithoutStartUsers: 1,
      },
    });
    expect(result?.users).toHaveLength(2);
    expect(result?.users[0]).toMatchObject({
      userId: "user-started",
      username: "started_user",
      status: "IN_PROGRESS",
      completedSteps: 1,
      totalSteps: 2,
      currentStepTitle: "Main drill",
    });
    expect(result?.users[0]?.steps).toEqual([
      expect.objectContaining({
        bundleStepId: "bundle-step-1",
        title: "Warm up",
        status: "COMPLETED",
      }),
      expect.objectContaining({
        bundleStepId: "bundle-step-2",
        title: "Main drill",
        status: "IN_PROGRESS",
        paused: true,
        remainingSec: 45,
      }),
    ]);
    expect(result?.users[1]).toMatchObject({
      userId: "user-opened",
      username: "opened_only",
      status: "NOT_STARTED",
      completedSteps: 0,
      currentStepTitle: "Warm up",
    });
  });
```

- [ ] **Step 3: Write failing test for trainer access control**

Append this test inside the same describe block:

```ts
  it("does not expose another trainer's daily course statistics to a non-elevated trainer", async () => {
    mocks.dailyCourseScheduleFindFirst.mockResolvedValue(null);

    const result = await getDailyCourseScheduleStatistics(
      { id: "trainer-1", role: "TRAINER" },
      { scheduleId: "schedule-2" },
    );

    expect(result).toBeNull();
    expect(mocks.dailyCourseScheduleFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "schedule-2",
          bundle: { authorId: "trainer-1" },
        },
      }),
    );
  });
```

- [ ] **Step 4: Run tests to verify they fail**

Run:

```bash
pnpm --filter @gafus/core test -- dailyCourseService.test.ts
```

Expected: FAIL because `getDailyCourseScheduleStatistics` is not exported or not implemented.

- [ ] **Step 5: Add DTO types and service implementation**

In `packages/core/src/services/dailyCourse/dailyCourseService.ts`, add these interfaces near the existing daily course DTO interfaces:

```ts
export interface DailyCourseStatisticsStepDto {
  bundleStepId: string;
  stepId: string;
  title: string;
  order: number;
  status: TrainingStatus;
  paused: boolean;
  remainingSec: number | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface DailyCourseStatisticsUserDto {
  userId: string;
  username: string;
  openedAt: Date;
  status: TrainingStatus;
  completedSteps: number;
  totalSteps: number;
  lastActivityAt: Date;
  currentStepTitle: string | null;
  steps: DailyCourseStatisticsStepDto[];
}

export interface DailyCourseScheduleStatisticsDto {
  scheduleId: string;
  mskDate: string;
  bundleId: string;
  title: string;
  totalSteps: number;
  summary: {
    openedUsers: number;
    startedUsers: number;
    completedUsers: number;
    openedWithoutStartUsers: number;
  };
  users: DailyCourseStatisticsUserDto[];
}
```

Then add this function before `getDailyCourseScheduleRange`:

```ts
export async function getDailyCourseScheduleStatistics(
  actor: DailyCourseActor,
  input: { scheduleId: string },
): Promise<DailyCourseScheduleStatisticsDto | null> {
  assertCanManageDailyCourse(actor);

  const schedule = await prisma.dailyCourseSchedule.findFirst({
    where: {
      id: input.scheduleId,
      ...(isElevated(actor) ? {} : { bundle: { authorId: actor.id } }),
    },
    select: {
      id: true,
      date: true,
      bundle: {
        select: {
          id: true,
          title: true,
          authorId: true,
          stepLinks: {
            orderBy: { order: "asc" },
            select: {
              id: true,
              order: true,
              step: {
                select: {
                  id: true,
                  title: true,
                },
              },
            },
          },
        },
      },
      userTrainings: {
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          userId: true,
          status: true,
          currentStepIndex: true,
          createdAt: true,
          updatedAt: true,
          user: {
            select: {
              id: true,
              username: true,
            },
          },
          steps: {
            select: {
              id: true,
              bundleStepId: true,
              status: true,
              paused: true,
              remainingSec: true,
              createdAt: true,
              updatedAt: true,
            },
          },
        },
      },
    },
  });

  if (!schedule) return null;

  const totalSteps = schedule.bundle.stepLinks.length;
  const users = schedule.userTrainings.map((training): DailyCourseStatisticsUserDto => {
    const userStepByBundleStepId = new Map(
      training.steps.map((step) => [step.bundleStepId, step]),
    );
    const orderedSteps = schedule.bundle.stepLinks.map((link): DailyCourseStatisticsStepDto => {
      const userStep = userStepByBundleStepId.get(link.id);
      return {
        bundleStepId: link.id,
        stepId: link.step.id,
        title: link.step.title,
        order: link.order,
        status: userStep?.status ?? TrainingStatus.NOT_STARTED,
        paused: userStep?.paused ?? false,
        remainingSec: userStep?.remainingSec ?? null,
        createdAt: userStep?.createdAt ?? null,
        updatedAt: userStep?.updatedAt ?? null,
      };
    });
    const completedSteps = orderedSteps.filter(
      (step) => step.status === TrainingStatus.COMPLETED,
    ).length;
    const lastStepActivityAt = orderedSteps
      .map((step) => step.updatedAt)
      .filter((date): date is Date => Boolean(date))
      .sort((a, b) => b.getTime() - a.getTime())[0];
    const currentStepIndex =
      training.currentStepIndex && training.currentStepIndex >= 0
        ? training.currentStepIndex
        : orderedSteps.findIndex((step) => step.status !== TrainingStatus.COMPLETED);

    return {
      userId: training.userId,
      username: training.user.username,
      openedAt: training.createdAt,
      status: training.status,
      completedSteps,
      totalSteps,
      lastActivityAt: lastStepActivityAt ?? training.updatedAt,
      currentStepTitle: orderedSteps[currentStepIndex < 0 ? 0 : currentStepIndex]?.title ?? null,
      steps: orderedSteps,
    };
  });

  const startedUsers = users.filter((user) =>
    user.steps.some((step) => step.status !== TrainingStatus.NOT_STARTED),
  ).length;

  return {
    scheduleId: schedule.id,
    mskDate: toDateKey(schedule.date),
    bundleId: schedule.bundle.id,
    title: schedule.bundle.title,
    totalSteps,
    summary: {
      openedUsers: users.length,
      startedUsers,
      completedUsers: users.filter((user) => user.status === TrainingStatus.COMPLETED).length,
      openedWithoutStartUsers: users.length - startedUsers,
    },
    users,
  };
}
```

- [ ] **Step 6: Export the new service and types**

In `packages/core/src/services/dailyCourse/index.ts`, add `getDailyCourseScheduleStatistics` to the function export list:

```ts
  getDailyCourseScheduleStatistics,
```

Add these to the type export list:

```ts
  DailyCourseScheduleStatisticsDto,
  DailyCourseStatisticsStepDto,
  DailyCourseStatisticsUserDto,
```

- [ ] **Step 7: Run core tests**

Run:

```bash
pnpm --filter @gafus/core test -- dailyCourseService.test.ts
```

Expected: PASS for `dailyCourseService.test.ts`.

- [ ] **Step 8: Commit core service changes**

Run:

```bash
git add packages/core/src/services/dailyCourse/dailyCourseService.ts packages/core/src/services/dailyCourse/index.ts packages/core/src/services/dailyCourse/dailyCourseService.test.ts
git commit -m "feat: add daily course statistics query"
```

---

### Task 2: Trainer Panel Server Loader

**Files:**
- Modify: `apps/trainer-panel/src/features/daily-course/lib/actions.ts`

- [ ] **Step 1: Add core imports**

In `apps/trainer-panel/src/features/daily-course/lib/actions.ts`, add `getDailyCourseScheduleStatistics` to the existing import from `@gafus/core/services/dailyCourse`:

```ts
  getDailyCourseScheduleStatistics,
```

Add `DailyCourseScheduleStatisticsDto` to the type import:

```ts
  DailyCourseScheduleStatisticsDto,
```

- [ ] **Step 2: Add statistics page data action**

Add this function after `getDailyCourseBundlesPageData`:

```ts
export async function getDailyCourseStatisticsPageData(input: {
  from: string;
  to: string;
  scheduleId?: string;
}): Promise<{
  schedule: DailyCourseScheduleDto[];
  selectedScheduleId: string | null;
  statistics: DailyCourseScheduleStatisticsDto | null;
}> {
  const actor = await getDailyCourseActor();
  const parsed = dailyCourseRangeSchema.parse({ from: input.from, to: input.to });
  const schedule = await getDailyCourseScheduleRange(actor, parsed);
  const selectedScheduleId =
    input.scheduleId && schedule.some((item) => item.id === input.scheduleId)
      ? input.scheduleId
      : (schedule[0]?.id ?? null);
  const statistics = selectedScheduleId
    ? await getDailyCourseScheduleStatistics(actor, { scheduleId: selectedScheduleId })
    : null;

  return {
    schedule,
    selectedScheduleId,
    statistics,
  };
}
```

- [ ] **Step 3: Run trainer-panel typecheck**

Run:

```bash
pnpm --filter @gafus/trainer-panel typecheck
```

Expected: PASS. If it fails because Task 1 has not been implemented, finish Task 1 first.

- [ ] **Step 4: Commit server loader**

Run:

```bash
git add apps/trainer-panel/src/features/daily-course/lib/actions.ts
git commit -m "feat: load daily course statistics in trainer panel"
```

---

### Task 3: Statistics Page UI

**Files:**
- Create: `apps/trainer-panel/src/app/(main)/main-panel/daily-course/statistics/page.tsx`
- Create: `apps/trainer-panel/src/app/(main)/main-panel/daily-course/statistics/DailyCourseStatisticsClient.tsx`

- [ ] **Step 1: Create the server page**

Create `apps/trainer-panel/src/app/(main)/main-panel/daily-course/statistics/page.tsx`:

```tsx
import { redirect } from "next/navigation";

import { getMoscowDateKey } from "@gafus/core/services/dailyCourse";
import { getCachedSession } from "@/shared/lib/getSessionCached";
import { getDailyCourseStatisticsPageData } from "@/features/daily-course/lib/actions";
import DailyCourseStatisticsClient from "./DailyCourseStatisticsClient";

export default async function DailyCourseStatisticsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; scheduleId?: string }>;
}) {
  const [session, params] = await Promise.all([getCachedSession(), searchParams]);
  if (!session?.user) {
    redirect("/login");
  }
  if (!["TRAINER", "ADMIN", "MODERATOR"].includes(session.user.role)) {
    redirect("/main-panel");
  }

  const today = getMoscowDateKey();
  const from = isDateKey(params.from) ? params.from : today;
  const to = isDateKey(params.to) ? params.to : addDays(today, 29);
  const data = await getDailyCourseStatisticsPageData({
    from,
    to,
    scheduleId: params.scheduleId,
  });

  return (
    <DailyCourseStatisticsClient
      from={from}
      to={to}
      schedule={data.schedule}
      selectedScheduleId={data.selectedScheduleId}
      statistics={data.statistics}
    />
  );
}

function isDateKey(value: string | undefined): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function addDays(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
```

- [ ] **Step 2: Create the client component shell**

Create `apps/trainer-panel/src/app/(main)/main-panel/daily-course/statistics/DailyCourseStatisticsClient.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";

import type {
  DailyCourseScheduleDto,
  DailyCourseScheduleStatisticsDto,
} from "@gafus/core/services/dailyCourse";
import PageLayout from "@/shared/components/PageLayout";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@/utils/muiImports";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

interface DailyCourseStatisticsClientProps {
  from: string;
  to: string;
  schedule: DailyCourseScheduleDto[];
  selectedScheduleId: string | null;
  statistics: DailyCourseScheduleStatisticsDto | null;
}

export default function DailyCourseStatisticsClient({
  from,
  to,
  schedule,
  selectedScheduleId,
  statistics,
}: DailyCourseStatisticsClientProps) {
  const router = useRouter();

  const handleScheduleChange = (scheduleId: string) => {
    const params = new URLSearchParams({ from, to, scheduleId });
    router.push(`/main-panel/daily-course/statistics?${params.toString()}`);
  };

  return (
    <PageLayout
      title="Статистика курса дня"
      subtitle="Детальная статистика по пользователям, которые открывали выбранный день"
    >
      <Box sx={{ display: "grid", gap: 3 }}>
        <Box component="form" sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
          <TextField name="from" label="С" type="date" defaultValue={from} size="small" />
          <TextField name="to" label="По" type="date" defaultValue={to} size="small" />
          {selectedScheduleId && <input type="hidden" name="scheduleId" value={selectedScheduleId} />}
          <Button type="submit" variant="outlined">
            Показать
          </Button>
        </Box>

        {schedule.length === 0 && (
          <Alert severity="info">В выбранном диапазоне нет запланированных дней курса дня.</Alert>
        )}

        {schedule.length > 0 && (
          <FormControl size="small" sx={{ maxWidth: 520 }}>
            <InputLabel id="daily-course-statistics-schedule">День курса дня</InputLabel>
            <Select
              labelId="daily-course-statistics-schedule"
              label="День курса дня"
              value={selectedScheduleId ?? ""}
              onChange={(event) => handleScheduleChange(event.target.value)}
            >
              {schedule.map((item) => (
                <MenuItem key={item.id} value={item.id}>
                  {item.date} · {item.bundle.title}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}

        {statistics && <StatisticsContent statistics={statistics} />}
      </Box>
    </PageLayout>
  );
}
```

- [ ] **Step 3: Add summary and table helpers to the client component**

Append these helper functions and components to the same file:

```tsx
function StatisticsContent({ statistics }: { statistics: DailyCourseScheduleStatisticsDto }) {
  return (
    <Box sx={{ display: "grid", gap: 3 }}>
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 2 }}>
        <SummaryCard label="Открыли день" value={statistics.summary.openedUsers} />
        <SummaryCard label="Начали шаги" value={statistics.summary.startedUsers} />
        <SummaryCard label="Завершили день" value={statistics.summary.completedUsers} />
        <SummaryCard label="Открыли без старта" value={statistics.summary.openedWithoutStartUsers} />
      </Box>

      {statistics.users.length === 0 ? (
        <Alert severity="info">Этот день курса дня ещё никто не открывал.</Alert>
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Пользователь</TableCell>
                <TableCell>Открыл</TableCell>
                <TableCell>Статус</TableCell>
                <TableCell>Прогресс</TableCell>
                <TableCell>Текущий шаг</TableCell>
                <TableCell>Последняя активность</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {statistics.users.map((user) => (
                <TableRow key={user.userId}>
                  <TableCell colSpan={6} sx={{ p: 0, borderBottom: 0 }}>
                    <Accordion disableGutters>
                      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                        <Box
                          sx={{
                            display: "grid",
                            gridTemplateColumns: "1.2fr 1fr 0.8fr 0.8fr 1.2fr 1fr",
                            gap: 2,
                            width: "100%",
                            alignItems: "center",
                          }}
                        >
                          <Typography fontWeight={600}>{user.username}</Typography>
                          <Typography variant="body2">{formatDateTime(user.openedAt)}</Typography>
                          <StatusChip status={user.status} />
                          <Typography variant="body2">
                            {user.completedSteps}/{user.totalSteps}
                          </Typography>
                          <Typography variant="body2">{user.currentStepTitle ?? "Нет"}</Typography>
                          <Typography variant="body2">{formatDateTime(user.lastActivityAt)}</Typography>
                        </Box>
                      </AccordionSummary>
                      <AccordionDetails>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell>Шаг</TableCell>
                              <TableCell>Статус</TableCell>
                              <TableCell>Создан</TableCell>
                              <TableCell>Обновлён</TableCell>
                              <TableCell>Таймер</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {user.steps.map((step) => (
                              <TableRow key={step.bundleStepId}>
                                <TableCell>{step.order + 1}. {step.title}</TableCell>
                                <TableCell><StatusChip status={step.status} /></TableCell>
                                <TableCell>{formatNullableDateTime(step.createdAt)}</TableCell>
                                <TableCell>{formatNullableDateTime(step.updatedAt)}</TableCell>
                                <TableCell>
                                  {step.paused ? `Пауза, осталось ${step.remainingSec ?? 0} сек.` : "Нет паузы"}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </AccordionDetails>
                    </Accordion>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="h4" fontWeight={700}>
          {value}
        </Typography>
      </CardContent>
    </Card>
  );
}

function StatusChip({ status }: { status: string }) {
  const labelByStatus: Record<string, string> = {
    NOT_STARTED: "Не начато",
    IN_PROGRESS: "В процессе",
    COMPLETED: "Завершено",
    RESET: "Сброшено",
  };
  const colorByStatus: Record<string, "default" | "primary" | "success" | "warning"> = {
    NOT_STARTED: "default",
    IN_PROGRESS: "primary",
    COMPLETED: "success",
    RESET: "warning",
  };

  return (
    <Chip
      size="small"
      label={labelByStatus[status] ?? status}
      color={colorByStatus[status] ?? "default"}
      variant={status === "NOT_STARTED" ? "outlined" : "filled"}
    />
  );
}

function formatNullableDateTime(value: Date | string | null) {
  return value ? formatDateTime(value) : "Нет";
}

function formatDateTime(value: Date | string) {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
```

- [ ] **Step 4: Run trainer-panel typecheck**

Run:

```bash
pnpm --filter @gafus/trainer-panel typecheck
```

Expected: PASS. If MUI exports are missing from `@/utils/muiImports`, import the missing components directly from `@mui/material` or add them to `apps/trainer-panel/src/utils/muiImports.ts` following existing patterns.

- [ ] **Step 5: Commit page UI**

Run:

```bash
git add 'apps/trainer-panel/src/app/(main)/main-panel/daily-course/statistics/page.tsx' 'apps/trainer-panel/src/app/(main)/main-panel/daily-course/statistics/DailyCourseStatisticsClient.tsx'
git commit -m "feat: add daily course statistics page"
```

---

### Task 4: Sidebar Link and Final Verification

**Files:**
- Modify: `apps/trainer-panel/src/app/(main)/main-panel/layout.tsx`

- [ ] **Step 1: Add the sidebar link**

In `apps/trainer-panel/src/app/(main)/main-panel/layout.tsx`, add this link after the existing `Курс дня` link and before `Связки для курса дня`:

```tsx
        <Link
          href="/main-panel/daily-course/statistics"
          className={styles.button}
          onClick={closeMobileMenu}
        >
          <TrendingUp />
          Статистика курса дня
        </Link>
```

- [ ] **Step 2: Run final verification**

Run:

```bash
pnpm --filter @gafus/core test -- dailyCourseService.test.ts
pnpm --filter @gafus/core typecheck
pnpm --filter @gafus/trainer-panel typecheck
```

Expected: all commands PASS.

- [ ] **Step 3: Inspect changed files**

Run:

```bash
git diff --stat
git diff -- packages/core/src/services/dailyCourse/dailyCourseService.ts packages/core/src/services/dailyCourse/index.ts packages/core/src/services/dailyCourse/dailyCourseService.test.ts apps/trainer-panel/src/features/daily-course/lib/actions.ts 'apps/trainer-panel/src/app/(main)/main-panel/daily-course/statistics/page.tsx' 'apps/trainer-panel/src/app/(main)/main-panel/daily-course/statistics/DailyCourseStatisticsClient.tsx' 'apps/trainer-panel/src/app/(main)/main-panel/layout.tsx'
```

Expected: only daily-course statistics service, trainer-panel statistics page, and sidebar link changed.

- [ ] **Step 4: Commit final integration**

Run:

```bash
git add 'apps/trainer-panel/src/app/(main)/main-panel/layout.tsx'
git commit -m "feat: link daily course statistics in trainer panel"
```


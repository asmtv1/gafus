import { describe, expect, it, vi, beforeEach } from "vitest";

import {
  cleanupDailyCourseContent,
  importDailyCourseFile,
  parseDailyCourseImportFile,
  previewDailyCourseCleanup,
  previewDailyCourseImportFile,
} from "./dailyCourseService";

const mocks = vi.hoisted(() => ({
  dailyCourseScheduleFindMany: vi.fn(),
  dailyCourseScheduleDeleteMany: vi.fn(),
  dailyCourseBundleFindMany: vi.fn(),
  dailyCourseBundleDeleteMany: vi.fn(),
  stepCreate: vi.fn(),
  stepFindMany: vi.fn(),
  stepDeleteMany: vi.fn(),
  dailyCourseBundleCreate: vi.fn(),
  dailyCourseBundleStepCreateMany: vi.fn(),
  dailyCourseScheduleUpsert: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@gafus/prisma", () => ({
  prisma: {
    $transaction: (...args: unknown[]) => mocks.transaction(...args),
    dailyCourseSchedule: {
      findMany: (...args: unknown[]) => mocks.dailyCourseScheduleFindMany(...args),
      upsert: (...args: unknown[]) => mocks.dailyCourseScheduleUpsert(...args),
      deleteMany: (...args: unknown[]) => mocks.dailyCourseScheduleDeleteMany(...args),
    },
    step: {
      create: (...args: unknown[]) => mocks.stepCreate(...args),
      findMany: (...args: unknown[]) => mocks.stepFindMany(...args),
      deleteMany: (...args: unknown[]) => mocks.stepDeleteMany(...args),
    },
    dailyCourseBundle: {
      findMany: (...args: unknown[]) => mocks.dailyCourseBundleFindMany(...args),
      create: (...args: unknown[]) => mocks.dailyCourseBundleCreate(...args),
      deleteMany: (...args: unknown[]) => mocks.dailyCourseBundleDeleteMany(...args),
    },
    dailyCourseBundleStep: {
      createMany: (...args: unknown[]) => mocks.dailyCourseBundleStepCreateMany(...args),
    },
  },
  Prisma: {
    JsonNull: null,
  },
  isPrismaUniqueConstraintError: () => false,
  TrainingStatus: {
    NOT_STARTED: "NOT_STARTED",
    IN_PROGRESS: "IN_PROGRESS",
    COMPLETED: "COMPLETED",
    RESET: "RESET",
  },
}));

vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  }),
}));

describe("daily course file import", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation((callback: (tx: unknown) => unknown) =>
      callback({
        step: { create: (...args: unknown[]) => mocks.stepCreate(...args) },
        dailyCourseBundle: {
          create: (...args: unknown[]) => mocks.dailyCourseBundleCreate(...args),
        },
        dailyCourseBundleStep: {
          createMany: (...args: unknown[]) => mocks.dailyCourseBundleStepCreateMany(...args),
        },
        dailyCourseSchedule: {
          upsert: (...args: unknown[]) => mocks.dailyCourseScheduleUpsert(...args),
          deleteMany: (...args: unknown[]) => mocks.dailyCourseScheduleDeleteMany(...args),
        },
        dailyCourseBundle: {
          create: (...args: unknown[]) => mocks.dailyCourseBundleCreate(...args),
          deleteMany: (...args: unknown[]) => mocks.dailyCourseBundleDeleteMany(...args),
        },
        step: {
          create: (...args: unknown[]) => mocks.stepCreate(...args),
          deleteMany: (...args: unknown[]) => mocks.stepDeleteMany(...args),
        },
      }),
    );
  });

  it("parses supported human step types and markdown descriptions", () => {
    const parsed = parseDailyCourseImportFile(validFile());

    expect(parsed.days[0]).toMatchObject({
      date: "2099-05-18",
      bundleTitle: "Пульт становится точнее",
      type: "daily_course",
      equipment: "лакомства",
      errors: [],
    });
    expect(parsed.days[0]?.steps).toEqual([
      expect.objectContaining({
        title: "Факт дня",
        type: "THEORY",
        estimatedDurationSec: 180,
        description: expect.stringContaining("# Факт дня"),
      }),
      expect.objectContaining({
        title: "Один жест",
        type: "PRACTICE",
        estimatedDurationSec: 360,
      }),
    ]);
  });

  it("strips markdown fences and surrounding quotes from step descriptions", () => {
    const parsed = parseDailyCourseImportFile(validFile());

    expect(parsed.days[0]?.steps[0]?.description).toBe(
      "# Факт дня\n\nСобака читает тело человека.",
    );
    expect(parsed.days[0]?.steps[0]?.description).not.toContain("```");
    expect(parsed.days[0]?.steps[0]?.description).not.toMatch(/^md\s/i);

    const quoted = parseDailyCourseImportFile(quotedFenceFile());

    expect(quoted.days[0]?.steps[0]?.description).toBe("# В кавычках\n\nТекст без мусора.");
    expect(quoted.days[0]?.steps[0]?.description).not.toContain("'");
    expect(quoted.days[0]?.steps[0]?.description).not.toContain("```");
    expect(quoted.days[0]?.steps[0]?.description).not.toMatch(/^md\s/i);
  });

  it("rejects unsupported step types", () => {
    const parsed = parseDailyCourseImportFile(
      validFile().replace("type: тренировочный без таймера", "type: DIARY"),
    );

    expect(parsed.days[0]?.steps[1]?.errors).toContain("Тип DIARY не поддерживается");
    expect(parsed.hasErrors).toBe(true);
  });

  it("requires examination checks and questions when hasTestQuestions is true", () => {
    const parsed = parseDailyCourseImportFile(examFile());

    expect(parsed.days[0]?.steps[0]).toMatchObject({
      type: "EXAMINATION",
      hasTestQuestions: true,
      requiresWrittenFeedback: false,
      requiresVideoReport: false,
      errors: [],
    });
    expect(parsed.days[0]?.steps[0]?.questions).toEqual([
      expect.objectContaining({
        question: "Что лучше сделать перед поворотом?",
        options: [
          "Молча резко повернуть",
          "Предупредить словом и потом повернуть",
          "Натянуть поводок",
        ],
        correctAnswer: 1,
      }),
    ]);
  });

  it("marks existing scheduled dates as conflicts in preview", async () => {
    mocks.dailyCourseScheduleFindMany.mockResolvedValue([
      {
        id: "schedule-1",
        date: new Date("2099-05-18T00:00:00.000Z"),
        isPublished: true,
        bundle: { title: "Old bundle" },
      },
    ]);

    const preview = await previewDailyCourseImportFile(
      { id: "trainer-1", role: "TRAINER" },
      { content: validFile(), today: "2099-05-17" },
    );

    expect(preview.days[0]).toMatchObject({
      date: "2099-05-18",
      conflict: { scheduleId: "schedule-1", bundleTitle: "Old bundle" },
      canImport: false,
    });
  });

  it("imports valid non-conflicting days by creating fresh steps, bundle and published schedule", async () => {
    mocks.dailyCourseScheduleFindMany.mockResolvedValue([]);
    mocks.stepCreate
      .mockResolvedValueOnce({ id: "step-1" })
      .mockResolvedValueOnce({ id: "step-2" });
    mocks.dailyCourseBundleCreate.mockResolvedValue({ id: "bundle-1" });
    mocks.dailyCourseScheduleUpsert.mockResolvedValue({ id: "schedule-1" });

    const result = await importDailyCourseFile(
      { id: "trainer-1", role: "TRAINER" },
      { content: validFile(), today: "2099-05-17", replaceConflicts: false },
    );

    expect(result.importedDates).toEqual(["2099-05-18"]);
    expect(mocks.stepCreate).toHaveBeenCalledTimes(2);
    expect(mocks.stepCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          authorId: "trainer-1",
          isDailyCourse: true,
          type: "THEORY",
        }),
      }),
    );
    expect(mocks.dailyCourseBundleCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: "Пульт становится точнее",
          authorId: "trainer-1",
        }),
      }),
    );
    expect(mocks.dailyCourseScheduleUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ isPublished: true }),
        update: expect.objectContaining({ isPublished: true }),
      }),
    );
  });

  it("previews full cleanup without counting daily-course steps linked to regular days as deletable", async () => {
    mocks.dailyCourseScheduleFindMany.mockResolvedValue([
      {
        id: "schedule-1",
        date: new Date("2099-05-18T00:00:00.000Z"),
        userTrainings: [
          {
            id: "training-1",
            steps: [{ id: "user-step-1" }, { id: "user-step-2" }],
          },
        ],
      },
    ]);
    mocks.dailyCourseBundleFindMany.mockResolvedValue([
      {
        id: "bundle-1",
        schedules: [{ id: "schedule-1" }],
        stepLinks: [{ stepId: "daily-step-1" }, { stepId: "shared-step-1" }],
      },
    ]);
    mocks.stepFindMany.mockResolvedValue([
      {
        id: "daily-step-1",
        title: "Daily only",
        stepLinks: [],
        dailyCourseBundleLinks: [{ bundleId: "bundle-1" }],
      },
      {
        id: "shared-step-1",
        title: "Linked to regular course",
        stepLinks: [{ id: "regular-link-1" }],
        dailyCourseBundleLinks: [{ bundleId: "bundle-1" }],
      },
    ]);

    const preview = await previewDailyCourseCleanup(
      { id: "trainer-1", role: "TRAINER" },
      { mode: "all", today: "2099-05-17" },
    );

    expect(preview).toMatchObject({
      mode: "all",
      schedulesToDelete: 1,
      bundlesToDelete: 1,
      stepsToDelete: 1,
      skippedSteps: [
        { id: "shared-step-1", title: "Linked to regular course", reason: "REGULAR_COURSE_LINK" },
      ],
      userTrainingsToDelete: 1,
      userStepsToDelete: 2,
    });
  });

  it("cleans daily-course content with hard guards that exclude regular course data", async () => {
    mocks.dailyCourseScheduleFindMany.mockResolvedValue([
      {
        id: "schedule-1",
        date: new Date("2099-05-18T00:00:00.000Z"),
        userTrainings: [],
      },
    ]);
    mocks.dailyCourseBundleFindMany.mockResolvedValue([
      {
        id: "bundle-1",
        schedules: [{ id: "schedule-1" }],
        stepLinks: [{ stepId: "daily-step-1" }],
      },
    ]);
    mocks.stepFindMany.mockResolvedValue([
      {
        id: "daily-step-1",
        title: "Daily only",
        stepLinks: [],
        dailyCourseBundleLinks: [{ bundleId: "bundle-1" }],
      },
    ]);
    mocks.dailyCourseScheduleDeleteMany.mockResolvedValue({ count: 1 });
    mocks.dailyCourseBundleDeleteMany.mockResolvedValue({ count: 1 });
    mocks.stepDeleteMany.mockResolvedValue({ count: 1 });

    const result = await cleanupDailyCourseContent(
      { id: "trainer-1", role: "TRAINER" },
      { mode: "all", confirmation: "ОЧИСТИТЬ КУРС ДНЯ", today: "2099-05-17" },
    );

    expect(result.deleted).toEqual({
      schedules: 1,
      bundles: 1,
      steps: 1,
    });
    expect(mocks.dailyCourseScheduleDeleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["schedule-1"] }, bundle: { authorId: "trainer-1" } },
    });
    expect(mocks.dailyCourseBundleDeleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["bundle-1"] }, authorId: "trainer-1" },
    });
    expect(mocks.stepDeleteMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["daily-step-1"] },
        isDailyCourse: true,
        authorId: "trainer-1",
        stepLinks: { none: {} },
      },
    });
  });
});

function validFile(): string {
  return `
## 2099-05-18, понедельник

**Bundle title:** Пульт становится точнее
**type:** daily_course
**equipment:** лакомства
**description:** Продолжаем тему сигналов тела.

**Шаг 1**
title: Факт дня
type: теоретический
estimatedDurationSec: 180
description:

\`\`\`md
# Факт дня

Собака читает тело человека.
\`\`\`

**Шаг 2**
title: Один жест
type: тренировочный без таймера
estimatedDurationSec: 360
description:

\`\`\`md
# Один жест

Проверьте понятный сигнал.
\`\`\`
`;
}

function examFile(): string {
  return `
## 2099-05-19, вторник

**Bundle title:** Проверка
**type:** daily_course
**equipment:** ничего
**description:** День проверки.

**Шаг 1**
title: Мини-тест
type: экзаменационный
estimatedDurationSec: 300
requiresWrittenFeedback: false
hasTestQuestions: true
requiresVideoReport: false
description:

\`\`\`md
# Мини-тест
\`\`\`

questions:
- question: Что лучше сделать перед поворотом?
  options:
    - Молча резко повернуть
    - Предупредить словом и потом повернуть
    - Натянуть поводок
  correctAnswer: 1
  comment: Собаке легче, когда маневр предсказуем.

**Шаг 2**
title: Теория после теста
type: THEORY
estimatedDurationSec: 180
description:

\`\`\`md
# Разбор
\`\`\`
`;
}

function quotedFenceFile(): string {
  return `
## 2099-05-20, среда

**Bundle title:** Проверка кавычек
**type:** daily_course
**equipment:** ничего
**description:** Проверяем очистку описаний.

**Шаг 1**
title: Кавычки вокруг fence
type: THEORY
estimatedDurationSec: 180
description:

'\`\`\`md
# В кавычках

Текст без мусора.
\`\`\`'

**Шаг 2**
title: Обычный шаг
type: PRACTICE
estimatedDurationSec: 180
description:

\`\`\`md
# Обычный шаг
\`\`\`
`;
}

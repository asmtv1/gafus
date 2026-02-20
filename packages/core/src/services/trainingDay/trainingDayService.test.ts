import { describe, expect, it, beforeEach, vi } from "vitest";

import {
  createTrainingDay,
  updateTrainingDay,
  deleteDays,
  getVisibleDays,
} from "./trainingDayService";

const mockTrainingDayCreate = vi.fn();
const mockTrainingDayUpdate = vi.fn();
const mockTrainingDayFindMany = vi.fn();
const mockTrainingDayDeleteMany = vi.fn();
const mockDayOnCourseFindMany = vi.fn();
const mockDayOnCourseDeleteMany = vi.fn();

const mockTransaction = vi.fn((arg: unknown) =>
  Array.isArray(arg) ? Promise.all(arg as Promise<unknown>[]) : (arg as () => Promise<unknown>)(),
);

vi.mock("@gafus/prisma", () => ({
  prisma: {
    trainingDay: {
      create: (...args: unknown[]) => mockTrainingDayCreate(...args),
      update: (...args: unknown[]) => mockTrainingDayUpdate(...args),
      findMany: (...args: unknown[]) => mockTrainingDayFindMany(...args),
      deleteMany: (...args: unknown[]) => mockTrainingDayDeleteMany(...args),
    },
    dayOnCourse: {
      findMany: (...args: unknown[]) => mockDayOnCourseFindMany(...args),
      deleteMany: (...args: unknown[]) => mockDayOnCourseDeleteMany(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
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

describe("createTrainingDay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTrainingDayCreate.mockResolvedValue({ id: "day-1" });
  });

  it("returns success with dayId", async () => {
    const result = await createTrainingDay({
      title: "День 1",
      description: "Описание",
      type: "regular",
      stepIds: [],
      authorId: "author-1",
    });

    expect(result.success).toBe(true);
    expect(result.dayId).toBe("day-1");
  });
});

describe("updateTrainingDay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTrainingDayUpdate.mockResolvedValue({});
  });

  it("returns success on update", async () => {
    const result = await updateTrainingDay({
      id: "day-1",
      title: "Обновлённый",
      stepIds: [],
    });

    expect(result.success).toBe(true);
  });

  it("returns error when prisma throws with code", async () => {
    const err = Object.assign(new Error("unique"), {
      code: "P2002",
      meta: { target: ["title"] },
    });
    mockTrainingDayUpdate.mockRejectedValue(err);

    const result = await updateTrainingDay({
      id: "day-1",
      title: "Обновлённый",
      stepIds: [],
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe("deleteDays", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDayOnCourseFindMany.mockResolvedValue([{ courseId: "c1" }]);
    mockDayOnCourseDeleteMany.mockResolvedValue({});
    mockTrainingDayDeleteMany.mockResolvedValue({});
  });

  it("returns success with courseIds and deletedDayIds", async () => {
    const result = await deleteDays({ dayIds: ["d1", "d2"] });

    expect(result.success).toBe(true);
    expect(result.courseIds).toEqual(["c1"]);
    expect(result.deletedDayIds).toEqual(["d1", "d2"]);
  });

  it("returns error on transaction failure", async () => {
    mockDayOnCourseFindMany.mockResolvedValue([]);
    mockTransaction.mockRejectedValue(new Error("TX failed"));

    const result = await deleteDays({ dayIds: ["d1"] });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe("getVisibleDays", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTrainingDayFindMany.mockResolvedValue([]);
  });

  it("queries by authorId when not admin", async () => {
    await getVisibleDays("author-1", false);

    expect(mockTrainingDayFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { authorId: "author-1" },
      }),
    );
  });

  it("queries all when isAdminOrModerator", async () => {
    await getVisibleDays(null, true);

    expect(mockTrainingDayFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {},
      }),
    );
  });
});

describe("createTrainingDay error path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns error when prisma throws with code", async () => {
    const err = Object.assign(new Error("unique"), {
      code: "P2002",
      meta: { target: ["title"] },
    });
    mockTrainingDayCreate.mockRejectedValue(err);

    const result = await createTrainingDay({
      title: "День 1",
      description: "Описание",
      type: "regular",
      stepIds: [],
      authorId: "author-1",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

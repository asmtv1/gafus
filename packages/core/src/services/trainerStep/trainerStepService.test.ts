import { beforeEach, describe, expect, it, vi } from "vitest";

import { getVisibleSteps } from "./trainerStepService";

const mocks = vi.hoisted(() => ({
  stepFindMany: vi.fn(),
}));

vi.mock("@gafus/prisma", () => ({
  prisma: {
    step: {
      findMany: (...args: unknown[]) => mocks.stepFindMany(...args),
    },
  },
  Prisma: {
    JsonNull: null,
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

describe("trainerStepService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("only lists non-daily-course steps for regular training day creation", async () => {
    mocks.stepFindMany.mockResolvedValue([]);

    await getVisibleSteps("trainer-1", false);

    expect(mocks.stepFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          authorId: "trainer-1",
          isDailyCourse: false,
        },
      }),
    );
  });
});

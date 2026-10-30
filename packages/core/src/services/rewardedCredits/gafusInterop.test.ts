import { beforeEach, describe, expect, it, vi } from "vitest";
import { findGafusUnlockedStepForVideoUrl } from "./gafusInterop";

const mockOccurrences = vi.fn();
const mockHasGafus = vi.fn();
vi.mock("@gafus/prisma", () => ({
  prisma: { dayOnCourse: { findMany: (...args: unknown[]) => mockOccurrences(...args) } },
}));
vi.mock("../contentAccess", () => ({
  hasActiveGafusCourseStepAccess: (...args: unknown[]) => mockHasGafus(...args),
}));

describe("video Gafus entitlement without progress rows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOccurrences.mockResolvedValue([
      {
        id: "day-occurrence",
        day: { stepLinks: [{ id: "step-occurrence" }] },
      },
    ]);
    mockHasGafus.mockResolvedValue(false);
  });

  it("checks actual course-step occurrence without reading UserStep", async () => {
    mockHasGafus.mockResolvedValue(true);
    expect(
      await findGafusUnlockedStepForVideoUrl({
        userId: "user-1",
        videoUrl: "https://cdn.example.com/training.mp4",
      }),
    ).toBe("step-occurrence");
    expect(mockHasGafus).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        dayOnCourseId: "day-occurrence",
        stepOnDayId: "step-occurrence",
      }),
    );
    expect(mockOccurrences).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          day: {
            stepLinks: { some: { step: { videoUrl: "https://cdn.example.com/training.mp4" } } },
          },
        },
      }),
    );
  });

  it("denies video without a valid per-user grant", async () => {
    expect(
      await findGafusUnlockedStepForVideoUrl({
        userId: "user-2",
        videoUrl: "https://cdn.example.com/training.mp4",
      }),
    ).toBeNull();
  });

  it("denies video absent from every course occurrence", async () => {
    mockOccurrences.mockResolvedValue([]);
    expect(
      await findGafusUnlockedStepForVideoUrl({
        userId: "user-1",
        videoUrl: "https://cdn.example.com/unknown.mp4",
      }),
    ).toBeNull();
    expect(mockHasGafus).not.toHaveBeenCalled();
  });
});

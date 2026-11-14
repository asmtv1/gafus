import { beforeEach, describe, expect, it, vi } from "vitest";
import { createGafusInteropService } from "./gafusInterop";
import {
  readGafusUserStepOccurrence, readGafusVideoOccurrences,
} from "@gafus/course-read-server/gafus-entitlement-reads";
import { hasActiveGafusCourseStepAccess } from "../contentAccess";

const mockOccurrences = vi.fn();
const mockHasGafus = vi.fn();
vi.mock("@gafus/prisma", () => ({
  prisma: { dayOnCourse: { findMany: (...args: unknown[]) => mockOccurrences(...args) } },
}));
vi.mock("../contentAccess", () => ({
  hasActiveGafusCourseStepAccess: (...args: unknown[]) => mockHasGafus(...args),
}));

const {
  findGafusUnlockedStepForVideoUrl,
  hasGafusUnlockForUserStep,
} = createGafusInteropService({
  readUserStepOccurrence: readGafusUserStepOccurrence,
  readVideoOccurrences: readGafusVideoOccurrences,
  hasActiveCourseStepGrant: hasActiveGafusCourseStepAccess,
});

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

// A URL or a replayed step ID is never entitlement evidence without the
// user's occurrence-bound active grant.
describe("Gafus occurrence port safety", () => {
  it("rejects missing actor/URL and never queries the database", async () => {
    vi.clearAllMocks();
    await expect(findGafusUnlockedStepForVideoUrl({ userId: "", videoUrl: "valid" })).resolves.toBeNull();
    await expect(findGafusUnlockedStepForVideoUrl({ userId: "owner", videoUrl: "" })).resolves.toBeNull();
    await expect(hasGafusUnlockForUserStep({ userId: "", userStepId: "step" })).resolves.toBe(false);
    expect(mockOccurrences).not.toHaveBeenCalled();
    expect(mockHasGafus).not.toHaveBeenCalled();
  });
  it("fails closed when a video lookup's persistence port rejects", async () => {
    mockOccurrences.mockRejectedValueOnce(new Error("PRIVATE_SQL_FAILURE"));
    await expect(findGafusUnlockedStepForVideoUrl({
      userId: "owner", videoUrl: "protected-video",
    })).rejects.toThrow("PRIVATE_SQL_FAILURE");
    expect(mockHasGafus).not.toHaveBeenCalled();
  });
});

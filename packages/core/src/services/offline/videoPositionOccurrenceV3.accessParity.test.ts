import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@gafus/prisma";

const checks = vi.hoisted(() => ({
  resolveTarget: vi.fn(),
  resolveAccess: vi.fn(),
}));
vi.mock("../contentAccess", () => ({
  resolveCourseStepTargetTx: checks.resolveTarget,
  resolveCourseStepAccessTx: checks.resolveAccess,
}));
vi.mock("@gafus/cdn-upload", () => ({
  extractVideoIdFromCdnUrl: vi.fn(() => "video-parity"),
}));

import { authorizeVideoOccurrenceV3 } from "./videoPositionOccurrenceV3";

function createFakeTransaction() {
  return {
    trainerVideo: {
      findUnique: vi.fn().mockResolvedValue({
        id: "video-parity",
        relativePath: "videocourses/video-parity/source.mp4",
      }),
    },
    stepOnDay: {
      findUnique: vi.fn().mockResolvedValue({
        dayId: "day-parity",
        step: {
          videoUrl:
            "https://gafus-media.storage.yandexcloud.net/videocourses/video-parity/source.mp4",
        },
      }),
    },
    dayOnCourse: {
      findUnique: vi.fn().mockResolvedValue({ dayId: "day-parity" }),
    },
    rewardedTargetAccess: {
      // A legacy ad grant MUST NOT be consulted, even when present.
      findFirst: vi.fn().mockResolvedValue({ id: "retired-ad-grant" }),
    },
  };
}
const occurrence = {
  eventId: "00000000-0000-4000-8000-000000000001",
  operation: "video.position" as const,
  scope: "COURSE_STEP" as const,
  videoId: "video-parity",
  positionSec: 25,
  recordedAt: "2026-10-27T12:00:00.000Z",
  expectedRevision: 0,
  dayOnCourseId: "day-on-course-parity",
  stepOnDayId: "step-on-day-parity",
};

describe("offline video occurrence follows the same Gafus/Premium policy", () => {
  beforeEach(() => {
    checks.resolveTarget.mockReset().mockResolvedValue({
      type: "COURSE_STEP",
      isPrivate: false,
      isPaid: true,
      dayOnCourseId: occurrence.dayOnCourseId,
      stepOnDayId: occurrence.stepOnDayId,
    });
    checks.resolveAccess.mockReset().mockResolvedValue({ allowed: false });
  });

  it("denies a paid step even if a retired rewarded ad grant exists", async () => {
    const tx = createFakeTransaction();
    const result = await authorizeVideoOccurrenceV3(
      tx as unknown as Prisma.TransactionClient,
      "viewer-parity",
      occurrence,
    );
    expect(result).toBe("DENIED");
    expect(tx.rewardedTargetAccess.findFirst).not.toHaveBeenCalled();
  });

  it("allows an active shared-policy entitlement without legacy ad access", async () => {
    const tx = createFakeTransaction();
    checks.resolveAccess.mockResolvedValue({ allowed: true, source: "GAFUS" });
    const result = await authorizeVideoOccurrenceV3(
      tx as unknown as Prisma.TransactionClient,
      "viewer-parity",
      occurrence,
    );
    expect(result).toBe("ALLOWED");
    expect(tx.rewardedTargetAccess.findFirst).not.toHaveBeenCalled();
  });
});

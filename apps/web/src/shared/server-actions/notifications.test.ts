import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createStepNotificationMock,
  getCurrentUserIdMock,
  getDayFromDayOnCourseIdMock,
  pauseStepNotificationMock,
  resumeStepNotificationMock,
} = vi.hoisted(() => ({
  createStepNotificationMock: vi.fn(),
  getCurrentUserIdMock: vi.fn(),
  getDayFromDayOnCourseIdMock: vi.fn(),
  pauseStepNotificationMock: vi.fn(),
  resumeStepNotificationMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  unstable_rethrow: vi.fn(),
}));

vi.mock("@shared/utils/getCurrentUserId", () => ({
  getCurrentUserId: getCurrentUserIdMock,
}));

vi.mock("@gafus/core/errors", () => ({
  getErrorMessage: (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback,
}));

vi.mock("@gafus/core/services/notifications", () => ({
  createStepNotificationForStepStart: createStepNotificationMock,
  deleteStepNotification: vi.fn(),
  getDayFromDayOnCourseId: getDayFromDayOnCourseIdMock,
  pauseStepNotification: pauseStepNotificationMock,
  resetStepNotification: vi.fn(),
  resumeStepNotification: resumeStepNotificationMock,
  toggleStepNotificationPause: vi.fn(),
}));

vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({
    error: vi.fn(),
  }),
}));

import {
  createStepNotificationAction,
  pauseNotificationAction,
  resumeNotificationAction,
} from "./notifications";

describe("web notification server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserIdMock.mockResolvedValue("user-1");
    getDayFromDayOnCourseIdMock.mockResolvedValue(3);
  });

  it("pauses a step notification for the current user and resolved day", async () => {
    await expect(
      pauseNotificationAction("course-1", "cmlp7m13t004emr018jrl30af", 0),
    ).resolves.toEqual({
      success: true,
    });

    expect(pauseStepNotificationMock).toHaveBeenCalledWith("user-1", 3, 0);
  });

  it("resumes a step notification with duration and dayOnCourseId", async () => {
    await expect(
      resumeNotificationAction("course-1", "cmlp7m13t004emr018jrl30af", 0, 60),
    ).resolves.toEqual({
      success: true,
    });

    expect(resumeStepNotificationMock).toHaveBeenCalledWith(
      "user-1",
      3,
      0,
      60,
      "cmlp7m13t004emr018jrl30af",
    );
  });

  it("creates a step notification from valid params", async () => {
    await expect(
      createStepNotificationAction({
        dayOnCourseId: "cmlp7m13t004emr018jrl30af",
        durationSec: 60,
        stepIndex: 0,
      }),
    ).resolves.toEqual({ success: true });

    expect(createStepNotificationMock).toHaveBeenCalledWith(
      "user-1",
      "cmlp7m13t004emr018jrl30af",
      0,
      60,
    );
  });

  it("returns a safe error result for invalid notification params", async () => {
    await expect(
      createStepNotificationAction({
        dayOnCourseId: "",
        durationSec: -1,
        stepIndex: -1,
      }),
    ).resolves.toMatchObject({
      success: false,
    });
    expect(createStepNotificationMock).not.toHaveBeenCalled();
  });
});

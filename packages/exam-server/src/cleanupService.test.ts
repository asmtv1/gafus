import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ findMany: vi.fn(), updateMany: vi.fn() }));
vi.mock("@gafus/prisma", () => ({
  prisma: { examResult: { findMany: m.findMany, updateMany: m.updateMany } },
}));
import { listExamVideosEligibleForCleanup, markExpiredExamVideoDeleted } from "./cleanupService.js";
import { EXAM_VIDEO_RETENTION_DAYS } from "./retentionPolicy.js";

describe("server-owned video expiry with exact matching before deletion", () => {
  beforeEach(() => vi.resetAllMocks());
  it("keeps retention domain policy frozen at 30 days completed / 90 in progress", () => {
    expect(EXAM_VIDEO_RETENTION_DAYS).toEqual({ completed: 30, inProgress: 90 });
  });
  it("never removes active or already deleted videos and uses distinct timestamps", async () => {
    const now = new Date("2026-11-07T10:00:00.000Z");
    m.findMany.mockResolvedValue([]);
    expect(await listExamVideosEligibleForCleanup(now)).toEqual({ completed: [], pending: [] });
    expect(m.findMany).toHaveBeenCalledTimes(2);
    const completed = m.findMany.mock.calls[0][0],
      progress = m.findMany.mock.calls[1][0];
    expect(completed.where).toEqual({
      videoReportUrl: { not: null },
      videoDeletedAt: null,
      userStep: { status: "COMPLETED" },
      updatedAt: { lt: new Date(now.getTime() - 30 * 86400000) },
    });
    expect(progress.where).toEqual({
      videoReportUrl: { not: null },
      videoDeletedAt: null,
      userStep: { status: "IN_PROGRESS" },
      createdAt: { lt: new Date(now.getTime() - 90 * 86400000) },
    });
    expect(completed.select).toEqual(progress.select);
  });
  it("never acknowledges a changed URL, or a previously cleared video", async () => {
    m.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });
    const arg = {
      userStepId: "user-step-1",
      expectedUrl: "private/object-1",
      reason: "auto_cleanup_completed",
      deletedAt: new Date("2026-11-07T10:00:00Z"),
    };
    expect(await markExpiredExamVideoDeleted(arg)).toBe(false);
    expect(await markExpiredExamVideoDeleted(arg)).toBe(true);
    expect(m.updateMany).toHaveBeenCalledWith({
      where: { userStepId: arg.userStepId, videoReportUrl: arg.expectedUrl, videoDeletedAt: null },
      data: { videoReportUrl: null, videoDeletedAt: arg.deletedAt, videoDeleteReason: arg.reason },
    });
  });
});

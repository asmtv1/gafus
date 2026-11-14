import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ upsert: vi.fn(), updateMany: vi.fn(), findMany: vi.fn() }));
vi.mock("@gafus/prisma", () => ({ prisma: { mobileIntroInstallation: {
  upsert: db.upsert, updateMany: db.updateMany, findMany: db.findMany,
} } }));
import { recordMobileIntroEvent, recordMobileIntroAuthOutcome, getMobileIntroReport } from "./mobileIntroService";

const openedAt = new Date("2026-11-11T10:00:00Z");
const occurredAt = new Date("2026-11-11T10:00:08Z");
const base = { installationId: "test-device", introVersion: "1", platform: "IOS" as const, openedAt, occurredAt };
beforeEach(() => { vi.clearAllMocks(); db.upsert.mockResolvedValue({}); db.updateMany.mockResolvedValue({ count: 1 }); });

describe("intro event storage and idempotent conditional terminal state", () => {
  it("records OPENED with unique installation/version and performs no terminal update", async () => {
    await recordMobileIntroEvent({ ...base, event: "OPENED" });
    expect(db.upsert).toHaveBeenCalledExactlyOnceWith({
      where: { installationId_introVersion: { installationId: "test-device", introVersion: "1" } },
      create: { installationId: "test-device", introVersion: "1", platform: "IOS", openedAt },
      update: {},
    });
    expect(db.updateMany).not.toHaveBeenCalled();
  });
  it("records first COMPLETED outcome with null-guard so replays cannot replace it", async () => {
    await recordMobileIntroEvent({ ...base, event: "COMPLETED" });
    expect(db.upsert).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      create: expect.objectContaining({ completion: "COMPLETED", completedAt: occurredAt }), update: {},
    }));
    expect(db.updateMany).toHaveBeenCalledExactlyOnceWith({
      where: { installationId: "test-device", introVersion: "1", completion: null },
      data: { completion: "COMPLETED", completedAt: occurredAt },
    });
  });
  it("persists auth first then guards later duplicate outcomes", async () => {
    await recordMobileIntroAuthOutcome({ ...base, userId: "user-1", outcome: "REGISTERED" });
    expect(db.upsert).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      create: expect.objectContaining({ authOutcome: "REGISTERED", authOutcomeUserId: "user-1" }), update: {},
    }));
    expect(db.updateMany).toHaveBeenCalledExactlyOnceWith({
      where: { installationId: "test-device", introVersion: "1", authOutcome: null },
      data: { authOutcome: "REGISTERED", authOutcomeAt: occurredAt, authOutcomeUserId: "user-1" },
    });
  });
  it("does not swallow persistence errors", async () => {
    db.upsert.mockRejectedValueOnce(new Error("TEST_DB_UNAVAILABLE"));
    await expect(recordMobileIntroEvent({ ...base, event: "SKIPPED" })).rejects.toThrow("TEST_DB_UNAVAILABLE");
    expect(db.updateMany).not.toHaveBeenCalled();
  });
});

describe("report aggregation", () => {
  it("counts completed, skipped, registered, logged in and pending auth by time range", async () => {
    db.findMany.mockResolvedValueOnce([
      { completion: "COMPLETED", authOutcome: "REGISTERED" },
      { completion: "SKIPPED", authOutcome: "LOGGED_IN" },
      { completion: null, authOutcome: null },
      { completion: "COMPLETED", authOutcome: null },
    ]);
    const range = { start: openedAt, end: new Date("2026-11-12T10:00:00Z") };
    const result = await getMobileIntroReport(range);
    expect(db.findMany).toHaveBeenCalledExactlyOnceWith({
      where: { openedAt: { gte: range.start, lt: range.end } },
      select: { completion: true, authOutcome: true },
    });
    expect(result).toMatchObject({ timeZone: "Europe/Samara", openings: 4, completed: 2,
      skipped: 1, registered: 1, loggedIn: 1, pendingAuth: 2,
      range: { start: range.start.toISOString(), end: range.end.toISOString() },
    });
    expect(new Date(result.generatedAt).getTime()).toBeGreaterThan(0);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({
  upsert: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn(), error: vi.fn(),
}));
vi.mock("@gafus/prisma", () => ({
  prisma: {
    reengagementSettings: { upsert: db.upsert, findUnique: db.findUnique },
    reengagementCampaign: { updateMany: db.updateMany },
  },
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({
    info: vi.fn(), error: db.error,
  }),
}));
import { getReengagementSettings, updateReengagementSettings } from "./reengagementSettings";

describe("reengagement persistence-bound preferences", () => {
  beforeEach(() => { vi.resetAllMocks(); });
  it("defaults to enabled but does not create a row during the read", async () => {
    db.findUnique.mockResolvedValue(null);
    expect(await getReengagementSettings("user")).toEqual({
      success: true, data: { enabled: true, preferredTime: null },
    });
    expect(db.upsert).not.toHaveBeenCalled();
  });
  it("updates settings and cancels only active campaigns when disabled", async () => {
    db.upsert.mockResolvedValue({});
    db.updateMany.mockResolvedValue({ count: 1 });
    expect(await updateReengagementSettings("user", false, "14:30")).toEqual({ success: true });
    expect(db.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "user" },
      update: expect.objectContaining({ enabled: false, preferredTime: "14:30", unsubscribedAt: expect.any(Date) }),
    }));
    expect(db.updateMany).toHaveBeenCalledWith({
      where: { userId: "user", isActive: true },
      data: { isActive: false, unsubscribed: true },
    });
  });
  it("never cancels campaigns when re-enabled", async () => {
    db.upsert.mockResolvedValue({});
    expect(await updateReengagementSettings("user", true)).toEqual({ success: true });
    expect(db.updateMany).not.toHaveBeenCalled();
    expect(db.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ unsubscribedAt: null }),
    }));
  });
  it("never returns provider exception text or logs its original error", async () => {
    db.findUnique.mockRejectedValue(new Error("SECRET_PROVIDER_DSN"));
    db.upsert.mockRejectedValue(new Error("SECRET_PROVIDER_DSN"));
    const a = await getReengagementSettings("user");
    const b = await updateReengagementSettings("user", false);
    expect(a).toEqual({ success: false, error: "REENGAGEMENT_SETTINGS_UNAVAILABLE" });
    expect(b).toEqual({ success: false, error: "REENGAGEMENT_SETTINGS_UNAVAILABLE" });
    expect(JSON.stringify([a,b])).not.toContain("SECRET_PROVIDER_DSN");
    for (const [message, err] of db.error.mock.calls) {
      expect(message).not.toContain("SECRET_PROVIDER_DSN");
      expect((err as Error).message).not.toContain("SECRET_PROVIDER_DSN");
    }
  });
});
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentUserId: vi.fn(),
  subscription: vi.fn(),
  checkByType: vi.fn(),
  checkById: vi.fn(),
  download: vi.fn(),
}));

vi.mock("@shared/utils/getCurrentUserId", () => ({
  getCurrentUserId: mocks.currentUserId,
}));
vi.mock("@gafus/core/services/offline", () => ({
  getCourseVersion: vi.fn(),
  checkCourseUpdates: vi.fn(),
  downloadFullCourse: mocks.download,
}));
vi.mock("@gafus/core/services/course", () => ({
  checkCourseAccess: mocks.checkByType,
  checkCourseAccessById: mocks.checkById,
}));
vi.mock("@gafus/core/services/appSubscription", () => ({
  getAppSubscriptionAccess: mocks.subscription,
  isOfflineCourseDownloadIncludedPlanCode: (plan: unknown) =>
    plan === "MONTHLY" || plan === "THREE_MONTHS",
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ info: vi.fn(), error: vi.fn() }),
}));

import { downloadFullCourse } from "./offlineCourseActions";

describe("Web offline course download action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentUserId.mockResolvedValue("viewer");
    mocks.subscription.mockResolvedValue({ hasActiveSubscription: true, planCode: "MONTHLY" });
    mocks.checkByType.mockResolvedValue({ hasAccess: true });
    mocks.checkById.mockResolvedValue({ hasAccess: true });
    mocks.download.mockResolvedValue({
      success: true,
      data: { course: { id: "c1", isPrivate: false, isPaid: true }, trainingDays: [] },
    });
  });

  it("does not fetch a private course without student assignment, even with a subscription", async () => {
    mocks.checkByType.mockResolvedValue({ hasAccess: false });
    const result = await downloadFullCourse("private-course");
    expect(result).toMatchObject({ success: false, error: "Нет доступа к курсу" });
    expect(mocks.checkByType).toHaveBeenCalledWith("private-course", "viewer");
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it("enforces monthly-or-longer tariff against direct Server Action calls", async () => {
    mocks.subscription.mockResolvedValue({ hasActiveSubscription: true, planCode: "TWO_WEEKS" });
    const result = await downloadFullCourse("public-course");
    expect(result.success).toBe(false);
    expect(result.error).toContain("от одного месяца");
    expect(mocks.checkByType).not.toHaveBeenCalled();
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it("rejects expired subscriptions before fetching content", async () => {
    mocks.subscription.mockResolvedValue({ hasActiveSubscription: false });
    expect((await downloadFullCourse("public-course")).success).toBe(false);
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it("downloads a permitted course after verifying both course type and returned ID", async () => {
    const result = await downloadFullCourse("public-course");
    expect(result.success).toBe(true);
    expect(mocks.checkByType).toHaveBeenCalledWith("public-course", "viewer");
    expect(mocks.checkById).toHaveBeenCalledWith("c1", "viewer");
  });

  it("rechecks private-course entitlement after data fetch (revoked assignment)", async () => {
    mocks.download.mockResolvedValue({
      success: true,
      data: { course: { id: "private", isPrivate: true, isPaid: false }, trainingDays: [] },
    });
    mocks.checkById.mockResolvedValue({ hasAccess: false });
    const result = await downloadFullCourse("private-course");
    expect(result.success).toBe(false);
    expect(result.data).toBeUndefined();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  courses: [{ id: "course-1", name: "Уход за собакой", shortDesc: "Мини-гайд",
    logoImg: "https://example.com/cover.png", guideContent: "<b>Закрытый HTML</b>" }],
  settings: { economyEnabled: true, spendingEnabled: true, miniGuideCost: 1 },
  access: { allowed: false, source: "DENIED", eligibleForGafus: true, expiresAt: null as Date | null },
  requestedFilter: null as unknown,
  protectedReads: 0,
}));
vi.mock("@gafus/prisma", () => ({
  prisma: {
    $transaction: async (fn: (tx: unknown) => unknown) => fn({
      course: {
        findUnique: async ({ where }: { where: { id: string } }) => {
          state.protectedReads++;
          const course = state.courses.find(x => x.id === where.id);
          return course ? { guideContent: course.guideContent } : null;
        },
        findMany: async (input: { where: unknown }) => {
          state.requestedFilter = input.where;
          return state.courses.map(({ guideContent: _guideContent, ...rest }) => rest);
        },
      },
    }),
  },
}));
vi.mock("./settingsService", () => ({
  getGafusSettingsTx: async () => state.settings,
}));
vi.mock("../contentAccess", () => ({
  resolveMiniGuideTargetTx: async (_tx: unknown, courseId: string) =>
    state.courses.find(x => x.id === courseId && x.guideContent.length > 0)
      ? { type: "MINI_GUIDE", courseId, targetKey: `mini-guide:${courseId}` }
      : null,
  resolveMiniGuideAccessTx: async () => state.access,
}));

import { listGafusMiniGuides, getAuthorizedMiniGuideContent } from "./miniGuideService";

describe("Gafus mini-guide catalog does not leak protected content", () => {
  beforeEach(() => {
    state.settings = { economyEnabled: true, spendingEnabled: true, miniGuideCost: 1 };
    state.protectedReads = 0;
    state.access = { allowed: false, source: "DENIED", eligibleForGafus: true, expiresAt: null };
  });

  it("returns public metadata only, with server-side price and purchasability", async () => {
    const [result] = await listGafusMiniGuides("reader");
    expect(result).toMatchObject({
      courseId: "course-1", title: "Уход за собакой",
      unlocked: false, canPurchase: true, price: 1,
    });
    expect(JSON.stringify(result)).not.toContain("<b>");
    expect(JSON.stringify(result)).not.toContain("guideContent");
    expect(state.requestedFilter).toMatchObject({
      isPaid: false, isPrivate: false, guideContent: { not: null },
    });
  });

  it("does not offer a purchase for already entitled or disabled users", async () => {
    state.settings.spendingEnabled = false;
    expect((await listGafusMiniGuides("reader"))[0]?.canPurchase).toBe(false);
    state.settings.spendingEnabled = true;
    state.access = { allowed: true, source: "PREMIUM", eligibleForGafus: false, expiresAt: null };
    expect((await listGafusMiniGuides("reader"))[0]).toMatchObject({
      unlocked: true, canPurchase: false, accessSource: "PREMIUM",
    });
  });
  it("does not read protected guide HTML without entitlement", async () => {
    expect(await getAuthorizedMiniGuideContent({
      userId: "reader", courseId: "course-1",
    })).toBeNull();
    expect(state.protectedReads).toBe(0);
  });

  it("returns protected guide content only after authorization", async () => {
    state.access = { allowed: true, source: "PREMIUM", eligibleForGafus: false, expiresAt: null };
    const content = await getAuthorizedMiniGuideContent({
      userId: "reader", courseId: "course-1",
    });
    expect(content).toBe("<b>Закрытый HTML</b>");
    expect(state.protectedReads).toBe(1);
  });

  it("does not read HTML for an unknown guide", async () => {
    expect(await getAuthorizedMiniGuideContent({
      userId: "reader", courseId: "missing",
    })).toBeNull();
    expect(state.protectedReads).toBe(0);
  });

});

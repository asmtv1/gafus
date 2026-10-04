import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ subscription: vi.fn() }));
vi.mock("@gafus/prisma", () => ({ prisma: { appSubscription: { findFirst: m.subscription } } }));
import { getChatDisplayRole } from "./authorRole";
beforeEach(() => {
  vi.clearAllMocks();
  m.subscription.mockResolvedValue(null);
});
describe("chat author role", () => {
  it.each([
    ["ADMIN", "admin"],
    ["TRAINER", "trainer"],
  ])("prioritizes project role %s", async (role, expected) => {
    expect(await getChatDisplayRole({ id: "u", role })).toBe(expected);
    expect(m.subscription).not.toHaveBeenCalled();
  });
  it("shows subscribers only with an active paid period", async () => {
    m.subscription.mockResolvedValue({ id: "paid" });
    const now = new Date("2026-10-03T12:00:00Z");
    expect(await getChatDisplayRole({ id: "u", role: "USER" }, now)).toBe("subscriber");
    expect(m.subscription).toHaveBeenCalledWith({
      where: {
        userId: "u",
        status: "ACTIVE",
        OR: [{ isLifetime: true }, { currentPeriodEnd: { gt: now } }],
        payments: { some: { status: "SUCCEEDED", amount: { gt: 0 } } },
      },
      select: { id: true },
    });
  });
  it.each(["USER", "PARTNER", "MODERATOR"])(
    "does not invent a badge for %s without paid subscription",
    async (role) => {
      expect(await getChatDisplayRole({ id: "u", role })).toBeNull();
    },
  );
});

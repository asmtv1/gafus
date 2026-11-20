import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ subscription: vi.fn() }));
import { getChatDisplayRole } from "./chatDisplayRole";
beforeEach(() => {
  vi.clearAllMocks();
  m.subscription.mockResolvedValue(null);
});
describe("chat author role", () => {
  it.each([
    ["ADMIN", "admin"],
    ["TRAINER", "trainer"],
  ])("prioritizes project role %s", async (role, expected) => {
    expect(await getChatDisplayRole({ id: "u", role }, m.subscription)).toBe(expected);
    expect(m.subscription).not.toHaveBeenCalled();
  });
  it("shows subscribers only with an active paid period", async () => {
    m.subscription.mockResolvedValue(true);
    const now = new Date("2026-10-03T12:00:00Z");
    expect(await getChatDisplayRole({ id: "u", role: "USER" }, m.subscription, now)).toBe(
      "subscriber",
    );
    expect(m.subscription).toHaveBeenCalledWith("u", now);
  });
  it.each(["USER", "PARTNER", "MODERATOR"])(
    "does not invent a badge for %s without paid subscription",
    async (role) => {
      expect(await getChatDisplayRole({ id: "u", role }, m.subscription)).toBeNull();
    },
  );
});

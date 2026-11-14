import { beforeEach, describe, expect, it, vi } from "vitest";

const spies = vi.hoisted(() => ({ user: vi.fn(), session: vi.fn() }));
vi.mock("@gafus/prisma", () => ({
  prisma: {
    user: { findUnique: spies.user },
    refreshToken: { findUnique: spies.session },
  },
}));
import { sessionIsCurrent } from "./identityReadService";

const active = { userId: "u1", revokedAt: null, expiresAt: new Date(Date.now() + 60_000) };
describe("Access session binding and current role", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    spies.user.mockResolvedValue({ registrationPending: false, sessionsRevokedAt: null, role: "USER" });
    spies.session.mockResolvedValue(active);
  });

  it("accepts a current access JWT bound to an active refresh session", async () => {
    expect(await sessionIsCurrent({ sub: "u1", role: "USER", sid: "session-1", authenticatedAt: Date.now() })).toBe(true);
    expect(spies.session).toHaveBeenCalledWith({
      where: { id: "session-1" }, select: { userId: true, revokedAt: true, expiresAt: true },
    });
  });

  it("rejects an old administrator token immediately after role demotion", async () => {
    expect(await sessionIsCurrent({ sub: "u1", role: "ADMIN", sid: "session-1", authenticatedAt: Date.now() })).toBe(false);
    expect(spies.session).not.toHaveBeenCalled();
  });

  it("rejects a revoked, expired or cross-user session", async () => {
    for (const row of [
      { ...active, revokedAt: new Date() },
      { ...active, expiresAt: new Date(0) },
      { ...active, userId: "another-account" },
      null,
    ]) {
      spies.session.mockResolvedValueOnce(row);
      expect(await sessionIsCurrent({ sub: "u1", role: "USER", sid: "session-1" })).toBe(false);
    }
  });

  it("rejects malformed session id and global credential revocation", async () => {
    expect(await sessionIsCurrent({ sub: "u1", role: "USER", sid: 42 })).toBe(false);
    spies.user.mockResolvedValueOnce({ registrationPending: false, role: "USER", sessionsRevokedAt: new Date(Date.now() + 30_000) });
    expect(await sessionIsCurrent({ sub: "u1", role: "USER", sid: "session-1", authenticatedAt: Date.now() })).toBe(false);
  });
});

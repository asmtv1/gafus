import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const VALID_ACCESS_SECRET = "a".repeat(32);
const { userFindUnique, refreshFindUnique } = vi.hoisted(() => ({ userFindUnique: vi.fn(), refreshFindUnique: vi.fn() }));
vi.mock("@gafus/prisma", () => ({ prisma: { user: { findUnique: userFindUnique }, refreshToken: { findUnique: refreshFindUnique } } }));
const VALID_REFRESH_SECRET = "b".repeat(32);

const authUser = {
  id: "user-1",
  username: "testuser",
  role: "USER" as const,
};

describe("jwt", () => {
  beforeEach(() => {
    userFindUnique.mockResolvedValue({ registrationPending: false, sessionsRevokedAt: null, role: "USER" });
    refreshFindUnique.mockResolvedValue({ userId: "user-1", revokedAt: null, expiresAt: new Date(Date.now() + 60_000) });
    vi.stubEnv("JWT_SECRET", VALID_ACCESS_SECRET);
    vi.stubEnv("JWT_REFRESH_SECRET", VALID_REFRESH_SECRET);
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("generateAccessToken / verifyAccessToken", () => {
    it("rejects access and refresh tokens after password-reset revocation", async () => {
      const jwt = await import("./jwt");
      const access = await jwt.generateAccessToken(authUser);
      const refresh = await jwt.generateRefreshToken(authUser.id, "old-session");
      userFindUnique.mockResolvedValue({ registrationPending: false, sessionsRevokedAt: new Date(Date.now() + 1) });
      expect(await jwt.verifyAccessToken(access)).toBeNull();
      expect(await jwt.verifyRefreshToken(refresh)).toBeNull();
    });
    it("roundtrip: generateAccessToken → verifyAccessToken", async () => {
      const { generateAccessToken, verifyAccessToken } = await import("./jwt");
      const token = await generateAccessToken(authUser);
      const payload = await verifyAccessToken(token);

      expect(payload).not.toBeNull();
      expect(payload!.id).toBe("user-1");
      expect(payload!.username).toBe("testuser");
      expect(payload!.role).toBe("USER");
    });

    it("bound access JWT dies immediately when refresh session is revoked", async () => {
      const { generateAccessToken, verifyAccessToken } = await import("./jwt");
      const jwt = await generateAccessToken(authUser, "session-1");
      expect(await verifyAccessToken(jwt)).not.toBeNull();
      refreshFindUnique.mockResolvedValue({ userId: "user-1", revokedAt: new Date(), expiresAt: new Date(Date.now() + 60_000) });
      expect(await verifyAccessToken(jwt)).toBeNull();
    });

    it("rejects JWT after DB role changes", async () => {
      const { generateAccessToken, verifyAccessToken } = await import("./jwt");
      const jwt = await generateAccessToken(authUser, "session-1");
      userFindUnique.mockResolvedValue({ registrationPending: false, sessionsRevokedAt: null, role: "MODERATOR" });
      expect(await verifyAccessToken(jwt)).toBeNull();
    });

    it("verifyAccessToken с невалидным токеном возвращает null", async () => {
      const { verifyAccessToken } = await import("./jwt");
      expect(await verifyAccessToken("invalid-token")).toBeNull();
    });

    it("verifyAccessToken с токеном от другого secret возвращает null", async () => {
      const { generateAccessToken, verifyAccessToken } = await import("./jwt");
      vi.stubEnv("JWT_SECRET", "x".repeat(32));
      vi.resetModules();
      const { generateAccessToken: genOther } = await import("./jwt");
      const otherToken = await genOther(authUser);

      vi.stubEnv("JWT_SECRET", VALID_ACCESS_SECRET);
      vi.resetModules();
      const { verifyAccessToken: verify } = await import("./jwt");
      expect(await verify(otherToken)).toBeNull();
    });
  });

  describe("generateRefreshToken / verifyRefreshToken", () => {
    it("roundtrip: generateRefreshToken → verifyRefreshToken", async () => {
      const { generateRefreshToken, verifyRefreshToken } = await import("./jwt");
      const token = await generateRefreshToken("user-1", "token-id-1");
      const payload = await verifyRefreshToken(token);

      expect(payload).not.toBeNull();
      expect(payload!.userId).toBe("user-1");
      expect(payload!.tokenId).toBe("token-id-1");
    });

    it("verifyRefreshToken с невалидным токеном возвращает null", async () => {
      const { verifyRefreshToken } = await import("./jwt");
      expect(await verifyRefreshToken("invalid")).toBeNull();
    });
  });

  describe("getAccessSecret / getRefreshSecret throw при коротком secret", () => {
    it("generateAccessToken throw при JWT_SECRET < 32", async () => {
      vi.stubEnv("JWT_SECRET", "short");
      vi.resetModules();

      const { generateAccessToken } = await import("./jwt");

      await expect(
        generateAccessToken(authUser),
      ).rejects.toThrow("JWT_SECRET must be at least 32 characters");
    });

    it("generateRefreshToken throw при JWT_REFRESH_SECRET < 32", async () => {
      vi.stubEnv("JWT_REFRESH_SECRET", "short");
      vi.resetModules();

      const { generateRefreshToken } = await import("./jwt");

      await expect(
        generateRefreshToken("user-1", "tid"),
      ).rejects.toThrow("JWT_REFRESH_SECRET must be at least 32 characters");
    });
  });
});

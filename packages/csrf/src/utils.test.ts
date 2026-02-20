import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGet = vi.fn();
const mockSet = vi.fn();
const mockDelete = vi.fn();

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  }),
}));

vi.mock("./csrf-crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./csrf-crypto")>();
  return {
    ...actual,
    generateSecureToken: vi.fn((bytes: number) => "a".repeat(bytes * 2)),
  };
});

describe("utils (CSRF)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { cookies } = await import("next/headers");
    vi.mocked(cookies).mockResolvedValue({
      get: mockGet,
      set: mockSet,
      delete: mockDelete,
      getAll: vi.fn(),
      has: vi.fn(),
    } as never);
  });

  describe("generateCSRFToken", () => {
    it("создаёт secret и token когда cookies пустые", async () => {
      const { generateCSRFToken } = await import("./utils");
      mockGet.mockReturnValue(undefined);

      const token = await generateCSRFToken();

      expect(token).toContain(".");
      expect(mockSet).toHaveBeenCalled();
    });

    it("переиспользует secret из cookies", async () => {
      const { generateCSRFToken } = await import("./utils");
      mockGet
        .mockReturnValueOnce({ value: "existing-secret" })
        .mockReturnValueOnce(undefined);

      const token = await generateCSRFToken();

      expect(token).toBeTruthy();
      expect(mockSet).toHaveBeenCalled();
    });
  });

  describe("verifyCSRFToken", () => {
    it("возвращает false при невалидном формате", async () => {
      const { verifyCSRFToken } = await import("./utils");

      expect(await verifyCSRFToken("invalid")).toBe(false);
      expect(await verifyCSRFToken("short.longer")).toBe(false);
    });

    it("возвращает false когда нет secret или storedToken", async () => {
      const { verifyCSRFToken } = await import("./utils");
      const { generateSecureToken } = await import("./csrf-crypto");
      const validFormat = "a".repeat(32) + "." + "b".repeat(64);
      mockGet.mockReturnValue(undefined);

      const result = await verifyCSRFToken(validFormat);

      expect(result).toBe(false);
    });
  });

  describe("refreshCSRFToken", () => {
    it("вызывает delete и generateCSRFToken", async () => {
      const { refreshCSRFToken } = await import("./utils");

      const token = await refreshCSRFToken();

      expect(mockDelete).toHaveBeenCalled();
      expect(token).toBeTruthy();
    });
  });

  describe("isCSRFTokenExpired", () => {
    it("возвращает true когда нет token", async () => {
      const { isCSRFTokenExpired } = await import("./utils");
      mockGet.mockReturnValue(undefined);

      expect(await isCSRFTokenExpired()).toBe(true);
    });
  });

  describe("getCSRFTokenInfo", () => {
    it("возвращает hasToken: false когда cookie пуста", async () => {
      const { getCSRFTokenInfo } = await import("./utils");
      mockGet.mockReturnValue(undefined);

      const info = await getCSRFTokenInfo();

      expect(info.hasToken).toBe(false);
      expect(info.hasSecret).toBe(false);
      expect(info.isExpired).toBe(true);
    });
  });
});

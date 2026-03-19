import { describe, expect, it, beforeEach, vi } from "vitest";

import { recordOfertaAcceptance } from "./ofertaAcceptanceService";

const mockOfertaAcceptanceCreate = vi.fn();

vi.mock("@gafus/prisma", () => ({
  prisma: {
    ofertaAcceptance: {
      create: (...args: unknown[]) => mockOfertaAcceptanceCreate(...args),
    },
  },
}));

vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  }),
}));

vi.mock("../../config/documentVersions", () => ({
  DOCUMENT_VERSIONS: { oferta: "1" },
}));

describe("recordOfertaAcceptance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("возвращает success при успешной записи", async () => {
    mockOfertaAcceptanceCreate.mockResolvedValue({});

    const result = await recordOfertaAcceptance({
      userId: "u1",
      courseId: "c1",
      paymentId: "p1",
      ipAddress: "127.0.0.1",
      userAgent: "Mozilla",
      source: "web",
    });

    expect(result).toEqual({ success: true });
    expect(mockOfertaAcceptanceCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "u1",
          courseId: "c1",
          paymentId: "p1",
          source: "web",
        }),
      }),
    );
  });

  it("возвращает ошибку при сбое Prisma", async () => {
    mockOfertaAcceptanceCreate.mockRejectedValue(new Error("db"));

    const result = await recordOfertaAcceptance({
      userId: "u1",
      courseId: "c1",
      source: "mobile",
    });

    expect(result.success).toBe(false);
    expect(result.success === false && result.error).toBeDefined();
  });
});

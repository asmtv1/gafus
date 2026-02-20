import { describe, expect, it, beforeEach, vi } from "vitest";

import { getAllPurchases } from "./adminPurchaseService";

const mockPaymentFindMany = vi.fn();

vi.mock("@gafus/prisma", () => ({
  prisma: {
    payment: {
      findMany: (...args: unknown[]) => mockPaymentFindMany(...args),
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

describe("getAllPurchases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns purchases on success", async () => {
    mockPaymentFindMany.mockResolvedValue([
      {
        id: "p1",
        userId: "u1",
        courseId: "c1",
        amountRub: 1000,
        currency: "RUB",
        status: "PAID",
        user: { username: "u", phone: "+7", profile: null },
        course: { name: "C", type: "f", priceRub: 1000 },
      },
    ]);

    const result = await getAllPurchases();

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
  });

  it("returns error on prisma failure", async () => {
    mockPaymentFindMany.mockRejectedValue(new Error("DB error"));

    const result = await getAllPurchases();

    expect(result.success).toBe(false);
    expect(result.error).toContain("покупок");
  });
});

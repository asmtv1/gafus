import { describe, expect, it, beforeEach, vi } from "vitest";

import { getStorageStats } from "./adminStorageService";

const mockExamResultCount = vi.fn();

vi.mock("@gafus/prisma", () => ({
  prisma: {
    examResult: {
      count: (...args: unknown[]) => mockExamResultCount(...args),
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

describe("getStorageStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExamResultCount.mockResolvedValue(0);
  });

  it("returns stats on success", async () => {
    const result = await getStorageStats();

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data).toHaveProperty("totalExamResults");
  });

  it("returns error on prisma failure", async () => {
    mockExamResultCount.mockRejectedValue(new Error("DB error"));

    const result = await getStorageStats();

    expect(result.success).toBe(false);
  });
});

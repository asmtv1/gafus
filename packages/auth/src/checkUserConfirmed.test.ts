import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUserFindUnique = vi.fn();

vi.mock("@gafus/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
    },
  },
}));

describe("checkUserConfirmed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("возвращает true когда user.isConfirmed = true", async () => {
    const { checkUserConfirmed } = await import("./checkUserConfirmed");
    mockUserFindUnique.mockResolvedValue({ isConfirmed: true });

    const result = await checkUserConfirmed("+79001234567");

    expect(result).toBe(true);
    expect(mockUserFindUnique).toHaveBeenCalledWith({
      where: { phone: "+79001234567" },
      select: { isConfirmed: true },
    });
  });

  it("возвращает false когда user.isConfirmed = false", async () => {
    const { checkUserConfirmed } = await import("./checkUserConfirmed");
    mockUserFindUnique.mockResolvedValue({ isConfirmed: false });

    const result = await checkUserConfirmed("+79001234567");

    expect(result).toBe(false);
  });

  it("возвращает false когда user не найден", async () => {
    const { checkUserConfirmed } = await import("./checkUserConfirmed");
    mockUserFindUnique.mockResolvedValue(null);

    const result = await checkUserConfirmed("+79001234567");

    expect(result).toBe(false);
  });

  it("нормализует phone: добавляет + и убирает не-цифры", async () => {
    const { checkUserConfirmed } = await import("./checkUserConfirmed");
    mockUserFindUnique.mockResolvedValue({ isConfirmed: true });

    await checkUserConfirmed("8 (900) 123-45-67");

    expect(mockUserFindUnique).toHaveBeenCalledWith({
      where: { phone: "+89001234567" },
      select: { isConfirmed: true },
    });
  });
});

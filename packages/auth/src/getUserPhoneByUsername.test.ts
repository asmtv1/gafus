import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUserFindUnique = vi.fn();

vi.mock("@gafus/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
    },
  },
}));

describe("getUserPhoneByUsername", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("возвращает phone когда user найден", async () => {
    const { getUserPhoneByUsername } = await import("./getUserPhoneByUsername");
    mockUserFindUnique.mockResolvedValue({ phone: "+79001234567" });

    const result = await getUserPhoneByUsername("testuser");

    expect(result).toBe("+79001234567");
    expect(mockUserFindUnique).toHaveBeenCalledWith({
      where: { username: "testuser" },
      select: { phone: true },
    });
  });

  it("возвращает null когда user не найден", async () => {
    const { getUserPhoneByUsername } = await import("./getUserPhoneByUsername");
    mockUserFindUnique.mockResolvedValue(null);

    const result = await getUserPhoneByUsername("unknown");

    expect(result).toBeNull();
  });

  it("нормализует username: toLowerCase и trim", async () => {
    const { getUserPhoneByUsername } = await import("./getUserPhoneByUsername");
    mockUserFindUnique.mockResolvedValue({ phone: "+79001234567" });

    await getUserPhoneByUsername("  TestUser  ");

    expect(mockUserFindUnique).toHaveBeenCalledWith({
      where: { username: "testuser" },
      select: { phone: true },
    });
  });
});

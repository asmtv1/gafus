import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUserFindUnique = vi.fn();
const mockUserCreate = vi.fn();
const mockBcryptHash = vi.fn();
const mockParsePhoneNumberFromString = vi.fn();

vi.mock("@gafus/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
      create: (...args: unknown[]) => mockUserCreate(...args),
    },
  },
}));

vi.mock("bcryptjs", () => ({
  default: {
    hash: (...args: unknown[]) => mockBcryptHash(...args),
  },
}));

vi.mock("libphonenumber-js", () => ({
  parsePhoneNumberFromString: (...args: unknown[]) =>
    mockParsePhoneNumberFromString(...args),
}));

describe("registerUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockParsePhoneNumberFromString.mockReturnValue({
      isValid: () => true,
      format: () => "+79001234567",
    });
  });

  it("success: создаёт user, хеширует пароль", async () => {
    const { registerUser } = await import("./registerUser");
    mockUserFindUnique.mockResolvedValue(null).mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    mockBcryptHash.mockResolvedValue("hashed");
    mockUserCreate.mockResolvedValue({});

    const result = await registerUser("TestUser", "+79001234567", "password123");

    expect(result).toEqual({ success: true });
    expect(mockBcryptHash).toHaveBeenCalledWith("password123", expect.any(Number));
    expect(mockUserCreate).toHaveBeenCalled();
  });

  it("возвращает error при невалидном номере телефона", async () => {
    const { registerUser } = await import("./registerUser");
    mockParsePhoneNumberFromString.mockReturnValue(null);

    const result = await registerUser("TestUser", "invalid", "pass");

    expect(result).toEqual({ error: "Неверный номер телефона" });
    expect(mockUserCreate).not.toHaveBeenCalled();
  });

  it("возвращает error при invalid phone (isValid false)", async () => {
    const { registerUser } = await import("./registerUser");
    mockParsePhoneNumberFromString.mockReturnValue({
      isValid: () => false,
      format: () => "+79001234567",
    });

    const result = await registerUser("TestUser", "+79001234567", "pass");

    expect(result).toEqual({ error: "Неверный номер телефона" });
  });

  it("возвращает error при дубликате phone", async () => {
    const { registerUser } = await import("./registerUser");
    mockUserFindUnique.mockResolvedValueOnce({ id: "existing" });

    const result = await registerUser("TestUser", "+79001234567", "pass");

    expect(result).toHaveProperty("error");
    expect((result as { error?: string }).error).toMatch(/уже существует|такими данными/);
    expect(mockUserCreate).not.toHaveBeenCalled();
  });

  it("возвращает error при дубликате username", async () => {
    const { registerUser } = await import("./registerUser");
    mockUserFindUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "existing" });

    const result = await registerUser("TestUser", "+79001234567", "pass");

    expect(result).toHaveProperty("error");
    expect((result as { error?: string }).error).toMatch(/уже существует|такими данными/);
    expect(mockUserCreate).not.toHaveBeenCalled();
  });
});

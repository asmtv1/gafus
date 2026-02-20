import { describe, expect, it, beforeEach, vi } from "vitest";

import {
  checkUserState,
  serverCheckUserConfirmed,
  sendPasswordResetRequest,
  registerUserService,
  changeUsername,
} from "./authService";

const mockGetUserPhoneByUsername = vi.fn();
const mockCheckUserConfirmed = vi.fn();
const mockMaskPhone = vi.fn();
const mockRegisterUser = vi.fn();
const mockSendTelegramPasswordResetRequest = vi.fn();
const mockSendTelegramUsernameChangeNotification = vi.fn();

const mockUserFindUnique = vi.fn();
const mockUserUpdate = vi.fn();

vi.mock("@gafus/auth", () => ({
  checkUserConfirmed: (...args: unknown[]) => mockCheckUserConfirmed(...args),
  getUserPhoneByUsername: (...args: unknown[]) => mockGetUserPhoneByUsername(...args),
  maskPhone: (phone: string) => mockMaskPhone(phone),
  registerUser: (...args: unknown[]) => mockRegisterUser(...args),
  sendTelegramPasswordResetRequest: (...args: unknown[]) =>
    mockSendTelegramPasswordResetRequest(...args),
  sendTelegramUsernameChangeNotification: (...args: unknown[]) =>
    mockSendTelegramUsernameChangeNotification(...args),
  confirmPhoneChangeByShortCode: vi.fn(),
  resetPasswordByShortCode: vi.fn(),
  resetPasswordByToken: vi.fn(),
  sendTelegramPhoneChangeRequest: vi.fn(),
}));

vi.mock("@gafus/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
      update: (...args: unknown[]) => mockUserUpdate(...args),
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

describe("checkUserState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns confirmed when user found and confirmed", async () => {
    mockGetUserPhoneByUsername.mockResolvedValue("+79001234567");
    mockCheckUserConfirmed.mockResolvedValue(true);
    mockMaskPhone.mockReturnValue("+7 *** *** 67");

    const result = await checkUserState("testuser");

    expect(result).toEqual({
      confirmed: true,
      phoneHint: "+7 *** *** 67",
      needsConfirm: false,
    });
  });

  it("returns needsConfirm when user found but not confirmed", async () => {
    mockGetUserPhoneByUsername.mockResolvedValue("+79001234567");
    mockCheckUserConfirmed.mockResolvedValue(false);
    mockMaskPhone.mockReturnValue("+7 *** *** 67");

    const result = await checkUserState("testuser");

    expect(result).toEqual({
      confirmed: false,
      phoneHint: "+7 *** *** 67",
      needsConfirm: true,
    });
  });

  it("returns confirmed false when user not found", async () => {
    mockGetUserPhoneByUsername.mockResolvedValue(null);

    const result = await checkUserState("unknown");

    expect(result).toEqual({ confirmed: false });
    expect(mockCheckUserConfirmed).not.toHaveBeenCalled();
  });
});

describe("serverCheckUserConfirmed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates to checkUserConfirmed", async () => {
    mockCheckUserConfirmed.mockResolvedValue(true);

    const result = await serverCheckUserConfirmed("+79001234567");

    expect(result).toBe(true);
    expect(mockCheckUserConfirmed).toHaveBeenCalledWith("+79001234567");
  });
});

describe("sendPasswordResetRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates to sendTelegramPasswordResetRequest", async () => {
    mockSendTelegramPasswordResetRequest.mockResolvedValue({ ok: true });

    await sendPasswordResetRequest("testuser", "+79001234567");

    expect(mockSendTelegramPasswordResetRequest).toHaveBeenCalledWith(
      "testuser",
      "+79001234567",
    );
  });
});

describe("registerUserService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls registerUser with params", async () => {
    mockRegisterUser.mockResolvedValue({ userId: "user-1" });

    const result = await registerUserService("Иван", "+79001234567", "password");

    expect(mockRegisterUser).toHaveBeenCalledWith(
      "Иван",
      "+79001234567",
      "password",
    );
    expect(result).toEqual({ userId: "user-1" });
  });
});

describe("changeUsername", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when username too short", async () => {
    await expect(changeUsername("user-1", "ab")).rejects.toThrow(/3 символа/);
  });

  it("throws when username invalid format", async () => {
    await expect(changeUsername("user-1", "кириллица")).rejects.toThrow(/латиница/);
  });

  it("throws when user not found", async () => {
    mockUserFindUnique.mockResolvedValue(null);

    await expect(changeUsername("user-1", "newuser")).rejects.toThrow(
      "Пользователь не найден",
    );
  });

  it("returns early when username unchanged", async () => {
    mockUserFindUnique.mockResolvedValue({
      id: "user-1",
      username: "sameuser",
      telegramId: null,
    });

    await changeUsername("user-1", "sameuser");

    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it("throws when username already taken", async () => {
    mockUserFindUnique
      .mockResolvedValueOnce({
        id: "user-1",
        username: "olduser",
        telegramId: null,
      })
      .mockResolvedValueOnce({ id: "other-user" });

    await expect(changeUsername("user-1", "taken")).rejects.toThrow("Логин уже занят");
  });

  it("updates username on success", async () => {
    mockUserFindUnique
      .mockResolvedValueOnce({
        id: "user-1",
        username: "olduser",
        telegramId: null,
      })
      .mockResolvedValueOnce(null);
    mockUserUpdate.mockResolvedValue({});

    await changeUsername("user-1", "newuser");

    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { username: "newuser" },
    });
  });
});

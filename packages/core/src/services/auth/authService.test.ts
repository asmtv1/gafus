import { describe, expect, it, beforeEach, vi } from "vitest";

import {
  changePassword,
  changeUsername,
  checkUserState,
  createRefreshSession,
  getAuthUserById,
  isUsernameAvailable,
  REGISTER_CREDENTIALS_CONFLICT_PUBLIC_MESSAGE,
  registerUserService,
  requestPhoneChange,
  confirmPhoneChange,
  resetPassword,
  resetPasswordByCode,
  revokeAllUserTokens,
  revokeRefreshToken,
  rotateRefreshToken,
  sendPasswordResetRequest,
  serverCheckUserConfirmed,
  setPassword,
  setVkPhone,
  validateCredentials,
  validateRefreshToken,
} from "./authService";

const bcryptMocks = vi.hoisted(() => ({
  compare: vi.fn(),
  hash: vi.fn(),
}));

vi.mock("bcryptjs", () => ({
  default: {
    compare: (...args: unknown[]) => bcryptMocks.compare(...args),
    hash: (...args: unknown[]) => bcryptMocks.hash(...args),
  },
}));

const mockCheckUserConfirmed = vi.fn();
const mockMaskPhone = vi.fn();
const mockRegisterUserWithCredentials = vi.hoisted(() => vi.fn());
const mockSendTelegramPasswordResetRequest = vi.fn();
const mockSendTelegramUsernameChangeNotification = vi.fn();
const mockResetPasswordByToken = vi.fn();
const mockResetPasswordByShortCode = vi.fn();
const mockSendTelegramPhoneChangeRequest = vi.fn();
const mockConfirmPhoneChangeByShortCode = vi.fn();

const mockUserFindUnique = vi.fn();
const mockUserFindFirst = vi.fn();
const mockUserUpdate = vi.fn();
const mockRefreshTokenCreate = vi.fn();
const mockRefreshTokenFindUnique = vi.fn();
const mockRefreshTokenUpdateMany = vi.fn();

const mockTxRefreshUpdateMany = vi.fn();
const mockTxRefreshCreate = vi.fn();
const refreshTxStub = {
  refreshToken: {
    updateMany: (...args: unknown[]) => mockTxRefreshUpdateMany(...args),
    create: (...args: unknown[]) => mockTxRefreshCreate(...args),
  },
};

const mockTransaction = vi.fn((fn: (tx: typeof refreshTxStub) => Promise<unknown>) =>
  fn(refreshTxStub),
);

vi.mock("./registerUserWithCredentials", () => ({
  registerUserWithCredentials: (...args: unknown[]) => mockRegisterUserWithCredentials(...args),
}));

vi.mock("@gafus/auth", () => ({
  checkUserConfirmed: (...args: unknown[]) => mockCheckUserConfirmed(...args),
  maskPhone: (phone: string) => mockMaskPhone(phone),
  sendTelegramPasswordResetRequest: (...args: unknown[]) =>
    mockSendTelegramPasswordResetRequest(...args),
  sendTelegramUsernameChangeNotification: (...args: unknown[]) =>
    mockSendTelegramUsernameChangeNotification(...args),
  confirmPhoneChangeByShortCode: (...args: unknown[]) =>
    mockConfirmPhoneChangeByShortCode(...args),
  resetPasswordByShortCode: (...args: unknown[]) => mockResetPasswordByShortCode(...args),
  resetPasswordByToken: (...args: unknown[]) => mockResetPasswordByToken(...args),
  sendTelegramPhoneChangeRequest: (...args: unknown[]) =>
    mockSendTelegramPhoneChangeRequest(...args),
}));

vi.mock("@gafus/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
      findFirst: (...args: unknown[]) => mockUserFindFirst(...args),
      update: (...args: unknown[]) => mockUserUpdate(...args),
    },
    refreshToken: {
      create: (...args: unknown[]) => mockRefreshTokenCreate(...args),
      findUnique: (...args: unknown[]) => mockRefreshTokenFindUnique(...args),
      updateMany: (...args: unknown[]) => mockRefreshTokenUpdateMany(...args),
    },
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => mockTransaction(fn),
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

const validNewPassword = "Password1x";

describe("checkUserState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns confirmed when user found and confirmed", async () => {
    mockUserFindUnique.mockResolvedValue({
      phone: "+79001234567",
      isConfirmed: true,
    });
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
    mockUserFindUnique.mockResolvedValue({
      phone: "+79001234567",
      isConfirmed: false,
    });
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
    mockUserFindUnique.mockResolvedValue(null);

    const result = await checkUserState("unknown");

    expect(result).toEqual({ confirmed: false });
    expect(mockCheckUserConfirmed).not.toHaveBeenCalled();
  });

  it("email-only: без телефона, isConfirmed true — вход без подтверждения", async () => {
    mockUserFindUnique.mockResolvedValue({ phone: null, isConfirmed: true });

    const result = await checkUserState("emailuser");

    expect(result).toEqual({
      confirmed: true,
      needsConfirm: false,
    });
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

  it("успех: делегирует в registerUserWithCredentials", async () => {
    mockRegisterUserWithCredentials.mockResolvedValue({ ok: true, userId: "user-1" });

    const result = await registerUserService("ivan", "ivan@example.com", "Password1x");

    expect(mockRegisterUserWithCredentials).toHaveBeenCalledWith({
      username: "ivan",
      email: "ivan@example.com",
      password: "Password1x",
    });
    expect(result).toEqual({ success: true, userId: "user-1" });
  });

  it("маскирует конфликт username/email", async () => {
    mockRegisterUserWithCredentials.mockResolvedValue({
      ok: false,
      code: "EMAIL_TAKEN",
      messageRu: "внутреннее",
    });

    const result = await registerUserService("ivan", "taken@example.com", "Password1x");

    expect(result).toEqual({ error: REGISTER_CREDENTIALS_CONFLICT_PUBLIC_MESSAGE });
  });
});

describe("resetPassword / resetPasswordByCode / phone change", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResetPasswordByToken.mockResolvedValue(undefined);
    mockResetPasswordByShortCode.mockResolvedValue(undefined);
    mockSendTelegramPhoneChangeRequest.mockResolvedValue(undefined);
    mockConfirmPhoneChangeByShortCode.mockResolvedValue(undefined);
  });

  it("resetPassword вызывает resetPasswordByToken", async () => {
    await resetPassword("tok", validNewPassword);
    expect(mockResetPasswordByToken).toHaveBeenCalledWith("tok", validNewPassword);
  });

  it("resetPasswordByCode вызывает resetPasswordByShortCode", async () => {
    await resetPasswordByCode("123456", validNewPassword);
    expect(mockResetPasswordByShortCode).toHaveBeenCalledWith("123456", validNewPassword);
  });

  it("requestPhoneChange вызывает sendTelegramPhoneChangeRequest", async () => {
    await requestPhoneChange("u1");
    expect(mockSendTelegramPhoneChangeRequest).toHaveBeenCalledWith("u1");
  });

  it("confirmPhoneChange вызывает confirmPhoneChangeByShortCode", async () => {
    await confirmPhoneChange("111111", "+79001234567");
    expect(mockConfirmPhoneChangeByShortCode).toHaveBeenCalledWith(
      "111111",
      "+79001234567",
    );
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

  it("throws Логин уже занят при P2002", async () => {
    mockUserFindUnique
      .mockResolvedValueOnce({
        id: "user-1",
        username: "old",
        telegramId: null,
      })
      .mockResolvedValueOnce(null);
    mockUserUpdate.mockRejectedValue(Object.assign(new Error("u"), { code: "P2002" }));

    await expect(changeUsername("user-1", "newuser2")).rejects.toThrow("Логин уже занят");
  });

  it("отправляет уведомление в Telegram при смене логина", async () => {
    mockUserFindUnique
      .mockResolvedValueOnce({
        id: "user-1",
        username: "old",
        telegramId: "tg-1",
      })
      .mockResolvedValueOnce(null);
    mockUserUpdate.mockResolvedValue({});
    mockSendTelegramUsernameChangeNotification.mockResolvedValue(undefined);

    await changeUsername("user-1", "newname");

    expect(mockSendTelegramUsernameChangeNotification).toHaveBeenCalledWith("tg-1", "newname");
  });
});

describe("isUsernameAvailable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("false при слишком коротком логине", async () => {
    await expect(isUsernameAvailable("ab")).resolves.toBe(false);
    expect(mockUserFindUnique).not.toHaveBeenCalled();
  });

  it("true если логин совпадает с текущим пользователем", async () => {
    mockUserFindUnique.mockResolvedValue({ username: "same" });

    await expect(isUsernameAvailable("same", "user-1")).resolves.toBe(true);
  });

  it("true если логин свободен", async () => {
    mockUserFindUnique.mockResolvedValue(null);

    await expect(isUsernameAvailable("freeuser")).resolves.toBe(true);
  });

  it("false если логин занят другим", async () => {
    mockUserFindUnique.mockResolvedValue({ id: "other" });

    await expect(isUsernameAvailable("taken", "me")).resolves.toBe(false);
  });
});

describe("getAuthUserById", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("возвращает пользователя или null", async () => {
    mockUserFindUnique.mockResolvedValue({
      id: "u1",
      username: "n",
      role: "USER",
      phone: "+79001234567",
    });

    await expect(getAuthUserById("u1")).resolves.toEqual({
      id: "u1",
      username: "n",
      role: "USER",
      phone: "+79001234567",
    });

    mockUserFindUnique.mockResolvedValue(null);
    await expect(getAuthUserById("x")).resolves.toBeNull();
  });
});

describe("validateCredentials", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bcryptMocks.compare.mockResolvedValue(true as unknown as boolean);
  });

  it("success: false если пользователь не найден", async () => {
    mockUserFindUnique.mockResolvedValue(null);

    await expect(validateCredentials("nouser", "pw")).resolves.toEqual({ success: false });
  });

  it("success: false если пароль неверный", async () => {
    mockUserFindUnique.mockResolvedValue({
      id: "1",
      username: "u",
      role: "USER",
      password: "hash",
    });
    bcryptMocks.compare.mockResolvedValue(false as unknown as boolean);

    await expect(validateCredentials("u", "wrong")).resolves.toEqual({ success: false });
  });

  it("success: true при верном пароле", async () => {
    const userRow = {
      id: "1",
      username: "u",
      role: "USER",
      password: "hash",
    };
    mockUserFindUnique.mockResolvedValue(userRow);
    bcryptMocks.compare.mockResolvedValue(true as unknown as boolean);

    await expect(validateCredentials("U", "pw")).resolves.toEqual({
      success: true,
      user: userRow,
    });
  });
});

describe("refresh token session", () => {
  const expiresAt = new Date(Date.now() + 86400000);

  beforeEach(() => {
    vi.clearAllMocks();
    mockRefreshTokenCreate.mockResolvedValue({});
    mockRefreshTokenFindUnique.mockResolvedValue(null);
    mockRefreshTokenUpdateMany.mockResolvedValue({ count: 1 });
    mockTxRefreshUpdateMany.mockResolvedValue({ count: 1 });
    mockTxRefreshCreate.mockResolvedValue({});
  });

  it("createRefreshSession создаёт запись", async () => {
    await createRefreshSession("u1", "tid", "hash", {
      deviceId: "d",
      userAgent: "ua",
      ipAddress: "1.1.1.1",
      expiresAt,
    });

    expect(mockRefreshTokenCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: "tid",
        userId: "u1",
        tokenHash: "hash",
        deviceId: "d",
        userAgent: "ua",
        ipAddress: "1.1.1.1",
        expiresAt,
      }),
    });
  });

  it("validateRefreshToken: not_found", async () => {
    await expect(validateRefreshToken("h")).resolves.toEqual({
      valid: false,
      reason: "not_found",
    });
  });

  it("validateRefreshToken: token_reuse", async () => {
    mockRefreshTokenFindUnique.mockResolvedValue({
      revokedAt: new Date(),
      userId: "u1",
      id: "t",
      expiresAt,
      user: { id: "u1", username: "n", role: "USER" },
    });

    await expect(validateRefreshToken("h")).resolves.toEqual({
      valid: false,
      reason: "token_reuse",
      userId: "u1",
    });
  });

  it("validateRefreshToken: expired", async () => {
    mockRefreshTokenFindUnique.mockResolvedValue({
      revokedAt: null,
      userId: "u1",
      id: "t",
      expiresAt: new Date(0),
      user: { id: "u1", username: "n", role: "USER" },
    });

    await expect(validateRefreshToken("h")).resolves.toEqual({
      valid: false,
      reason: "expired",
    });
  });

  it("validateRefreshToken: success", async () => {
    mockRefreshTokenFindUnique.mockResolvedValue({
      revokedAt: null,
      userId: "u1",
      id: "t1",
      expiresAt,
      user: { id: "u1", username: "n", role: "USER" },
    });

    await expect(validateRefreshToken("h")).resolves.toEqual({
      valid: true,
      userId: "u1",
      tokenId: "t1",
      user: { id: "u1", username: "n", role: "USER" },
    });
  });

  it("rotateRefreshToken вызывает транзакцию", async () => {
    await rotateRefreshToken("old", "u1", "newh", "newid", { expiresAt });

    expect(mockTransaction).toHaveBeenCalled();
    expect(mockTxRefreshUpdateMany).toHaveBeenCalled();
    expect(mockTxRefreshCreate).toHaveBeenCalled();
  });

  it("revokeRefreshToken и revokeAllUserTokens", async () => {
    await revokeRefreshToken("h");
    expect(mockRefreshTokenUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tokenHash: "h" } }),
    );

    await revokeAllUserTokens("u1");
    expect(mockRefreshTokenUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1", revokedAt: null } }),
    );
  });
});

describe("setVkPhone / setPassword / changePassword", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bcryptMocks.hash.mockResolvedValue("new-hash" as never);
    bcryptMocks.compare.mockResolvedValue(true as unknown as boolean);
    mockUserUpdate.mockResolvedValue({});
  });

  it("setVkPhone: ошибка если не vk_ телефон", async () => {
    mockUserFindUnique.mockResolvedValue({ phone: "+79001234567" });

    await expect(setVkPhone("u1", "+79001112233")).rejects.toThrow(
      "Смена номера недоступна через этот метод",
    );
  });

  it("setVkPhone: ошибка если телефон отсутствует", async () => {
    mockUserFindUnique.mockResolvedValue({ phone: null });

    await expect(setVkPhone("u1", "+79001234567")).rejects.toThrow(
      "Смена номера недоступна через этот метод",
    );
  });

  it("setVkPhone: успех", async () => {
    mockUserFindUnique.mockResolvedValue({ phone: "vk_99" });
    mockUserFindFirst.mockResolvedValue(null);

    await setVkPhone("u1", "+79001234567");

    expect(mockUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "u1" },
        data: { phone: "+79001234567" },
      }),
    );
  });

  it("setPassword: ошибка если пароль уже установлен", async () => {
    mockUserFindUnique.mockResolvedValue({ passwordSetAt: new Date() });

    await expect(setPassword("u1", validNewPassword)).rejects.toThrow("уже установлен");
  });

  it("setPassword: успех", async () => {
    mockUserFindUnique.mockResolvedValue({ passwordSetAt: null });

    await setPassword("u1", validNewPassword);

    expect(bcryptMocks.hash).toHaveBeenCalled();
    expect(mockUserUpdate).toHaveBeenCalled();
  });

  it("changePassword: ошибка если пароль ещё не установлен", async () => {
    mockUserFindUnique.mockResolvedValue({
      password: "h",
      passwordSetAt: null,
    });

    await expect(
      changePassword("u1", "old", validNewPassword),
    ).rejects.toThrow("Сначала установите пароль");
  });

  it("changePassword: ошибка при неверном текущем пароле", async () => {
    mockUserFindUnique.mockResolvedValue({
      password: "h",
      passwordSetAt: new Date(),
    });
    bcryptMocks.compare.mockResolvedValue(false as unknown as boolean);

    await expect(
      changePassword("u1", "wrong", validNewPassword),
    ).rejects.toThrow("Неверный текущий пароль");
  });

  it("changePassword: успех", async () => {
    mockUserFindUnique.mockResolvedValue({
      password: "h",
      passwordSetAt: new Date(),
    });
    bcryptMocks.compare.mockResolvedValue(true as unknown as boolean);

    await changePassword("u1", "Oldpass1", validNewPassword);

    expect(mockUserUpdate).toHaveBeenCalled();
  });
});

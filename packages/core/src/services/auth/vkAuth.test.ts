import { describe, expect, it, beforeEach, vi } from "vitest";

const bcryptMocks = vi.hoisted(() => ({
  hash: vi.fn().mockResolvedValue("mock-bcrypt-hash"),
}));

vi.mock("bcryptjs", () => ({
  default: {
    hash: (...args: unknown[]) => bcryptMocks.hash(...args),
  },
}));

import {
  exchangeVkCodeAndGetUser,
  exchangeVkCodeForProfile,
  fetchVkProfile,
  findOrCreateVkUser,
  generateUniqueVkUsername,
  linkVkToUser,
  type VkProfile,
} from "./vkAuth";

const mockAccountFindUnique = vi.fn();
const mockUserFindFirst = vi.fn();
const mockUserProfileUpsert = vi.fn();
const mockUserProfileFindUnique = vi.fn();

const mockTxUserCreate = vi.fn();
const mockTxUserProfileCreate = vi.fn();
const mockTxUserProfileFindUnique = vi.fn();
const mockTxUserProfileUpsert = vi.fn();
const mockTxAccountCreate = vi.fn();

const vkTxStub = {
  user: {
    create: (...args: unknown[]) => mockTxUserCreate(...args),
  },
  userProfile: {
    create: (...args: unknown[]) => mockTxUserProfileCreate(...args),
    findUnique: (...args: unknown[]) => mockTxUserProfileFindUnique(...args),
    upsert: (...args: unknown[]) => mockTxUserProfileUpsert(...args),
  },
  account: {
    create: (...args: unknown[]) => mockTxAccountCreate(...args),
  },
};

const mockVkTransaction = vi.fn((fn: (tx: typeof vkTxStub) => Promise<unknown>) =>
  fn(vkTxStub),
);

vi.mock("@gafus/prisma", () => ({
  prisma: {
    account: {
      findUnique: (...args: unknown[]) => mockAccountFindUnique(...args),
      create: vi.fn(),
    },
    user: {
      findFirst: (...args: unknown[]) => mockUserFindFirst(...args),
    },
    userProfile: {
      upsert: (...args: unknown[]) => mockUserProfileUpsert(...args),
      findUnique: (...args: unknown[]) => mockUserProfileFindUnique(...args),
    },
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => mockVkTransaction(fn),
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

describe("generateUniqueVkUsername", () => {
  it("строит логин из имён через транслит", () => {
    expect(generateUniqueVkUsername("Иван", "Петров", "123")).toMatch(/ivan/i);
  });

  it("fallback vk_id если короткое имя", () => {
    expect(generateUniqueVkUsername(undefined, undefined, "999")).toBe("vk_999");
  });
});

describe("fetchVkProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("берёт данные из users.get при успехе", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            response: [
              {
                id: 1,
                first_name: "Иван",
                last_name: "Тест",
                bdate: "15.5.1990",
                photo_200: "https://vk.com/photo.jpg",
              },
            ],
          }),
      }),
    );

    const p = await fetchVkProfile({
      accessToken: "t",
      vkUserId: "1",
      clientId: "c",
    });

    expect(p.id).toBe("1");
    expect(p.first_name).toBe("Иван");
    expect(p.birthday).toBe("15.5.1990");
  });

  it("fallback на user_info если users.get пустой", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        json: () => Promise.resolve({ response: [] }),
      })
      .mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            user: {
              user_id: "42",
              first_name: "A",
              last_name: "B",
            },
          }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const p = await fetchVkProfile({
      accessToken: "t",
      vkUserId: "1",
      clientId: "cid",
    });

    expect(p.id).toBe("42");
  });
});

describe("exchangeVkCodeForProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("обменивает code и возвращает профиль", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            access_token: "at",
            user_id: "7",
          }),
      })
      .mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            response: [{ id: 7, first_name: "N", last_name: "" }],
          }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const profile = await exchangeVkCodeForProfile({
      code: "c",
      codeVerifier: "v",
      deviceId: "d",
      state: "s",
      redirectUri: "https://app/cb",
      clientId: "cid",
    });

    expect(profile.id).toBe("7");
  });

  it("ошибка при отсутствии clientId", async () => {
    await expect(
      exchangeVkCodeForProfile({
        code: "c",
        codeVerifier: "v",
        deviceId: "d",
        state: "s",
        redirectUri: "",
        clientId: "",
      }),
    ).rejects.toThrow(/misconfigured/);
  });
});

describe("exchangeVkCodeAndGetUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAccountFindUnique.mockResolvedValue(null);
    mockUserFindFirst.mockResolvedValue(null);
    mockTxUserCreate.mockResolvedValue({
      id: "created-id",
      username: "x_y",
      role: "USER",
    });
    mockTxUserProfileCreate.mockResolvedValue({});
    mockTxAccountCreate.mockResolvedValue({});
  });

  it("цепочка: токен → профиль → findOrCreate (новый пользователь)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            access_token: "at",
            user_id: "200",
          }),
      })
      .mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            response: [{ id: 200, first_name: "A", last_name: "B" }],
          }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const r = await exchangeVkCodeAndGetUser({
      code: "c",
      codeVerifier: "v",
      deviceId: "d",
      state: "s",
      redirectUri: "https://app/cb",
      clientId: "cid",
    });

    expect(r.isNewUser).toBe(true);
    expect(r.user.id).toBe("created-id");
    expect(mockVkTransaction).toHaveBeenCalled();
  });
});

describe("findOrCreateVkUser", () => {
  const baseProfile: VkProfile = {
    id: "vk99",
    first_name: "Тест",
    last_name: "Юзер",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUserProfileUpsert.mockResolvedValue({});
    mockUserFindFirst.mockResolvedValue(null);
    mockTxUserCreate.mockResolvedValue({
      id: "new-u",
      username: "test_user",
      role: "USER",
    });
    mockTxUserProfileCreate.mockResolvedValue({});
    mockTxAccountCreate.mockResolvedValue({});
  });

  it("существующий аккаунт: обновляет профиль и needsPhone по vk_ телефону", async () => {
    mockAccountFindUnique.mockResolvedValue({
      userId: "u1",
      user: {
        id: "u1",
        username: "old",
        role: "USER",
        phone: "vk_99",
        profile: { fullName: null, birthDate: null },
      },
    });

    const r = await findOrCreateVkUser(
      { ...baseProfile, avatar: "https://cdn/a.png", birthday: "01.01.2000" },
      "vk99",
    );

    expect(r.needsPhone).toBe(true);
    expect(r.isNewUser).toBe(false);
    expect(mockUserProfileUpsert).toHaveBeenCalled();
  });

  it("создаёт пользователя если аккаунта нет", async () => {
    mockAccountFindUnique.mockResolvedValue(null);

    const r = await findOrCreateVkUser(baseProfile, "vk99");

    expect(r.isNewUser).toBe(true);
    expect(r.needsPhone).toBe(true);
    expect(mockVkTransaction).toHaveBeenCalled();
    expect(mockTxUserCreate).toHaveBeenCalled();
  });

  it("при занятом username добавляет суффикс и повторяет поиск", async () => {
    mockAccountFindUnique.mockResolvedValue(null);
    mockUserFindFirst
      .mockResolvedValueOnce({ id: "other-user" })
      .mockResolvedValueOnce(null);

    const r = await findOrCreateVkUser(baseProfile, "vk99");

    expect(r.isNewUser).toBe(true);
    expect(mockUserFindFirst).toHaveBeenCalledTimes(2);
    expect(mockTxUserCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          username: expect.stringMatching(/_1$/),
        }),
      }),
    );
  });
});

describe("linkVkToUser", () => {
  const profile: VkProfile = { id: "vk1", first_name: "A" };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUserProfileFindUnique.mockResolvedValue(null);
  });

  it("ошибка если VK уже на другом пользователе", async () => {
    mockAccountFindUnique.mockResolvedValue({ userId: "other" });

    await expect(linkVkToUser("me", profile)).resolves.toEqual({
      success: false,
      error: expect.stringContaining("другому"),
    });
  });

  it("ошибка если VK уже привязан к этому пользователю", async () => {
    mockAccountFindUnique.mockResolvedValue({ userId: "me" });

    await expect(linkVkToUser("me", profile)).resolves.toEqual({
      success: false,
      error: expect.stringContaining("уже подключён"),
    });
  });

  it("успех: создаёт account и профиль", async () => {
    mockAccountFindUnique.mockResolvedValue(null);
    mockTxUserProfileFindUnique.mockResolvedValue(null);
    mockTxUserProfileUpsert.mockResolvedValue({});
    mockVkTransaction.mockImplementation(async (fn: (tx: typeof vkTxStub) => Promise<unknown>) =>
      fn(vkTxStub),
    );

    await expect(linkVkToUser("me", profile)).resolves.toEqual({ success: true });
    expect(mockVkTransaction).toHaveBeenCalled();
  });
});

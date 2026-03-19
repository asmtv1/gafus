import { describe, expect, it, beforeEach, vi } from "vitest";

import {
  createConsentLogs,
  linkConsentLogsToUser,
  markConsentLogsFailed,
} from "./consentService";

const mockConsentLogUpsert = vi.fn();
const mockConsentLogUpdateMany = vi.fn();

vi.mock("@gafus/prisma", async (importOriginal) => {
  // vitest передаёт модуль без стабильного типа для importOriginal
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports -- cast результата importOriginal
  const mod = (await importOriginal()) as typeof import("@gafus/prisma");
  return {
    ...mod,
    prisma: {
      ...mod.prisma,
      consentLog: {
        upsert: (...args: unknown[]) => mockConsentLogUpsert(...args),
        updateMany: (...args: unknown[]) => mockConsentLogUpdateMany(...args),
      },
      $transaction: (arg: unknown) => {
        if (Array.isArray(arg)) {
          return Promise.all(arg as Promise<unknown>[]);
        }
        return (mod.prisma as { $transaction: (a: unknown) => Promise<unknown> }).$transaction(
          arg,
        );
      },
    },
  };
});

vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  }),
}));

const baseParams = {
  tempSessionId: "sess-1",
  consentPayload: {
    acceptPersonalData: true,
    acceptPrivacyPolicy: false,
    acceptDataDistribution: false,
  },
  formData: { name: "Иван", phone: "+79000000000" },
  defaultVersion: "v1",
};

describe("createConsentLogs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConsentLogUpsert.mockResolvedValue({});
  });

  it("создаёт записи только для принятых типов согласия", async () => {
    await createConsentLogs(baseParams);

    expect(mockConsentLogUpsert).toHaveBeenCalledTimes(1);
    expect(mockConsentLogUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tempSessionId_consentType: {
            tempSessionId: "sess-1",
            consentType: expect.anything(),
          },
        },
        create: expect.objectContaining({
          tempSessionId: "sess-1",
          status: expect.anything(),
        }),
      }),
    );
  });

  it("создаёт три записи когда все согласия приняты", async () => {
    await createConsentLogs({
      ...baseParams,
      consentPayload: {
        acceptPersonalData: true,
        acceptPrivacyPolicy: true,
        acceptDataDistribution: true,
      },
    });

    expect(mockConsentLogUpsert).toHaveBeenCalledTimes(3);
  });

  it("пробрасывает ошибку при сбое транзакции", async () => {
    mockConsentLogUpsert.mockRejectedValueOnce(new Error("db"));

    await expect(createConsentLogs(baseParams)).rejects.toThrow("db");
  });
});

describe("linkConsentLogsToUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConsentLogUpdateMany.mockResolvedValue({ count: 2 });
  });

  it("обновляет записи по tempSessionId", async () => {
    await linkConsentLogsToUser("sess-1", "user-1");

    expect(mockConsentLogUpdateMany).toHaveBeenCalledWith({
      where: { tempSessionId: "sess-1" },
      data: expect.objectContaining({ userId: "user-1" }),
    });
  });

  it("пробрасывает ошибку при сбое", async () => {
    mockConsentLogUpdateMany.mockRejectedValue(new Error("db"));

    await expect(linkConsentLogsToUser("s", "u")).rejects.toThrow("db");
  });
});

describe("markConsentLogsFailed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConsentLogUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("ставит статус FAILED", async () => {
    await markConsentLogsFailed("sess-1");

    expect(mockConsentLogUpdateMany).toHaveBeenCalledWith({
      where: { tempSessionId: "sess-1" },
      data: expect.objectContaining({ status: expect.anything() }),
    });
  });
});

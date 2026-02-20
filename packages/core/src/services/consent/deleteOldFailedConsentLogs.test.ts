import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { deleteOldFailedConsentLogs } from "./consentService";

const mockDeleteMany = vi.fn();

vi.mock("@gafus/prisma", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@gafus/prisma")>();
  return {
    ...actual,
    prisma: {
      consentLog: {
        deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
      },
    },
  };
});

vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
  }),
}));

describe("deleteOldFailedConsentLogs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeleteMany.mockResolvedValue({ count: 0 });
  });

  afterEach(() => {
    delete process.env.CONSENT_CLEANUP_DAYS;
  });

  it("вызывает deleteMany с корректным where (default 90 days)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-15T12:00:00Z"));

    await deleteOldFailedConsentLogs();

    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: {
        status: "FAILED",
        userId: null,
        createdAt: { lt: expect.any(Date) },
      },
    });
    const callArg = mockDeleteMany.mock.calls[0][0];
    const cutoff = callArg.where.createdAt.lt as Date;
    expect(cutoff.getTime()).toBeCloseTo(
      new Date("2025-03-17T12:00:00Z").getTime(),
      -5,
    );

    vi.useRealTimers();
  });

  it("использует daysOld при передаче опции", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-15T12:00:00Z"));

    await deleteOldFailedConsentLogs({ daysOld: 30 });

    const callArg = mockDeleteMany.mock.calls[0][0];
    const cutoff = callArg.where.createdAt.lt as Date;
    expect(cutoff.getTime()).toBeCloseTo(
      new Date("2025-05-16T12:00:00Z").getTime(),
      -5,
    );

    vi.useRealTimers();
  });

  it("возвращает { deleted: N } при успехе", async () => {
    mockDeleteMany.mockResolvedValue({ count: 5 });

    const result = await deleteOldFailedConsentLogs();

    expect(result).toEqual({ deleted: 5 });
  });

  it("возвращает { error } при ошибке БД, не бросает исключение", async () => {
    mockDeleteMany.mockRejectedValue(new Error("DB error"));

    const result = await deleteOldFailedConsentLogs();

    expect(result).toEqual({ error: "DB error" });
  });

  it("использует CONSENT_CLEANUP_DAYS из env при вызове без опций", async () => {
    process.env.CONSENT_CLEANUP_DAYS = "30";
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-15T12:00:00Z"));

    await deleteOldFailedConsentLogs();

    const callArg = mockDeleteMany.mock.calls[0][0];
    const cutoff = callArg.where.createdAt.lt as Date;
    expect(cutoff.getTime()).toBeCloseTo(
      new Date("2025-05-16T12:00:00Z").getTime(),
      -5,
    );

    vi.useRealTimers();
  });
});

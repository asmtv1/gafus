import { afterEach, describe, expect, it, vi } from "vitest";

import { processDueNpdReceiptOperations, reconciliationMatches } from "./npd-worker";

function db(overrides: Record<string, unknown> = {}) {
  const client: any = {
    $queryRawUnsafe: vi.fn().mockResolvedValue([{ locked: true }]),
    $transaction: vi.fn(),
    npdReceiptOperation: {
      findFirst: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      findUnique: vi.fn(),
    },
    ...overrides,
  };
  client.$transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback(client));
  return client;
}

afterEach(() => vi.unstubAllEnvs());

describe("processDueNpdReceiptOperations", () => {
  it("does not touch the database while kill switch is off", async () => {
    vi.stubEnv("NPD_PROCESSING_ENABLED", "false");
    const client = db();
    await expect(processDueNpdReceiptOperations({ db: client })).resolves.toMatchObject({ enabled: false, processed: 0 });
    expect(client.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it("skips a batch if another replica owns the advisory lock", async () => {
    vi.stubEnv("NPD_PROCESSING_ENABLED", "true");
    const client = db({ $queryRawUnsafe: vi.fn().mockResolvedValue([{ locked: false }]) });
    await expect(processDueNpdReceiptOperations({ db: client })).resolves.toMatchObject({ processed: 0, enabled: true });
    expect(client.npdReceiptOperation.findFirst).not.toHaveBeenCalled();
  });

  it("reclaims only an expired lease with an atomic compare-and-set", async () => {
    vi.stubEnv("NPD_PROCESSING_ENABLED", "true");
    const client = db();
    client.npdReceiptOperation.findFirst.mockResolvedValueOnce({ id: "op-1" }).mockResolvedValueOnce(null);
    client.npdReceiptOperation.updateMany.mockResolvedValueOnce({ count: 1 });
    client.npdReceiptOperation.findUnique.mockResolvedValue({ id: "op-1", type: "CREATE", leaseOwner: "owner", attemptCount: 1, receipt: { payment: { status: "REFUNDED" } } });
    await expect(processDueNpdReceiptOperations({ db: client, batchSize: 1 })).resolves.toMatchObject({ processed: 1, lockAcquired: true });
    expect(client.npdReceiptOperation.updateMany).toHaveBeenNthCalledWith(1, expect.objectContaining({ where: expect.objectContaining({ OR: expect.any(Array) }), data: expect.objectContaining({ status: "PROCESSING" }) }));
    expect(client.npdReceiptOperation.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "NOT_REQUIRED" }) }));
  });
});

describe("reconciliationMatches", () => {
  const operation: any = { receipt: { amountKopecks: 29900, serviceName: "Подписка Gafus Premium на 30 дней", operationAt: new Date("2026-08-29T10:00:00Z"), connection: { deviceId: "gafus-device" } } };
  const exact: any = { receiptUuid: "receipt-1", cancelled: false, sourceDeviceId: "gafus-device", amountKopecks: 29900, serviceNames: ["Подписка Gafus Premium на 30 дней"], operationAt: new Date("2026-08-29T10:01:00Z") };

  it("binds only an exact receipt created by this device", () => {
    expect(reconciliationMatches(operation, [exact])).toEqual([exact]);
  });

  it("fails closed for a wrong device, amount, service, cancelled receipt, or ambiguous time window", () => {
    const wrongDevice = { ...exact, sourceDeviceId: "other-device" };
    const wrongAmount = { ...exact, amountKopecks: 1 };
    const wrongService = { ...exact, serviceNames: ["Другая услуга"] };
    const cancelled = { ...exact, cancelled: true };
    const stale = { ...exact, operationAt: new Date("2026-08-29T10:06:00Z") };
    expect(reconciliationMatches(operation, [wrongDevice, wrongAmount, wrongService, cancelled, stale])).toEqual([]);
    expect(reconciliationMatches(operation, [exact, { ...exact, operationAt: new Date("2026-08-29T10:02:00Z") }])).toHaveLength(2);
  });
});

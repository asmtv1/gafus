import { afterEach, describe, expect, it, vi } from "vitest";

import { processDueNpdReceiptOperations } from "./npd-worker";

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

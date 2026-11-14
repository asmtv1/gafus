import { describe, expect, it, vi } from "vitest";
import {
  processDueNpdReceiptOperationsCore,
  type NpdOperationPersistencePort,
  type NpdPolicyOperation,
  type NpdProviderCallbacks,
} from "./npdOperationUseCase";

type Db = { isolated: true };
const db: Db = { isolated: true };
const operation: NpdPolicyOperation = {
  id: "fake-operation", type: "CREATE", attemptCount: 1, recoveredLease: false,
  receipt: {
    connectionId: "fake-connection", providerReceiptId: null, amountKopecks: 25900,
    serviceName: "Premium", operationAt: new Date("2026-11-01T00:00:00.000Z"),
    payment: { status: "SUCCEEDED" }, connection: { deviceId: "device-1", inn: "123456789012" },
  },
};
function adapters(op: NpdPolicyOperation | null = operation) {
  const claim = vi.fn().mockResolvedValue({ operation: op, lockAcquired: true });
  const finish = vi.fn().mockResolvedValue(undefined);
  const markReconciliation = vi.fn().mockResolvedValue(undefined);
  const persistIssuedReceipt = vi.fn().mockResolvedValue(undefined);
  const persistCanceledReceipt = vi.fn().mockResolvedValue(true);
  const markReauthorization = vi.fn().mockResolvedValue(undefined);
  const persistence: NpdOperationPersistencePort<Db, NpdPolicyOperation> = {
    claim, finish, markReconciliation, persistIssuedReceipt,
    persistCanceledReceipt, markReauthorization,
  };
  const create = vi.fn().mockResolvedValue({
    receiptUuid: "provider-id", printUrl: "https://example.test/print", jsonUrl: "https://example.test/json",
  });
  const reconcile = vi.fn().mockResolvedValue(false);
  const cancel = vi.fn().mockResolvedValue(undefined);
  const onCrash = vi.fn();
  const io: NpdProviderCallbacks<Db, NpdPolicyOperation> = {
    safeError: () => ({ code: "UNAVAILABLE", message: "transient" }),
    create, reconcile, cancel, onCrash,
  };
  return { persistence, io, claim, create, reconcile, finish,
    markReconciliation, persistIssuedReceipt, persistCanceledReceipt, onCrash };
}

describe("Core NPD policy needs an explicit durable persistence port", () => {
  it("fails closed when the Worker omits the port", async () => {
    const { io, create } = adapters();
    await expect(processDueNpdReceiptOperationsCore(db, io,
      { batchSize: 1, enabled: false }, undefined as never,
    )).rejects.toThrow("NPD_PERSISTENCE_PORT_REQUIRED");
    expect(create).not.toHaveBeenCalled();
  });

  it("does no SQL or provider calls when the fiscalization kill switch is disabled", async () => {
    const { persistence, io, claim, create } = adapters();
    await expect(processDueNpdReceiptOperationsCore(db, io,
      { batchSize: 3, enabled: false }, persistence,
    )).resolves.toEqual({ processed: 0, skipped: 0, lockAcquired: false, enabled: false });
    expect(claim).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("reconciles recovered CREATE leases instead of sending an ambiguous receipt twice", async () => {
    const recovered = { ...operation, recoveredLease: true };
    const { persistence, io, create, reconcile, markReconciliation, finish } = adapters(recovered);
    await expect(processDueNpdReceiptOperationsCore(db, io,
      { batchSize: 1, enabled: true }, persistence,
    )).resolves.toMatchObject({ processed: 1, skipped: 0 });
    expect(reconcile).toHaveBeenCalledExactlyOnceWith(db, recovered);
    expect(markReconciliation).toHaveBeenCalledExactlyOnceWith(db, recovered,
      "AMBIGUOUS_WRITE", "Expired CREATE lease requires reconciliation");
    expect(create).not.toHaveBeenCalled();
    expect(finish).not.toHaveBeenCalled();
  });

  it("persists a newly issued receipt using the injected lease-fenced repository", async () => {
    const { persistence, io, create, persistIssuedReceipt, markReconciliation } = adapters();
    await expect(processDueNpdReceiptOperationsCore(db, io,
      { batchSize: 1, enabled: true }, persistence,
    )).resolves.toMatchObject({ processed: 1, skipped: 0 });
    expect(create).toHaveBeenCalledExactlyOnceWith(db, operation);
    expect(persistIssuedReceipt).toHaveBeenCalledExactlyOnceWith(db, operation, {
      receiptUuid: "provider-id", printUrl: "https://example.test/print", jsonUrl: "https://example.test/json",
    });
    expect(markReconciliation).not.toHaveBeenCalled();
  });

  it("does not create a receipt for an already refunded payment", async () => {
    const refunded = { ...operation, receipt: { ...operation.receipt, payment: { status: "REFUNDED" } } };
    const { persistence, io, create, finish } = adapters(refunded);
    await processDueNpdReceiptOperationsCore(db, io, { batchSize: 1, enabled: true }, persistence);
    expect(create).not.toHaveBeenCalled();
    expect(finish).toHaveBeenCalledWith(db, refunded,
      expect.objectContaining({ status: "NOT_REQUIRED" }));
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RegistrationContractRowsPort } from "./registrationContractRowsPort";

beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });

function port() {
  const sameTx = { ownerScope: "one-transaction" };
  const p = {
    withRegistrationTransaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(sameTx)),
    readRegistrationPromoRowTx: vi.fn(async () => null),
    saveRegistrationPromoRowTx: vi.fn(async () => ({})),
    lockRegistrationEmailAttemptTx: vi.fn(async () => {}),
    readRegistrationEmailAttemptTx: vi.fn(async () => null),
    insertRegistrationEmailAttemptTx: vi.fn(async () => ({
      id: "attempt-1", userId: null, tempSessionId: "session-1", dataFingerprint: "fp-1",
      completedAt: null, result: null,
    })),
    finishRegistrationEmailAttemptTx: vi.fn(async () => ({
      id: "attempt-1", userId: "owner-1", tempSessionId: "session-1", dataFingerprint: "fp-1",
      completedAt: new Date(), result: "SUCCEEDED",
    })),
  };
  return { p, sameTx };
}

describe("Core registration row port preserves SQL transaction and email idempotency", () => {
  it("cannot accept an email registration without the server Persistence port", async () => {
    const c = await import("./registrationContracts");
    await expect(c.getOrCreateRegistrationEmailAttemptInTransaction({}, {
      tempSessionId: "session-1", dataFingerprint: "fp-1",
    })).rejects.toThrow("REGISTRATION_CONTRACT_ROWS_PORT_UNBOUND");
  });

  it("holds the advisory lock before reading, and creates a single idempotency receipt", async () => {
    const c = await import("./registrationContracts");
    const { p, sameTx } = port();
    const fixtureRegistrationContractRowsPort = p as RegistrationContractRowsPort;
    const created = await c.getOrCreateRegistrationEmailAttemptInTransaction(sameTx, {
      tempSessionId: "session-1", dataFingerprint: "fp-1",
    }, fixtureRegistrationContractRowsPort);
    expect(created.id).toBe("attempt-1");
    expect(p.lockRegistrationEmailAttemptTx).toHaveBeenCalledExactlyOnceWith(sameTx, "session-1");
    expect(p.readRegistrationEmailAttemptTx).toHaveBeenCalledExactlyOnceWith(sameTx, "session-1");
    expect(p.lockRegistrationEmailAttemptTx.mock.invocationCallOrder[0])
      .toBeLessThan(p.readRegistrationEmailAttemptTx.mock.invocationCallOrder[0]);
    expect(p.insertRegistrationEmailAttemptTx).toHaveBeenCalledExactlyOnceWith(sameTx, {
      tempSessionId: "session-1", dataFingerprint: "fp-1",
    });
  });

  it("rejects idempotency replay with changed input fingerprint", async () => {
    const c = await import("./registrationContracts");
    const { p, sameTx } = port();
    const fixtureRegistrationContractRowsPort = p as RegistrationContractRowsPort;
    p.readRegistrationEmailAttemptTx.mockResolvedValueOnce({
      id: "attempt-1", userId: null, tempSessionId: "session-1", dataFingerprint: "original",
      completedAt: null, result: null,
    });
    await expect(c.getOrCreateRegistrationEmailAttemptInTransaction(sameTx, {
      tempSessionId: "session-1", dataFingerprint: "changed",
    }, fixtureRegistrationContractRowsPort)).rejects.toMatchObject({ code: "REGISTRATION_ATTEMPT_FINGERPRINT_MISMATCH" });
    expect(p.insertRegistrationEmailAttemptTx).not.toHaveBeenCalled();
  });

  it("keeps two explicit SQL row adapters isolated without a global singleton", async () => {
    const c = await import("./registrationContracts");
    const first = port();
    const second = port();
    const args = { tempSessionId: "session-1", dataFingerprint: "fp-1" };
    await c.getOrCreateRegistrationEmailAttemptInTransaction(first.sameTx, args, first.p);
    await c.getOrCreateRegistrationEmailAttemptInTransaction(second.sameTx, args, second.p);
    expect(first.p.lockRegistrationEmailAttemptTx).toHaveBeenCalledExactlyOnceWith(first.sameTx, "session-1");
    expect(second.p.lockRegistrationEmailAttemptTx).toHaveBeenCalledExactlyOnceWith(second.sameTx, "session-1");
    expect(first.p.readRegistrationEmailAttemptTx).toHaveBeenCalledExactlyOnceWith(first.sameTx, "session-1");
    expect(second.p.readRegistrationEmailAttemptTx).toHaveBeenCalledExactlyOnceWith(second.sameTx, "session-1");
    await expect(c.getOrCreateRegistrationEmailAttemptInTransaction({}, args))
      .rejects.toThrow("REGISTRATION_CONTRACT_ROWS_PORT_UNBOUND");
  });


});

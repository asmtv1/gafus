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
    insertVkRegistrationContextTx: vi.fn(async () => ({ id: "vk-context-1" })),
    claimVkRegistrationContextUserTx: vi.fn(async () => ({count: 0})),
    insertVkLoginGrantTx: vi.fn(async () => ({
      id: "grant-1", userId: "owner-1", purpose: "LOGIN", registrationContextId: "vk-context-1",
    })),
    consumeVkLoginGrantRowTx: vi.fn(async () => null),
  };
  return { p, sameTx };
}

describe("Core registration row port preserves one transaction and explicit deny", () => {
  it("does not accept a registration or LOGIN grant without Persistence", async () => {
    const c = await import("./registrationContracts");
    await expect(c.createVkRegistrationContext({
      contextToken: "opaque-context", state: "opaque-state", codeVerifier: "verifier", purpose: "REGISTER",
    })).rejects.toThrow("REGISTRATION_CONTRACT_ROWS_PORT_UNBOUND");
    await expect(c.issueVkLoginGrantInTransaction({}, {token: "opaque", userId: "u", purpose: "LOGIN"}))
      .rejects.toThrow("REGISTRATION_CONTRACT_ROWS_PORT_UNBOUND");
  });
  it("creates VK context with raw tokens hashed, purpose REGISTER and same Tx", async () => {
    const c = await import("./registrationContracts");
    const {p,sameTx} = port();c.registerRegistrationContractRowsPort(p as unknown as RegistrationContractRowsPort);
    await expect(c.createVkRegistrationContext({
      contextToken: "opaque-context", state: "opaque-state", codeVerifier: "verifier", purpose: "REGISTER",
    })).resolves.toEqual({id: "vk-context-1"});
    expect(p.withRegistrationTransaction).toHaveBeenCalledTimes(1);
    expect(p.insertVkRegistrationContextTx).toHaveBeenCalledWith(sameTx, expect.objectContaining({
      contextTokenHash: c.hashRegistrationOpaqueValue("opaque-context"),
      stateHash: c.hashRegistrationOpaqueValue("opaque-state"),
      purpose: "REGISTER", expiresAt: expect.any(Date),
    }));
    expect(p.insertVkRegistrationContextTx.mock.calls[0]?.[1]).not.toHaveProperty("contextToken");
  });
  it("retains advisory-lock-before-read ordering and rejects stale claim", async () => {
    const c = await import("./registrationContracts");
    const {p,sameTx} = port();c.registerRegistrationContractRowsPort(p as unknown as RegistrationContractRowsPort);
    await c.getOrCreateRegistrationEmailAttemptInTransaction(sameTx, {
      tempSessionId:"session-1",dataFingerprint:"fp-1",
    });
    expect(p.lockRegistrationEmailAttemptTx).toHaveBeenCalledExactlyOnceWith(sameTx,"session-1");
    expect(p.readRegistrationEmailAttemptTx).toHaveBeenCalledExactlyOnceWith(sameTx,"session-1");
    expect(p.lockRegistrationEmailAttemptTx.mock.invocationCallOrder[0]).toBeLessThan(
      p.readRegistrationEmailAttemptTx.mock.invocationCallOrder[0],
    );
    await expect(c.claimVkRegistrationContextUserInTransaction(sameTx, {
      contextToken:"opaque",state:"state",userId:"owner-1",purpose:"REGISTER",
    })).rejects.toMatchObject({code:"VK_CONTEXT_INVALID"});
  });
  it("issues a hashed LOGIN grant and never treats a consumed grant as authorization", async () => {
    const c = await import("./registrationContracts");
    const {p,sameTx} = port();c.registerRegistrationContractRowsPort(p as unknown as RegistrationContractRowsPort);
    await c.issueVkLoginGrantInTransaction(sameTx, {token:"opaque-login",userId:"owner-1",purpose:"LOGIN"});
    expect(p.insertVkLoginGrantTx).toHaveBeenCalledWith(sameTx, expect.objectContaining({
      tokenHash:c.hashRegistrationOpaqueValue("opaque-login"),purpose:"LOGIN",expiresAt:expect.any(Date),
    }));
    await expect(c.consumeVkLoginGrantInTransaction(sameTx, {
      token:"expired-login",purpose:"LOGIN",requireConsent:true,
    })).rejects.toMatchObject({code:"VK_LOGIN_GRANT_INVALID"});
    expect(p.consumeVkLoginGrantRowTx).toHaveBeenCalledWith(sameTx,expect.objectContaining({
      tokenHash:c.hashRegistrationOpaqueValue("expired-login"),purpose:"LOGIN",requireConsent:true,
    }));
  });
  it("cannot hot-replace a running SQL port", async () => {
    const c = await import("./registrationContracts");
    const {p} = port();c.registerRegistrationContractRowsPort(p as unknown as RegistrationContractRowsPort);
    c.registerRegistrationContractRowsPort(p as unknown as RegistrationContractRowsPort);
    expect(() => c.registerRegistrationContractRowsPort(port().p as unknown as RegistrationContractRowsPort))
      .toThrow("REGISTRATION_CONTRACT_ROWS_PORT_ALREADY_BOUND");
  });
});

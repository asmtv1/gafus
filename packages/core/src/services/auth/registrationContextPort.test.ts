import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RegistrationContextPorts } from "./registrationUseCases";

const contracts = vi.hoisted(() => ({
  promo: vi.fn(async (_tx: unknown, code: unknown) => code === "WINTER"
    ? { id: "promo-A", normalizedCode: "WINTER" } : null),
  create: vi.fn(async () => {}),
  claim: vi.fn(async () => ({ id: "user-A" })),
}));
vi.mock("./registrationContracts", () => ({
  resolveRegistrationPromoCodeInTransaction: contracts.promo,
  createVkRegistrationContextInTransaction: contracts.create,
  claimVkRegistrationContextUserInTransaction: contracts.claim,
  hashRegistrationOpaqueValue: (s: string) => `hash:${s}`,
}));
beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });

function adapter() {
  const tx = { transaction: "single-owner-locked" };
  const transaction = vi.fn(async (callback: (value: unknown) => Promise<unknown>) => callback(tx));
  return {
    withRegistrationTransaction: transaction as unknown as RegistrationContextPorts["withRegistrationTransaction"],
    readValidVkRegistrationContext: vi.fn(async () => ({ codeVerifier: "verifier-A" })),
    readVkRegistrationConsentContext: vi.fn(async () => ({
      selectedPromoCodeValue: "WINTER", completedAt: null,
    })),
    readVkRegistrationPendingUsername: vi.fn(async () => "pending-A"),
    readIsRegistrationCompleted: vi.fn(async () => false),
    readVkLinkedAccountUsername: vi.fn(async () => "user-A"),
    tx,
  };
}

describe("Core registration-context Persistence port", () => {
  it("fails closed for protected requests, VK context and promo write without binding", async () => {
    const core = await import("./registrationUseCases");
    await expect(core.isRegistrationCompleted("owner-A"))
      .rejects.toThrow("REGISTRATION_CONTEXT_PORT_UNBOUND");
    await expect(core.getValidVkRegistrationContext("opaque-A"))
      .rejects.toThrow("REGISTRATION_CONTEXT_PORT_UNBOUND");
    await expect(core.previewRegistrationPromoCode("WINTER"))
      .rejects.toThrow("REGISTRATION_CONTEXT_PORT_UNBOUND");
    expect(contracts.create).not.toHaveBeenCalled();
  });
  it("hashes opaque VK secrets in Core, leaves owner and purpose to SQL", async () => {
    const core = await import("./registrationUseCases");
    const p = adapter();
    core.registerRegistrationContextPort(p);
    await expect(core.getValidVkRegistrationContext("token-A"))
      .resolves.toEqual({ codeVerifier: "verifier-A" });
    expect(p.readValidVkRegistrationContext).toHaveBeenCalledExactlyOnceWith("hash:token-A");
    await expect(core.getVkConsentContextSummary("token-A", "state-A"))
      .resolves.toEqual({ selectedPromoCodeValue: "WINTER", completedAt: null });
    expect(p.readVkRegistrationConsentContext).toHaveBeenCalledWith("hash:token-A", "hash:state-A");
    await expect(core.getVkPendingRegistrationUsername("token-A", "state-A"))
      .resolves.toBe("pending-A");
    expect(p.readVkRegistrationPendingUsername).toHaveBeenCalledWith("hash:token-A", "hash:state-A");
    await expect(core.isRegistrationCompleted("owner-B")).resolves.toBe(false);
    expect(p.readIsRegistrationCompleted).toHaveBeenCalledWith("owner-B");
    await expect(core.getVkLinkedAccountUsername("owner-C")).resolves.toBe("user-A");
    expect(p.readVkLinkedAccountUsername).toHaveBeenCalledWith("owner-C");
  });
  it("uses one transaction for promo selection and VK context insertion", async () => {
    const core = await import("./registrationUseCases");
    const p = adapter();core.registerRegistrationContextPort(p);
    await expect(core.createVkRegistrationContextWithPromo({
      contextToken: "token-A", state: "state-A", codeVerifier: "v-A", promoCode: "WINTER",
    })).resolves.toEqual({ selectedPromoCode: "WINTER" });
    expect(contracts.promo).toHaveBeenCalledWith(p.tx, "WINTER");
    expect(contracts.create).toHaveBeenCalledWith(p.tx, expect.objectContaining({
      purpose: "REGISTER", contextToken: "token-A", selectedPromoCodeId: "promo-A",
    }));
    expect(p.withRegistrationTransaction).toHaveBeenCalledTimes(1);
    await core.claimVkRegistrationContextUser({ contextToken: "token-A", state: "state-A", userId: "user-A" });
    expect(contracts.claim).toHaveBeenCalledWith(p.tx, expect.objectContaining({ purpose: "REGISTER" }));
  });
  it("prohibits replacement of a running process registration adapter", async () => {
    const core = await import("./registrationUseCases");
    const p=adapter();core.registerRegistrationContextPort(p);core.registerRegistrationContextPort(p);
    expect(() => core.registerRegistrationContextPort(adapter())).toThrow("REGISTRATION_CONTEXT_PORT_ALREADY_BOUND");
  });
});

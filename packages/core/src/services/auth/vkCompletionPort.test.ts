import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VkCompletionPorts } from "./vkRegistrationCompletion";

const fake = vi.hoisted(() => ({ promo: vi.fn(), consent: vi.fn() }));
vi.mock("./registrationContracts", () => ({
  RegistrationContractError: class RegistrationContractError extends Error {
    constructor(public readonly code: string) { super(code); this.name = "RegistrationContractError"; }
  },
  hashRegistrationOpaqueValue: (input: string) => `hash:${input}`,
  issueVkLoginGrantInTransaction: vi.fn(),
  resolveRegistrationPromoCodeInTransaction: fake.promo,
  saveRegistrationPromoCodeInTransaction: vi.fn(),
}));
beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });
const consent = {
  tempSessionId: "consent-id",
  consentPayload: { acceptPersonalData: true, acceptPrivacyPolicy: true, acceptDataDistribution: true },
  formData: { name: "A" }, defaultVersion: "v1",
};
function port() {
  const tx = { contextTransaction: "owner-locked" };
  return {
    withLockedVkCompletion: vi.fn(async (_hash: string, callback: (
      tx: unknown, context: unknown, now: Date,
    ) => Promise<unknown>) => callback(tx, null, new Date())),
    revokePriorVkCompletionLoginGrantsTx: vi.fn(),
    completePendingVkRegistrationUserTx: vi.fn(),
    markVkRegistrationContextCompletedTx: vi.fn(),
    createCompletedConsentLogsInTransaction: fake.consent,
    attributePartnerReferralIfCurrentPartnerInTransaction: vi.fn(),
  } as unknown as VkCompletionPorts;
}

describe("VK completion uses one fail-closed SQL composition", () => {
  it("rejects a valid consent if transaction port is not installed", async () => {
    const core = await import("./vkRegistrationCompletion");
    await expect(core.completeVkRegistration({ contextToken: "opaque", state: "state", consent,
      transport: "MOBILE" })).rejects.toThrow("VK_COMPLETION_PORT_UNBOUND");
    expect(fake.consent).not.toHaveBeenCalled();
  });
  it("preserves the precise WEB login grant requirement before calling SQL", async () => {
    const core = await import("./vkRegistrationCompletion");
    await expect(core.completeVkRegistration({ contextToken: "opaque", state: "state", consent,
      transport: "WEB" })).rejects.toMatchObject({ code: "VK_LOGIN_GRANT_INVALID" });
    await expect(core.completeVkRegistration({ contextToken: "opaque", state: "state", consent,
      transport: "MOBILE", loginGrantToken: "unexpected" }))
      .rejects.toMatchObject({ code: "VK_LOGIN_GRANT_INVALID" });
  });
  it("passes the hashed context to one SQL owner lock and rejects missing SQL row", async () => {
    const core = await import("./vkRegistrationCompletion");
    const p = port();core.registerVkCompletionPort(p);
    await expect(core.completeVkRegistration({ contextToken: "opaque", state: "state", consent,
      transport: "MOBILE" })).rejects.toMatchObject({ code: "VK_CONTEXT_INVALID" });
    expect(p.withLockedVkCompletion).toHaveBeenCalledTimes(1);
    expect(p.withLockedVkCompletion).toHaveBeenCalledWith("hash:opaque", expect.any(Function));
    expect(fake.consent).not.toHaveBeenCalled();
    expect(p.completePendingVkRegistrationUserTx).not.toHaveBeenCalled();
  });
  it("does not allow hot-swapping a transaction port", async () => {
    const core = await import("./vkRegistrationCompletion");
    const first = port();core.registerVkCompletionPort(first);core.registerVkCompletionPort(first);
    expect(() => core.registerVkCompletionPort(port())).toThrow("VK_COMPLETION_PORT_ALREADY_BOUND");
  });
});

import { describe, expect, it, vi } from "vitest";
const fake = vi.hoisted(() => ({ lock: vi.fn() }));
vi.mock("@gafus/identity-write-server/vk-completion-rows", () => ({
  completedConsentLogStatus: "COMPLETED",
  withLockedVkCompletion: fake.lock,
  revokePriorVkCompletionLoginGrantsTx: vi.fn(),
  completePendingVkRegistrationUserTx: vi.fn(),
  markVkRegistrationContextCompletedTx: vi.fn(),
  createCompletedConsentLogsInTransaction: vi.fn(),
  attributePartnerReferralIfCurrentPartnerInTransaction: vi.fn(),
}));

describe("API VK completion dependency wiring", () => {
  it("injects authoritative transaction lock and preserves REGISTER-only error", async () => {
    const core = await import("@gafus/core/services/auth");
    await import("./install-vk-completion");
    fake.lock.mockImplementation(async (_hash: string, callback: (
      tx: unknown, context: null, now: Date,
    ) => Promise<unknown>) => callback({}, null, new Date()));
    const consent = {
      tempSessionId: "consent-A", formData: { name: "VK" }, defaultVersion: "v1",
      consentPayload: { acceptPersonalData: true, acceptPrivacyPolicy: true, acceptDataDistribution: true },
    };
    await expect(core.completeVkRegistration({
      contextToken: "opaque-token", state: "opaque-state", transport: "MOBILE", consent,
    })).rejects.toMatchObject({ code: "VK_CONTEXT_INVALID" });
    expect(fake.lock).toHaveBeenCalledTimes(1);
    expect(fake.lock.mock.calls[0]?.[0]).toMatch(/^[a-f0-9]{64}$/);
  });
});

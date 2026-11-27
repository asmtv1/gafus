import { describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ transaction: vi.fn(), unique: vi.fn() }));
vi.mock("@gafus/identity-write-server/registration-contract-rows", () => ({
  withRegistrationTransaction: mock.transaction,
  readCredentialRegistrationReplayUserTx: vi.fn(),
  insertCredentialRegistrationUserTx: vi.fn(),
  markCredentialRegistrationAttemptSucceededTx: vi.fn(),
  registrationUniqueErrorTargets: mock.unique,
  createCompletedConsentLogsInTransaction: vi.fn(),
  attributePartnerReferralIfCurrentPartnerInTransaction: vi.fn(),
}));

describe("API credential registration composition", () => {
  it("validates credentials before opening its supplied transaction", async () => {
    const core = await import("@gafus/core/services/auth");
    const { credentialRegistrationPort } = await import("./credential-registration-instance");
    await expect(core.registerUserWithCredentials({ username: "", email: "bad", password: "x" }, credentialRegistrationPort))
      .resolves.toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect(mock.transaction).not.toHaveBeenCalled();
  });
});

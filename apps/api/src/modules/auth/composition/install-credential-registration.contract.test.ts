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
  it("installs exactly one Persistence-owned transaction port while preserving input validation", async () => {
    const core = await import("@gafus/core/services/auth");
    await import("./install-credential-registration");
    expect(() => core.registerCredentialRegistrationPort({} as never))
      .toThrow("CREDENTIAL_REGISTRATION_PORT_ALREADY_BOUND");
    await expect(core.registerUserWithCredentials({ username: "", email: "bad", password: "x" }))
      .resolves.toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect(mock.transaction).not.toHaveBeenCalled();
  });
});

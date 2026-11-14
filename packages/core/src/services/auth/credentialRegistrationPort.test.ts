import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CredentialRegistrationPort } from "./registerUserWithCredentials";
const mail = vi.hoisted(() => ({ hash: vi.fn(async () => "bcrypt-12"), lookup: vi.fn(async () => true) }));
vi.mock("bcryptjs", () => ({ default: { hash: mail.hash, compare: vi.fn() } }));
vi.mock("./registerEmailDomainDns", () => ({ canRegisterEmailDomain: mail.lookup }));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ error: vi.fn(), warn: vi.fn(), success: vi.fn() }),
}));
beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });

const context = {
  tempSessionId: "aa5a3c22-114e-41dc-975e-099486586021",
  consentPayload: { acceptPersonalData: true, acceptPrivacyPolicy: true, acceptDataDistribution: true },
  formData: { name: "newuser", email: "new@example.test" }, defaultVersion: "v1",
};
const input = { username: "newuser", email: "new@example.test", password: "Password1x", registrationContext: context };
const noopPort = () => ({
  withRegistrationTransaction: vi.fn(async () => { throw new Error("SERVER_TX_ABORT"); }),
  readCredentialRegistrationReplayUserTx: vi.fn(),
  insertCredentialRegistrationUserTx: vi.fn(),
  markCredentialRegistrationAttemptSucceededTx: vi.fn(),
  registrationUniqueErrorTargets: vi.fn(() => null),
  createCompletedConsentLogsInTransaction: vi.fn(),
  attributePartnerReferralIfCurrentPartnerInTransaction: vi.fn(),
} as unknown as CredentialRegistrationPort);

describe("Credential registration is composed only from authoritative transactional port", () => {
  it("without Persistence adapter rejects before any user write or email", async () => {
    const c = await import("./registerUserWithCredentials");
    await expect(c.registerUserWithCredentials(input))
      .rejects.toThrow("CREDENTIAL_REGISTRATION_PORT_UNBOUND");
  });
  it("keeps consent failure response and does not call a transaction", async () => {
    const c = await import("./registerUserWithCredentials");
    await expect(c.registerUserWithCredentials({ ...input, registrationContext: undefined }))
      .resolves.toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect(mail.hash).not.toHaveBeenCalled();
  });
  it("propagates unknown server errors, never returns a fabricated success", async () => {
    const c = await import("./registerUserWithCredentials");
    const p = noopPort();c.registerCredentialRegistrationPort(p);
    await expect(c.registerUserWithCredentials(input)).rejects.toThrow("SERVER_TX_ABORT");
    expect(p.withRegistrationTransaction).toHaveBeenCalledTimes(1);
  });
  it("cannot hot-swap a registration transaction adapter", async () => {
    const c = await import("./registerUserWithCredentials");
    const p = noopPort();c.registerCredentialRegistrationPort(p);c.registerCredentialRegistrationPort(p);
    expect(() => c.registerCredentialRegistrationPort(noopPort()))
      .toThrow("CREDENTIAL_REGISTRATION_PORT_ALREADY_BOUND");
  });
});

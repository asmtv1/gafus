vi.mock("./registerEmailDomainDns", () => ({ canRegisterEmailDomain: vi.fn().mockResolvedValue(true) }));
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ hash: vi.fn(), compare: vi.fn(), transaction: vi.fn(), attempt: vi.fn(), userCreate: vi.fn(), userFindUnique: vi.fn(), savePromo: vi.fn(), attributeReferral: vi.fn(), createConsents: vi.fn(), attemptUpdate: vi.fn() }));

vi.mock("bcryptjs", () => ({ default: { hash: (...args: unknown[]) => mocks.hash(...args), compare: (...args: unknown[]) => mocks.compare(...args) } }));
const tx = {
  user: { create: (...args: unknown[]) => mocks.userCreate(...args), findUnique: (...args: unknown[]) => mocks.userFindUnique(...args) },
  registrationEmailAttempt: { update: (...args: unknown[]) => mocks.attemptUpdate(...args) },
};
vi.mock("@gafus/prisma", () => ({
  Prisma: { PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {} },
  ConsentType: { PERSONAL_DATA: "PERSONAL_DATA", PRIVACY_POLICY: "PRIVACY_POLICY", DATA_DISTRIBUTION: "DATA_DISTRIBUTION" },
  RegistrationChannel: { UNKNOWN: "UNKNOWN" },
  prisma: { $transaction: (...args: unknown[]) => mocks.transaction(...args) },
}));
vi.mock("@gafus/logger", () => ({ createWebLogger: () => ({ success: vi.fn(), warn: vi.fn(), error: vi.fn() }) }));
vi.mock("../appSubscription/partnerService", () => ({ attributePartnerReferralIfCurrentPartnerInTransaction: (...args: unknown[]) => mocks.attributeReferral(...args) }));
vi.mock("../consent", () => ({ createCompletedConsentLogsInTransaction: (...args: unknown[]) => mocks.createConsents(...args) }));
vi.mock("./registrationContracts", () => ({
  RegistrationContractError: class RegistrationContractError extends Error { code: string; constructor(code: string) { super(code); this.code = code; } },
  fingerprintRegistrationAttempt: vi.fn(() => "fingerprint"),
  getOrCreateRegistrationEmailAttemptInTransaction: (...args: unknown[]) => mocks.attempt(...args),
  saveRegistrationPromoCodeInTransaction: (...args: unknown[]) => mocks.savePromo(...args),
}));

import { canRegisterEmailDomain } from "./registerEmailDomainDns";

import { registerUserWithCredentials } from "./registerUserWithCredentials";

const context = {
  tempSessionId: "9d7ca270-0e15-4e37-a0f9-9c62529c63d2",
  consentPayload: { acceptPersonalData: true, acceptPrivacyPolicy: true, acceptDataDistribution: true },
  formData: { name: "new_user", email: "new@example.com" }, defaultVersion: "v1",
};
const input = { username: "new_user", email: "new@example.com", password: "Password1x", registrationContext: context };

describe("registerUserWithCredentials atomic registration", () => {
  beforeEach(() => {
    vi.mocked(canRegisterEmailDomain).mockResolvedValue(true);
    vi.clearAllMocks(); mocks.hash.mockResolvedValue("password-hash"); mocks.compare.mockResolvedValue(true);
    mocks.attempt.mockResolvedValue({ id: "attempt-1", completedAt: null }); mocks.userCreate.mockResolvedValue({ id: "user-1" }); mocks.savePromo.mockResolvedValue(null);
    mocks.transaction.mockImplementation((operation: (client: typeof tx) => Promise<unknown>) => operation(tx));
  });

  it.each(["WEB", "IOS", "ANDROID"])("rejects an unmail-able domain for %s before hashing or writing", async (channel) => {
    vi.mocked(canRegisterEmailDomain).mockResolvedValue(false);
    await expect(registerUserWithCredentials({ ...input, email: "new@qwe.ru", registrationChannel: channel as import("@gafus/prisma").RegistrationChannel })).resolves.toEqual({
      ok: false, code: "VALIDATION_ERROR",
      messageRu: "Почта с доменом @qwe.ru не принимает письма. Укажите настоящий адрес электронной почты",
    });
    expect(canRegisterEmailDomain).toHaveBeenCalledWith("qwe.ru");
    expect(mocks.hash).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("requires accepted consent context even for an old no-promo client", async () => {
    await expect(registerUserWithCredentials({ ...input, registrationContext: undefined })).resolves.toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("creates user, saved ordinary promo, completed linked consents and attempt in one transaction", async () => {
    mocks.savePromo.mockResolvedValue({ normalizedCode: "ORDINARY" });
    await expect(registerUserWithCredentials({ ...input, promoCode: "ordinary" })).resolves.toEqual({ ok: true, userId: "user-1", wasCreated: true });
    expect(mocks.savePromo).toHaveBeenCalledWith(tx, { userId: "user-1", rawCode: "ORDINARY" });
    expect(mocks.attributeReferral).toHaveBeenCalledWith(tx, "user-1", "ORDINARY");
    expect(mocks.createConsents).toHaveBeenCalledWith(tx, expect.objectContaining({ userId: "user-1", tempSessionId: context.tempSessionId }));
    expect(mocks.attemptUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ result: "SUCCEEDED", userId: "user-1" }) }));
  });

  it("rolls the whole attempt back when consent persistence fails", async () => {
    mocks.createConsents.mockRejectedValueOnce(new Error("consent write failed"));
    await expect(registerUserWithCredentials(input)).rejects.toThrow("consent write failed");
    expect(mocks.attemptUpdate).not.toHaveBeenCalled();
  });

  it("replays only after password verification and does not create duplicates", async () => {
    mocks.attempt.mockResolvedValue({ id: "attempt-1", completedAt: new Date(), userId: "user-1", result: "SUCCEEDED" }); mocks.userFindUnique.mockResolvedValue({ id: "user-1", password: "stored-hash" });
    await expect(registerUserWithCredentials(input)).resolves.toEqual({ ok: true, userId: "user-1", wasCreated: false });
    expect(mocks.userCreate).not.toHaveBeenCalled(); expect(mocks.createConsents).not.toHaveBeenCalled(); expect(mocks.compare).toHaveBeenCalledWith("Password1x", "stored-hash");
  });

  it("rejects a completed-attempt replay with a changed password", async () => {
    mocks.attempt.mockResolvedValue({ id: "attempt-1", completedAt: new Date(), userId: "user-1", result: "SUCCEEDED" }); mocks.userFindUnique.mockResolvedValue({ id: "user-1", password: "stored-hash" }); mocks.compare.mockResolvedValue(false);
    await expect(registerUserWithCredentials(input)).resolves.toMatchObject({ ok: false, code: "ATTEMPT_MISMATCH" });
  });
});

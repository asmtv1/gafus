import { beforeEach, describe, expect, it, vi } from "vitest";

const tx = vi.hoisted(() => ({
  $executeRaw: vi.fn(),
  vkRegistrationContext: { findUnique: vi.fn(), update: vi.fn() },
  vkLoginGrant: { updateMany: vi.fn(), create: vi.fn() },
  appSubscriptionPromoCode: { findUnique: vi.fn() },
  user: { update: vi.fn(), updateMany: vi.fn() },
  consentLog: { upsert: vi.fn() },
}));
const transaction = vi.hoisted(() => vi.fn((fn: (client: typeof tx) => unknown) => fn(tx)));

vi.mock("@gafus/prisma", () => ({
  prisma: { $transaction: (fn: (client: typeof tx) => unknown) => transaction(fn) },
  Prisma: { sql: (parts: TemplateStringsArray) => parts.join("") },
  ConsentLogStatus: { COMPLETED: "COMPLETED" },
}));
vi.mock("@gafus/subscription-payment-server/partner", () => ({ attributePartnerReferralIfCurrentPartnerInTransaction: vi.fn() }));
vi.mock("@gafus/consent-server/consentService", () => ({ createCompletedConsentLogsInTransaction: vi.fn() }));

import { completeVkRegistration } from "./vkRegistrationCompletion";
// The production owner-scoped SQL rows are still called, but are now bound
// through the Core transaction port; mocks keep the same Prisma Tx in-process.
import { registerRegistrationContractRowsPort } from "./registrationContracts";
import * as registrationRows from "@gafus/identity-write-server/registration-contract-rows";
const asServerTx = (tx: unknown): registrationRows.RegistrationContractDbTx =>
  tx as registrationRows.RegistrationContractDbTx;
registerRegistrationContractRowsPort({
  withRegistrationTransaction: (action, options) =>
    registrationRows.withRegistrationTransaction(tx => action(tx), options),
  readRegistrationPromoRowTx: (tx, code) => registrationRows.readRegistrationPromoRowTx(asServerTx(tx), code),
  saveRegistrationPromoRowTx: (tx, userId, promoId) => registrationRows.saveRegistrationPromoRowTx(asServerTx(tx), userId, promoId),
  lockRegistrationEmailAttemptTx: (tx, id) => registrationRows.lockRegistrationEmailAttemptTx(asServerTx(tx), id),
  readRegistrationEmailAttemptTx: (tx, id) => registrationRows.readRegistrationEmailAttemptTx(asServerTx(tx), id),
  insertRegistrationEmailAttemptTx: (tx, input) => registrationRows.insertRegistrationEmailAttemptTx(asServerTx(tx), input),
  finishRegistrationEmailAttemptTx: (tx, id, input) => registrationRows.finishRegistrationEmailAttemptTx(asServerTx(tx), id, input),
  insertVkRegistrationContextTx: (tx, input) => registrationRows.insertVkRegistrationContextTx(asServerTx(tx), input),
  claimVkRegistrationContextUserTx: (tx, input) => registrationRows.claimVkRegistrationContextUserTx(asServerTx(tx), input),
  insertVkLoginGrantTx: (tx, input) => registrationRows.insertVkLoginGrantTx(asServerTx(tx), input),
  consumeVkLoginGrantRowTx: (tx, input) => registrationRows.consumeVkLoginGrantRowTx(asServerTx(tx), input),
});

import { registerVkCompletionPort } from "./vkRegistrationCompletion";
import {
  completedConsentLogStatus,
  withLockedVkCompletion,
  revokePriorVkCompletionLoginGrantsTx,
  completePendingVkRegistrationUserTx,
  markVkRegistrationContextCompletedTx,
  createCompletedConsentLogsInTransaction,
  attributePartnerReferralIfCurrentPartnerInTransaction,
} from "@gafus/identity-write-server/vk-completion-rows";
registerVkCompletionPort({
  withLockedVkCompletion,
  revokePriorVkCompletionLoginGrantsTx,
  completePendingVkRegistrationUserTx,
  markVkRegistrationContextCompletedTx,
  createCompletedConsentLogsInTransaction: (tx, params) =>
    createCompletedConsentLogsInTransaction(tx, params, completedConsentLogStatus),
  attributePartnerReferralIfCurrentPartnerInTransaction,
});


const consent = {
  tempSessionId: "consent-1",
  consentPayload: { acceptPersonalData: true, acceptPrivacyPolicy: true, acceptDataDistribution: true },
  formData: { name: "VK user" }, defaultVersion: "v1",
};

function completedContext(expiresAt = new Date(Date.now() + 60_000)) {
  return {
    id: "ctx-1", stateHash: "4ba69735ca53765ed6a709edb56c6ea236b7193a3b29a6b390c346f0f4340e4e", purpose: "REGISTER", expiresAt,
    selectedPromoCode: null, user: null, completionFingerprint: null,
    completedAt: new Date(), resultUser: { id: "u1", username: "vk_user", role: "USER", phone: "vk_1" },
  };
}

describe("VK registration completion replay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.vkLoginGrant.updateMany.mockResolvedValue({ count: 1 });
    tx.vkLoginGrant.create.mockResolvedValue({ id: "grant-2" });
  });

  it("reissues a distinct web LOGIN grant and invalidates an unconsumed predecessor", async () => {
    // A completed context only replays unchanged input; fixture it with the
    // stored fingerprint produced by the same request via a lightweight hash.
    const crypto = await import("node:crypto");
    const fp = crypto.createHash("sha256").update(JSON.stringify({ promo: null, consent: { tempSessionId: "consent-1", consentPayload: consent.consentPayload, formData: consent.formData, ipAddress: null, userAgent: null, consentVersions: {}, defaultVersion: "v1" }, transport: "WEB" })).digest("hex");
    tx.vkRegistrationContext.findUnique.mockResolvedValue({ ...completedContext(), completionFingerprint: fp });
    const result = await completeVkRegistration({ contextToken: "ctx", state: "state", consent, transport: "WEB", loginGrantToken: "grant-b" });
    expect(result).toMatchObject({ replayed: true, loginGrantToken: "grant-b", user: { id: "u1" } });
    expect(tx.vkLoginGrant.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ registrationContextId: "ctx-1", consumedAt: null }) }));
    expect(tx.vkLoginGrant.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ purpose: "LOGIN", tokenHash: expect.not.stringContaining("grant-b"), expiresAt: expect.any(Date) }) }));
  });

  it("rejects an expired completion context before any grant or user write", async () => {
    tx.vkRegistrationContext.findUnique.mockResolvedValue(completedContext(new Date(Date.now() - 1)));
    await expect(completeVkRegistration({ contextToken: "ctx", state: "state", consent, transport: "WEB", loginGrantToken: "grant" })).rejects.toThrow("VK_CONTEXT_EXPIRED");
    expect(tx.vkLoginGrant.create).not.toHaveBeenCalled();
    expect(tx.user.updateMany).not.toHaveBeenCalled();
  });
});

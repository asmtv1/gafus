import crypto from "node:crypto";

import { requireRegistrationContractRowsPort } from "./registrationContractRowsPort";
import type {
  RegistrationContractDbTx,
  RegistrationContractChannel as RegistrationChannel,
  RegistrationContractVkPurpose as VkRegistrationContextPurpose,
  RegistrationContractLoginPurpose as VkLoginGrantPurpose,
  RegistrationPromoDbRow,
} from "./registrationContractRowsPort";
export { registerRegistrationContractRowsPort } from "./registrationContractRowsPort";
export type { RegistrationContractRowsPort } from "./registrationContractRowsPort";

import { parseAppSubscriptionPromoCode } from "../appSubscription/promoCode";

const VK_CONTEXT_TTL_MS = 5 * 60 * 1000;

export type RegistrationContractErrorCode =
  | "REGISTRATION_PROMO_INVALID"
  | "REGISTRATION_PROMO_INACTIVE"
  | "REGISTRATION_PROMO_ARCHIVED"
  | "REGISTRATION_ATTEMPT_FINGERPRINT_MISMATCH"
  | "VK_CONTEXT_INVALID"
  | "VK_CONTEXT_EXPIRED"
  | "VK_CONTEXT_PURPOSE_INVALID"
  | "VK_COMPLETION_ATTEMPT_CONFLICT"
  | "VK_LOGIN_GRANT_INVALID";

export class RegistrationContractError extends Error {
  constructor(public readonly code: RegistrationContractErrorCode) {
    super(code);
    this.name = "RegistrationContractError";
  }
}

export type RegistrationPromoResolution = RegistrationPromoDbRow;

export function hashRegistrationOpaqueValue(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/** Password is deliberately excluded: a replay checks it against the resulting account. */
export function fingerprintRegistrationAttempt(input: {
  username: string;
  email: string;
  registrationChannel: RegistrationChannel;
  /** The normalized submitted code, not a mutable promo row id. */
  promoCode: string | null;
  consent: {
    acceptPersonalData: boolean;
    acceptPrivacyPolicy: boolean;
    acceptDataDistribution: boolean;
    versions: Record<string, string | undefined>;
    defaultVersion: string;
  };
}): string {
  return hashRegistrationOpaqueValue(
    JSON.stringify({
      username: input.username.trim().toLowerCase(),
      email: input.email.trim().toLowerCase(),
      registrationChannel: input.registrationChannel,
      promoCode: input.promoCode,
      consent: input.consent,
    }),
  );
}

export async function resolveRegistrationPromoCodeInTransaction(
  tx: RegistrationContractDbTx,
  rawCode: unknown,
): Promise<RegistrationPromoResolution | null> {
  if (rawCode === undefined || rawCode === null || rawCode === "") return null;
  const identity = parseAppSubscriptionPromoCode(rawCode);
  if (!identity) throw new RegistrationContractError("REGISTRATION_PROMO_INVALID");

  const promoCode = await requireRegistrationContractRowsPort().readRegistrationPromoRowTx(tx,identity.normalizedCode);
  if (!promoCode) throw new RegistrationContractError("REGISTRATION_PROMO_INVALID");
  if (promoCode.archivedAt) throw new RegistrationContractError("REGISTRATION_PROMO_ARCHIVED");
  if (!promoCode.isActive) throw new RegistrationContractError("REGISTRATION_PROMO_INACTIVE");
  const { isActive: _isActive, archivedAt: _archivedAt, ...resolution } = promoCode;
  return resolution;
}

/** Persists the selected valid Premium promo independently from partner attribution. */
export async function saveRegistrationPromoCodeInTransaction(
  tx: RegistrationContractDbTx,
  params: { userId: string; rawCode: unknown },
): Promise<RegistrationPromoResolution | null> {
  const promoCode = await resolveRegistrationPromoCodeInTransaction(tx, params.rawCode);
  if (promoCode) {
    await requireRegistrationContractRowsPort().saveRegistrationPromoRowTx(tx,params.userId,promoCode.id);
  }
  return promoCode;
}

export async function getOrCreateRegistrationEmailAttemptInTransaction(
  tx: RegistrationContractDbTx,
  params: { tempSessionId: string; dataFingerprint: string },
) {
  // A unique-violation catch cannot query PostgreSQL afterwards: the transaction
  // is already aborted. Serialize every observation/creation of this stable key.
  await requireRegistrationContractRowsPort().lockRegistrationEmailAttemptTx(tx,params.tempSessionId);
  const existing = await requireRegistrationContractRowsPort().readRegistrationEmailAttemptTx(tx,params.tempSessionId);
  if (existing) {
    if (existing.dataFingerprint !== params.dataFingerprint) {
      throw new RegistrationContractError("REGISTRATION_ATTEMPT_FINGERPRINT_MISMATCH");
    }
    return existing;
  }
  return requireRegistrationContractRowsPort().insertRegistrationEmailAttemptTx(tx,params);
}

export async function completeRegistrationEmailAttemptInTransaction(
  tx: RegistrationContractDbTx,
  params: {
    tempSessionId: string;
    dataFingerprint: string;
    result: "SUCCEEDED" | "USERNAME_TAKEN" | "EMAIL_TAKEN" | "VALIDATION_ERROR";
    userId?: string;
  },
) {
  const attempt = await getOrCreateRegistrationEmailAttemptInTransaction(tx, params);
  if (attempt.completedAt) return attempt;
  return requireRegistrationContractRowsPort().finishRegistrationEmailAttemptTx(tx,attempt.id,params);
}

export async function createVkRegistrationContextInTransaction(
  tx: RegistrationContractDbTx,
  params: {
    contextToken: string;
    state: string;
    codeVerifier: string;
    purpose: VkRegistrationContextPurpose;
    selectedPromoCodeId?: string | null;
    selectedPromoCodeValue?: string | null;
    userId?: string | null;
  },
) {
  return requireRegistrationContractRowsPort().insertVkRegistrationContextTx(tx,{
    contextTokenHash:hashRegistrationOpaqueValue(params.contextToken),
    stateHash:hashRegistrationOpaqueValue(params.state),
    codeVerifier:params.codeVerifier,purpose:params.purpose,
    selectedPromoCodeId:params.selectedPromoCodeId,
    selectedPromoCodeValue:params.selectedPromoCodeValue,userId:params.userId,
    expiresAt:new Date(Date.now()+VK_CONTEXT_TTL_MS),
  });
}

/**
 * Claims an OAuth context after the network exchange has finished.  This is not
 * consent completion: a pending VK user remains unable to authenticate.
 */
export async function claimVkRegistrationContextUserInTransaction(
  tx: RegistrationContractDbTx,
  params: { contextToken: string; state: string; userId: string; purpose: VkRegistrationContextPurpose },
) {
  const now = new Date();
  const updated = await requireRegistrationContractRowsPort().claimVkRegistrationContextUserTx(tx,{
    contextTokenHash:hashRegistrationOpaqueValue(params.contextToken),
    stateHash:hashRegistrationOpaqueValue(params.state),
    purpose:params.purpose,userId:params.userId,now,
  });
  if (updated.count !== 1) throw new RegistrationContractError("VK_CONTEXT_INVALID");
}

export async function issueVkLoginGrantInTransaction(
  tx: RegistrationContractDbTx,
  params: {
    token: string;
    userId: string;
    purpose: VkLoginGrantPurpose;
    reissuedFromId?: string;
    registrationContextId?: string;
    expiresAt?: Date;
  },
) {
  return requireRegistrationContractRowsPort().insertVkLoginGrantTx(tx,{
    tokenHash:hashRegistrationOpaqueValue(params.token),
    userId:params.userId,purpose:params.purpose,
    reissuedFromId:params.reissuedFromId,
    registrationContextId:params.registrationContextId,
    expiresAt:params.expiresAt??new Date(Date.now()+VK_CONTEXT_TTL_MS),
  });
}

export async function consumeVkLoginGrantInTransaction(
  tx: RegistrationContractDbTx,
  params: { token: string; purpose: VkLoginGrantPurpose; requireConsent?: boolean },
) {
  const now = new Date();
  const grant = await requireRegistrationContractRowsPort().consumeVkLoginGrantRowTx(tx,{
    tokenHash:hashRegistrationOpaqueValue(params.token),
    purpose:params.purpose,requireConsent:params.requireConsent,now,
  });
  if(!grant)throw new RegistrationContractError("VK_LOGIN_GRANT_INVALID");
  return grant;
}

/** Reissue consumes the old grant first, then produces a distinct, hashed token row. */
export async function reissueVkLoginGrantInTransaction(
  tx: RegistrationContractDbTx,
  params: { oldToken: string; newToken: string; purpose: VkLoginGrantPurpose; requireConsent?: boolean },
) {
  const old = await consumeVkLoginGrantInTransaction(tx, {
    token: params.oldToken,
    purpose: params.purpose,
    requireConsent: params.requireConsent,
  });
  return issueVkLoginGrantInTransaction(tx, {
    token: params.newToken,
    userId: old.userId,
    purpose: old.purpose,
    reissuedFromId: old.id,
    registrationContextId: old.registrationContextId ?? undefined,
  });
}

export async function createVkRegistrationContext(params: Parameters<typeof createVkRegistrationContextInTransaction>[1]) {
  return requireRegistrationContractRowsPort().withRegistrationTransaction((tx) => createVkRegistrationContextInTransaction(tx, params));
}

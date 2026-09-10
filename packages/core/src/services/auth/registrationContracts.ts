import crypto from "node:crypto";

import {
  Prisma,
  prisma,
  type AppSubscriptionPromoCode,
  type RegistrationChannel,
  type VkLoginGrantPurpose,
  type VkRegistrationContextPurpose,
} from "@gafus/prisma";

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

export type RegistrationPromoResolution = Pick<
  AppSubscriptionPromoCode,
  "id" | "code" | "normalizedCode" | "discountPercent" | "revision"
>;

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
  tx: Prisma.TransactionClient,
  rawCode: unknown,
): Promise<RegistrationPromoResolution | null> {
  if (rawCode === undefined || rawCode === null || rawCode === "") return null;
  const identity = parseAppSubscriptionPromoCode(rawCode);
  if (!identity) throw new RegistrationContractError("REGISTRATION_PROMO_INVALID");

  const promoCode = await tx.appSubscriptionPromoCode.findUnique({
    where: { normalizedCode: identity.normalizedCode },
    select: { id: true, code: true, normalizedCode: true, discountPercent: true, revision: true, isActive: true, archivedAt: true },
  });
  if (!promoCode) throw new RegistrationContractError("REGISTRATION_PROMO_INVALID");
  if (promoCode.archivedAt) throw new RegistrationContractError("REGISTRATION_PROMO_ARCHIVED");
  if (!promoCode.isActive) throw new RegistrationContractError("REGISTRATION_PROMO_INACTIVE");
  const { isActive: _isActive, archivedAt: _archivedAt, ...resolution } = promoCode;
  return resolution;
}

/** Persists the selected valid Premium promo independently from partner attribution. */
export async function saveRegistrationPromoCodeInTransaction(
  tx: Prisma.TransactionClient,
  params: { userId: string; rawCode: unknown },
): Promise<RegistrationPromoResolution | null> {
  const promoCode = await resolveRegistrationPromoCodeInTransaction(tx, params.rawCode);
  if (promoCode) {
    await tx.user.update({
      where: { id: params.userId },
      data: { savedRegistrationPromoCodeId: promoCode.id },
    });
  }
  return promoCode;
}

export async function getOrCreateRegistrationEmailAttemptInTransaction(
  tx: Prisma.TransactionClient,
  params: { tempSessionId: string; dataFingerprint: string },
) {
  // A unique-violation catch cannot query PostgreSQL afterwards: the transaction
  // is already aborted. Serialize every observation/creation of this stable key.
  await tx.$executeRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${params.tempSessionId}, 0))`,
  );
  const existing = await tx.registrationEmailAttempt.findUnique({
    where: { tempSessionId: params.tempSessionId },
  });
  if (existing) {
    if (existing.dataFingerprint !== params.dataFingerprint) {
      throw new RegistrationContractError("REGISTRATION_ATTEMPT_FINGERPRINT_MISMATCH");
    }
    return existing;
  }
  return tx.registrationEmailAttempt.create({ data: params });
}

export async function completeRegistrationEmailAttemptInTransaction(
  tx: Prisma.TransactionClient,
  params: {
    tempSessionId: string;
    dataFingerprint: string;
    result: "SUCCEEDED" | "USERNAME_TAKEN" | "EMAIL_TAKEN" | "VALIDATION_ERROR";
    userId?: string;
  },
) {
  const attempt = await getOrCreateRegistrationEmailAttemptInTransaction(tx, params);
  if (attempt.completedAt) return attempt;
  return tx.registrationEmailAttempt.update({
    where: { id: attempt.id },
    data: { result: params.result, userId: params.userId ?? null, completedAt: new Date() },
  });
}

export async function createVkRegistrationContextInTransaction(
  tx: Prisma.TransactionClient,
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
  return tx.vkRegistrationContext.create({
    data: {
      contextTokenHash: hashRegistrationOpaqueValue(params.contextToken),
      stateHash: hashRegistrationOpaqueValue(params.state),
      codeVerifier: params.codeVerifier,
      purpose: params.purpose,
      selectedPromoCodeId: params.selectedPromoCodeId ?? null,
      selectedPromoCodeValue: params.selectedPromoCodeValue ?? null,
      userId: params.userId ?? null,
      expiresAt: new Date(Date.now() + VK_CONTEXT_TTL_MS),
    },
  });
}

/**
 * Claims an OAuth context after the network exchange has finished.  This is not
 * consent completion: a pending VK user remains unable to authenticate.
 */
export async function claimVkRegistrationContextUserInTransaction(
  tx: Prisma.TransactionClient,
  params: { contextToken: string; state: string; userId: string; purpose: VkRegistrationContextPurpose },
) {
  const now = new Date();
  const updated = await tx.vkRegistrationContext.updateMany({
    where: {
      contextTokenHash: hashRegistrationOpaqueValue(params.contextToken),
      stateHash: hashRegistrationOpaqueValue(params.state),
      purpose: params.purpose,
      expiresAt: { gt: now },
      completedAt: null,
      OR: [{ userId: null }, { userId: params.userId }],
    },
    data: { userId: params.userId },
  });
  if (updated.count !== 1) throw new RegistrationContractError("VK_CONTEXT_INVALID");
}

export async function issueVkLoginGrantInTransaction(
  tx: Prisma.TransactionClient,
  params: {
    token: string;
    userId: string;
    purpose: VkLoginGrantPurpose;
    reissuedFromId?: string;
    registrationContextId?: string;
    expiresAt?: Date;
  },
) {
  return tx.vkLoginGrant.create({
    data: {
      tokenHash: hashRegistrationOpaqueValue(params.token),
      userId: params.userId,
      purpose: params.purpose,
      reissuedFromId: params.reissuedFromId,
      registrationContextId: params.registrationContextId,
      expiresAt: params.expiresAt ?? new Date(Date.now() + VK_CONTEXT_TTL_MS),
    },
  });
}

export async function consumeVkLoginGrantInTransaction(
  tx: Prisma.TransactionClient,
  params: { token: string; purpose: VkLoginGrantPurpose; requireConsent?: boolean },
) {
  const now = new Date();
  const grant = await tx.vkLoginGrant.findFirst({
    where: { tokenHash: hashRegistrationOpaqueValue(params.token), purpose: params.purpose, expiresAt: { gt: now }, consumedAt: null },
  });
  if (!grant || (params.requireConsent && !grant.consentCompletedAt)) {
    throw new RegistrationContractError("VK_LOGIN_GRANT_INVALID");
  }
  const consumed = await tx.vkLoginGrant.updateMany({
    // The user state is in this conditional update so a pending account cannot
    // turn a previously issued LOGIN grant into an authenticated session.
    where: {
      id: grant.id,
      expiresAt: { gt: now },
      consumedAt: null,
      ...(params.requireConsent ? { consentCompletedAt: { not: null } } : {}),
      user: { registrationPending: false },
    },
    data: { consumedAt: now },
  });
  if (consumed.count !== 1) throw new RegistrationContractError("VK_LOGIN_GRANT_INVALID");
  return grant;
}

/** Reissue consumes the old grant first, then produces a distinct, hashed token row. */
export async function reissueVkLoginGrantInTransaction(
  tx: Prisma.TransactionClient,
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
  return prisma.$transaction((tx) => createVkRegistrationContextInTransaction(tx, params));
}

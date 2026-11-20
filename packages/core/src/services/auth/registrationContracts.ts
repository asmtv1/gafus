import crypto from "node:crypto";

import { requireRegistrationContractRowsPort } from "./registrationContractRowsPort";
import type {
  RegistrationContractDbTx,
  RegistrationContractChannel as RegistrationChannel,
  RegistrationPromoDbRow,
  RegistrationContractRowsPort,
} from "./registrationContractRowsPort";
export { registerRegistrationContractRowsPort } from "./registrationContractRowsPort";
export type { RegistrationContractRowsPort } from "./registrationContractRowsPort";

import { parseAppSubscriptionPromoCode } from "../appSubscription/promoCode";


export type RegistrationContractErrorCode =
  | "REGISTRATION_PROMO_INVALID"
  | "REGISTRATION_PROMO_INACTIVE"
  | "REGISTRATION_PROMO_ARCHIVED"
  | "REGISTRATION_ATTEMPT_FINGERPRINT_MISMATCH";

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
  rows?: RegistrationContractRowsPort,
): Promise<RegistrationPromoResolution | null> {
  if (rawCode === undefined || rawCode === null || rawCode === "") return null;
  const identity = parseAppSubscriptionPromoCode(rawCode);
  if (!identity) throw new RegistrationContractError("REGISTRATION_PROMO_INVALID");

  const promoCode = await (rows ?? requireRegistrationContractRowsPort()).readRegistrationPromoRowTx(tx,identity.normalizedCode);
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
  rows?: RegistrationContractRowsPort,
): Promise<RegistrationPromoResolution | null> {
  const promoCode = await resolveRegistrationPromoCodeInTransaction(tx, params.rawCode, rows);
  if (promoCode) {
    await (rows ?? requireRegistrationContractRowsPort()).saveRegistrationPromoRowTx(tx,params.userId,promoCode.id);
  }
  return promoCode;
}

export async function getOrCreateRegistrationEmailAttemptInTransaction(
  tx: RegistrationContractDbTx,
  params: { tempSessionId: string; dataFingerprint: string },
  rows?: RegistrationContractRowsPort,
) {
  // A unique-violation catch cannot query PostgreSQL afterwards: the transaction
  // is already aborted. Serialize every observation/creation of this stable key.
  await (rows ?? requireRegistrationContractRowsPort()).lockRegistrationEmailAttemptTx(tx,params.tempSessionId);
  const existing = await (rows ?? requireRegistrationContractRowsPort()).readRegistrationEmailAttemptTx(tx,params.tempSessionId);
  if (existing) {
    if (existing.dataFingerprint !== params.dataFingerprint) {
      throw new RegistrationContractError("REGISTRATION_ATTEMPT_FINGERPRINT_MISMATCH");
    }
    return existing;
  }
  return (rows ?? requireRegistrationContractRowsPort()).insertRegistrationEmailAttemptTx(tx,params);
}

export async function completeRegistrationEmailAttemptInTransaction(
  tx: RegistrationContractDbTx,
  params: {
    tempSessionId: string;
    dataFingerprint: string;
    result: "SUCCEEDED" | "USERNAME_TAKEN" | "EMAIL_TAKEN" | "VALIDATION_ERROR";
    userId?: string;
  },
  rows?: RegistrationContractRowsPort,
) {
  const attempt = await getOrCreateRegistrationEmailAttemptInTransaction(tx, params, rows);
  if (attempt.completedAt) return attempt;
  return (rows ?? requireRegistrationContractRowsPort()).finishRegistrationEmailAttemptTx(tx,attempt.id,params);
}

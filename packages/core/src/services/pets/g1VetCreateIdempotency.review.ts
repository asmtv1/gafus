/** AG1 source-only vet CREATE idempotency contract. NO DB table, writes or live route. */
import { createHmac } from "node:crypto";
import { petVetVisitSchema } from "./petVetVisitService";
const UUID_V4 = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const VERSION = "gafus.vet.visit.CREATE.v1";
export const vetCreateOperationKey = (value: string): string => {
  if (typeof value !== "string" || !UUID_V4.test(value)) throw new Error("VET_CREATE_KEY_INVALID");
  return value.toLowerCase();
};
/** HMAC includes petId; never log any medical input, owner, secret or digest. */
export function vetCreateFingerprint(
  petId: string, input: unknown, fingerprintSecret: string,
): string {
  // Medical diagnosis/notes are guessable: do NOT store a bare SHA256 hash.
  // A dedicated server-only HMAC key is required; keep old key versions for replay.
  if (typeof fingerprintSecret !== "string" || fingerprintSecret.length < 32)
    throw new Error("VET_CREATE_FINGERPRINT_SECRET_REQUIRED");
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(petId)) throw new Error("VET_CREATE_PET_INVALID");
  const data = petVetVisitSchema.parse(input); // existing schema and defaults: no invented wire fields
  return createHmac("sha256", fingerprintSecret).update(JSON.stringify([
    VERSION, petId, data.visitedOn, data.specialty, data.doctorName,
    data.clinic, data.diagnosis, data.conclusion, data.notes,
  ])).digest("hex");
}
export type VetCreateReceiptReview = {
  operationKind: string;
  fingerprint: string;
  state: string;
  expiresAt: Date;
  visitId: string | null;
  responseJson: unknown;
};
export type VetReceiptDecision = "IDEMPOTENT_REPLAY" | "VET_CREATE_CONFLICT" | "VET_CREATE_UNKNOWN";
/** Read-only decision; caller MUST verify stored visit owner/pet before replaying. */
export function vetCreateExistingReceiptDecision(
  receipt: VetCreateReceiptReview,
  fingerprint: string,
  now: Date,
): VetReceiptDecision {
  // Keep tombstones permanently even after expiry/deletion; no same-key recreation.
  if (receipt.state !== "COMMITTED" || receipt.expiresAt <= now ||
      !receipt.visitId || receipt.responseJson === null) return "VET_CREATE_UNKNOWN";
  if (receipt.operationKind !== "CREATE" || receipt.fingerprint !== fingerprint)
    return "VET_CREATE_CONFLICT";
  return "IDEMPOTENT_REPLAY";
}

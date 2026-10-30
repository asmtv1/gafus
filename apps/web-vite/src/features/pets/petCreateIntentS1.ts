/**
 * G05 source/mock preflight only: one stable UUID v4 per explicit pet-create
 * intent. No actual HTTP, persistence, or automatic retry. AG4 accepted AG1 v9
 * 16/16 packaged Core/Prisma/PG tests; Web real POST remains separately gated.
 */
import type { PetCreateBody, PetResult } from "./petCreateS1";

export type PetCreateBindingS1 = Readonly<{
  ownerId: string;
  authEpoch: number;
  sessionScope: string;
}>;
export type PetCreateIntentStateS1 = "pending" | "unknown" | "confirmed" | "abandoned";
export type PetCreateIntentS1 = Readonly<{
  requestId: string;
  binding: PetCreateBindingS1;
  body: Readonly<PetCreateBody>;
  state: PetCreateIntentStateS1;
}>;
export type SyntheticAttemptS1 = Readonly<{
  requestId: string;
  body: Readonly<PetCreateBody>;
}>;
/** Approved proposed JSON shape, NOT attached to live submitter or HTTP. */
export type PetCreateJsonProposalS1 = Readonly<PetCreateBody & {
  clientRequestId: string;
}>;

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Cryptographically secure local identity. Never derive it from names or JWTs. */
export function newSyntheticUuidV4(): string {
  if (!globalThis.crypto?.getRandomValues) throw new Error("Secure random unavailable");
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map(x => x.toString(16).padStart(2, "0")).join("");
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16),
    hex.slice(16, 20), hex.slice(20)].join("-");
}
export function newPetCreateIntentS1(
  body: PetCreateBody,
  binding: PetCreateBindingS1,
  newUuid: () => string = newSyntheticUuidV4,
): PetCreateIntentS1 {
  if (!binding.ownerId || !binding.sessionScope ||
      !Number.isSafeInteger(binding.authEpoch) || binding.authEpoch < 0)
    throw new Error("Invalid synthetic owner/session binding");
  const requestId = newUuid();
  if (!UUID_V4.test(requestId)) throw new Error("Invalid UUID v4 source");
  // Copy ONLY canonical create fields. TypeScript excess-property checks alone
  // cannot defend against a runtime object with forged owner or request keys.
  const allowedBody: PetCreateBody = {
    name: body.name, type: body.type, breed: body.breed,
    birthDate: body.birthDate,
    ...(body.heightCm !== undefined ? {heightCm: body.heightCm} : {}),
    ...(body.neckGirthCm !== undefined ? {neckGirthCm: body.neckGirthCm} : {}),
    ...(body.muzzleGirthCm !== undefined ? {muzzleGirthCm: body.muzzleGirthCm} : {}),
    ...(body.bellyGirthCm !== undefined ? {bellyGirthCm: body.bellyGirthCm} : {}),
    ...(body.notes !== undefined ? {notes: body.notes} : {}),
  };
  return Object.freeze({
    requestId,
    binding: Object.freeze({...binding}),
    body: Object.freeze(allowedBody),
    state: "pending" as const,
  });
}
/** State transition does not allocate or change the ID/body. */
export function markPetIntentS1(
  intent: PetCreateIntentS1,
  next: Exclude<PetCreateIntentStateS1, "pending">,
): PetCreateIntentS1 {
  if (intent.state === "abandoned" || intent.state === "confirmed")
    throw new Error("Terminal pet intent cannot change state");
  if (intent.state === "unknown" && next === "confirmed")
    throw new Error("Unknown outcome needs a separately verified ACK");
  return Object.freeze({...intent, state: next});
}
function sameBinding(intent: PetCreateIntentS1, binding: PetCreateBindingS1): boolean {
  return intent.binding.ownerId === binding.ownerId &&
    intent.binding.authEpoch === binding.authEpoch &&
    intent.binding.sessionScope === binding.sessionScope;
}
/** Initial planned attempt, also entirely local. No implicit POST. */
export function prepareSyntheticFirstAttemptS1(
  intent: PetCreateIntentS1,
  binding: PetCreateBindingS1,
): SyntheticAttemptS1 | null {
  if (intent.state !== "pending" || !sameBinding(intent, binding)) return null;
  return Object.freeze({requestId: intent.requestId, body: intent.body});
}
/**
 * AG4 approved optional JSON clientRequestId (UUID v4) as canonical transport.
 * Preview ONLY; never attach "Idempotency-Key" header (unsupported/400).
 * AG1 v9 16/16 passed AG4 scoped PG acceptance; this still is mock-only.
 */
export function toPetCreateJsonProposalS1(
  attempt: SyntheticAttemptS1,
): PetCreateJsonProposalS1 {
  if (!UUID_V4.test(attempt.requestId)) throw new Error("Invalid UUID v4 source");
  return Object.freeze({...attempt.body, clientRequestId: attempt.requestId});
}
/**
 * An explicit MANUAL retry proposal only. This is NOT a network operation.
 * No real Web POST until a separate AG4 Web consumer/resource gate is granted.
 */
export function prepareSyntheticManualRetryS1(
  intent: PetCreateIntentS1,
  binding: PetCreateBindingS1,
  explicitlyRequested: boolean,
): SyntheticAttemptS1 | null {
  if (!explicitlyRequested || intent.state !== "unknown" ||
      !sameBinding(intent, binding)) return null;
  return Object.freeze({requestId: intent.requestId, body: intent.body});
}
/**
 * New identity requires a separate deliberate creation action.
 * If the previous operation is UNKNOWN, the user must explicitly acknowledge
 * that the old operation might already exist; this is not an automatic retry.
 */
export function beginExplicitNewPetIntentS1(
  previous: PetCreateIntentS1 | null,
  body: PetCreateBody,
  binding: PetCreateBindingS1,
  options: Readonly<{explicitNewCreate: boolean; acknowledgePossibleDuplicate: boolean}>,
  newUuid: () => string = newSyntheticUuidV4,
): PetCreateIntentS1 | null {
  if (!options.explicitNewCreate) return null;
  if (previous?.state === "pending") return null;
  if (previous && !sameBinding(previous, binding)) return null;
  if (previous?.state === "unknown" && !options.acknowledgePossibleDuplicate)
    return null;
  const next = newPetCreateIntentS1(body, binding, newUuid);
  if (previous?.requestId === next.requestId) throw new Error("UUID collision");
  return next;
}

/** Unknown -> confirmed needs a separately validated matching HTTP 201 ACK. */
export function confirmPetIntentWithVerifiedReplyS1(
  intent: PetCreateIntentS1,
  result: PetResult,
): PetCreateIntentS1 {
  if ((intent.state !== "pending" && intent.state !== "unknown") ||
      result.kind !== "confirmed" ||
      result.pet.ownerId !== intent.binding.ownerId ||
      result.pet.name !== intent.body.name ||
      result.pet.type !== intent.body.type)
    throw new Error("Matching verified ACK required");
  return Object.freeze({...intent,state:"confirmed" as const});
}

/** G05 source-only protocol. NOT wired to HTTP until AG4 shared-client acceptance. */
import type { CreatePetData } from "@/shared/lib/api/pets";

export type PetCreateIntent = Readonly<{
  ownerId: string;
  authEpoch: string;
  clientRequestId: string;
  payload: Readonly<CreatePetData>;
}>;

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** A manual retry MUST use the same exact snapshot and key, never edited draft fields. */
export function preparePetCreateIntent(
  existing: PetCreateIntent | null,
  actor: { ownerId: string; authEpoch: string },
  payload: CreatePetData,
  newUuid: () => string,
): PetCreateIntent {
  if (!actor.ownerId || !UUID_V4.test(actor.authEpoch))
    throw new Error("G05_OWNER_EPOCH_UNVERIFIED");
  if (existing && existing.ownerId === actor.ownerId && existing.authEpoch === actor.authEpoch)
    return existing;
  const key = newUuid();
  if (!UUID_V4.test(key)) throw new Error("G05_INVALID_UUID_V4");
  return Object.freeze({
    ownerId: actor.ownerId,
    authEpoch: actor.authEpoch,
    clientRequestId: key,
    payload: Object.freeze({ ...payload }),
  });
}

/** Explicit separate creation discards the previous intent, never automated retry. */
export function startNewPetCreateIntent(
  actor: { ownerId: string; authEpoch: string },
  payload: CreatePetData,
  newUuid: () => string,
): PetCreateIntent {
  return preparePetCreateIntent(null, actor, payload, newUuid);
}

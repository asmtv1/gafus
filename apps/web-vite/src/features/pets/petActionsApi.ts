import { apiRequest, ApiError } from "../../shared/api/client";
import { getMyPet, getMyPetWeightHistory, type PetDetails } from "./petApi";

const identifier = (id: string) => /^[A-Za-z0-9_-]{1,128}$/.test(id) && id !== "." && id !== "..";
const petPath = (id: string) => {
  if (!identifier(id)) throw Error("INVALID_PET_ID");
  return "/api/v1/pets/" + id;
};
export type PetPatch = Partial<Pick<PetDetails,
  "name" | "type" | "breed" | "birthDate" | "notes" | "showInProfile" |
  "heightCm" | "neckGirthCm" | "muzzleGirthCm" | "bellyGirthCm">>;

export async function updateMyPetAndVerify(
  petId: string, ownerId: string, patch: PetPatch,
): Promise<PetDetails> {
  if (!Object.keys(patch).length) throw Error("NO_PET_CHANGES");
  const raw = await apiRequest<unknown>(petPath(petId), {
    method: "PUT", browserAuth: true, json: patch, expectedStatus: 200,
  });
  if (!raw || typeof raw !== "object") throw Error("PET_UPDATE_ACK_INVALID");
  const ack = raw as Record<string, unknown>;
  if (ack.id !== petId || ack.ownerId !== ownerId) throw Error("PET_UPDATE_ACK_OWNER_MISMATCH");
  const readback = await getMyPet(petId);
  if (Object.entries(patch).some(([field, expected]) => {
    const actual = readback[field as keyof PetDetails];
    return field === "birthDate" && typeof expected === "string" && typeof actual === "string"
      ? actual.slice(0, 10) !== expected.slice(0, 10)
      : actual !== expected;
  })) throw Error("PET_UPDATE_READBACK_UNCONFIRMED");
  return readback;
}

export async function addMyPetWeightAndVerify(petId: string, weightKg: number,
  measuredAt: string): Promise<boolean> {
  if (!Number.isFinite(weightKg) || weightKg < 0.1 || weightKg > 200)
    throw Error("INVALID_WEIGHT");
  const date = new Date(measuredAt);
  if (!Number.isFinite(date.getTime()) || date.getTime() > Date.now() + 60_000)
    throw Error("INVALID_WEIGHT_DATE");
  const result = await apiRequest<unknown>(petPath(petId) + "/weight", {
    method: "POST", browserAuth: true, expectedStatus: 201,
    json: { weightKg, measuredAt: date.toISOString() },
  });
  if (!result || typeof result !== "object" ||
      typeof (result as { id?: unknown }).id !== "string")
    throw Error("WEIGHT_ACK_UNCONFIRMED");
  const data = await getMyPetWeightHistory(petId);
  return data.entries.some(entry =>
    entry.weightKg === weightKg && entry.measuredAt === date.toISOString());
}

export async function setMyPetWeightTargetAndVerify(petId: string,
  targetWeightKg: number | null): Promise<boolean> {
  if (targetWeightKg !== null &&
      (!Number.isFinite(targetWeightKg) || targetWeightKg < 0.1 || targetWeightKg > 200))
    throw Error("INVALID_TARGET_WEIGHT");
  await apiRequest<unknown>(petPath(petId) + "/weight/target", {
    method: "PUT", browserAuth: true, expectedStatus: 200, json: { targetWeightKg },
  });
  const actual = await getMyPetWeightHistory(petId);
  return actual.targetWeightKg === targetWeightKg;
}

/** Original registered DELETE /pets/:petId/weight/:entryId. After its exact HTTP200
 * ACK, GET the original owner weight history to prove this row disappeared.
 * There is deliberately NO retry after a lost/unknown DELETE response.
 */
export async function deleteMyPetWeightAndVerify(
  petId: string, entryId: string, currentOwner: () => boolean,
): Promise<boolean> {
  if (!identifier(entryId)) throw Error("INVALID_WEIGHT_ENTRY_ID");
  if (!currentOwner()) throw Error("PET_WEIGHT_SESSION_CHANGED");
  await apiRequest<unknown>(petPath(petId) + "/weight/" + entryId, {
    method: "DELETE", browserAuth: true, expectedStatus: 200,
  });
  if (!currentOwner()) throw Error("PET_WEIGHT_SESSION_CHANGED");
  const actual = await getMyPetWeightHistory(petId);
  if (!currentOwner()) throw Error("PET_WEIGHT_SESSION_CHANGED");
  return !actual.entries.some(entry => entry.id === entryId);
}

/** No retry of DELETE on lost acknowledgement: only a verified owner 404
 * after the accepted 200 response counts as a confirmed deletion. */
export async function deleteMyPetAndVerify(petId: string): Promise<void> {
  await apiRequest<unknown>(petPath(petId), {
    method: "DELETE", browserAuth: true, expectedStatus: 200,
  });
  try {
    await getMyPet(petId);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return;
    throw error;
  }
  throw Error("PET_DELETE_READBACK_UNCONFIRMED");
}

import type { Pet } from "./pets";

/** Pure DTO validation shared by private pets list and individual read screens. */
const nullableString = (value: unknown) => value === null || typeof value === "string";
const nullableNumber = (value: unknown) =>
  value === null || (typeof value === "number" && Number.isFinite(value));
/** No foreign, partial, malformed or duplicate private pets may enter shared cache. */
export function validatedPetsForActor(value: unknown, actor: { ownerId: string }): Pet[] {
  if (!Array.isArray(value)) throw new Error("PETS_LIST_INVALID");
  const seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item))
      throw new Error("PETS_LIST_INVALID");
    const pet = item as Record<string, unknown>;
    if (
      typeof pet.id !== "string" ||
      !pet.id ||
      seen.has(pet.id) ||
      pet.ownerId !== actor.ownerId ||
      typeof pet.name !== "string" ||
      !pet.name.trim() ||
      (pet.type !== "DOG" && pet.type !== "CAT") ||
      typeof pet.showInProfile !== "boolean" ||
      typeof pet.createdAt !== "string" ||
      !Number.isFinite(Date.parse(pet.createdAt)) ||
      !nullableString(pet.breed) ||
      !nullableString(pet.birthDate) ||
      !nullableString(pet.photoUrl) ||
      !nullableString(pet.notes) ||
      !nullableNumber(pet.heightCm) ||
      !nullableNumber(pet.weightKg) ||
      !nullableNumber(pet.neckGirthCm) ||
      !nullableNumber(pet.muzzleGirthCm) ||
      !nullableNumber(pet.bellyGirthCm)
    )
      throw new Error("PETS_LIST_INVALID");
    seen.add(pet.id);
  }
  return value as Pet[];
}

/** A one-record GET must match the exact route and verified actor. */
export function validatedPetDetailForActor(
  value: unknown,
  actor: { ownerId: string },
  petId: string,
): Pet {
  if (
    !petId ||
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (value as { id?: unknown }).id !== petId
  )
    throw new Error("PET_DETAIL_INVALID");
  try {
    return validatedPetsForActor([value], actor)[0]!;
  } catch {
    throw new Error("PET_DETAIL_INVALID");
  }
}

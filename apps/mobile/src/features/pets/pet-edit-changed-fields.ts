import type { Pet, UpdatePetData } from "@/shared/lib/api/pets";

const editableKeys = [
  "name",
  "type",
  "breed",
  "birthDate",
  "heightCm",
  "neckGirthCm",
  "muzzleGirthCm",
  "bellyGirthCm",
  "notes",
] as const;

export function getPetEditChanges(
  original: Pet,
  draft: UpdatePetData,
): { ok: true; changes: UpdatePetData } | { ok: false; field: keyof UpdatePetData | "weightKg" } {
  // Weight is managed exclusively by petWeightApi; generic PUT must never imply saving it.
  if (Object.prototype.hasOwnProperty.call(draft, "weightKg"))
    return { ok: false, field: "weightKg" };
  const changes: UpdatePetData = {};
  for (const field of editableKeys) {
    const value = draft[field];
    if (value === undefined) {
      if (typeof original[field] === "number") {
        // AG4 narrow 55PASS handoff: omit unchanged fields, but clear a previously
        // set nullable measurement with explicit JSON null (never zero).
        (changes as Record<string, unknown>)[field] = null;
      }
      continue;
    }
    const originalValue =
      field === "notes"
        ? (original.notes ?? "")
        : field === "birthDate"
          ? original.birthDate?.slice(0, 10)
          : original[field];
    if (originalValue !== value) (changes as Record<string, unknown>)[field] = value;
  }
  return { ok: true, changes };
}

export function matchesPetEditReadback(
  id: string,
  changes: UpdatePetData,
  saved: Pet | null | undefined,
): boolean {
  if (!saved || saved.id !== id) return false;
  return Object.entries(changes).every(([field, value]) => {
    const actual = (saved as unknown as Record<string, unknown>)[field];
    // Server serializes its Date to UTC ISO with time; compare calendar date.
    if (field === "birthDate" && typeof actual === "string" && typeof value === "string")
      return actual.slice(0, 10) === value;
    return actual === value;
  });
}

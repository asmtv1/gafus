import type { Pet } from "@gafus/types";
import { isValidOwnedPetWeightId, parseOwnedPetWeightHistoryData } from "@gafus/types";
import { apiRequest } from "../../shared/api/client";
import { trustedPetPhotoUrl } from "./petPhotoUrl";

/** Private card projection: never retain owner IDs, notes or medical metrics. */
export type PetCard = Pick<Pet, "id" | "name" | "type" | "breed" | "showInProfile"> & {
  photoUrl?: string;
  birthDate?: string | null;
  weightKg?: number | null;
  heightCm?: number | null;
  preventionCount?: number;
  documentCount?: number;
};

type PetListWire = PetCard & {
  _count?: { preventionEntries: number; documents: number };
};
function isPet(row: unknown): row is PetListWire {
  if (!row || typeof row !== "object") return false;
  const pet = row as Record<string, unknown>;
  const rawCounts = pet._count;
  const validCounts = rawCounts === undefined ||
    (!!rawCounts && typeof rawCounts === "object" && !Array.isArray(rawCounts) &&
      ["preventionEntries", "documents"].every((field) => {
        const value = (rawCounts as Record<string, unknown>)[field];
        return typeof value === "number" && Number.isSafeInteger(value) &&
          value >= 0 && value <= 1_000_000;
      }));
  return validCounts && typeof pet.id === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(pet.id) &&
    typeof pet.name === "string" && pet.name.trim().length > 0 &&
    ["DOG", "CAT"].includes(String(pet.type)) &&
    (pet.breed === null || typeof pet.breed === "string") &&
    typeof pet.showInProfile === "boolean" &&
    (pet.birthDate === undefined || pet.birthDate === null ||
      typeof pet.birthDate === "string" && Number.isFinite(Date.parse(pet.birthDate))) &&
    ["weightKg", "heightCm"].every(key => pet[key] === undefined || pet[key] === null ||
      typeof pet[key] === "number" && Number.isFinite(pet[key]));
}

export async function listMyPets(): Promise<PetCard[]> {
  const data = await apiRequest<unknown>("/api/v1/pets");
  if (!Array.isArray(data) || !data.every(isPet) ||
    new Set(data.map((pet: PetCard) => pet.id)).size !== data.length) {
    throw new Error("Сервер вернул некорректный список питомцев");
  }
  return data.map(pet => ({
    id: pet.id,
    name: pet.name,
    type: pet.type,
    breed: pet.breed,
    showInProfile: pet.showInProfile,
    ...(pet.birthDate !== undefined ? { birthDate: pet.birthDate } : {}),
    ...(pet.weightKg !== undefined ? { weightKg: pet.weightKg } : {}),
    ...(pet.heightCm !== undefined ? { heightCm: pet.heightCm } : {}),
    ...(pet._count !== undefined ? {
      preventionCount: pet._count.preventionEntries,
      documentCount: pet._count.documents,
    } : {}),
    ...(() => { const photoUrl=trustedPetPhotoUrl((pet as Record<string,unknown>).photoUrl);
      return photoUrl ? {photoUrl} : {}; })(),
  }));
}


export type PetDetails = PetCard & {
  notes: string | null;
  birthDate: string | null;
  weightKg: number | null;
  heightCm: number | null;
  neckGirthCm: number | null;
  muzzleGirthCm: number | null;
  bellyGirthCm: number | null;
};

export async function getMyPet(id: string): Promise<PetDetails> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id) || id === "." || id === "..") {
    throw new Error("Некорректный идентификатор питомца");
  }
  const data = await apiRequest<unknown>("/api/v1/pets/" + id);
  // Preserve the original detail-specific date validation while requiring
  // an exact same-pet ID before exposing a field-specific error. The list
  // projection independently rejects all malformed dates before rendering.
  if (data && typeof data === "object" && !Array.isArray(data) &&
      (data as Record<string, unknown>).id === id) {
    const date = (data as Record<string, unknown>).birthDate;
    if (date !== null && date !== undefined &&
      (typeof date !== "string" || !Number.isFinite(Date.parse(date))))
      throw new Error("Некорректная дата питомца");
  }
  if (!isPet(data) || !data || typeof data !== "object" || data.id !== id) {
    // A typed 200 body is not proof that it belongs to the requested
    // private /pets/:petId route. Deny before medical notes or Vet GET.
    throw new Error("Сервер вернул некорректный профиль питомца");
  }
  const pet = data as Record<string, unknown>;
  if (pet.birthDate !== null &&
    (typeof pet.birthDate !== "string" ||
      !Number.isFinite(Date.parse(pet.birthDate)))) {
    throw new Error("Некорректная дата питомца");
  }
  if (pet.notes !== null && typeof pet.notes !== "string") {
    throw new Error("Некорректное описание питомца");
  }
  for (const field of ["weightKg", "heightCm", "neckGirthCm",
    "muzzleGirthCm", "bellyGirthCm"] as const) {
    if (pet[field] !== null && pet[field] !== undefined &&
        (typeof pet[field] !== "number" ||
        !Number.isFinite(pet[field]))) {
      throw new Error("Некорректные измерения питомца");
    }
  }
  return {
    id: data.id, name: data.name, type: data.type,
    breed: data.breed, showInProfile: data.showInProfile,
    ...(() => { const photoUrl=trustedPetPhotoUrl(pet.photoUrl);
      return photoUrl ? {photoUrl} : {}; })(),
    notes: pet.notes as string | null,
    birthDate: pet.birthDate as string | null,
    weightKg: pet.weightKg as number | null,
    heightCm: pet.heightCm as number | null,
    neckGirthCm: (pet.neckGirthCm ?? null) as number | null,
    muzzleGirthCm: (pet.muzzleGirthCm ?? null) as number | null,
    bellyGirthCm: (pet.bellyGirthCm ?? null) as number | null,
  };
}


/** Owner-only history read; never cache server row ownerId, petId or metadata. */
export type PetWeightHistoryRead = {
  currentWeightKg: number | null;
  targetWeightKg: number | null;
  // Existing original Hono entry ID is required for DELETE /weight/:entryId.
  // Never include private ownerId, petId or createdAt in the UI projection.
  entries: { id: string; weightKg: number; measuredAt: string }[];
};

export async function getMyPetWeightHistory(id: string): Promise<PetWeightHistoryRead> {
  if (!isValidOwnedPetWeightId(id)) {
    throw new Error("Некорректный идентификатор питомца");
  }
  const raw = await apiRequest<unknown>("/api/v1/pets/" + id + "/weight");
  const data = parseOwnedPetWeightHistoryData(raw, id);
  if (!data) throw new Error("Некорректная история веса питомца");
  // Preserve the existing Web projection: never surface petId/ownerId/createdAt.
  return {
    currentWeightKg: data.currentWeightKg,
    targetWeightKg: data.targetWeightKg,
    entries: data.entries.map(({id: entryId, weightKg, measuredAt}) =>
      ({ id: entryId, weightKg, measuredAt })),
  };
}

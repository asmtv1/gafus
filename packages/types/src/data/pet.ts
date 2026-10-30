// Типы для работы с питомцами

export interface Pet {
  id: string;
  name: string;
  type: string;
  breed: string | null;
  birthDate: Date;
  heightCm: number | null;
  weightKg: number | null;
  neckGirthCm: number | null;
  muzzleGirthCm: number | null;
  bellyGirthCm: number | null;
  notes: string | null;
  photoUrl: string | null;
  showInProfile: boolean;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PetFormData {
  id: string;
  name: string;
  type: string;
  breed: string;
  birthDate: string;
  heightCm?: number;
  weightKg?: number;
  neckGirthCm?: number;
  muzzleGirthCm?: number;
  bellyGirthCm?: number;
  photoUrl?: string;
  notes?: string;
  ownerId?: string;
}

/** Existing ordinary GET /pets and GET /pets/:petId JSON, not the Date-valued domain Pet. */
export interface PetAwardWire {
  id: string;
  petId: string;
  title: string;
  event: string | null;
  date: string | null;
  rank: string | null;
  examType: string | null;
  examScore: number | null;
  courseId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Actual Prisma Pet scalar row plus only the awards relation included by both GETs. */
export interface PetWire {
  id: string;
  ownerId: string;
  name: string;
  type: string;
  breed: string;
  breedKey: string | null;
  birthDate: string;
  heightCm: number | null;
  weightKg: number | null;
  targetWeightKg: number | null;
  neckGirthCm: number | null;
  muzzleGirthCm: number | null;
  bellyGirthCm: number | null;
  photoUrl: string | null;
  showInProfile: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  awards: PetAwardWire[];
}

/** Owner-only list includes aggregate counts, never document or health rows. */
export interface PetListWire extends PetWire {
  _count?: { preventionEntries: number; documents: number };
}
export interface PetListRead { success: true; data: PetListWire[] }
export interface PetDetailRead { success: true; data: PetWire }


/** GET /api/v1/pets/:petId/weight public wire, scoped by authenticated owner.
 * The source record includes petId/ownerId for server checks; consumers must
 * not retain ownership metadata in the UI result. No Zod or Node dependency.
 */
export interface OwnedPetWeightHistoryEntry {
  id: string;
  petId: string;
  weightKg: number;
  measuredAt: string;
  createdAt: string;
  ownerId?: string;
}
export interface OwnedPetWeightHistoryData {
  currentWeightKg: number | null;
  targetWeightKg: number | null;
  entries: OwnedPetWeightHistoryEntry[];
}
export type OwnedPetWeightHistoryResponse =
  | { success: true; data: OwnedPetWeightHistoryData }
  | { success: false; error: string };

export type OwnedPetWeightHistoryClientData = {
  currentWeightKg: number | null;
  targetWeightKg: number | null;
  entries: Pick<OwnedPetWeightHistoryEntry, "id" | "weightKg" | "measuredAt" | "createdAt">[];
};

export function isValidOwnedPetWeightId(value: unknown): value is string {
  return typeof value === "string" &&
    value !== "." && value !== ".." && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

const weightRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const exactWeightDate = (value: unknown): value is string =>
  typeof value === "string" && !Number.isNaN(Date.parse(value)) &&
  new Date(value).toISOString() === value;
const nullableFiniteWeight = (value: unknown): value is number | null =>
  value === null || typeof value === "number" && Number.isFinite(value);

/** Parse the *unwrapped* owner-scoped response data. Reject a foreign petId,
 * malformed metrics or noncanonical dates before exposing any history.
 * Ignore future fields and strip ownerId/petId from client projections.
 */
export function parseOwnedPetWeightHistoryData(
  value: unknown, requestedPetId: string,
): OwnedPetWeightHistoryClientData | null {
  if (!isValidOwnedPetWeightId(requestedPetId) || !weightRecord(value) ||
    !nullableFiniteWeight(value.currentWeightKg) ||
    !nullableFiniteWeight(value.targetWeightKg) ||
    !Array.isArray(value.entries)) return null;
  const entries: OwnedPetWeightHistoryClientData["entries"] = [];
  for (const item of value.entries) {
    if (!weightRecord(item) || !isValidOwnedPetWeightId(item.id) ||
      item.petId !== requestedPetId ||
      typeof item.weightKg !== "number" || !Number.isFinite(item.weightKg) ||
      !exactWeightDate(item.measuredAt) || !exactWeightDate(item.createdAt)) return null;
    entries.push({
      id: item.id,
      weightKg: item.weightKg,
      measuredAt: item.measuredAt,
      createdAt: item.createdAt,
    });
  }
  return {
    currentWeightKg: value.currentWeightKg,
    targetWeightKg: value.targetWeightKg,
    entries,
  };
}

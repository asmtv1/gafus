/** Strict source-only read projection for current private pet weight history. */
import { useAuthStore } from "@/shared/stores/authStore";
import { reportClientError } from "@/shared/lib/tracer";
import { newOnlyV2NativeQueues } from "@/shared/lib/offline/newOnlyV2Native";
import { petWeightApi, type PetWeightEntry, type PetWeightHistory } from "@/shared/lib/api/pets";
export type WeightReadActor = { ownerId: string; authEpoch: string };
export type VerifiedWeightHistory = PetWeightHistory & {
  __weightOwnerId: string;
  __weightEpoch: string;
  __weightPetId: string;
};
export function verifiedWeightActor(): WeightReadActor | null {
  const a = useAuthStore.getState();
  if (!a.isAuthenticated || a.isLoading || !a.user?.id) return null;
  const b = newOnlyV2NativeQueues.getVerifiedBinding();
  return b?.principalId === a.user.id && b.authEpoch
    ? { ownerId: a.user.id, authEpoch: b.authEpoch }
    : null;
}
export function currentWeightActor(actor: WeightReadActor | null): boolean {
  if (!actor) return false;
  const now = verifiedWeightActor();
  return now?.ownerId === actor.ownerId && now.authEpoch === actor.authEpoch;
}
const finiteWeight = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0.1 && v <= 200;
const nullableWeight = (v: unknown) => v === null || finiteWeight(v);
const timestamp = (v: unknown): v is string =>
  typeof v === "string" && v.length >= 20 && Number.isFinite(Date.parse(v));
/** Exact Core sorting: measuredAt ASC, createdAt ASC, deterministic ID tie. */
export function validateWeightHistory(
  value: unknown,
  petId: string,
  actor: WeightReadActor,
): PetWeightHistory {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("PET_WEIGHT_INVALID");
  const raw = value as Record<string, unknown>;
  if (
    !nullableWeight(raw.currentWeightKg) ||
    !nullableWeight(raw.targetWeightKg) ||
    !Array.isArray(raw.entries)
  )
    throw new Error("PET_WEIGHT_INVALID");
  const seen = new Set<string>();
  const entries: PetWeightEntry[] = [];
  for (const item of raw.entries) {
    if (!item || typeof item !== "object" || Array.isArray(item))
      throw new Error("PET_WEIGHT_INVALID");
    const row = item as Record<string, unknown>;
    if (
      typeof row.id !== "string" ||
      !row.id ||
      seen.has(row.id) ||
      !finiteWeight(row.weightKg) ||
      !timestamp(row.measuredAt) ||
      !timestamp(row.createdAt) ||
      (row.petId !== undefined && row.petId !== petId) ||
      (row.ownerId !== undefined && row.ownerId !== actor.ownerId)
    )
      throw new Error("PET_WEIGHT_INVALID");
    seen.add(row.id);
    entries.push({
      id: row.id,
      weightKg: row.weightKg,
      measuredAt: row.measuredAt,
      createdAt: row.createdAt,
    });
  }
  entries.sort(
    (a, b) =>
      Date.parse(a.measuredAt) - Date.parse(b.measuredAt) ||
      Date.parse(a.createdAt) - Date.parse(b.createdAt) ||
      a.id.localeCompare(b.id),
  );
  return {
    currentWeightKg: raw.currentWeightKg as number | null,
    targetWeightKg: raw.targetWeightKg as number | null,
    entries,
  };
}
export function projectedWeightHistory(
  raw: unknown,
  petId: string,
  actor: WeightReadActor | null,
): VerifiedWeightHistory | null {
  if (!actor || !currentWeightActor(actor) || !raw || typeof raw !== "object") return null;
  const r = raw as Partial<VerifiedWeightHistory>;
  if (
    r.__weightOwnerId !== actor.ownerId ||
    r.__weightEpoch !== actor.authEpoch ||
    r.__weightPetId !== petId
  )
    return null;
  try {
    return {
      ...validateWeightHistory(raw, petId, actor),
      __weightOwnerId: actor.ownerId,
      __weightEpoch: actor.authEpoch,
      __weightPetId: petId,
    };
  } catch {
    reportClientError(new Error("PET_WEIGHT_CACHE_INVALID"), {
      issueKey: "PetWeightRead",
      keys: { operation: "cache_projection" },
    });
    return null;
  }
}
/**
 * Negative-only check of the JWT subject on the *exact token selected by the
 * transport*. This unverified payload NEVER grants identity or access: the
 * Hono JWT verifier/ACL is authoritative. A mismatch/malformed token can only
 * block this private native read before it is sent. Bound decoding avoids a
 * base64 runtime polyfill and rejects ambiguous/oversized payloads.
 */
function selectedWeightTokenMatchesActor(token: string | null | undefined, ownerId: string): boolean {
  if (!token || token.length > 8192) return false;
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[2] || !/^[A-Za-z0-9_-]{4,4096}$/.test(parts[1] ?? ""))
    return false;
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const payload = parts[1]!;
  let buffer = 0;
  let bits = 0;
  let json = "";
  for (const c of payload) {
    const sextet = alphabet.indexOf(c);
    if (sextet < 0) return false;
    buffer = (buffer << 6) | sextet;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      json += String.fromCharCode((buffer >>> bits) & 255);
      buffer &= (1 << bits) - 1;
    }
  }
  if (bits && buffer !== 0) return false;
  try {
    const value: unknown = JSON.parse(json);
    return !!value && typeof value === "object" && !Array.isArray(value) &&
      (value as { sub?: unknown }).sub === ownerId;
  } catch {
    // Fail closed without logging token content.
    return false;
  }
}

export async function readWeightHistory(
  petId: string,
  actor: WeightReadActor,
): Promise<VerifiedWeightHistory> {
  if (!petId || !currentWeightActor(actor)) throw new Error("PET_WEIGHT_SESSION_CHANGED");
  const r = await petWeightApi.get(petId, (selectedAccessToken) =>
    currentWeightActor(actor) && selectedWeightTokenMatchesActor(selectedAccessToken, actor.ownerId),
  actor.ownerId);
  if (!currentWeightActor(actor)) throw new Error("PET_WEIGHT_SESSION_CHANGED");
  // Invalid HTTP200 is a private data integrity failure, not an unavailable
  // 404/429/500; preserve the strict native caller's original error contract.
  if (!r.success && r.code === "G05_SESSION_CHANGED") throw new Error("PET_WEIGHT_SESSION_CHANGED");
  if (!r.success && r.code === "INVALID_RESPONSE") throw new Error("PET_WEIGHT_INVALID");
  if (!r.success) throw new Error("PET_WEIGHT_UNAVAILABLE");
  return {
    ...validateWeightHistory(r.data, petId, actor),
    __weightOwnerId: actor.ownerId,
    __weightEpoch: actor.authEpoch,
    __weightPetId: petId,
  };
}

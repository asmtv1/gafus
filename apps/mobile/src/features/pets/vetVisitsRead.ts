/* eslint-disable @gafus/require-client-catch-tracer -- Invalid signed media links may contain secret tokens; never send the raw link to tracer. */
/** AG3 V43: owner-scoped medical history reads through existing Hono GET only. */
import { useAuthStore } from "@/shared/stores/authStore";
import { newOnlyV2NativeQueues } from "@/shared/lib/offline/newOnlyV2Native";
import { petVetVisitsApi } from "@/shared/lib/api/pet-vet-visits";
import type { ApiResponse } from "@/shared/lib/api/client";
import { VET_VISIT_MIME_TYPES, type PetVetVisit, type PetVetAttachment } from "@gafus/types";

export type VetReadActor = { ownerId: string; authEpoch: string };
export type VetReadScope = {
  ownerId: string;
  authEpoch: string;
  petId: string;
  visitId?: string;
};
export type VetReadResult<T> =
  | { kind: "ready"; data: T; scope?: VetReadScope }
  | { kind: "missing" | "unauthorized" | "unknown" | "stale" };
const idPattern = /^[A-Za-z0-9_-]{1,128}$/;
const vetFields = [
  "specialty",
  "doctorName",
  "clinic",
  "diagnosis",
  "conclusion",
  "notes",
] as const;
export const validVetId = (value: string): boolean => idPattern.test(value);
export function verifiedVetActor(): VetReadActor | null {
  const auth = useAuthStore.getState();
  const binding = newOnlyV2NativeQueues.getVerifiedBinding();
  if (
    !auth.isAuthenticated ||
    auth.isLoading ||
    !auth.user?.id ||
    binding?.principalId !== auth.user.id ||
    !binding.authEpoch
  )
    return null;
  return { ownerId: auth.user.id, authEpoch: binding.authEpoch };
}
export function sameVetActor(actor: VetReadActor | null): boolean {
  if (!actor) return false;
  const current = verifiedVetActor();
  return current?.ownerId === actor.ownerId && current.authEpoch === actor.authEpoch;
}
function projectAttachment(value: unknown): PetVetAttachment | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== "string" ||
    !validVetId(row.id) ||
    typeof row.name !== "string" ||
    row.name.length > 255 ||
    typeof row.mimeType !== "string" ||
    !VET_VISIT_MIME_TYPES.includes(row.mimeType as (typeof VET_VISIT_MIME_TYPES)[number]) ||
    typeof row.sizeBytes !== "number" ||
    !Number.isInteger(row.sizeBytes) ||
    row.sizeBytes < 0 ||
    typeof row.hasPreview !== "boolean"
  )
    return null;
  return {
    id: row.id,
    name: row.name,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    hasPreview: row.hasPreview,
    previewProcessing: row.previewProcessing === true,
  };
}
/** Drop all unrecognized keys: object keys, signed URLs, owner tokens and storage metadata. */
export function publicOwnVetVisit(
  value: unknown,
  petId: string,
  verifiedOwnerId?: string,
): PetVetVisit | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== "string" ||
    !validVetId(row.id) ||
    row.petId !== petId ||
    // Core private rows may include ownerId; reject any foreign-owned records.
    (verifiedOwnerId !== undefined &&
      row.ownerId !== undefined &&
      row.ownerId !== verifiedOwnerId) ||
    typeof row.visitedOn !== "string" ||
    !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(row.visitedOn) ||
    !Number.isFinite(new Date(`${row.visitedOn}T12:00:00Z`).getTime()) ||
    new Date(`${row.visitedOn}T12:00:00Z`).toISOString().slice(0, 10) !== row.visitedOn ||
    !Array.isArray(row.attachments) ||
    row.attachments.length > 5
  )
    return null;
  const max: Record<(typeof vetFields)[number], number> = {
    specialty: 200,
    doctorName: 200,
    clinic: 300,
    diagnosis: 10_000,
    conclusion: 10_000,
    notes: 10_000,
  };
  for (const field of vetFields)
    if (typeof row[field] !== "string" || (row[field] as string).length > max[field]) return null;
  const attachments = row.attachments.map(projectAttachment);
  if (attachments.some((a) => a === null)) return null;
  return {
    id: row.id,
    petId,
    visitedOn: row.visitedOn,
    specialty: row.specialty as string,
    doctorName: row.doctorName as string,
    clinic: row.clinic as string,
    diagnosis: row.diagnosis as string,
    conclusion: row.conclusion as string,
    notes: row.notes as string,
    attachments: attachments as PetVetAttachment[],
  };
}
function mapFailure<T>(response: ApiResponse<T>): VetReadResult<never> {
  if (response.code === "VET_VISIT_NOT_FOUND") return { kind: "missing" };
  if (
    response.code === "UNAUTHORIZED" ||
    response.code === "AUTH_REFRESH_UNAVAILABLE" ||
    response.code === "AUTH_REQUIRED"
  )
    return { kind: "unauthorized" };
  if (response.code === "G05_SESSION_CHANGED") return { kind: "stale" };
  return { kind: "unknown" };
}
/** Reproject private QueryClient rows at display time, even after successful refocus.
 * A matching owner/epoch cache key alone does not validate arbitrary cached data. */
export function vetHistoryCacheForActor(
  value: unknown,
  actor: VetReadActor | null,
  petId: string,
): VetReadResult<PetVetVisit[]> | null {
  if (!sameVetActor(actor) || !validVetId(petId) || !value || typeof value !== "object")
    return null;
  const result = value as Partial<VetReadResult<PetVetVisit[]>>;
  if (result.kind !== "ready") {
    if (
      result.kind === "missing" ||
      result.kind === "unauthorized" ||
      result.kind === "unknown" ||
      result.kind === "stale"
    )
      return { kind: result.kind };
    return { kind: "unknown" };
  }
  // Owner/epoch/pet provenance must originate from a guarded GET, never cache injection.
  const scope = result.scope;
  if (
    !scope ||
    scope.ownerId !== actor!.ownerId ||
    scope.authEpoch !== actor!.authEpoch ||
    scope.petId !== petId ||
    scope.visitId !== undefined
  )
    return { kind: "unknown" };
  if (!Array.isArray(result.data)) return { kind: "unknown" };
  const projected = result.data.map((item) => publicOwnVetVisit(item, petId, actor!.ownerId));
  return projected.some((item) => item === null)
    ? { kind: "unknown" }
    : { kind: "ready", data: projected as PetVetVisit[] };
}

export function vetVisitsForActor(actor: VetReadActor | null, petId: string) {
  const guard = () => sameVetActor(actor);
  return {
    queryKey: [
      "pet-vet-visits",
      "owner",
      actor?.ownerId ?? null,
      actor?.authEpoch ?? null,
      petId,
    ] as const,
    enabled: guard() && validVetId(petId),
    gcTime: 0,
    staleTime: 0,
    refetchOnMount: "always" as const,
    retry: false,
    queryFn: async (): Promise<VetReadResult<PetVetVisit[]>> => {
      if (!guard()) return { kind: "stale" };
      if (!validVetId(petId)) return { kind: "missing" };
      const response = await petVetVisitsApi.listResponse(petId, guard);
      if (!guard()) return { kind: "stale" };
      if (!response.success) return mapFailure(response);
      if (!Array.isArray(response.data)) return { kind: "unknown" };
      const visits = response.data.map((item) => publicOwnVetVisit(item, petId, actor!.ownerId));
      return visits.some((row) => row === null)
        ? { kind: "unknown" }
        : {
            kind: "ready",
            data: visits as PetVetVisit[],
            scope: { ownerId: actor!.ownerId, authEpoch: actor!.authEpoch, petId },
          };
    },
  };
}
/** Revalidate private detail cache provenance before showing diagnosis/media. */
export function vetDetailCacheForActor(
  value: unknown,
  actor: VetReadActor | null,
  petId: string,
  visitId: string | null,
): VetReadResult<PetVetVisit> | null {
  if (
    !sameVetActor(actor) ||
    !validVetId(petId) ||
    !visitId ||
    !validVetId(visitId) ||
    !value ||
    typeof value !== "object"
  )
    return null;
  const result = value as Partial<VetReadResult<PetVetVisit>>;
  if (result.kind !== "ready") {
    if (
      result.kind === "missing" ||
      result.kind === "unauthorized" ||
      result.kind === "unknown" ||
      result.kind === "stale"
    )
      return { kind: result.kind };
    return { kind: "unknown" };
  }
  const scope = result.scope;
  if (
    !scope ||
    scope.ownerId !== actor!.ownerId ||
    scope.authEpoch !== actor!.authEpoch ||
    scope.petId !== petId ||
    scope.visitId !== visitId
  )
    return { kind: "unknown" };
  const detail = publicOwnVetVisit(result.data, petId, actor!.ownerId);
  return detail?.id === visitId ? { kind: "ready", data: detail, scope } : { kind: "unknown" };
}

export function vetVisitDetailForActor(
  actor: VetReadActor | null,
  petId: string,
  visitId: string | null,
) {
  const guard = () => sameVetActor(actor);
  return {
    queryKey: [
      "pet-vet-detail",
      "owner",
      actor?.ownerId ?? null,
      actor?.authEpoch ?? null,
      petId,
      visitId,
    ] as const,
    enabled: guard() && validVetId(petId) && !!visitId && validVetId(visitId),
    gcTime: 0,
    staleTime: 0,
    refetchOnMount: "always" as const,
    retry: false,
    queryFn: async (): Promise<VetReadResult<PetVetVisit>> => {
      if (!guard()) return { kind: "stale" };
      if (!validVetId(petId) || !visitId || !validVetId(visitId)) return { kind: "missing" };
      const response = await petVetVisitsApi.detailResponse(petId, visitId, guard);
      if (!guard()) return { kind: "stale" };
      if (!response.success) return mapFailure(response);
      const detail = publicOwnVetVisit(response.data, petId, actor!.ownerId);
      return detail?.id === visitId
        ? {
            kind: "ready",
            data: detail,
            scope: { ownerId: actor!.ownerId, authEpoch: actor!.authEpoch, petId, visitId },
          }
        : { kind: "unknown" };
    },
  };
}

/** Core returns time-limited S3 X-Amz and CDN md5(path,expiry) URLs.
 * Reject unsigned/bare private medical media URLs. */
export function signedVetMediaUrl(value: unknown, now = Date.now()): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    const cdn = url.pathname.match(/^\/md5\([A-Za-z0-9_-]+,(\d{10})\)\//);
    if (cdn) return Number(cdn[1]) * 1000 - now > 5_000 ? value : null;
    const params = url.searchParams;
    if (!params.get("X-Amz-Signature") || !params.get("X-Amz-Credential")) return null;
    const date = params.get("X-Amz-Date"),
      duration = params.get("X-Amz-Expires");
    if (!date || !duration || !/^\d{8}T\d{6}Z$/.test(date) || !/^\d+$/.test(duration)) return null;
    const started = Date.UTC(
      Number(date.slice(0, 4)),
      Number(date.slice(4, 6)) - 1,
      Number(date.slice(6, 8)),
      Number(date.slice(9, 11)),
      Number(date.slice(11, 13)),
      Number(date.slice(13, 15)),
    );
    const seconds = Number(duration);
    return Number.isFinite(started) &&
      seconds > 0 &&
      seconds <= 86400 &&
      started + seconds * 1000 - now > 5_000
      ? value
      : null;
  } catch {
    return null;
  }
}

/** AG3 V46 — mock-only, owner verified, metadata-only veterinary visit delete. */
import type { PetVetVisit } from "@gafus/types";
import { petVetVisitsApi } from "@/shared/lib/api/pet-vet-visits";
import { reportClientError } from "@/shared/lib/tracer";
import { publicOwnVetVisit, sameVetActor, validVetId, type VetReadActor } from "./vetVisitsRead";

export type VetDeleteOutcome =
  | { kind: "confirmed" }
  | { kind: "blocked_attachments" | "missing" | "unknown" | "stale" };

const fields = [
  "visitedOn",
  "specialty",
  "doctorName",
  "clinic",
  "diagnosis",
  "conclusion",
  "notes",
] as const;
function sameOriginal(a: PetVetVisit, b: PetVetVisit): boolean {
  return (
    a.id === b.id &&
    a.petId === b.petId &&
    fields.every((field) => a[field] === b[field]) &&
    a.attachments.length === b.attachments.length &&
    a.attachments.every((f, index) => b.attachments[index]?.id === f.id)
  );
}
/** Call only after the user explicitly confirms the existing Alert.
 * No real HTTP or storage providers are authorized by this source/mock code. */
export async function deleteVetVisitAndReadback(input: {
  actor: VetReadActor;
  petId: string;
  original: PetVetVisit;
  live: () => boolean;
}): Promise<VetDeleteOutcome> {
  const { actor, petId, original, live } = input;
  const current = () => live() && sameVetActor(actor);
  if (!current()) return { kind: "stale" };
  if (!validVetId(petId) || !validVetId(original.id) || original.petId !== petId)
    return { kind: "missing" };
  // Core deletePetVetVisit enqueues attachment removal. Outside AG3 V46 lease.
  if (original.attachments.length) return { kind: "blocked_attachments" };
  try {
    const before = await petVetVisitsApi.detailResponse(petId, original.id, current);
    if (!current()) return { kind: "stale" };
    if (!before.success) {
      if (before.code === "VET_VISIT_NOT_FOUND") return { kind: "missing" };
      return { kind: "unknown" };
    }
    const fresh = publicOwnVetVisit(before.data, petId);
    if (!fresh || fresh.id !== original.id) return { kind: "unknown" };
    if (fresh.attachments.length) return { kind: "blocked_attachments" };
    if (!sameOriginal(fresh, original)) return { kind: "unknown" };
    if (!current()) return { kind: "stale" };
    // Exactly one DELETE after explicit UI confirmation.
    const ack = await petVetVisitsApi.deleteResponse(petId, original.id, current);
    if (!current()) return { kind: "stale" };
    if (!ack.success) {
      // DELETE returned 404: owner-safe absence, NOT proof this client deleted it.
      if (ack.code === "VET_VISIT_NOT_FOUND") return { kind: "missing" };
      return { kind: "unknown" };
    }
    // Only authoritative owner-scoped detail GET + exact code proves absence.
    const readback = await petVetVisitsApi.detailResponse(petId, original.id, current);
    if (!current()) return { kind: "stale" };
    if (!readback.success && readback.code === "VET_VISIT_NOT_FOUND") return { kind: "confirmed" };
    return { kind: "unknown" };
  } catch {
    if (current())
      reportClientError(new Error("VET_DELETE_RESULT_UNKNOWN"), {
        issueKey: "VetVisitDelete",
        keys: { operation: "preflight_delete_readback" },
      });
    return current() ? { kind: "unknown" } : { kind: "stale" };
  }
}

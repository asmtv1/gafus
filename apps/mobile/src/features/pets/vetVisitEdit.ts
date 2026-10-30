/** V45 existing Core full PUT with preflight owner GET, one write, exact readback. */
import type { PetVetVisit, PetVetVisitInput } from "@gafus/types";
import { petVetVisitsApi } from "@/shared/lib/api/pet-vet-visits";
import { publicOwnVetVisit, sameVetActor, validVetId, type VetReadActor } from "./vetVisitsRead";
import { vetCreatePayload } from "./vetVisitCreate";
import { vetPrecommitRejection, type VetFieldErrors } from "./vetVisitMutationValidation";
import { reportClientError } from "@/shared/lib/tracer";

const fields = [
  "visitedOn",
  "specialty",
  "doctorName",
  "clinic",
  "diagnosis",
  "conclusion",
  "notes",
] as const;
export type VetEditResult =
  | { kind: "confirmed"; visit: PetVetVisit; changedFields: string[] }
  | { kind: "unchanged" }
  | { kind: "rejected"; fieldErrors: VetFieldErrors }
  | { kind: "invalid"; field: "date" | "specialty" | "fields" }
  | { kind: "missing" | "unknown" | "stale" };
function fieldEqual(a: PetVetVisit, b: PetVetVisit): boolean {
  return fields.every((key) => a[key] === b[key]);
}
function attachmentsEqual(a: PetVetVisit, b: PetVetVisit): boolean {
  const fingerprint = (visit: PetVetVisit) =>
    visit.attachments
      .map((x) => x.id)
      .sort()
      .join("|");
  return fingerprint(a) === fingerprint(b);
}
export async function editVetVisitAndReadback(input: {
  actor: VetReadActor;
  petId: string;
  original: PetVetVisit;
  day: string;
  draft: PetVetVisitInput;
  live: () => boolean;
  now?: Date;
}): Promise<VetEditResult> {
  const { actor, petId, original, live } = input;
  const current = () => live() && sameVetActor(actor);
  if (!current()) return { kind: "stale" };
  if (!validVetId(petId) || !validVetId(original.id) || original.petId !== petId)
    return { kind: "missing" };
  const planned = vetCreatePayload(input.day, input.draft, input.now);
  if (!planned.ok) return { kind: "invalid", field: planned.field };
  const payload = planned.expected; // FULL Core PUT, intentionally preserve unchanged fields.
  const changedFields = fields.filter((field) => payload[field] !== original[field]);
  if (!changedFields.length) return { kind: "unchanged" };
  if (!current()) return { kind: "stale" };
  try {
    // The screen's detail can be stale. Read server baseline first: no write if
    // someone updated clinical fields or attachments since the form opened.
    const baseline = await petVetVisitsApi.detailResponse(petId, original.id, current);
    if (!current()) return { kind: "stale" };
    if (!baseline.success) {
      if (baseline.code === "VET_VISIT_NOT_FOUND") return { kind: "missing" };
      return { kind: "unknown" };
    }
    const fresh = publicOwnVetVisit(baseline.data, petId);
    if (
      !fresh ||
      fresh.id !== original.id ||
      !fieldEqual(fresh, original) ||
      !attachmentsEqual(fresh, original)
    )
      return { kind: "unknown" };
    if (!current()) return { kind: "stale" };
    // Exactly one PUT. No retries on thrown/lost ACK or ambiguous statuses.
    const ack = await petVetVisitsApi.editResponse(petId, original.id, payload, current);
    if (!current()) return { kind: "stale" };
    if (!ack.success) {
      const fieldErrors = vetPrecommitRejection(ack);
      if (fieldErrors) return { kind: "rejected", fieldErrors };
      if (ack.code === "VET_VISIT_NOT_FOUND") return { kind: "missing" };
      return { kind: "unknown" };
    }
    const saved = publicOwnVetVisit(ack.data, petId);
    if (
      !saved ||
      saved.id !== original.id ||
      fields.some((field) => saved[field] !== payload[field]) ||
      !attachmentsEqual(saved, original)
    )
      return { kind: "unknown" };
    const readback = await petVetVisitsApi.detailResponse(petId, original.id, current);
    if (!current()) return { kind: "stale" };
    if (!readback.success) return { kind: "unknown" };
    const verified = publicOwnVetVisit(readback.data, petId);
    if (
      !verified ||
      verified.id !== original.id ||
      fields.some((field) => verified[field] !== payload[field]) ||
      !attachmentsEqual(verified, original)
    )
      return { kind: "unknown" };
    return { kind: "confirmed", visit: verified, changedFields };
  } catch {
    reportClientError(new Error("VET_EDIT_WRITE_OR_READBACK_UNKNOWN"), {
      issueKey: "VetVisitEdit",
      keys: { operation: "preflight_put_readback" },
    });
    return current() ? { kind: "unknown" } : { kind: "stale" };
  }
}

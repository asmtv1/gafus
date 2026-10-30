/** AG3 V44 — existing vet visit POST, guarded single attempt plus authoritative detail GET.
 * Core has no idempotency receipt. Do NOT auto-retry a lost response. */
import type { PetVetVisit, PetVetVisitInput } from "@gafus/types";
import { petVetVisitsApi } from "@/shared/lib/api/pet-vet-visits";
import { parseVetVisitDate } from "./vetVisitDate";
import { reportClientError } from "@/shared/lib/tracer";
import { vetPrecommitRejection, type VetFieldErrors } from "./vetVisitMutationValidation";
import { publicOwnVetVisit, sameVetActor, validVetId, type VetReadActor } from "./vetVisitsRead";

const optional = ["doctorName", "clinic", "diagnosis", "conclusion", "notes"] as const;
const limits: Record<(typeof optional)[number], number> = {
  doctorName: 200,
  clinic: 300,
  diagnosis: 10_000,
  conclusion: 10_000,
  notes: 10_000,
};
export type VetCreateDraft = Pick<PetVetVisitInput, "visitedOn" | "specialty"> &
  Partial<PetVetVisitInput>;
export type VetCreateResult =
  | { kind: "confirmed"; visit: PetVetVisit }
  | { kind: "invalid"; field: "date" | "specialty" | "fields" }
  | { kind: "rejected"; fieldErrors: VetFieldErrors }
  | { kind: "unknown" | "stale" };
export function vetCreatePayload(
  day: string,
  draft: PetVetVisitInput,
  now = new Date(),
):
  | { ok: true; value: VetCreateDraft; expected: PetVetVisitInput }
  | { ok: false; field: "date" | "specialty" | "fields" } {
  const visitedOn = parseVetVisitDate(day, now);
  // Backend Core currently accepts 1900+; do not send dates it will reject.
  if (!visitedOn || visitedOn < "1900-01-01") return { ok: false, field: "date" };
  const specialty = draft.specialty.trim();
  if (!specialty || specialty.length > 200) return { ok: false, field: "specialty" };
  const expected: PetVetVisitInput = {
    visitedOn,
    specialty,
    doctorName: "",
    clinic: "",
    diagnosis: "",
    conclusion: "",
    notes: "",
  };
  const value: VetCreateDraft = { visitedOn, specialty };
  // Existing Core zod schema defaults omitted optional strings to empty. Only
  // include genuinely entered optional fields, with no additional keys or ownerId.
  for (const field of optional) {
    const text = draft[field].trim();
    if (text.length > limits[field]) return { ok: false, field: "fields" };
    expected[field] = text;
    if (text) value[field] = text;
  }
  return { ok: true, value, expected };
}
function exactCreated(actual: PetVetVisit, expected: PetVetVisitInput): boolean {
  return (
    actual.visitedOn === expected.visitedOn &&
    actual.specialty === expected.specialty &&
    optional.every((field) => actual[field] === expected[field]) &&
    actual.attachments.length === 0
  );
}
export async function createVetVisitAndReadback(input: {
  actor: VetReadActor;
  petId: string;
  day: string;
  draft: PetVetVisitInput;
  live: () => boolean;
  now?: Date;
}): Promise<VetCreateResult> {
  const { actor, petId, live } = input;
  const current = () => live() && sameVetActor(actor);
  if (!current()) return { kind: "stale" };
  if (!validVetId(petId)) return { kind: "invalid", field: "fields" };
  const payload = vetCreatePayload(input.day, input.draft, input.now);
  if (!payload.ok) return { kind: "invalid", field: payload.field };
  if (!current()) return { kind: "stale" };
  // The first POST is the only attempt, regardless of error/timeout status.
  try {
    const ack = await petVetVisitsApi.createResponse(petId, payload.value, current);
    if (!current()) return { kind: "stale" };
    if (!ack.success) {
      const fieldErrors = vetPrecommitRejection(ack);
      return fieldErrors ? { kind: "rejected", fieldErrors } : { kind: "unknown" };
    }
    if (!ack.data) return { kind: "unknown" };
    const receipt = publicOwnVetVisit(ack.data, petId);
    if (!receipt || !validVetId(receipt.id) || !exactCreated(receipt, payload.expected))
      return { kind: "unknown" };
    // GET is authoritative. A successful POST response alone never confirms UI.
    const read = await petVetVisitsApi.detailResponse(petId, receipt.id, current);
    if (!current()) return { kind: "stale" };
    if (!read.success || !read.data) return { kind: "unknown" };
    const persisted = publicOwnVetVisit(read.data, petId);
    if (!persisted || persisted.id !== receipt.id || !exactCreated(persisted, payload.expected))
      return { kind: "unknown" };
    return { kind: "confirmed", visit: persisted };
  } catch {
    // Fixed code only: no diagnosis, clinic, petId, URL, or raw exception body.
    reportClientError(new Error("VET_CREATE_COMMIT_OR_READBACK_UNKNOWN"), {
      issueKey: "VetVisitCreate",
      keys: { operation: "post_and_readback" },
    });
    // The HTTP request may already have committed. Never auto-retry.
    return current() ? { kind: "unknown" } : { kind: "stale" };
  }
}

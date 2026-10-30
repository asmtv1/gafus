/** Owner+epoch scoped LOCAL preview only: no server calls, queue mutation or legacy reads. */
import type { NewOnlyV2Queues, V2PendingEvent } from "./newOnlyV2Queues";

type ReadOnlyQueue = Pick<NewOnlyV2Queues, "getVerifiedBinding" | "getPending">;
export type PendingPreventionPreview = {
  eventId: string;
  type: "VACCINATION" | "DEWORMING" | "TICKS_FLEAS";
  performedAt: string;
};

/** Never expose a preview from a previous or unverified session. */
export async function readOwnPendingPrevention(
  queue: ReadOnlyQueue,
  petId: string,
  principalId: string | null,
): Promise<PendingPreventionPreview[]> {
  const start = queue.getVerifiedBinding();
  if (!principalId || !start || start.principalId !== principalId || !petId) return [];
  const items = await queue.getPending("prevention");
  const end = queue.getVerifiedBinding();
  if (!end || end.principalId !== principalId || end.authEpoch !== start.authEpoch) return [];
  return items.flatMap((event: V2PendingEvent): PendingPreventionPreview[] => {
    if (event.kind !== "prevention.upsert" || event.payload.petId !== petId) return [];
    const entries = event.payload.entries;
    if (!Array.isArray(entries) || entries.length !== 1) return [];
    const item: unknown = entries[0];
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const fields = item as Record<string, unknown>;
    if (
      !["VACCINATION", "DEWORMING", "TICKS_FLEAS"].includes(String(fields.type)) ||
      typeof fields.performedAt !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T/.test(fields.performedAt)
    )
      return [];
    return [
      {
        eventId: event.eventId,
        type: fields.type as PendingPreventionPreview["type"],
        performedAt: fields.performedAt,
      },
    ];
  });
}

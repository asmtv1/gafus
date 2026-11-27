import type { NewOnlyV2Queues, V2SessionBinding } from "./newOnlyV2Queues";
import { preparePreventionJournalContract, type PreventionContractPreview } from "./newOnlyV2PreventionContract";

export type PreventionReplayQueue = Pick<NewOnlyV2Queues, "getVerifiedBinding" | "getPending" | "acknowledgePrevention">;
export type PreventionReplayTransport = (request: PreventionContractPreview["post"], current: () => boolean) => Promise<unknown>;

/** Bounded exact-once submission. No legacy endpoint, lookup-only ACK,
 * ownerless migration, or deletion on a timeout/conflict. */
export async function replayPreventionJournal(
  queue: PreventionReplayQueue,
  binding: V2SessionBinding,
  isCurrent: () => boolean,
  send: PreventionReplayTransport,
  onCommitted: (petId: string) => void,
  limit = 25,
): Promise<{ committed: number; pending: boolean }> {
  const current = () => {
    const active = queue.getVerifiedBinding();
    return isCurrent() && active?.principalId === binding.principalId && active.authEpoch === binding.authEpoch;
  };
  let committed = 0;
  if (!current()) return { committed, pending: true };
  const entries = await queue.getPending("prevention");
  if (!current()) return { committed, pending: true };
  for (const event of entries.slice(0, Math.max(1, Math.min(50, limit)))) {
    if (!current()) return { committed, pending: true };
    const preview = preparePreventionJournalContract({ binding, event }, binding);
    // On lost ACK, repeat POST with the exact same event and body. The SQL
    // journal validates the original payloadHash before returning a replay.
    const response = await send(preview.post, current);
    if (!current() || !await queue.acknowledgePrevention(binding, event, preview, response, current))
      return { committed, pending: true };
    committed++;
    if (current()) onCommitted(preview.post.body.petId);
  }
  return { committed, pending: entries.length > committed };
}

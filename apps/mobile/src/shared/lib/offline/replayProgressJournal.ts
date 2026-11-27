import { prepareVideoJournal, type VideoJournalPreview } from "./videoJournalContract";
import { prepareTimerJournal, type TimerJournalPreview } from "./timerJournalContract";
import type { NewOnlyV2Queues, V2SessionBinding } from "./newOnlyV2Queues";
import { preparePracticeJournalRequest, type PracticeJournalPreview } from "./newOnlyV2PracticeContract";

import { prepareDailyJournalRequest, type DailyJournalPreview } from "./dailyJournalContract";
type ReplayQueue = Pick<NewOnlyV2Queues, "getVerifiedBinding" | "getPending" | "acknowledgePractice" | "acknowledgeDaily" | "acknowledgeTimer" | "acknowledgeVideo">;
export type ProgressJournalRequest = PracticeJournalPreview["post"] | DailyJournalPreview["post"] | TimerJournalPreview["post"] | VideoJournalPreview["post"];
export type ProgressReplayTransport = (request: ProgressJournalRequest, current: () => boolean) => Promise<unknown>;

/** Replay only a contiguous supported prefix. Never invent an occurrence
 * for old index-only events or jump over unsupported timer/video commands. */
export async function replayProgressJournal(
  queue: ReplayQueue, binding: V2SessionBinding, isCurrent: () => boolean,
  send: ProgressReplayTransport, onCommitted: (operation: ProgressJournalRequest["body"]["operation"]) => void, limit = 25,
): Promise<{ committed: number; pending: boolean }> {
  const current = () => {
    const active = queue.getVerifiedBinding();
    return isCurrent() && active?.principalId === binding.principalId && active.authEpoch === binding.authEpoch;
  };
  let committed = 0;
  if (!current()) return { committed, pending: true };
  const entries = await queue.getPending("progress");
  for (const event of entries.slice(0, Math.max(1, Math.min(50, limit)))) {
    if (!current()) return { committed, pending: true };
    let operation: ProgressJournalRequest["body"]["operation"];
    if (event.kind === "dailyCourseCompleteStep" && event.payload.expectedBundleStepId && event.payload.expectedStepId) {
      const preview = prepareDailyJournalRequest(binding, event);
      operation = preview.post.body.operation;
      const response = await send(preview.post, current);
      if (!current() || !await queue.acknowledgeDaily(binding, event, preview, response, current))
        return { committed, pending: true };
    } else if (["completePracticeStep", "completeTheoryStep"].includes(event.kind) &&
        event.payload.expectedStepOnDayId && event.payload.expectedStepId) {
      const preview = preparePracticeJournalRequest({ binding, event }, binding);
      operation = preview.post.body.operation;
      const response = await send(preview.post, current);
      if (!current() || !await queue.acknowledgePractice(binding, event, preview, response, current))
        return { committed, pending: true };
    } else if (event.kind === "saveVideoProgress") {
      const preview = prepareVideoJournal(binding, event);
      if (!preview) return { committed, pending: true };
      operation = preview.post.body.operation;
      const response = await send(preview.post, current);
      if (!current() || !await queue.acknowledgeVideo(binding, event, preview, response, current))
        return { committed, pending: true };
    } else {
      const preview = prepareTimerJournal(binding,event);
      if (!preview) return { committed, pending: true };
      operation = preview.post.body.operation;
      const response = await send(preview.post,current);
      if (!current() || !await queue.acknowledgeTimer(binding,event,preview,response,current))
        return { committed, pending: true };
    }
    committed++;
    if (current()) onCommitted(operation);
  }
  return { committed, pending: entries.length > committed };
}

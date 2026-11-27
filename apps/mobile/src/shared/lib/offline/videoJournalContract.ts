import type { V2PendingEvent, V2SessionBinding } from "./newOnlyV2Queues";
import { readJournalVersionFields, validProgressVersion, type JournalVersionFields } from "./journalVersionFields";

export type VideoProgressSnapshot = { lastPositionSec: number; progressVersion: string };
export type VideoJournalBody = Readonly<JournalVersionFields & {
  eventId: string; operation: "video.progress"; videoId: string; positionSec: number;
}>;
export type VideoJournalPreview = Readonly<{ post: Readonly<{
  path: "/api/v1/offline/mutations"; method: "POST";
  headers: Readonly<{ "X-Gafus-Sync-Protocol": "2"; "Idempotency-Key": string }>;
  body: VideoJournalBody;
}> }>;
const captured = new WeakMap<VideoJournalPreview, { binding: V2SessionBinding; body: string }>();
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
export const validVideoId = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
export function validVideoSnapshot(value: unknown): value is VideoProgressSnapshot {
  return record(value) && Number.isSafeInteger(value.lastPositionSec) &&
    Number(value.lastPositionSec) >= 0 && Number(value.lastPositionSec) <= 2073600 &&
    validProgressVersion(value.progressVersion);
}
function bodyFor(event: V2PendingEvent): VideoJournalBody {
  const p = event.payload;
  const base = readJournalVersionFields(p);
  if (event.kind !== "saveVideoProgress" || !validVideoId(p.videoId) ||
      !Number.isSafeInteger(p.positionSec) || Number(p.positionSec) < 0 ||
      Number(p.positionSec) > 2073600 ||
      Boolean(base.expectedVersion) === Boolean(base.previousEventId)) throw new Error("V2_VIDEO_CONTRACT_INVALID");
  return Object.freeze({ ...base, eventId: event.eventId, operation: "video.progress",
    videoId: p.videoId, positionSec: Number(p.positionSec) });
}
export function prepareVideoJournal(binding: V2SessionBinding, event: V2PendingEvent): VideoJournalPreview | null {
  if (event.kind !== "saveVideoProgress" || !binding.principalId || !binding.authEpoch) return null;
  let body: VideoJournalBody;
  try { body = bodyFor(event); } catch { return null; }
  const preview: VideoJournalPreview = Object.freeze({ post: Object.freeze({
    path: "/api/v1/offline/mutations", method: "POST",
    headers: Object.freeze({ "X-Gafus-Sync-Protocol": "2", "Idempotency-Key": body.eventId }), body,
  }) });
  captured.set(preview, { binding: { ...binding }, body: JSON.stringify(body) });
  return preview;
}
export function verifyVideoAck(preview: VideoJournalPreview, binding: V2SessionBinding,
  event: V2PendingEvent, response: unknown): VideoProgressSnapshot | null {
  const snapshot = captured.get(preview);
  if (!snapshot || snapshot.binding.principalId !== binding.principalId || snapshot.binding.authEpoch !== binding.authEpoch ||
      !record(response) || response.success !== true || !record(response.ack)) return null;
  let body: VideoJournalBody;
  try { body = bodyFor(event); } catch { return null; }
  const ack = response.ack;
  if (JSON.stringify(body) !== snapshot.body || ack.protocol !== 2 || ack.eventId !== body.eventId ||
      ack.operation !== body.operation || ack.state !== "COMMITTED" || typeof ack.replayed !== "boolean" ||
      typeof ack.serverRevision !== "string" || !/^[1-9][0-9]*$/.test(ack.serverRevision) ||
      !record(ack.result) || ack.result.videoId !== body.videoId || !validVideoSnapshot(ack.result) ||
      ack.result.lastPositionSec !== body.positionSec) return null;
  return { lastPositionSec: ack.result.lastPositionSec, progressVersion: ack.result.progressVersion };
}

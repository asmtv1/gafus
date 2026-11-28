/** Only stable native Expo Updates codes are diagnostic evidence. Never
 * transmit arbitrary error text, native log messages or asset IDs. */
const signatureCodes = new Set(["UpdateHasInvalidSignature", "UpdateCodeSigningError"]);
const MAX_LOG_AGE_MS = 300_000;
export const MANDATORY_OTA_INCOMPLETE_MS = 5 * 60_000;

type LogEntry = { code: string; timestamp: number; updateId?: string };
export function hasOtaSignatureRejection(
  entries: readonly LogEntry[], startedAt: number, endedAt: number, updateId?: string,
): boolean {
  return entries.some(entry => signatureCodes.has(entry.code) &&
    Number.isFinite(entry.timestamp) && entry.timestamp >= startedAt && entry.timestamp <= endedAt &&
    (!entry.updateId || !updateId || entry.updateId.toLowerCase() === updateId.toLowerCase()));
}

/** Read native log codes asynchronously outside the update's critical path. */
export async function detectOtaSignatureRejection(input: {
  startedAt: number; endedAt: number; updateId?: string;
  readLogs: (age: number) => Promise<readonly LogEntry[]>;
  isCurrent: () => boolean;
  report: () => void;
}): Promise<void> {
  const { startedAt, endedAt, updateId, readLogs, isCurrent, report } = input;
  if (!isCurrent()) return;
  try {
    const logs = await readLogs(Math.min(MAX_LOG_AGE_MS, Math.max(1000, Date.now() - startedAt + 1000)));
    if (isCurrent() && hasOtaSignatureRejection(logs, startedAt, endedAt, updateId)) report();
  } catch { /* diagnostic: expected Inaccessible native logs are unknown rather than a signature rejection. */
    // Older native engines and inaccessible logs are unknown, not a signature failure.
  }
}

type MandatorySignal = "MANDATORY_ATTEMPT" | "MANDATORY_INCOMPLETE";
type Storage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> };

/**
 * A marker is local to an already verified platform/revision target. A subsequent
 * check of the SAME still-required target can observe a previously interrupted
 * attempt. It never changes the mandatory policy or unlocks the UI.
 */
export function createMandatoryOtaAttemptMonitor(input: {
  key: string; target: string; storage: Storage; isCurrent: () => boolean;
  emit: (event: MandatorySignal) => void; reportIncomplete: () => void;
}) {
  const { key, target, storage, isCurrent, emit, reportIncomplete } = input;
  let active = false;
  let reported = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  function incomplete() {
    if (!active || reported || !isCurrent()) return;
    reported = true;
    emit("MANDATORY_INCOMPLETE");
    reportIncomplete();
    // Do not block a failed update or the retry button on diagnostics.
    void storage.setItem(key, "reported:" + target).catch(() => { /* diagnostic: expected Operational marker write is best effort; cannot block mandatory OTA. */ return undefined; });
  }
  return {
    async start() {
      const previous = await storage.getItem(key).catch(() => { /* diagnostic: expected Unreadable marker is unknown, not confirmed previous attempt. */ return null; });
      if (!isCurrent()) return;
      if (previous === "pending:" + target) {
        emit("MANDATORY_INCOMPLETE");
        reportIncomplete();
      }
      await storage.setItem(key, "pending:" + target).catch(() => { /* diagnostic: expected Operational marker write is best effort; cannot block mandatory OTA. */ return undefined; });
      if (!isCurrent()) return;
      active = true;
      emit("MANDATORY_ATTEMPT");
      timer = setTimeout(incomplete, MANDATORY_OTA_INCOMPLETE_MS);
    },
    incomplete,
    dispose() {
      active = false;
      if (timer !== undefined) clearTimeout(timer);
    },
  };
}

/** Clear a superseded/satisfied marker only after an authoritative policy read. */
export async function retireMandatoryOtaAttemptMarker(
  storage: Storage, key: string, isCurrent: () => boolean,
): Promise<void> {
  const previous = await storage.getItem(key).catch(() => { /* diagnostic: expected Unreadable marker is unknown, not confirmed previous attempt. */ return null; });
  if (previous && previous !== "idle" && isCurrent()) {
    await storage.setItem(key, "idle").catch(() => { /* diagnostic: expected Marker retirement is best effort; cannot prevent startup. */ return undefined; });
  }
}

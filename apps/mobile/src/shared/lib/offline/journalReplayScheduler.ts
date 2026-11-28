/** Local lifecycle only. Work may continue only while the owner/network/
 * foreground fence holds. No unbounded loops on a persistent conflict. */
export type ReplayOutcome = { pending: boolean; madeProgress: boolean; transient: boolean };
const RETRY_DELAYS = [1000, 3000, 10000, 30000, 60000] as const;

export function createJournalReplayScheduler(
  current: () => boolean,
  drain: () => Promise<ReplayOutcome>,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let requested = false;
  let disposed = false;
  let failures = 0;
  const allowed = () => !disposed && current();
  const schedule = (delay: number) => {
    if (!allowed()) return;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => { timer = undefined; void run(); }, delay);
  };
  async function run() {
    if (!allowed()) return;
    if (running) { requested = true; return; }
    running = true;
    requested = false;
    let result: ReplayOutcome;
    try {
      result = await drain();
    } catch { /* diagnostic: expected Replay failure is pending/transient and retried with scheduler backoff. */
      result = { pending: true, madeProgress: false, transient: true };
    } finally {
      running = false;
    }
    if (!allowed()) return;
    if (requested || (result.pending && result.madeProgress)) {
      failures = 0;
      schedule(1000);
    } else if (result.pending && result.transient && failures < RETRY_DELAYS.length) {
      schedule(RETRY_DELAYS[failures++]);
    } else if (!result.pending) {
      failures = 0;
    }
  }
  return {
    trigger() {
      if (!allowed()) return;
      failures = 0;
      if (running) requested = true;
      else schedule(1000);
    },
    dispose() {
      disposed = true;
      if (timer !== undefined) clearTimeout(timer);
    },
  };
}

export function isTransientJournalResult(value: { success: boolean; code?: string }): boolean {
  if (value.success) return false;
  return ["NETWORK_ERROR", "REQUEST_TIMEOUT", "AUTH_REFRESH_UNAVAILABLE", "JOURNAL_UNAVAILABLE",
    "INTERNAL_ERROR", "SERVER_ERROR", "HTTP_500", "HTTP_502", "HTTP_503", "HTTP_504"].includes(value.code ?? "");
}

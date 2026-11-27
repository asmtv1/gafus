/** Bounded operator read model. No job data, result, stack or raw failure
 * text is returned. Redis outages are unavailable, never an empty queue. */
export const pendingStates = ["wait", "paused", "prioritized", "delayed", "waiting-children", "active"] as const;
export const countStates = [...pendingStates, "completed", "failed"] as const;
type State = typeof countStates[number];
const sampleLimit = 25;
export type DiagnosticJob = {
  id?: string; timestamp: number; attemptsMade: number;
  finishedOn?: number; failedReason?: string; opts: { attempts?: number };
  getState(): Promise<string>; retry(state: "failed"): Promise<void>;
};
export interface DiagnosticQueue {
  name: string;
  getJobCounts(...states: State[]): Promise<Record<string, number>>;
  getJobs(states: State[], start: number, end: number, asc: boolean): Promise<(DiagnosticJob | undefined)[]>;
  getJob(id: string): Promise<DiagnosticJob | undefined>;
  isPaused(): Promise<boolean>;
}
export const replayableQueues = new Set(["consent-log-cleanup"]);
const safeId = /^[A-Za-z0-9_.:-]{1,180}$/;
const finiteAge = (timestamp: number, now: number) =>
  Number.isFinite(timestamp) && timestamp > 0 && timestamp <= now
    ? Math.floor((now - timestamp) / 1000) : null;

export function failureCategory(reason?: string) {
  if (!reason) return "unknown";
  // These are only categories, not the provider's exact text. Error strings
  // may contain identifiers, credentials, signed URLs, or user content.
  if (/stalled|lock mismatch|missing lock/i.test(reason)) return "stalled_or_lock";
  if (/timeout|timed out|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN/i.test(reason)) return "network_or_timeout";
  if (/rate limit|too many requests|\b429\b/i.test(reason)) return "rate_limit";
  if (/unauthori[sz]ed|forbidden|\b(?:401|403)\b/i.test(reason)) return "authorization";
  if (/invalid|validation|malformed/i.test(reason)) return "validation";
  return "other_review_logs";
}
function jobView(job: DiagnosticJob, now: number) {
  return {
    id: typeof job.id === "string" && safeId.test(job.id) ? job.id : null,
    ageSeconds: finiteAge(job.timestamp, now),
    attemptsMade: Number.isSafeInteger(job.attemptsMade) ? job.attemptsMade : null,
    maxAttempts: Number.isSafeInteger(job.opts.attempts) ? job.opts.attempts! : 1,
    finishedOn: Number.isSafeInteger(job.finishedOn) ? job.finishedOn! : null,
    reason: failureCategory(job.failedReason),
  };
}
export type QueueSnapshot = Awaited<ReturnType<typeof readQueueSnapshot>>;
export async function readQueueSnapshot(queue: DiagnosticQueue, now = Date.now()) {
  // "waiting" in BullMQ includes paused; use the raw "wait" state, not both.
  const [counts, paused, ...samples] = await Promise.all([
    queue.getJobCounts(...countStates), queue.isPaused(),
    ...pendingStates.map(state => queue.getJobs([state], 0, sampleLimit - 1, true)),
    queue.getJobs(["failed"], 0, sampleLimit - 1, false),
  ]);
  const typedCounts = Object.fromEntries(countStates.map(state => {
    const count = counts[state];
    if (!Number.isSafeInteger(count) || count < 0) throw Error("QUEUE_INVALID_COUNTS");
    return [state, count];
  }));
  let oldestAgeSeconds: number | null = null;
  let sampleComplete = true;
  let sampledRetries = 0;
  for (let i = 0; i < pendingStates.length; i++) {
    const jobs = samples[i].filter((job): job is DiagnosticJob => !!job);
    // Counts and samples are not an atomic Redis snapshot. A mismatch or
    // truncated sample is an explicitly labelled lower bound, never exact.
    if (jobs.length !== typedCounts[pendingStates[i]]) sampleComplete = false;
    for (const job of jobs) {
      const age = finiteAge(job.timestamp, now);
      if (age === null) sampleComplete = false;
      else oldestAgeSeconds = Math.max(oldestAgeSeconds ?? age, age);
      if (job.attemptsMade > 0) sampledRetries++;
    }
  }
  return {
    name: queue.name, counts: typedCounts, paused, oldestAgeSeconds,
    sampleComplete, sampledRetries,
    failed: samples[pendingStates.length].filter((job): job is DiagnosticJob => !!job).map(job => jobView(job, now)),
    observedAt: now,
  };
}

/** Deduplicate stuck reads per queue. The outer timeout doesn't cancel a
 * Redis command; never launch a new command on each HTTP request while
 * the old command is still queued in ioredis. */
const snapshotsInFlight = new Map<DiagnosticQueue, Promise<QueueSnapshot>>();
export async function deadline<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(Error("QUEUE_DEADLINE")), timeoutMs);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}
export async function boundedSnapshot(queue: DiagnosticQueue, redisReady: () => boolean, timeoutMs = 4000) {
  if (!redisReady()) return { name: queue.name, available: false as const };
  let pending = snapshotsInFlight.get(queue);
  if (!pending) {
    pending = readQueueSnapshot(queue).finally(() => snapshotsInFlight.delete(queue));
    snapshotsInFlight.set(queue, pending);
  }
  try { return { available: true as const, ...await deadline(pending, timeoutMs) }; }
  catch { return { name: queue.name, available: false as const }; }
}

export type ReplayRequest = { queue: string; id: string; attemptsMade: number; finishedOn: number; confirmation: string };
export function parseReplayRequest(value: unknown): ReplayRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (Object.keys(input).sort().join(",") !== "attemptsMade,confirmation,finishedOn,id,queue" ||
      typeof input.queue !== "string" || typeof input.id !== "string" || !safeId.test(input.id) ||
      input.confirmation !== "REPLAY_FAILED_JOB" ||
      typeof input.attemptsMade !== "string" || !/^\d{1,8}$/.test(input.attemptsMade) ||
      typeof input.finishedOn !== "string" || !/^\d{1,16}$/.test(input.finishedOn)) return null;
  const finishedOn = Number(input.finishedOn);
  if (!Number.isSafeInteger(finishedOn) || finishedOn <= 0) return null;
  return { queue: input.queue, id: input.id, attemptsMade: Number(input.attemptsMade),
    finishedOn, confirmation: input.confirmation };
}
export type ReplayResult = "QUEUED" | "STALE_JOB" | "RECONCILIATION_REQUIRED" | "UNAVAILABLE" | "UNKNOWN_ACK" | "IN_PROGRESS";
const replaysInFlight = new Set<string>();
export async function replayFailedJob(queue: DiagnosticQueue, input: ReplayRequest, redisReady: () => boolean): Promise<ReplayResult> {
  // Only an idempotent DB cleanup is approved. Never blindly replay a
  // payment, notification, mail or external media side effect.
  if (!replayableQueues.has(queue.name) || input.queue !== queue.name || input.confirmation !== "REPLAY_FAILED_JOB") return "RECONCILIATION_REQUIRED";
  if (!redisReady()) return "UNAVAILABLE";
  const key = JSON.stringify([queue.name, input.id]);
  if (replaysInFlight.has(key)) return "IN_PROGRESS";
  replaysInFlight.add(key);
  const cutoff = Date.now() + 5000;
  const pending = (async (): Promise<ReplayResult> => {
    let job: DiagnosticJob | undefined;
    try {
      job = await queue.getJob(input.id);
      if (!job || await job.getState() !== "failed" ||
          job.attemptsMade !== input.attemptsMade || job.finishedOn !== input.finishedOn) return "STALE_JOB";
    } catch { return "UNAVAILABLE"; }
    // BullMQ retry checks failed state atomically. QUEUED is the enqueue
    // acknowledgement, NOT a claim that the worker/business effect succeeded.
    if (Date.now() >= cutoff || !redisReady()) return "UNAVAILABLE";
    try { await job.retry("failed"); return "QUEUED"; }
    catch { return "UNKNOWN_ACK"; }
  })().finally(() => replaysInFlight.delete(key));
  try { return await deadline(pending, 5000); }
  catch { return "UNKNOWN_ACK"; }
}
type Row = Awaited<ReturnType<typeof boundedSnapshot>>;
function escape(value: unknown) {
  return String(value ?? "—").replace(/[&<>"']/g, x => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[x]!));
}
const labels: Record<ReplayResult, string> = {
  QUEUED: "Задание возвращено в очередь. Выполнение ещё не подтверждено.",
  STALE_JOB: "Состояние задания изменилось. Обновите список.",
  RECONCILIATION_REQUIRED: "Сначала требуется сверка внешнего эффекта с владельцем очереди.",
  UNAVAILABLE: "Redis недоступен. Операция не выполнена.",
  UNKNOWN_ACK: "Подтверждение не получено. Не повторяйте вслепую; обновите состояние задания.",
  IN_PROGRESS: "Повтор уже обрабатывается. Обновите состояние задания.",
};
export function renderOperations(rows: Row[], result?: ReplayResult, basePath = "/api/v1/admin/queues") {
  const fmt = (value: unknown) => escape(value);
  const html = rows.map(row => {
    if (!row.available) return '<section><h2>'+fmt(row.name)+'</h2><p>Недоступно — состояние неизвестно</p></section>';
    const counts = countStates.map(state => fmt(state)+": "+fmt(row.counts[state])).join(" · ");
    const failed = row.failed.map(job => {
      const replay = replayableQueues.has(row.name) && job.id && job.attemptsMade !== null && job.finishedOn !== null
        ? '<form method="post" action="'+basePath+'/operations/replay">'+
          Object.entries({queue:row.name,id:job.id,attemptsMade:job.attemptsMade,finishedOn:job.finishedOn,confirmation:"REPLAY_FAILED_JOB"})
            .map(([key,val])=>'<input type="hidden" name="'+key+'" value="'+fmt(val)+'">').join("")+
          '<button type="submit">Подтвердить повтор</button></form>'
        : "Требуется сверка / недоступно";
      return '<tr><td>'+fmt(job.id)+'</td><td>'+fmt(job.ageSeconds)+'</td><td>'+fmt(job.attemptsMade)+' / '+fmt(job.maxAttempts)+'</td><td>'+fmt(job.reason)+'</td><td>'+replay+'</td></tr>';
    }).join("");
    return '<section><h2>'+fmt(row.name)+(row.paused?" (пауза)":"")+'</h2><p>'+counts+'</p>'+
      '<p>Возраст старейшего незавершённого задания, сек.: '+fmt(row.oldestAgeSeconds)+
      (row.sampleComplete?" (выборка покрыла наблюдаемые задачи)":" (нижняя оценка по ограниченной выборке)")+
      ' · Задач с повторами в выборке: '+fmt(row.sampledRetries)+'</p>'+
      (failed?'<table><thead><tr><th>Job ID</th><th>Возраст, сек.</th><th>Попытки</th><th>Категория отказа</th><th>Replay</th></tr></thead><tbody>'+failed+'</tbody></table>':'<p>Нет наблюдаемых failed jobs</p>')+'</section>';
  }).join("");
  return '<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GAFUS — диагностика очередей</title></head><body>'+
    '<h1>Диагностика очередей GAFUS</h1><p><a href="'+basePath+'/operations">Обновить</a> · <a href="'+basePath+'/">Bull Board (только чтение)</a></p>'+
    '<p>Возраст — с момента создания, не время ожидания. До 25 задач на состояние; наблюдение не является атомарным.</p>'+
    (result?'<p role="status">'+fmt(labels[result])+'</p>':'')+html+'</body></html>';
}

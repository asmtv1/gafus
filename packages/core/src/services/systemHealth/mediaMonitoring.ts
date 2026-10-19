import { prisma } from "@gafus/prisma";
import { connection } from "@gafus/queues";

export const MEDIA_KINDS = ["gallery", "feed-photo", "feed-video", "questions"] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];
export type MediaDispatchOutcome = "ok" | "499" | "429" | "5xx" | "timeout" | "other";
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const STUCK = 10 * 60_000;
const prefix = "gafus:media:monitor:v1:";
export const MEDIA_MONITOR_HEARTBEAT_KEY = "gafus:media:monitor:v1:heartbeat";

const outcomeOf = (status: number | undefined, transport?: "timeout" | "other"): MediaDispatchOutcome =>
  status === undefined ? transport === "timeout" ? "timeout" : "other"
    : status >= 200 && status < 300 ? "ok"
      : status === 499 ? "499" : status === 429 ? "429"
        : status >= 500 ? "5xx" : "other";

export const kindForCloudruJob = (name: string): MediaKind | null =>
  name === "gafus-gallery-process" ? "gallery"
    : name === "gafus-questions-photo" ? "questions"
      : /^gafus-feed-photo(?:-2)?$/.test(name) ? "feed-photo"
        : /^gafus-feed-video(?:-2)?$/.test(name) ? "feed-video" : null;

/** Low-cardinality metrics only. No file paths, user IDs, credentials or provider response bodies.
 * Redis telemetry is best effort and cannot affect processing or publication.
 */
export async function recordMediaDispatch(
  job: string,
  status: number | undefined,
  elapsedMs: number,
  transport?: "timeout" | "other",
  at = new Date(),
): Promise<void> {
  const kind = kindForCloudruJob(job);
  if (!kind) return;
  const hour = new Date(Math.floor(at.getTime() / HOUR) * HOUR).toISOString().slice(0, 13);
  const key = prefix + hour;
  const outcome = outcomeOf(status, transport);
  const ms = Math.max(0, Math.min(120_000, Math.round(elapsedMs) || 0));
  const multi = connection.multi();
  multi.hincrby(`${key}`, `${kind}:${outcome}`, 1);
  multi.hincrby(`${key}`, `${kind}:launchMsSum`, ms);
  multi.hincrby(`${key}`, `${kind}:launchCount`, 1);
  multi.expire(key, 26 * 3600);
  await multi.exec();
}

export async function recordMediaEmptyClaim(kind: MediaKind, at = new Date()): Promise<void> {
  const hour = new Date(Math.floor(at.getTime() / HOUR) * HOUR).toISOString().slice(0, 13);
  const key = prefix + hour;
  await connection.multi().hincrby(key, `${kind}:empty`, 1).expire(key, 26 * 3600).exec();
}

export interface MediaQueueRow {
  kind: MediaKind;
  pending: number;
  processing: number;
  stuck: number;
  failed: number;
  retries24h: number;
  completed24h: number;
  averageEndToEndMs: number | null;
  maxEndToEndMs: number | null;
  oldestPendingMinutes: number | null;
  launches24h: number | null;
  launchAverageMs: number | null;
  errors: Record<MediaDispatchOutcome, number> | null;
  emptyRuns24h: number | null;
}
const emptyErrors = (): Record<MediaDispatchOutcome, number> =>
  ({ ok: 0, "499": 0, "429": 0, "5xx": 0, timeout: 0, other: 0 });
const count = (entries: Record<string, number>, name: string): number => entries[name] ?? 0;

async function boundedTelemetry<T>(job: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      job,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("MEDIA_TELEMETRY_TIMEOUT")), 1500);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function readDispatch24h(now: Date): Promise<Record<string, number> | null> {
  const end = Math.floor(now.getTime() / HOUR) * HOUR;
  const hours = Array.from({ length: 24 }, (_, i) =>
    prefix + new Date(end - i * HOUR).toISOString().slice(0, 13));
  try {
    const values = await boundedTelemetry(connection.pipeline(
      hours.map(key => ["hgetall", key] as [string, string]),
    ).exec());
    if (!values) return null;
    const counters: Record<string, number> = {};
    for (const [error, result] of values) {
      if (error) return null;
      for (const [k, value] of Object.entries((result ?? {}) as Record<string, string>))
        counters[k] = (counters[k] ?? 0) + (Number(value) || 0);
    }
    return counters;
  } catch { return null; }
}
const finishedTimes = (rows: { createdAt: Date; updatedAt: Date }[]) => {
  if (!rows.length) return { avg: null as number | null, max: null as number | null };
  const times = rows.map(row => Math.max(0, row.updatedAt.getTime() - row.createdAt.getTime()));
  return {
    avg: Math.round(times.reduce((sum, ms) => sum + ms, 0) / times.length),
    max: Math.max(...times),
  };
};
/** Read-only dashboard. Processing time is labelled END-TO-END, from durable
 * job creation to completion; it includes queue delays and retries.
 */
export async function getAdminMediaDashboard(now = new Date()) {
  const recent = new Date(now.getTime() - DAY);
  const stale = new Date(now.getTime() - STUCK);
  const kinds = MEDIA_KINDS;
  const jobsWhere = (kind: MediaKind) =>
    kind === "feed-video" ? { kind: "publish_video" as const }
      : kind === "feed-photo" ? { kind: { in: [
        "copy_album", "publish_photo", "delete_keys", "cleanup_source",
      ] as ("copy_album" | "publish_photo" | "delete_keys" | "cleanup_source")[] } } : {};
  const [dispatch, heartbeat, gallery, feed, question] = await Promise.all([
    readDispatch24h(now),
    boundedTelemetry(connection.get(MEDIA_MONITOR_HEARTBEAT_KEY)).catch(() => null),
    Promise.all([
      prisma.galleryUpload.count({ where: { status: "uploaded" } }),
      prisma.galleryUpload.count({ where: { status: "processing" } }),
      prisma.galleryUpload.count({ where: { status: "failed" } }),
      prisma.galleryUpload.count({ where: {
        OR: [
          { status: "uploaded", updatedAt: { lt: stale } },
          { status: "processing", leaseUntil: { lt: now } },
        ],
      } }),
      prisma.galleryUpload.count({ where: { attempts: { gt: 1 }, updatedAt: { gte: recent } } }),
      prisma.galleryUpload.findMany({ where: { status: "ready", updatedAt: { gte: recent } },
        select: { createdAt: true, updatedAt: true }, orderBy: { updatedAt: "desc" }, take: 250 }),
      prisma.galleryUpload.findFirst({ where: { status: "uploaded" }, orderBy: { createdAt: "asc" },
        select: { createdAt: true } }),
      prisma.galleryStorageJob.count({ where: { status: "pending", availableAt: { lte: now } } }),
      prisma.galleryStorageJob.count({ where: { status: "processing" } }),
      prisma.galleryStorageJob.count({ where: { status: "processing", leaseUntil: { lt: now } } }),
      prisma.galleryStorageJob.count({ where: {
        status: "pending", availableAt: { lt: stale },
      } }),
      prisma.galleryStorageJob.findFirst({
        where: { status: "pending" }, orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      }),
    ]),
    Promise.all((["feed-photo", "feed-video"] as const).map(async kind => {
      const filter = jobsWhere(kind);
      return Promise.all([
        prisma.feedStorageJob.count({ where: { ...filter, status: "pending" } }),
        prisma.feedStorageJob.count({ where: { ...filter, status: "processing" } }),
        prisma.feedStorageJob.count({ where: { ...filter, status: "failed" } }),
        prisma.feedStorageJob.count({ where: { ...filter, OR: [
          { status: "pending", availableAt: { lt: stale } },
          { status: "processing", leaseUntil: { lt: now } },
        ] } }),
        prisma.feedStorageJob.count({ where: { ...filter, attempts: { gt: 1 }, updatedAt: { gte: recent } } }),
        prisma.feedStorageJob.findMany({ where: { ...filter, status: "completed", updatedAt: { gte: recent } },
          select: { createdAt: true, updatedAt: true }, orderBy: { updatedAt: "desc" }, take: 250 }),
        prisma.feedStorageJob.findFirst({ where: { ...filter, status: "pending" },
          orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
      ]) as Promise<[number, number, number, number, number,
        { createdAt: Date; updatedAt: Date }[], { createdAt: Date } | null]>;
    })),
    prisma.questionPhoto.count({ where: { url: "",
      storagePath: { startsWith: "cloudru:questions-pending:" } } }),
  ] as const);
  const decorate = (kind: MediaKind, state: {
    pending: number; processing: number; stuck: number; failed: number;
    retries: number; completed: {createdAt: Date; updatedAt: Date}[];
    oldest: Date | null;
  }): MediaQueueRow => {
    const timings = finishedTimes(state.completed);
    const starts = dispatch === null ? null : count(dispatch, `${kind}:launchCount`);
    return {
      kind,
      pending: state.pending, processing: state.processing,
      stuck: state.stuck, failed: state.failed, retries24h: state.retries,
      completed24h: state.completed.length,
      averageEndToEndMs: timings.avg, maxEndToEndMs: timings.max,
      oldestPendingMinutes: state.oldest ? Math.floor((now.getTime() - state.oldest.getTime()) / 60000) : null,
      launches24h: starts,
      launchAverageMs: starts ? Math.round(count(dispatch!, `${kind}:launchMsSum`) / starts) : null,
      errors: dispatch === null ? null : (Object.fromEntries(
        Object.keys(emptyErrors()).map(name =>
          [name, count(dispatch, `${kind}:${name}`)]),
      ) as Record<MediaDispatchOutcome, number>),
      // Core reports zero-claim events for Feed. Gallery/Questions do not
      // currently report them: unknown must never be presented as zero.
      emptyRuns24h: dispatch === null || kind === "gallery" || kind === "questions"
        ? null : count(dispatch, `${kind}:empty`),
    };
  };
  const rows: MediaQueueRow[] = [
    decorate("gallery", {
      pending: gallery[0] + gallery[7], processing: gallery[1] + gallery[8],
      failed: gallery[2], stuck: gallery[3] + gallery[9] + gallery[10],
      retries: gallery[4], completed: gallery[5],
      oldest: [gallery[6]?.createdAt, gallery[11]?.createdAt]
        .filter((time): time is Date => Boolean(time))
        .sort((a, b) => a.getTime() - b.getTime())[0] ?? null,
    }),
    ...feed.map((f, i) => decorate(kinds[i + 1]!, {
      pending: f[0], processing: f[1], failed: f[2], stuck: f[3],
      retries: f[4], completed: f[5], oldest: f[6]?.createdAt ?? null,
    })),
    decorate("questions", {
      pending: question, processing: 0, failed: 0, stuck: 0, retries: 0,
      completed: [], oldest: null,
    }),
  ];
  const issues = rows.filter(row => row.stuck > 0 ||
    (row.pending > 0 && (row.oldestPendingMinutes ?? 0) >= 10) ||
    ((row.errors?.["499"] ?? 0) + (row.errors?.["5xx"] ?? 0) +
      (row.errors?.timeout ?? 0) >= 5 &&
      row.pending > 0 && (row.oldestPendingMinutes ?? 0) >= 5));
  const heartbeatTime = heartbeat ? Number(heartbeat) : NaN;
  const workerMonitorState = !Number.isFinite(heartbeatTime) ? "unknown" :
    now.getTime() - heartbeatTime > 12 * 60_000 ? "stale" : "alive";
  return {
    updatedAt: now.toISOString(),
    telemetryAvailable: dispatch !== null,
    workerMonitorState,
    rows,
    attention: issues.map(row => row.kind),
  };
}

/** Worker-internal, read-only Prometheus metrics. Only fixed label values,
 * no object IDs, tokens, signed links or upload paths.
 */
export async function renderMediaMetricsPrometheus(): Promise<string> {
  const data = await getAdminMediaDashboard();
  const values = [
    ["pending", "Media objects waiting for processing"],
    ["processing", "Media processing leases in progress"],
    ["stuck", "Media jobs stalled beyond recovery deadline"],
    ["failed", "Failed media jobs"],
    ["retries24h", "Jobs which required multiple attempts (last 24h)"],
    ["completed24h", "Sample of completed jobs in last 24h (max 250)"],
  ] as const;
  const lines = [
    "# HELP gafus_media_worker_monitor_alive Worker media monitor has a fresh heartbeat",
    "# TYPE gafus_media_worker_monitor_alive gauge",
    `gafus_media_worker_monitor_alive ${data.workerMonitorState === "alive" ? 1 : 0}`,
  ];
  for (const [field, description] of values) {
    lines.push(`# HELP gafus_media_${field} ${description}`);
    lines.push(`# TYPE gafus_media_${field} gauge`);
    for (const row of data.rows)
      lines.push(`gafus_media_${field}{kind="${row.kind}"} ${row[field]}`);
  }
  lines.push("# HELP gafus_media_attention Processing queues requiring operator attention");
  lines.push("# TYPE gafus_media_attention gauge");
  for (const row of data.rows)
    lines.push(`gafus_media_attention{kind="${row.kind}"} ${data.attention.includes(row.kind) ? 1 : 0}`);
  for (const code of ["499", "429", "5xx", "timeout"] as const) {
    lines.push(`# HELP gafus_media_cloudru_errors_${code === "5xx" ? "5xx" : code} Cloud.ru dispatch failures by kind`);
    lines.push(`# TYPE gafus_media_cloudru_errors_${code === "5xx" ? "5xx" : code} gauge`);
    for (const row of data.rows) {
      if (row.errors)
        lines.push(`gafus_media_cloudru_errors_${code}{kind="${row.kind}"} ${row.errors[code]}`);
    }
  }
  return lines.join("\n") + "\n";
}

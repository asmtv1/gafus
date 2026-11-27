import { prisma, type Prisma } from "@gafus/prisma";

export interface CompletedDogWalkInput {
  clientId: string;
  startedAt: string;
  finishedAt: string;
  durationSeconds: number;
  steps: number;
  estimatedMeters: number;
  timerMode: "stopwatch" | "countdown";
  incompleteSteps: boolean;
  gpsEnabled?: boolean;
  gpsMeters?: number | null;
}

/** Any existing authenticated account can access its own walks; owner ID comes from the JWT. */
export async function assertWalkHistoryAccess(ownerId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: ownerId }, select: { id: true },
  });
  if (!user) {
    throw new Error("WALKS_FORBIDDEN");
  }
}

function toDto(record: {
  clientId: string; startedAt: Date; finishedAt: Date;
  durationSeconds: number; steps: number; estimatedMeters: number;
  timerMode: string; incompleteSteps: boolean; gpsEnabled: boolean; gpsMeters: number | null;
}) {
  return {
    clientId: record.clientId,
    startedAt: record.startedAt.toISOString(),
    finishedAt: record.finishedAt.toISOString(),
    durationSeconds: record.durationSeconds,
    steps: record.steps,
    estimatedMeters: record.estimatedMeters,
    timerMode: record.timerMode === "countdown" ? "countdown" as const : "stopwatch" as const,
    incompleteSteps: record.incompleteSteps,
    gpsEnabled: record.gpsEnabled,
    gpsMeters: record.gpsMeters,
  };
}

/** Server data is merged into the phone by clientId; the phone wins collisions. */
export async function listCompletedDogWalks(ownerId: string) {
  await assertWalkHistoryAccess(ownerId);
  return readWalkHistory(prisma, ownerId);
}

type WalkRow = Parameters<typeof toDto>[0];
async function readWalkHistory(db: Pick<typeof prisma, "$queryRaw">, ownerId: string) {
  const rows = await db.$queryRaw<WalkRow[]>`
    SELECT w."clientId", w."startedAt", w."finishedAt", w."durationSeconds", w.steps,
           w."estimatedMeters", w."timerMode", w."incompleteSteps", w."gpsEnabled", w."gpsMeters"
    FROM "DogWalkRecord" w
    WHERE w."userId" = ${ownerId} AND NOT EXISTS (
      SELECT 1 FROM "DogWalkTombstone" d WHERE d."userId" = w."userId" AND d."clientId" = w."clientId"
    ) ORDER BY w."startedAt" DESC, w."clientId" DESC LIMIT 2000`;
  return rows.map(toDto);
}

async function walkTransaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try { return await prisma.$transaction(work, { isolationLevel: "Serializable" }); }
    catch (error) {
      const dbError = error as { code?: string; meta?: { code?: string } };
      if (attempt >= 3 || !(dbError.code === "P2034" ||
          (dbError.code === "P2010" && ["40001", "40P01"].includes(dbError.meta?.code ?? "")))) throw error;
      await new Promise(resolve => setTimeout(resolve, 10 * attempt + Math.random() * 15));
    }
  }
}

export async function writeCompletedDogWalks(ownerId: string, walks: CompletedDogWalkInput[]) {
  await assertWalkHistoryAccess(ownerId);
  if (walks.length > 100) throw new Error("WALK_BATCH_TOO_LARGE");
  if (!walks.length) return;
  await walkTransaction(async tx => {
    // Also used by deletes. The serializable snapshot protects against older
    // writers that have not yet adopted the advisory lock.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('gafus/walk/' || ${ownerId}::text, 0))`;
    await tx.$executeRaw`
      INSERT INTO "DogWalkRecord" AS w
        (id, "userId", "clientId", "startedAt", "finishedAt", "durationSeconds", steps,
         "estimatedMeters", "timerMode", "incompleteSteps", "gpsEnabled", "gpsMeters", "updatedAt")
      SELECT gen_random_uuid()::text, ${ownerId}, x."clientId", x."startedAt" AT TIME ZONE 'UTC',
        x."finishedAt" AT TIME ZONE 'UTC', x."durationSeconds", x.steps, x."estimatedMeters",
        x."timerMode", x."incompleteSteps", COALESCE(x."gpsEnabled", false), x."gpsMeters", CURRENT_TIMESTAMP
      FROM jsonb_to_recordset(${JSON.stringify(walks)}::jsonb) AS x("clientId" text, "startedAt" timestamptz,
        "finishedAt" timestamptz, "durationSeconds" int, steps int, "estimatedMeters" int,
        "timerMode" text, "incompleteSteps" boolean, "gpsEnabled" boolean, "gpsMeters" int)
      WHERE NOT EXISTS (SELECT 1 FROM "DogWalkTombstone" d WHERE d."userId" = ${ownerId} AND d."clientId" = x."clientId")
      ORDER BY x."clientId"
      ON CONFLICT ("userId", "clientId") DO UPDATE SET
        ("startedAt","finishedAt","durationSeconds",steps,"estimatedMeters","timerMode","incompleteSteps","gpsEnabled","gpsMeters","updatedAt") =
        (EXCLUDED."startedAt",EXCLUDED."finishedAt",EXCLUDED."durationSeconds",EXCLUDED.steps,EXCLUDED."estimatedMeters",
         EXCLUDED."timerMode",EXCLUDED."incompleteSteps",EXCLUDED."gpsEnabled",EXCLUDED."gpsMeters",EXCLUDED."updatedAt")
      WHERE (w."startedAt",w."finishedAt",w."durationSeconds",w.steps,w."estimatedMeters",w."timerMode",w."incompleteSteps",w."gpsEnabled",w."gpsMeters")
        IS DISTINCT FROM (EXCLUDED."startedAt",EXCLUDED."finishedAt",EXCLUDED."durationSeconds",EXCLUDED.steps,EXCLUDED."estimatedMeters",
         EXCLUDED."timerMode",EXCLUDED."incompleteSteps",EXCLUDED."gpsEnabled",EXCLUDED."gpsMeters")`;
  });
}

export async function syncCompletedDogWalks(ownerId: string, walks: CompletedDogWalkInput[]) {
  await writeCompletedDogWalks(ownerId, walks);
  return readWalkHistory(prisma, ownerId);
}

/** Snapshot and cursor share one PG snapshot, including when this is the first sync after OTA. */
export async function readDogWalkChanges(ownerId: string, after?: bigint) {
  await assertWalkHistoryAccess(ownerId);
  return prisma.$transaction(async tx => {
    const head = await tx.dogWalkChange.findFirst({
      where: { userId: ownerId }, orderBy: { version: "desc" }, select: { version: true },
    });
    const version = head?.version ?? 0n;
    if (after === undefined || after > version) {
      const walks = await readWalkHistory(tx, ownerId);
      const markers = await tx.dogWalkTombstone.findMany({ where: { userId: ownerId }, select: { clientId: true } });
      return { reset: true, walks, deleted: markers.map(row => row.clientId), cursor: version.toString(), more: false };
    }
    const changes = await tx.dogWalkChange.findMany({
      where: { userId: ownerId, version: { gt: after } }, orderBy: { version: "asc" }, take: 101,
      select: { version: true, clientId: true },
    });
    const page = changes.slice(0, 100);
    const ids = page.map(row => row.clientId);
    const rows = ids.length ? await tx.dogWalkRecord.findMany({ where: { userId: ownerId, clientId: { in: ids } } }) : [];
    const markers = ids.length ? await tx.dogWalkTombstone.findMany({
      where: { userId: ownerId, clientId: { in: ids } }, select: { clientId: true },
    }) : [];
    const deleted = new Set(markers.map(row => row.clientId));
    return { reset: false, walks: rows.filter(row => !deleted.has(row.clientId)).map(toDto), deleted: [...deleted],
      cursor: (page.at(-1)?.version ?? after).toString(), more: changes.length > page.length };
  }, { isolationLevel: "RepeatableRead" });
}

export interface DogWalkTrackInput {
  seq: number;
  segment: number;
  latitude: number;
  longitude: number;
  timestamp: string;
  accuracy: number | null;
  speed: number | null;
  accepted: boolean;
  reason: string;
  deltaMeters: number;
}

/** Idempotent append-only route; the parent walk must belong to the JWT principal. */
export async function syncDogWalkTrackPoints(ownerId: string, clientId: string, points: DogWalkTrackInput[]) {
  await assertWalkHistoryAccess(ownerId);
  const parent = await prisma.dogWalkRecord.findUnique({
    where: { userId_clientId: { userId: ownerId, clientId } }, select: { id: true },
  });
  if (!parent) throw new Error('WALK_NOT_FOUND');
  if (points.length) {
    await prisma.dogWalkTrackPoint.createMany({
      data: points.map(point => ({
        userId: ownerId, walkClientId: clientId, seq: point.seq, segment: point.segment,
        latitude: point.latitude, longitude: point.longitude, timestamp: new Date(point.timestamp),
        accuracy: point.accuracy, speed: point.speed, accepted: point.accepted,
        reason: point.reason, deltaMeters: point.deltaMeters,
      })),
      skipDuplicates: true,
    });
  }
  return { accepted: points.length };
}

export async function listDogWalkTrackPoints(ownerId: string, clientId: string, afterSeq=0) {
  await assertWalkHistoryAccess(ownerId);
  const parent = await prisma.dogWalkRecord.findUnique({
    where: { userId_clientId: { userId: ownerId, clientId } }, select: { id: true },
  });
  if (!parent) throw new Error('WALK_NOT_FOUND');
  const rows = await prisma.dogWalkTrackPoint.findMany({
    where: {userId:ownerId,walkClientId:clientId,seq:{gt:afterSeq}},
    orderBy: {seq:'asc'},take:200,
  });
  return rows.map(row => ({
    seq:row.seq,segment:row.segment,latitude:row.latitude,longitude:row.longitude,
    timestamp:row.timestamp.toISOString(),accuracy:row.accuracy,speed:row.speed,
    accepted:row.accepted,reason:row.reason,deltaMeters:row.deltaMeters,
  }));
}

/** Server remains authoritative for deletions, even if another device has stale local history. */
export async function listDeletedDogWalkIds(ownerId:string):Promise<string[]> {
  await assertWalkHistoryAccess(ownerId);
  const rows=await prisma.dogWalkTombstone.findMany({where:{userId:ownerId},select:{clientId:true}});
  return rows.map(row=>row.clientId);
}
export async function deleteDogWalk(ownerId:string,clientId:string):Promise<void> {
  await assertWalkHistoryAccess(ownerId);
  await walkTransaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('gafus/walk/' || ${ownerId}::text, 0))`;
    await tx.dogWalkTombstone.upsert({
      where: { userId_clientId: { userId: ownerId, clientId } },
      create: { userId: ownerId, clientId }, update: {},
    });
    await tx.dogWalkRecord.deleteMany({ where: { userId: ownerId, clientId } });
  });
}

export type WalkGpsSnapshot = {
  eligible: number;
  noPoints: number;
  insufficientFix: number;
};

/**
 * One-hour cohort of GPS-enabled walks first synced 10–70 minutes ago.
 * Grace allows track chunks to arrive after the metadata. Not a device-loss
 * rate: unsynced walks are excluded and late uploads can correct the gauges.
 */
export async function readWalkGpsOperationalMetrics(): Promise<WalkGpsSnapshot> {
  const [row] = await prisma.$queryRaw<WalkGpsSnapshot[]>`
    WITH cohort AS (
      SELECT "userId", "clientId", "gpsMeters"
      FROM "DogWalkRecord"
      WHERE "gpsEnabled" = true AND "durationSeconds" >= 120
        AND "createdAt" > timezone('UTC', now()) - interval '70 minutes'
        AND "createdAt" <= timezone('UTC', now()) - interval '10 minutes'
    ), classified AS (
      SELECT "gpsMeters", EXISTS (
        SELECT 1 FROM "DogWalkTrackPoint" p
        WHERE p."userId" = cohort."userId" AND p."walkClientId" = cohort."clientId"
      ) AS has_points
      FROM cohort
    )
    SELECT count(*)::int AS eligible,
      count(*) FILTER (WHERE NOT has_points)::int AS "noPoints",
      count(*) FILTER (WHERE has_points AND "gpsMeters" IS NULL)::int AS "insufficientFix"
    FROM classified
  `;
  return row ?? { eligible: 0, noPoints: 0, insufficientFix: 0 };
}

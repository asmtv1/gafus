import { prisma } from "@gafus/prisma";

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
  const tombstones=await prisma.dogWalkTombstone.findMany({where:{userId:ownerId},select:{clientId:true}});
  const deletedIds=tombstones.map(row=>row.clientId);
  const data = await prisma.dogWalkRecord.findMany({
    where: { userId: ownerId, ...(deletedIds.length ? {clientId:{notIn:deletedIds}} : {}) },
    orderBy: { startedAt: "desc" }, take: 2000,
  });
  return data.map(toDto);
}

/** Idempotent, owner-scoped upsert. No userId/role accepted in payload. */
export async function syncCompletedDogWalks(ownerId: string, walks: CompletedDogWalkInput[]) {
  await assertWalkHistoryAccess(ownerId);
  if (walks.length) {
    // Serializable isolation prevents a concurrent offline upsert from racing a
    // deletion tombstone and recreating already deleted private tracks.
    await prisma.$transaction(async tx=>{
      const tombstones=await tx.dogWalkTombstone.findMany({
        where:{userId:ownerId,clientId:{in:walks.map(w=>w.clientId)}},select:{clientId:true},
      });
      const deleted=new Set(tombstones.map(row=>row.clientId));
      for(const walk of walks) {
        if(deleted.has(walk.clientId))continue;
        const data={
          startedAt:new Date(walk.startedAt), finishedAt:new Date(walk.finishedAt),
          durationSeconds:walk.durationSeconds,steps:walk.steps,estimatedMeters:walk.estimatedMeters,
          timerMode:walk.timerMode,incompleteSteps:walk.incompleteSteps,
          gpsEnabled:walk.gpsEnabled??false,gpsMeters:walk.gpsMeters??null,
        };
        await tx.dogWalkRecord.upsert({
          where:{userId_clientId:{userId:ownerId,clientId:walk.clientId}},
          create:{userId:ownerId,clientId:walk.clientId,...data},update:data,
        });
      }
    },{isolationLevel:'Serializable'});
  }
  return listCompletedDogWalks(ownerId);
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
  await prisma.$transaction([
    prisma.dogWalkTombstone.upsert({
      where:{userId_clientId:{userId:ownerId,clientId}},
      create:{userId:ownerId,clientId},update:{deletedAt:new Date()},
    }),
    prisma.dogWalkRecord.deleteMany({where:{userId:ownerId,clientId}}),
  ],{isolationLevel:'Serializable'});
}

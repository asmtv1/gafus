/** Server-owned PostgreSQL spool persistence; no telemetry/OTLP SDK dependencies.
 * Lease fencing and worker export outcomes remain independent of business data. */
import { prisma } from '@gafus/prisma';

export type SpoolEnvironment = 'preview' | 'production';
const LEASE_MS=120_000;

export async function claimTelemetrySpoolRow(rowId:string, now:Date,
  environment:SpoolEnvironment, runId:string):Promise<boolean> {
  const stale=new Date(now.getTime()-LEASE_MS);
  const updated=await prisma.mobileTelemetrySpool.updateMany({where:{
    id:rowId,retentionUntil:{gt:now},environment,OR:[
      {status:'PENDING',availableAt:{lte:now}},
      {status:'LEASED',lockedAt:{lt:stale}},
    ],
  },data:{status:'LEASED',lockedAt:now,lockedBy:runId,attempts:{increment:1}}});
  return updated.count===1;
}

export async function finishTelemetrySpoolRow(rowId:string,
  status:'PENDING'|'EXPORTED'|'DEAD', now:Date,runId:string,
  retryMs=0, code?:string):Promise<boolean> {
  const retainedDead=status==='DEAD' &&
    (code==='OTLP_PERMANENT_REJECT'||code==='OTLP_PARTIAL_REJECT');
  const done=await prisma.mobileTelemetrySpool.updateMany({
    where:{id:rowId,status:'LEASED',lockedBy:runId},data:{
      status,lockedAt:null,lockedBy:null,
      ...(status==='EXPORTED'?{exportedAt:now}:{}),
      ...(status==='PENDING'?{availableAt:new Date(now.getTime()+retryMs)}:{}),
      // Canonical event UUID remains for idempotent future replay.
      ...(status==='EXPORTED'||(status==='DEAD'&&!retainedDead)?{payload:{}}:{}),
      ...(status==='DEAD'?{retentionUntil:new Date(now.getTime()+24*60*60_000)}:{}),
      lastFailureCode:code??null,
    },
  });
  return done.count===1;
}

export async function findDueTelemetrySpoolRows(environment:SpoolEnvironment,
  now:Date, take=20) {
  const stale=new Date(now.getTime()-LEASE_MS);
  return prisma.mobileTelemetrySpool.findMany({where:{
    retentionUntil:{gt:now},environment,OR:[
      {status:'PENDING',availableAt:{lte:now}},
      {status:'LEASED',lockedAt:{lt:stale}},
    ],
  },select:{id:true,eventId:true,service:true,environment:true,payload:true,attempts:true},
  orderBy:{createdAt:'asc'},take:Math.max(1,Math.min(take,50))});
}

export async function purgeExpiredTelemetrySpool(now:Date) {
  const [events,grants]=await Promise.all([
    prisma.mobileTelemetrySpool.deleteMany({where:{retentionUntil:{lt:now}}}),
    prisma.mobileTelemetryUploadSession.deleteMany({where:{expiresAt:{lt:now}}}),
  ]);
  await prisma.mobileTelemetryDailyQuota.deleteMany({
    where:{day:{lt:new Date(now.getTime()-45*24*60*60_000)}},
  });
  return {events:events.count,grants:grants.count};
}
export async function snapshotTelemetrySpool(environment:SpoolEnvironment,day:Date) {
  const [pending,leased,dead,quota]=await Promise.all([
    prisma.mobileTelemetrySpool.count({where:{environment,status:'PENDING'}}),
    prisma.mobileTelemetrySpool.count({where:{environment,status:'LEASED'}}),
    prisma.mobileTelemetrySpool.count({where:{environment,status:'DEAD'}}),
    prisma.mobileTelemetryDailyQuota.findUnique({where:{environment_day:{environment,day}}}),
  ]);
  return {pending,leased,dead,acceptedEvents:quota?.acceptedEvents??0,
    acceptedBytes:String(quota?.acceptedBytes??0n)};
}

/**
 * Fixed-service aggregate backlog for separate iOS/Android/Web panels. The
 * caller never receives event payload, user/session IDs, or dynamic DB labels.
 */
export async function snapshotTelemetrySpoolByService(environment:SpoolEnvironment) {
  const services = [
    'gafus-mobile-ios','gafus-mobile-android','gafus-web',
    'gafus-admin-panel','gafus-trainer-panel','gafus-bull-board',
  ] as const;
  const statuses = ['PENDING','LEASED','DEAD'] as const;
  const rows=await prisma.mobileTelemetrySpool.groupBy({
    by:['service','status'],
    where:{environment,service:{in:[...services]},status:{in:[...statuses]}},
    _count:{_all:true},
  });
  const totals=new Map(rows.map(row=>[row.service+'|'+row.status,row._count._all]));
  return services.flatMap(service=>statuses.map(status=>({
    service,status,count:totals.get(service+'|'+status)??0,
  })));
}

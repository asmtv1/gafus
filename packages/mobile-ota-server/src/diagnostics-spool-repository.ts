/** Server-owned PostgreSQL spool persistence; no telemetry/OTLP SDK dependencies.
 * Lease fencing and worker export outcomes remain independent of business data. */
import { prisma } from '@gafus/prisma';
import { parseMobileTelemetryEvent } from '@gafus/types';

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
  retryMs=0, code?:string, exportedPayload?:unknown):Promise<boolean> {
  const retainedDead=status==='DEAD' &&
    (code==='OTLP_PERMANENT_REJECT'||code==='OTLP_PARTIAL_REJECT');
  // Keep only bounded pseudonymous cohort metadata after export, never stack,
  // breadcrumbs, request context or exception content. Existing expiry applies.
  let summary: Record<string,string|number> = {};
  if(status==='EXPORTED' && exportedPayload!==undefined) {
    try {
      const e=parseMobileTelemetryEvent(exportedPayload);
      if(e.platform!=='web') summary={
        summaryVersion:1, ...(e.installationId?{installationId:e.installationId}:{}), appStartId:e.appStartId,
        build:e.build, channel:e.channel, occurredAt:e.occurredAt, occurrences:e.occurrences??1,
      };
    } catch { /* old/unrecognized payloads are erased as before */ }
  }
  const done=await prisma.mobileTelemetrySpool.updateMany({
    where:{id:rowId,status:'LEASED',lockedBy:runId},data:{
      status,lockedAt:null,lockedBy:null,
      ...(status==='EXPORTED'?{exportedAt:now}:{}),
      ...(status==='PENDING'?{availableAt:new Date(now.getTime()+retryMs)}:{}),
      // Canonical event UUID remains for idempotent future replay.
      ...(status==='EXPORTED'||(status==='DEAD'&&!retainedDead)?{payload:summary}:{}),
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
  },select:{id:true,eventId:true,service:true,environment:true,payload:true,attempts:true,createdAt:true},
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
  // Preserve event-ID tombstones for deduplication, but erase cohort IDs
  // after the 24-hour reporting window. Keep query work bounded by retention.
  await prisma.mobileTelemetrySpool.updateMany({
    where:{status:'EXPORTED',createdAt:{lt:new Date(now.getTime()-24*60*60_000)},
      payload:{path:['summaryVersion'],equals:1}},
    data:{payload:{}},
  });
  return {events:events.count,grants:grants.count};
}
export async function snapshotTelemetrySpool(environment:SpoolEnvironment,day:Date) {
  const [pending,leased,dead,quota,oldest]=await Promise.all([
    prisma.mobileTelemetrySpool.count({where:{environment,status:'PENDING'}}),
    prisma.mobileTelemetrySpool.count({where:{environment,status:'LEASED'}}),
    prisma.mobileTelemetrySpool.count({where:{environment,status:'DEAD'}}),
    prisma.mobileTelemetryDailyQuota.findUnique({where:{environment_day:{environment,day}}}),
    prisma.mobileTelemetrySpool.findFirst({where:{environment,status:{in:['PENDING','LEASED']}},orderBy:{createdAt:'asc'},select:{createdAt:true}}),
  ]);
  return {pending,leased,dead,oldestAgeSeconds:oldest?Math.max(0,(Date.now()-oldest.createdAt.getTime())/1000):0,acceptedEvents:quota?.acceptedEvents??0,
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

/** Resolve diagnostic release metadata only from the verified registry, including
 * historical non-active OTA releases. Never infer a revision from client input. */
export async function resolveTelemetryRelease(scope: {
  platform: string; appVersion: string; build: string; runtime: string;
  channel: string; updateId: string; environment: SpoolEnvironment;
}): Promise<{status:'ota'|'embedded'|'unknown'; revision?:number; sourceSha?:string; symbolsRef?:string; embeddedUpdateId?:string;nativeArtifactSha256?:string}> {
  if (scope.updateId==='unknown' || (scope.platform !== 'ios' && scope.platform !== 'android')) return {status:'unknown'};
  const nativeScope = {appId:'gafus', platform:scope.platform,
    environment:scope.environment, appVersion:scope.appVersion, buildNumber:scope.build,
    runtimeVersion:scope.runtime, channel:scope.channel, verified:true};
  if (scope.updateId !== 'embedded') {
    const ota = await prisma.mobileOtaRelease.findFirst({
      where:{updateId:scope.updateId,appId:'gafus',platform:scope.platform,
        environment:scope.environment,channel:scope.channel,runtimeVersion:scope.runtime,
        nativeRelease:nativeScope},
      select:{revision:true,sourceSha:true,symbolsRef:true},
    });
    if (ota) return {status:'ota',revision:ota.revision,sourceSha:ota.sourceSha,...(ota.symbolsRef?{symbolsRef:ota.symbolsRef}:{})};
  }
  const native = await prisma.mobileNativeRelease.findMany({
    where:{...nativeScope,...(scope.updateId==='embedded'?{}:{embeddedUpdateId:scope.updateId})},
    select:{sourceSha:true,embeddedUpdateId:true,attestation:true},take:2,
  });
  if(native.length!==1)return {status:'unknown'};
  const row=native[0]!;
  const attestation=row.attestation as {embeddedSymbolsRef?:unknown;nativeArtifactSha256?:unknown}|null;
  return {status:'embedded',sourceSha:row.sourceSha,
    ...(row.embeddedUpdateId?{embeddedUpdateId:row.embeddedUpdateId}:{}),
    ...(row.embeddedUpdateId&&typeof attestation?.embeddedSymbolsRef==='string'&&/^symbols-s3:[a-f0-9]{64}$/.test(attestation.embeddedSymbolsRef)&&
      typeof attestation.nativeArtifactSha256==='string'&&/^[a-f0-9]{64}$/.test(attestation.nativeArtifactSha256)?
      {symbolsRef:attestation.embeddedSymbolsRef,nativeArtifactSha256:attestation.nativeArtifactSha256}:{}),
  };
}

/** Aggregate across embedded and OTA bundles; no identities returned to metrics.
 * A matched start event is required for an error to enter the JS denominator. */
export async function snapshotMobileSessionHealth(environment:SpoolEnvironment,now:Date) {
  const from=new Date(now.getTime()-24*60*60_000);
  const rows=await prisma.$queryRaw<{
    platform:string;sessions:number;errorSessions:number;installations:number;fatalEvents:number;errors:number;
  }[]>`
    WITH recent AS (
      SELECT platform,"updateId","eventKind",severity,
        payload->>'appStartId' AS session_id,payload->>'installationId' AS installation_id,
        CASE WHEN (payload->>'occurrences') ~ '^[1-9][0-9]{0,3}$'
          THEN LEAST(1000,(payload->>'occurrences')::int) ELSE 1 END AS occurrences
      FROM "MobileTelemetrySpool"
      WHERE environment=${environment} AND platform IN ('ios','android')
        AND "createdAt">=${from} AND "retentionUntil">${now}
    ), cohorts AS (
      SELECT platform,"updateId",session_id,
        MAX(installation_id) FILTER (WHERE "eventKind"='session_start') AS installation_id,
        BOOL_OR("eventKind"='session_start') AS started,
        BOOL_OR(severity IN ('ERROR','FATAL')) AS errored
      FROM recent WHERE session_id IS NOT NULL GROUP BY platform,"updateId",session_id
    ), totals AS (
      SELECT platform,COUNT(*) FILTER (WHERE started)::int AS sessions,
        COUNT(*) FILTER (WHERE started AND errored)::int AS "errorSessions",
        COUNT(DISTINCT installation_id) FILTER (WHERE started)::int AS installations
      FROM cohorts GROUP BY platform
    ), failures AS (
      SELECT platform,COALESCE(SUM(occurrences) FILTER (WHERE severity='FATAL'),0)::int AS "fatalEvents",
        COALESCE(SUM(occurrences) FILTER (WHERE severity IN ('ERROR','FATAL')),0)::int AS errors
      FROM recent GROUP BY platform
    )
    SELECT f.platform,COALESCE(t.sessions,0)::int AS sessions,COALESCE(t."errorSessions",0)::int AS "errorSessions",
      COALESCE(t.installations,0)::int AS installations,f."fatalEvents",f.errors
    FROM failures f LEFT JOIN totals t ON t.platform=f.platform
  `;
  return ['ios','android'].map(platform=>rows.find(row=>row.platform===platform)??{
    platform,sessions:0,errorSessions:0,installations:0,fatalEvents:0,errors:0,
  });
}

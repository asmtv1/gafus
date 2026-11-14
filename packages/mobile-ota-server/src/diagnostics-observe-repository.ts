/** Release-gated preview native Observe adapter. The native SDK cannot send
 * our bearer grant; public metadata therefore remains untrusted. No payload
 * bypasses normalization. Production is deliberately unavailable. */
import { prisma, Prisma } from '@gafus/prisma';
import type { MobileTelemetryEventV1 } from '@gafus/types';
import type { ObserveReleaseScope, ObservePreviewRepository } from './diagnostics-contracts.js';
import { ObservePreviewStoreError } from './diagnostics-contracts.js';
const MAX_DAILY_RECORDS=20_000,MAX_DAILY_BYTES=64*1024*1024;
const service=(p:'ios'|'android')=>p==='ios'?'gafus-mobile-ios':'gafus-mobile-android';

/** Shared strict preview-release validation for native logs AND metrics. */
export async function verifyObserveReleaseScopes(scopes:ObserveReleaseScope[]):Promise<void> {
  if(!scopes.length||scopes.length>8)
    throw new ObservePreviewStoreError('OBSERVE_RELEASE_SCOPE_INVALID',403);
  for(const scope of scopes){
    if(scope.environment!=='preview'||scope.channel!=='preview')
      throw new ObservePreviewStoreError('OBSERVE_NOT_PREVIEW',403);
    const verified=await prisma.mobileNativeRelease.findFirst({where:{
      appId:'gafus',platform:scope.platform,environment:'preview',channel:'preview',
      appVersion:scope.appVersion,buildNumber:scope.build,
      runtimeVersion:scope.runtime,verified:true},select:{id:true}});
    if(!verified)throw new ObservePreviewStoreError('OBSERVE_RELEASE_NOT_VERIFIED',403);
  }
}

export const observePreviewRepository:ObservePreviewRepository={
  async store(events,scopes,now=new Date()){
    if(events.length>50)throw new ObservePreviewStoreError('OBSERVE_TOO_MANY_EVENTS',413);
    if(!events.length)return 0;
    await verifyObserveReleaseScopes(scopes);
    for(const event of events){
      if(!scopes.some(s=>s.platform===event.platform&&s.appVersion===event.appVersion&&
        s.build===event.build&&s.runtime===event.runtime&&s.channel===event.channel))
        throw new ObservePreviewStoreError('OBSERVE_EVENT_OUT_OF_SCOPE',403);
    }
    for(let retry=0;retry<3;retry++){
      try{
        return await prisma.$transaction(async tx=>{
          const found=await tx.mobileTelemetrySpool.findMany({where:{
            eventId:{in:events.map(e=>e.eventId)},environment:'preview',
          },select:{eventId:true,service:true}});
          const existing=new Set(found.map(e=>`${e.service}:${e.eventId}`));
          const unique=events.filter(e=>!existing.has(`${service(e.platform as 'ios'|'android')}:${e.eventId}`));
          if(!unique.length)return 0;
          const allocatedBytes=Buffer.byteLength(JSON.stringify(unique));
          const day=now.toISOString().slice(0,10);
          const reserved=await tx.$executeRaw`
            INSERT INTO "MobileTelemetryDailyQuota"
              ("environment", "day", "acceptedEvents", "acceptedBytes")
            VALUES ('preview', ${day}::date, ${unique.length}, ${allocatedBytes})
            ON CONFLICT ("environment", "day") DO UPDATE SET
              "acceptedEvents"="MobileTelemetryDailyQuota"."acceptedEvents"+EXCLUDED."acceptedEvents",
              "acceptedBytes"="MobileTelemetryDailyQuota"."acceptedBytes"+EXCLUDED."acceptedBytes"
            WHERE "MobileTelemetryDailyQuota"."acceptedEvents"+EXCLUDED."acceptedEvents"<=${MAX_DAILY_RECORDS}
              AND "MobileTelemetryDailyQuota"."acceptedBytes"+EXCLUDED."acceptedBytes"<=${MAX_DAILY_BYTES}
          `;
          if(reserved!==1)throw new ObservePreviewStoreError('OBSERVE_DAILY_QUOTA_EXCEEDED',429);
          const result=await tx.mobileTelemetrySpool.createMany({data:unique.map(e=>({
            eventId:e.eventId,environment:'preview',
            service:service(e.platform as 'ios'|'android'),platform:e.platform,
            eventKind:e.kind,severity:e.severity,runtimeVersion:e.runtime,
            updateId:e.updateId,appVersion:e.appVersion,
            payload:e as unknown as Prisma.InputJsonValue,
            retentionUntil:new Date(now.getTime()+7*24*60*60_000),
          })),skipDuplicates:true});
          return result.count;
        },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:10_000});
      }catch(error){
        if((error as {code?:unknown})?.code==='P2034' && retry<2)continue;
        throw error;
      }
    }
    throw new ObservePreviewStoreError('OBSERVE_TRANSACTION_RETRIES_EXHAUSTED',503);
  },
};

/** Atomic PREVIEW-only metrics budget; no user/device values are stored. */
export async function reserveObserveMetricsDailyQuota(
  points:number,bytes:number,now=new Date(),
):Promise<void>{
  if(!Number.isSafeInteger(points)||points<1||points>64||
     !Number.isSafeInteger(bytes)||bytes<1||bytes>64*1024)
    throw new ObservePreviewStoreError('OBSERVE_METRICS_QUOTA_ARGUMENT_INVALID',413);
  const day=now.toISOString().slice(0,10);
  const reserved=await prisma.$executeRaw`
    INSERT INTO "MobileTelemetryDailyQuota"
      ("environment","day","acceptedEvents","acceptedBytes")
    VALUES ('preview-observe-metrics', ${day}::date, ${points}, ${bytes})
    ON CONFLICT ("environment","day") DO UPDATE SET
      "acceptedEvents"="MobileTelemetryDailyQuota"."acceptedEvents"+EXCLUDED."acceptedEvents",
      "acceptedBytes"="MobileTelemetryDailyQuota"."acceptedBytes"+EXCLUDED."acceptedBytes"
    WHERE "MobileTelemetryDailyQuota"."acceptedEvents"+EXCLUDED."acceptedEvents"<=10000
      AND "MobileTelemetryDailyQuota"."acceptedBytes"+EXCLUDED."acceptedBytes"<=8388608
  `;
  if(reserved!==1)
    throw new ObservePreviewStoreError('OBSERVE_METRICS_DAILY_QUOTA_EXCEEDED',429);
}

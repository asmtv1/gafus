/** Browser telemetry persistence uses the same bounded spool but a DISTINCT
 * quota namespace from Mobile. No user, cookie, IP, or request body retained. */
import { createHash } from 'node:crypto';
import { prisma, Prisma } from '@gafus/prisma';
import {parseMobileTelemetryEvent,type MobileTelemetryEventV1} from '@gafus/types';

export type WebTelemetryService='gafus-web'|'gafus-admin-panel'|
  'gafus-trainer-panel'|'gafus-bull-board';
export type WebTelemetryEnvironment='preview'|'production';
export type WebRelease={appVersion:string;build:string};
export class WebTelemetryStoreError extends Error {
  constructor(readonly code:string,readonly status:number){super(code);}
}
const SERVICE_CODES:Record<WebTelemetryService,string>={
  'gafus-web':'web','gafus-admin-panel':'admin',
  'gafus-trainer-panel':'trainer','gafus-bull-board':'bull',
};
const ALLOWED_KINDS=new Set([
  'js_handled','react_error','promise_rejection','network_failure','startup_failure',
]);
const DAILY_EVENTS=5000,DAILY_BYTES=16*1024*1024;
export const webFingerprint=(service:WebTelemetryService)=>
  createHash('sha256').update('gafus-web-telemetry:v1:'+service).digest('hex');

function verifyEvent(e:MobileTelemetryEventV1,scope:WebRelease,now:Date) {
  if(e.platform!=='web'||e.channel!=='web'||e.updateId!=='embedded'||
     e.appVersion!==scope.appVersion||e.build!==scope.build||e.runtime!==scope.build||
     !ALLOWED_KINDS.has(e.kind) || (e.severity!=='ERROR'&&e.severity!=='FATAL'))
    throw new WebTelemetryStoreError('WEB_EVENT_SCOPE_INVALID',403);
  const age=now.getTime()-Date.parse(e.occurredAt);
  if(!Number.isFinite(age)||age< -5*60_000||age>72*60*60_000)
    throw new WebTelemetryStoreError('WEB_EVENT_TIME_INVALID',400);
}
export interface WebTelemetryRepository {
  issueGrant(input:{tokenHash:string;service:WebTelemetryService;release:WebRelease;
    environment:WebTelemetryEnvironment;expiresAt:Date}):Promise<void>;
  persistBatch(input:{tokenHash:string;service:WebTelemetryService;events:MobileTelemetryEventV1[];
    environment:WebTelemetryEnvironment;now:Date}):Promise<{accepted:string[];newlyInserted:number}>;
}
export const prismaWebTelemetryRepository:WebTelemetryRepository={
  async issueGrant({tokenHash,service,release,environment,expiresAt}) {
    await prisma.mobileTelemetryUploadSession.create({data:{
      tokenHash,platform:'web',environment,appVersion:release.appVersion,
      build:release.build,runtimeVersion:release.build,channel:'web',
      nativeFingerprint:webFingerprint(service),eventBudget:50,expiresAt,
    }});
  },
  async persistBatch(input) {
    if(input.events.length<1||input.events.length>50)
      throw new WebTelemetryStoreError('WEB_BATCH_INVALID',413);
    const session=await prisma.mobileTelemetryUploadSession.findUnique({
      where:{tokenHash:input.tokenHash},
    });
    if(!session || session.expiresAt<=input.now || session.environment!==input.environment ||
       session.platform!=='web'||session.channel!=='web'||
       session.nativeFingerprint!==webFingerprint(input.service))
      throw new WebTelemetryStoreError('WEB_GRANT_EXPIRED',401);
    const release={appVersion:session.appVersion,build:session.build};
    const clean=input.events.map(e=>{
      let parsed:MobileTelemetryEventV1;
      try{parsed=parseMobileTelemetryEvent(e);}
      catch{throw new WebTelemetryStoreError('WEB_INVALID_EVENT',400);}
      verifyEvent(parsed,release,input.now);
      return parsed;
    });
    const today=input.now.toISOString().slice(0,10);
    const quotaScope=`${input.environment}-web-${SERVICE_CODES[input.service]}`;
    for(let retry=0;retry<3;retry++){
      try{
        return await prisma.$transaction(async tx=>{
          const existing=await tx.mobileTelemetrySpool.findMany({where:{
            environment:input.environment,service:input.service,
            eventId:{in:clean.map(e=>e.eventId)},
          },select:{eventId:true}});
          const seen=new Set(existing.map(e=>e.eventId));
          const fresh=clean.filter(e=>{
            if(seen.has(e.eventId))return false;
            seen.add(e.eventId);
            return true;
          });
          if(fresh.length){
            const bytes=Buffer.byteLength(JSON.stringify(fresh));
            const quota=await tx.$executeRaw`
              INSERT INTO "MobileTelemetryDailyQuota"
                ("environment","day","acceptedEvents","acceptedBytes")
              VALUES (${quotaScope},${today}::date,${fresh.length},${bytes})
              ON CONFLICT ("environment","day") DO UPDATE SET
                "acceptedEvents"="MobileTelemetryDailyQuota"."acceptedEvents"+EXCLUDED."acceptedEvents",
                "acceptedBytes"="MobileTelemetryDailyQuota"."acceptedBytes"+EXCLUDED."acceptedBytes"
              WHERE "MobileTelemetryDailyQuota"."acceptedEvents"+EXCLUDED."acceptedEvents"<=${DAILY_EVENTS}
                AND "MobileTelemetryDailyQuota"."acceptedBytes"+EXCLUDED."acceptedBytes"<=${DAILY_BYTES}
            `;
            if(quota!==1)throw new WebTelemetryStoreError('WEB_DAILY_QUOTA_EXCEEDED',429);
            const grant=await tx.mobileTelemetryUploadSession.updateMany({
              where:{id:session.id,expiresAt:{gt:input.now},
                usedEvents:{lte:session.eventBudget-fresh.length}},
              data:{usedEvents:{increment:fresh.length}},
            });
            if(grant.count!==1)throw new WebTelemetryStoreError('WEB_GRANT_EXHAUSTED',429);
            await tx.mobileTelemetrySpool.createMany({data:fresh.map(e=>({
              eventId:e.eventId,environment:input.environment,service:input.service,
              platform:'web',eventKind:e.kind,severity:e.severity,runtimeVersion:e.runtime,
              updateId:e.updateId,appVersion:e.appVersion,
              payload:e as unknown as Prisma.InputJsonValue,
              retentionUntil:new Date(input.now.getTime()+72*60*60_000),
            })),skipDuplicates:true});
          }
          return {accepted:[...new Set(clean.map(e=>e.eventId))],newlyInserted:fresh.length};
        },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:10_000});
      }catch(error){
        if((error as {code?:unknown})?.code==='P2034'&&retry<2)continue;
        throw error;
      }
    }
    throw new WebTelemetryStoreError('WEB_TRANSACTION_RETRIES_EXHAUSTED',503);
  },
};

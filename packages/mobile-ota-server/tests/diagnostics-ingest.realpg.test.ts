/** Real PostgreSQL isolation-only check. NEVER run against a shared database. */
import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '@gafus/prisma';
import { createMobileTelemetryIngest } from '../../../apps/api/src/modules/mobile-telemetry/ingest.js';
import { prismaMobileTelemetryRepository } from '@gafus/mobile-ota-server/diagnostics-repository';
const URL_STRING=process.env.DATABASE_URL??'';
const isolated=process.env.GAFUS_TELEMETRY_TEST_ISOLATED==='true' &&
  URL_STRING.includes('127.0.0.1:65493/gafus_refactor_telemetry_sdk57_qa');
const run=isolated?describe:describe.skip;
run('SDK57 actual PostgreSQL durable ingest',()=>{
  it('locks release scope, persists before ACK, dedups on replay, enforces transactional quotas',async()=>{
    const nativeFingerprint='a'.repeat(64);
    const build=String(Math.floor(Math.random()*900000)+100000);
    const release=await prisma.mobileNativeRelease.create({data:{
      appId:'gafus',platform:'android',environment:'preview',distribution:'internal',
      bundleId:'ru.gafus.app',appVersion:'1.8.0',buildNumber:build,runtimeVersion:'1.8.0',
      channel:'preview',updateUrl:'https://qa.invalid/ota/manifest',
      signingKeyId:'qa-key',certificateSha256:'b'.repeat(64),nativeFingerprint,
      sourceSha:'f'.repeat(40),verified:true,
    }});
    const one=randomUUID(),two=randomUUID();
    const input=()=>({schemaVersion:1 as const,eventId:one,appStartId:randomUUID(),
      platform:'android',kind:'js_handled',severity:'ERROR',occurredAt:new Date().toISOString(),
      appVersion:'1.8.0',build,runtime:'1.8.0',channel:'preview',updateId:'embedded',
      errorCode:'QA_CANARY',
      stack:'Error: authorization private@example.com\n  at MyFn (https://qa.invalid/private?token=abc:33:44)',
    });
    const config={platform:'android',appVersion:'1.8.0',build,runtime:'1.8.0',
      channel:'preview',nativeFingerprint};
    const service='gafus-mobile-android';
    const day=new Date(new Date().toISOString().slice(0,10)+'T00:00:00.000Z');
    const baseline=await prisma.mobileTelemetryDailyQuota.findUnique({where:{environment_day:{environment:'preview',day}}});
    try{
      const ingest=createMobileTelemetryIngest(prismaMobileTelemetryRepository,{
        GAFUS_TELEMETRY_INGEST_ENABLED:'true',GAFUS_TELEMETRY_ENVIRONMENT:'preview',
      });
      const grant=await ingest.issueUploadGrant(config);
      expect(grant.token).toMatch(/^[\w-]{43}$/);
      const first=await ingest.acceptBatch('Bearer '+grant.token,{schemaVersion:1,events:[input()]});
      expect(first).toEqual({accepted:[one],newlyInserted:1});
      const row=await prisma.mobileTelemetrySpool.findUniqueOrThrow({
        where:{environment_service_eventId:{environment:'preview',service,eventId:one}},
      });
      expect(row.status).toBe('PENDING');
      expect(row.environment).toBe('preview');
      expect(row.payload).not.toHaveProperty('userId');
      expect(JSON.stringify(row.payload)).not.toMatch(/private@example|token=abc|qa\.invalid/);
      expect(JSON.stringify(row.payload)).toContain('bundle:33:44');
      // Duplicate IDs within a single batch fail strict contract validation.
      await expect(ingest.acceptBatch('Bearer '+grant.token,{schemaVersion:1,events:[input(),input()]}))
        .rejects.toMatchObject({code:'TELEMETRY_INVALID_BATCH',status:400});
      const replay=await ingest.acceptBatch('Bearer '+grant.token,{schemaVersion:1,events:[input()]});
      expect(replay).toEqual({accepted:[one],newlyInserted:0});
      const rows=await prisma.mobileTelemetrySpool.count({where:{eventId:one}});
      expect(rows).toBe(1);
      const digest=prisma.mobileTelemetryUploadSession.findMany({where:{appVersion:'1.8.0',platform:'android'}});
      const sessions=await digest;
      expect(sessions.some(e=>e.tokenHash===grant.token)).toBe(false);
      const today=await prisma.mobileTelemetryDailyQuota.findUnique({where:{environment_day:{environment:'preview',day}}});
      expect(today?.acceptedEvents).toBe((baseline?.acceptedEvents??0)+1);
      // Exhaust quota and verify rejection atomically rolls back session count.
      await prisma.mobileTelemetryDailyQuota.update({where:{environment_day:{environment:'preview',day}},data:{acceptedEvents:20000}});
      const second={...input(),eventId:two};
      await expect(ingest.acceptBatch('Bearer '+grant.token,{schemaVersion:1,events:[second]}))
        .rejects.toMatchObject({code:'TELEMETRY_DAILY_BUDGET_EXCEEDED',status:429});
      expect(await prisma.mobileTelemetrySpool.count({where:{eventId:two}})).toBe(0);
      const updatedSession=await prisma.mobileTelemetryUploadSession.findFirstOrThrow({where:{appVersion:'1.8.0',platform:'android',build}});
      expect(updatedSession.usedEvents).toBe(1);
    }finally{
      await prisma.mobileTelemetrySpool.deleteMany({where:{eventId:{in:[one,two]}}});
      await prisma.mobileTelemetryUploadSession.deleteMany({where:{appVersion:'1.8.0',platform:'android',build}});
      if(baseline)await prisma.mobileTelemetryDailyQuota.update({where:{environment_day:{environment:'preview',day}},data:{acceptedEvents:baseline.acceptedEvents,acceptedBytes:baseline.acceptedBytes}});
      else await prisma.mobileTelemetryDailyQuota.deleteMany({where:{environment:'preview',day}});
      await prisma.mobileNativeRelease.delete({where:{id:release.id}});
    }
  });
});

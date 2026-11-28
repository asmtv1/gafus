import { randomUUID } from 'node:crypto';
import { describe,it,expect } from 'vitest';
import { prisma } from '@gafus/prisma';
import { listOtaDiagnosticQuality } from '@gafus/mobile-ota-server/telemetry';
import { createMobileTelemetryIngest } from '../../../apps/api/src/modules/mobile-telemetry/ingest';
import { prismaMobileTelemetryRepository } from '@gafus/mobile-ota-server/diagnostics-repository';
import { claimTelemetrySpoolRow,finishTelemetrySpoolRow,snapshotMobileSessionHealth } from '@gafus/mobile-ota-server/diagnostics-spool-repository';
import type { MobileTelemetryEventV1 } from '@gafus/types';

const isolated=process.env.GAFUS_TELEMETRY_TEST_ISOLATED==='true'&&
 process.env.GAFUS_API_REALPG_ISOLATED==='1'&&
 /127\.0\.0\.1:65493\/gafus_refactor_telemetry_sdk57_qa\?schema=public/.test(process.env.DATABASE_URL??'');
(isolated?describe:describe.skip)('observed OTA quality cohorts with actual PostgreSQL',()=>{
 it('keeps only cohort metadata after ACK, counts occurrences and excludes wrong build',async()=>{
  const build='quality-'+randomUUID().slice(0,8);
  const native=await prisma.mobileNativeRelease.create({data:{
    appId:'gafus',platform:'ios',environment:'production',distribution:'internal',bundleId:'ru.gafus.app',
    appVersion:'1.7.5',buildNumber:build,runtimeVersion:'1.7.5',channel:'production',
    updateUrl:'https://qa.invalid/ota/manifest',signingKeyId:'qa',certificateSha256:'c'.repeat(64),
    nativeFingerprint:'e'.repeat(64),sourceSha:'a'.repeat(40),verified:true,
  }});
  const updateId=randomUUID();
  const ota=await prisma.mobileOtaRelease.create({data:{
    nativeReleaseId:native.id,appId:'gafus',platform:'ios',environment:'production',channel:'production',
    runtimeVersion:'1.7.5',sourceSha:'a'.repeat(40),revision:15,updateId,
    manifestBody:Buffer.from('{}'),signatureHeader:'qa',signingKeyId:'qa',state:'READY',
  }});
  const sessionId=randomUUID(),installationId=randomUUID(),now=new Date();
  const base={schemaVersion:1 as const,platform:'ios' as const,appVersion:'1.7.5',build,
    runtime:'1.7.5',channel:'production',updateId,occurredAt:now.toISOString(),appStartId:sessionId,installationId};
  const start:MobileTelemetryEventV1={...base,eventId:randomUUID(),kind:'session_start',severity:'INFO'};
  const failure:MobileTelemetryEventV1={...base,eventId:randomUUID(),kind:'js_handled',severity:'ERROR',
    errorCode:'QA_ERROR',stack:'at test (bundle:1:12345)',occurrences:3,lastOccurredAt:now.toISOString()};
  try {
    const ingest=createMobileTelemetryIngest(prismaMobileTelemetryRepository,{
      GAFUS_TELEMETRY_INGEST_ENABLED:'true',GAFUS_TELEMETRY_ENVIRONMENT:'production',GAFUS_TELEMETRY_PRODUCTION_APPROVED:'true',
    });
    const grant=await ingest.issueUploadGrant({platform:'ios',appVersion:'1.7.5',build,runtime:'1.7.5',
      channel:'production',nativeFingerprint:'e'.repeat(64)});
    expect((await ingest.acceptBatch('Bearer '+grant.token,{schemaVersion:1,events:[start,failure]})).newlyInserted).toBe(2);
    for(const event of [start,failure]){
      const row=await prisma.mobileTelemetrySpool.findFirstOrThrow({where:{eventId:event.eventId}});
      expect(await claimTelemetrySpoolRow(row.id,new Date(),'production','quality-test')).toBe(true);
      expect(await finishTelemetrySpoolRow(row.id,'EXPORTED',new Date(),'quality-test',0,undefined,row.payload)).toBe(true);
      const exported=await prisma.mobileTelemetrySpool.findUniqueOrThrow({where:{id:row.id}});
      expect(exported.payload).not.toHaveProperty('stack');
      expect(exported.payload).not.toHaveProperty('errorCode');
      expect(exported.payload).toHaveProperty('appStartId',sessionId);
    }
    await prisma.mobileTelemetrySpool.create({data:{
      eventId:randomUUID(),environment:'production',service:'gafus-mobile-ios',platform:'ios',eventKind:'js_handled',
      severity:'ERROR',runtimeVersion:'1.7.5',updateId,appVersion:'1.7.5',
      payload:{...failure,build:'different-build',occurrences:100},retentionUntil:new Date(Date.now()+3600000),
    }});
    const quality=(await listOtaDiagnosticQuality()).find(row=>row.updateId===updateId);
    expect(quality).toMatchObject({revision:15,build,sessions:1,installations:1,errorSessions:1,errors:3});
    expect(JSON.stringify(quality)).not.toContain(installationId);
    expect(JSON.stringify(quality)).not.toContain(sessionId);
    const aggregate=(await snapshotMobileSessionHealth('production',new Date())).find(row=>row.platform==='ios');
    expect(aggregate?.sessions).toBeGreaterThanOrEqual(1);
    expect(aggregate?.errorSessions).toBeGreaterThanOrEqual(1);
  } finally {
    await prisma.mobileTelemetrySpool.deleteMany({where:{updateId}});
    await prisma.mobileTelemetryUploadSession.deleteMany({where:{build}});
    await prisma.mobileTelemetryDailyQuota.deleteMany({where:{environment:'production'}});
    await prisma.mobileOtaRelease.delete({where:{id:ota.id}});
    await prisma.mobileNativeRelease.delete({where:{id:native.id}});
  }
 });
});

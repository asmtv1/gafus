/** Local physical PG proof of browser durable ACK; NO production data. */
import {createHash,randomUUID} from 'node:crypto';
import {describe,it,expect} from 'vitest';
import {prisma} from '@gafus/prisma';
import {
 prismaWebTelemetryRepository,WebTelemetryStoreError,
} from '@gafus/mobile-ota-server/diagnostics-web-repository';

const isolated=process.env.GAFUS_TELEMETRY_TEST_ISOLATED==='true'&&
 process.env.GAFUS_API_REALPG_ISOLATED==='1'&&
 /127\.0\.0\.1:65493\/gafus_refactor_telemetry_sdk57_qa\?schema=public/.test(process.env.DATABASE_URL??'');
const suite=isolated?describe:describe.skip;
suite('GAFUS browser transactional ingestion with real PostgreSQL',()=>{
 it('stores before ACK, dedups event UUID and isolates grants per service',async()=>{
  const now=new Date();const id=randomUUID();const startId=randomUUID();
  const tokenHash=createHash('sha256').update(randomUUID()).digest('hex');
  const build='f'.repeat(40);
  const event={
   schemaVersion:1 as const,eventId:id,appStartId:startId,
   platform:'web' as const,kind:'react_error' as const,severity:'ERROR' as const,
   occurredAt:now.toISOString(),appVersion:'1.7.3',build,runtime:build,
   channel:'web',updateId:'embedded',errorCode:'WEB_REACT_RENDER',
   stack:'at SafeComponent (bundle:123:4)',
  };
  try{
   await prismaWebTelemetryRepository.issueGrant({tokenHash,service:'gafus-web',
    release:{appVersion:'1.7.3',build},environment:'preview',
    expiresAt:new Date(now.getTime()+15*60_000)});
   const input={tokenHash,service:'gafus-web' as const,events:[event],
    environment:'preview' as const,now};
   const first=await prismaWebTelemetryRepository.persistBatch(input);
   expect(first).toEqual({accepted:[id],newlyInserted:1});
   const stored=await prisma.mobileTelemetrySpool.findFirstOrThrow({
    where:{environment:'preview',service:'gafus-web',eventId:id},
   });
   expect(stored.status).toBe('PENDING');
   expect(stored.platform).toBe('web');
   expect(await prismaWebTelemetryRepository.persistBatch(input))
    .toEqual({accepted:[id],newlyInserted:0});
   expect(await prisma.mobileTelemetrySpool.count({where:{eventId:id}})).toBe(1);
   await expect(prismaWebTelemetryRepository.persistBatch({...input,service:'gafus-admin-panel'}))
    .rejects.toMatchObject({code:'WEB_GRANT_EXPIRED',status:401});
   const quotaDay=new Date(now.toISOString().slice(0,10)+'T00:00:00Z');
   const quota=await prisma.mobileTelemetryDailyQuota.findUnique({
    where:{environment_day:{environment:'preview-web-web',day:quotaDay}},
   });
   expect(quota?.acceptedEvents).toBe(1);
  }finally{
   await prisma.mobileTelemetrySpool.deleteMany({where:{eventId:id}});
   await prisma.mobileTelemetryUploadSession.deleteMany({where:{tokenHash}});
  }
 });
});

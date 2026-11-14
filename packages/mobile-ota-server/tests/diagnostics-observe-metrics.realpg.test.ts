/** Strict 127.0.0.1:65493, disposable PostgreSQL quota transaction tests.
 * Only a fixed no-userid day counter is stored.
 */
import {describe,it,expect} from 'vitest';
import {prisma} from '@gafus/prisma';
import {reserveObserveMetricsDailyQuota} from '@gafus/mobile-ota-server/diagnostics-observe-repository';

const isTemp=process.env.GAFUS_TELEMETRY_TEST_ISOLATED==='true'&&
 process.env.GAFUS_API_REALPG_ISOLATED==='1'&&
 /^postgresql:\/\/[^@\s]+@127\.0\.0\.1:65493\/gafus_refactor_telemetry_sdk57_qa\?schema=public$/.test(process.env.DATABASE_URL??'');
(isTemp?describe:describe.skip)('Observe preview metrics atomic PostgreSQL quota',()=>{
 it('charges only a fixed preview-observe-metrics aggregate, never user metadata',async()=>{
  const now=new Date();
  const day=new Date(now.toISOString().slice(0,10)+'T00:00:00Z');
  const where={environment_day:{environment:'preview-observe-metrics',day}};
  await prisma.mobileTelemetryDailyQuota.deleteMany({where:{environment:'preview-observe-metrics',day}});
  try{
   await reserveObserveMetricsDailyQuota(2,1000,now);
   await reserveObserveMetricsDailyQuota(3,900,now);
   const row=await prisma.mobileTelemetryDailyQuota.findUniqueOrThrow({where});
   expect(row.acceptedEvents).toBe(5);
   expect(row.acceptedBytes).toBe(1900n);
   expect(row.environment).toBe('preview-observe-metrics');
   await prisma.mobileTelemetryDailyQuota.update({
    where,data:{acceptedEvents:9999,acceptedBytes:8388500n},
   });
   await expect(reserveObserveMetricsDailyQuota(2,200,now))
    .rejects.toMatchObject({code:'OBSERVE_METRICS_DAILY_QUOTA_EXCEEDED',status:429});
   const unchanged=await prisma.mobileTelemetryDailyQuota.findUniqueOrThrow({where});
   expect(unchanged.acceptedEvents).toBe(9999);
   expect(unchanged.acceptedBytes).toBe(8388500n);
   await expect(reserveObserveMetricsDailyQuota(65,100,now))
    .rejects.toMatchObject({code:'OBSERVE_METRICS_QUOTA_ARGUMENT_INVALID',status:413});
  }finally{
   await prisma.mobileTelemetryDailyQuota.deleteMany({where:{environment:'preview-observe-metrics',day}});
  }
 });
});

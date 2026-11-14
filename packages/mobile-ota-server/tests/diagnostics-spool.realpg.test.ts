/** Strict 127.0.0.1:65493 isolated PG only; config denies any other database. */
import { randomUUID } from 'node:crypto';
import { describe,it,expect } from 'vitest';
import {prisma} from '@gafus/prisma';
import {
 claimTelemetrySpoolRow,finishTelemetrySpoolRow,findDueTelemetrySpoolRows,
 snapshotTelemetrySpool,purgeExpiredTelemetrySpool,snapshotTelemetrySpoolByService,
} from '@gafus/mobile-ota-server/diagnostics-spool-repository';

const isolated=process.env.GAFUS_TELEMETRY_TEST_ISOLATED==='true'&&
 process.env.GAFUS_API_REALPG_ISOLATED==='1'&&
 /127\.0\.0\.1:65493\/gafus_refactor_telemetry_sdk57_qa\?schema=public/.test(process.env.DATABASE_URL??'');
const suite=isolated?describe:describe.skip;
suite('GAFUS durable spool lease CAS and retention with real PostgreSQL',()=>{
 it('claims exactly once, ACK persists ID but discards raw payload',async()=>{
  const now=new Date();const runId='qa-'+randomUUID();
  const row=await prisma.mobileTelemetrySpool.create({data:{
   eventId:randomUUID(),environment:'preview',service:'gafus-mobile-android',
   platform:'android',eventKind:'js_fatal',severity:'FATAL',
   runtimeVersion:'1.8.0',updateId:'embedded',appVersion:'1.8.0',
   payload:{kind:'js_fatal',stack:'synthetic-frame'},availableAt:now,
   retentionUntil:new Date(now.getTime()+72*60*60_000),
  }});
  try{
   const scoped=await snapshotTelemetrySpoolByService('preview');
   expect(scoped).toHaveLength(18); // 6 fixed services x 3 bounded states
   expect(scoped.find(x=>x.service==='gafus-mobile-android'&&x.status==='PENDING')?.count)
     .toBeGreaterThanOrEqual(1);
   expect(scoped.filter(x=>!['PENDING','LEASED','DEAD'].includes(x.status))).toHaveLength(0);
   const due=await findDueTelemetrySpoolRows('preview',new Date(now.getTime()+1));
   expect(due.some(x=>x.id===row.id)).toBe(true);
   const claimed=await claimTelemetrySpoolRow(row.id,new Date(now.getTime()+1),'preview',runId);
   expect(claimed).toBe(true);
   expect(await claimTelemetrySpoolRow(row.id,new Date(now.getTime()+1),'preview','different-run')).toBe(false);
   expect(await finishTelemetrySpoolRow(row.id,'EXPORTED',new Date(now.getTime()+2),'different-run')).toBe(false);
   expect(await finishTelemetrySpoolRow(row.id,'EXPORTED',new Date(now.getTime()+2),runId)).toBe(true);
   const saved=await prisma.mobileTelemetrySpool.findUniqueOrThrow({where:{id:row.id}});
   expect(saved.status).toBe('EXPORTED');
   expect(saved.eventId).toBe(row.eventId);
   expect(saved.payload).toEqual({});
   expect(saved.exportedAt).not.toBeNull();
   expect(await claimTelemetrySpoolRow(row.id,new Date(now.getTime()+3),'preview',runId)).toBe(false);
  }finally{await prisma.mobileTelemetrySpool.deleteMany({where:{id:row.id}});}
 });
 it('auth failure retries without losing payload, safe DLQ is short lived',async()=>{
  const now=new Date();const runId='qa-'+randomUUID();
  const row=await prisma.mobileTelemetrySpool.create({data:{
   eventId:randomUUID(),environment:'preview',service:'gafus-mobile-ios',
   platform:'ios',eventKind:'js_fatal',severity:'FATAL',
   runtimeVersion:'1.8.0',updateId:'embedded',appVersion:'1.8.0',
   payload:{kind:'js_fatal',stack:'frame'},availableAt:now,
   retentionUntil:new Date(now.getTime()+72*60*60_000),
  }});
  try{
   expect(await claimTelemetrySpoolRow(row.id,new Date(now.getTime()+1),'preview',runId)).toBe(true);
   expect(await finishTelemetrySpoolRow(row.id,'PENDING',new Date(now.getTime()+2),runId,900_000,'OTLP_AUTH_CONFIGURATION')).toBe(true);
   let saved=await prisma.mobileTelemetrySpool.findUniqueOrThrow({where:{id:row.id}});
   expect(saved.status).toBe('PENDING');
   expect(saved.payload).toEqual({kind:'js_fatal',stack:'frame'});
   expect(saved.availableAt.getTime()).toBe(now.getTime()+2+900_000);
   expect(await claimTelemetrySpoolRow(row.id,new Date(now.getTime()+3),'preview',runId)).toBe(false);
   expect(await claimTelemetrySpoolRow(row.id,new Date(now.getTime()+2+900_000),'preview',runId)).toBe(true);
   expect(await finishTelemetrySpoolRow(row.id,'DEAD',new Date(now.getTime()+2+900_001),runId,0,'OTLP_PARTIAL_REJECT')).toBe(true);
   saved=await prisma.mobileTelemetrySpool.findUniqueOrThrow({where:{id:row.id}});
   expect(saved.payload).toEqual({kind:'js_fatal',stack:'frame'});
   expect(saved.retentionUntil.getTime()-now.getTime()).toBeLessThanOrEqual(24*60*60_000+900_100);
   const snapshot=await snapshotTelemetrySpool('preview',new Date(now.toISOString().slice(0,10)+'T00:00:00Z'));
   expect(snapshot.dead).toBeGreaterThanOrEqual(1);
  }finally{await prisma.mobileTelemetrySpool.deleteMany({where:{id:row.id}});}
 });
});

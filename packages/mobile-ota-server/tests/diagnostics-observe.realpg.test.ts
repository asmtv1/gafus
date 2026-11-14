/** Isolated PG only: SDK57 native Observe release scoping and durable dedup. */
import {describe,expect,it} from 'vitest';
import {prisma} from '@gafus/prisma';
import {observePreviewRepository,verifyObserveReleaseScopes} from '@gafus/mobile-ota-server/diagnostics-observe-repository';
import {normalizeObserveLogs} from '../../../apps/api/src/modules/mobile-telemetry/observe-normalizer.js';
const ISOLATED=process.env.GAFUS_API_REALPG_ISOLATED==='1' &&
  process.env.GAFUS_TELEMETRY_TEST_ISOLATED==='true' &&
  (process.env.DATABASE_URL??'').includes('127.0.0.1:65493/gafus_refactor_telemetry_sdk57_qa');
const attr=(key:string,stringValue:string)=>({key,value:{stringValue}});
(ISOLATED?describe:describe.skip)('SDK57 Expo Observe native preview real PostgreSQL',()=>{
 it('deduplicates normalized native crash; rejects unverified release',async()=>{
  const build=String(Math.floor(200000+Math.random()*700000));
  const sourceSha='e'.repeat(40);const nativeFingerprint='d'.repeat(64);
  const release=await prisma.mobileNativeRelease.create({data:{
    appId:'gafus',platform:'ios',environment:'preview',distribution:'internal',
    bundleId:'ru.gafus.app',appVersion:'1.8.0',buildNumber:build,runtimeVersion:'1.8.0',
    channel:'preview',updateUrl:'https://qa.invalid/ota/manifest',signingKeyId:'qa-key',
    certificateSha256:'c'.repeat(64),nativeFingerprint,sourceSha,verified:true,
  }});
  const raw={resourceLogs:[{resource:{attributes:[
    attr('os.type','darwin'),attr('expo.sdk.version','57.0.28'),
    attr('service.version','1.8.0'),attr('expo.app.build_number',build),
    attr('expo.app.updates.runtime_version','1.8.0'),attr('expo.app.updates.channel','preview'),
    attr('expo.eas_client.id','PRIVATE_NATIVE_DEVICE_KEY'),
  ]},scopeLogs:[{scope:{name:'expo-observe'},logRecords:[{
    timeUnixNano:(BigInt(Date.now())*1000000n).toString(),severityNumber:21,
    body:{stringValue:'BEARER_DO_NOT_STORE secret@example.com'},
    attributes:[attr('exception.type','NSException'),attr('event.name','native.crash'),
      attr('exception.stacktrace','NSException: bearer private@example.com\n at Crash.qa (https://secret.example/file?sig=123:25:8)')],
  }]}]}]};
  const normalized=normalizeObserveLogs(raw);
  const event=normalized.events[0]!;
  try{
    expect(normalized.events).toHaveLength(1);
    await expect(verifyObserveReleaseScopes(normalized.scopes)).resolves.toBeUndefined();
    await expect(verifyObserveReleaseScopes([{...normalized.scopes[0]!,build:'unverified-build'}]))
      .rejects.toMatchObject({code:'OBSERVE_RELEASE_NOT_VERIFIED'});
    expect(await observePreviewRepository.store(normalized.events,normalized.scopes)).toBe(1);
    expect(await observePreviewRepository.store(normalized.events,normalized.scopes)).toBe(0);
    const spool=await prisma.mobileTelemetrySpool.findFirstOrThrow({where:{eventId:event.eventId}});
    expect(spool.status).toBe('PENDING');expect(spool.service).toBe('gafus-mobile-ios');
    expect(JSON.stringify(spool.payload)).not.toMatch(/PRIVATE_NATIVE|BEARER_DO_NOT_STORE|secret@example|private@example|sig=123|secret.example/);
    const mutated={...normalized.scopes[0]!,build:'9999999'};
    await expect(observePreviewRepository.store(normalized.events,[mutated])).rejects.toMatchObject({code:'OBSERVE_RELEASE_NOT_VERIFIED'});
  }finally{
    await prisma.mobileTelemetrySpool.deleteMany({where:{eventId:event.eventId}});
    await prisma.mobileNativeRelease.delete({where:{id:release.id}});
  }
 });
});

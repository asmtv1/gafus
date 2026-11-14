/** Real isolated 127.0.0.1:65493 release verification -> Hono metrics
 * -> Uptrace Cloud 9383 -> PromQL readback. All data is synthetic.
 */
import {randomUUID} from 'node:crypto';
import {Hono} from 'hono';
import {prisma} from '@gafus/prisma';
import {createObservePreviewRoutes} from '../../apps/api/src/routes/v1/mobile-observe-preview.ts';
import {readCanaryDsn} from './uptrace-nonprod-canary.mjs';
import {readViewerToken,fetchReadOnlyJson} from './uptrace-read.mjs';
import {homedir} from 'node:os';
import {join} from 'node:path';

const db=process.env.DATABASE_URL??'';
if(!/^postgresql:\/\/[^@\s]+@127\.0\.0\.1:65493\/gafus_refactor_telemetry_sdk57_qa\?schema=public$/.test(db)||
   process.env.GAFUS_TELEMETRY_TEST_ISOLATED!=='true'||
   process.env.GAFUS_API_REALPG_ISOLATED!=='1')throw Error('NONPROD_METRIC_E2E_DB_ISOLATION_REQUIRED');
const P='6c36fab5-6226-450f-8ee5-64e9beeea7db';
const random=String(Math.floor(1000000+Math.random()*8000000));
const release=await prisma.mobileNativeRelease.create({data:{
 appId:'gafus',platform:'android',environment:'preview',distribution:'internal',
 bundleId:'ru.gafus.app',appVersion:'1.8.0',buildNumber:random,runtimeVersion:'1.8.0',
 channel:'preview',updateUrl:'https://qa.invalid/ota/manifest',
 signingKeyId:'qa-key',certificateSha256:'d'.repeat(64),
 nativeFingerprint:'e'.repeat(64),sourceSha:'a'.repeat(40),verified:true,
}});
const attr=(key:string,stringValue:string)=>({key,value:{stringValue}});
const raw=(build:string)=>({resourceMetrics:[{resource:{attributes:[
 attr('os.type','linux'),attr('expo.sdk.version','57.0.28'),
 attr('service.version','1.8.0'),attr('expo.app.build_number',build),
 attr('expo.app.updates.runtime_version','1.8.0'),
 attr('expo.app.updates.channel','preview'),
 attr('session.id','SYNTHETIC_DO_NOT_FORWARD'),
]},scopeMetrics:[{scope:{name:'expo-observe'},metrics:[{
 name:'expo.app_startup.tti',unit:'s',gauge:{dataPoints:[{
  timeUnixNano:(BigInt(Date.now())*1000000n).toString(),asDouble:0.47,
  attributes:[attr('expo.route_name','/private/restricted-user/abc')],
 }]},
}]}]}]});
const dsn=await readCanaryDsn();
const env={
 GAFUS_OBSERVE_EXPERIMENT_INGEST_ENABLED:'true',
 GAFUS_OBSERVE_METRICS_ENABLED:'true',
 GAFUS_TELEMETRY_ENVIRONMENT:'preview',
 GAFUS_OBSERVE_EXPERIMENT_PROJECT_ID:P,
 UPTRACE_DSN:dsn,
};
const app=new Hono().route('/api/v1/telemetry/observe',createObservePreviewRoutes({env}));
const url='https://api.gafus.ru/api/v1/telemetry/observe/'+P+'/v1/metrics';
const headers={'content-type':'application/json'};
try{
 const day=new Date(new Date().toISOString().slice(0,10)+'T00:00:00Z');
 const quotaWhere={environment_day:{environment:'preview-observe-metrics',day}};
 const invalid=await app.request(url,{method:'POST',headers,body:JSON.stringify(raw('wrong-build'))});
 if(invalid.status!==403)throw Error('NATIVE_RELEASE_GUARD_FAILED');
 if(await prisma.mobileTelemetryDailyQuota.findUnique({where:quotaWhere}))
  throw Error('UNVERIFIED_METRIC_RELEASE_CHARGED');
 const sent=await app.request(url,{method:'POST',headers,body:JSON.stringify(raw(random))});
 if(sent.status!==200)throw Error('OBSERVE_METRIC_REAL_HONO_ACK_FAILED');
 const quota=await prisma.mobileTelemetryDailyQuota.findUniqueOrThrow({where:quotaWhere});
 if(quota.acceptedEvents!==1||quota.acceptedBytes<=0n)
  throw Error('METRIC_BUDGET_NOT_RESERVED_BEFORE_ACK');
 const token=await readViewerToken(join(homedir(),'.config/gafus-observability/uptrace-read.token'));
 let found=false;
 for(let i=0;i<16;i++){
  const query=new URL('https://api.uptrace.dev/api/prometheus/9383/api/v1/query');
  query.searchParams.set('query','expo_app_startup_tti');
  const cloud=await fetchReadOnlyJson(query,token);
  found=(cloud.data?.result??[]).some((r:{value?:unknown[],metric?:{service_name?:string}})=>
   Array.isArray(r.value)&&Number(r.value[1])===0.47&&
   Number(r.value[0])*1000>=Date.now()-90_000);
  if(found)break;
  await new Promise(resolve=>setTimeout(resolve,1200));
 }
 console.log(JSON.stringify({project:9383,isolatedPostgres:true,
  nativeReleaseVerified:true,wrongBuildRejected:invalid.status===403,
  atomicDailyPointsReserved:quota.acceptedEvents,cloudMetricReadback:found,
  hmapApiAck:sent.status===200,synthetic:true}));
 if(!found)process.exitCode=3;
}finally{
 await prisma.mobileNativeRelease.delete({where:{id:release.id}});
 await prisma.$disconnect();
}

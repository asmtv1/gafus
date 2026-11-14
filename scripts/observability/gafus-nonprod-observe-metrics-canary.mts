/** Real but harmless Expo Observe-compatible synthetic metrics to 9383.
 * This does NOT imply a real native SDK build, signed release, or ANR capture.
 */
import {readCanaryDsn} from './uptrace-nonprod-canary.mjs';
import {readViewerToken,fetchReadOnlyJson} from './uptrace-read.mjs';
import {normalizeObserveMetrics,exportObserveMetrics}
  from '../../apps/api/src/modules/mobile-telemetry/observe-metrics.ts';
import {homedir} from 'node:os';
import {join} from 'node:path';
const attr=(key:string,stringValue:string)=>({key,value:{stringValue}});
const time=(BigInt(Date.now())*1000000n).toString();
const raw={resourceMetrics:[{resource:{attributes:[
 attr('os.type','darwin'),attr('expo.sdk.version','57.0.28'),
 attr('service.version','1.8.0'),attr('expo.app.build_number','25'),
 attr('expo.app.updates.runtime_version','1.8.0'),
 attr('expo.app.updates.channel','preview'),
]},scopeMetrics:[{scope:{name:'expo-observe'},metrics:[{
 name:'expo.app_startup.tti',unit:'s',
 gauge:{dataPoints:[{timeUnixNano:time,asDouble:0.38,
 attributes:[attr('session.id','SYNTHETIC_PRIVATE_VALUE_REMOVED')]}]},
}]}]}]};
const sanitized=normalizeObserveMetrics(raw);
const encoded=JSON.stringify(sanitized.payload);
if(encoded.includes('SYNTHETIC_PRIVATE_VALUE_REMOVED'))
  throw Error('PII_SANITIZATION_FAILED');
const dsn=await readCanaryDsn();
const result=await exportObserveMetrics(sanitized,{
 env:{GAFUS_OBSERVE_METRICS_ENABLED:'true',
 GAFUS_TELEMETRY_ENVIRONMENT:'preview',UPTRACE_DSN:dsn},
});
if(!result.ok)throw Error('OBSERVE_METRIC_CLOUD_EXPORT_FAILED');
const token=await readViewerToken(join(homedir(),'.config/gafus-observability/uptrace-read.token'));
let confirmed=false;
for(let i=0;i<14;i++){
 const url=new URL('https://api.uptrace.dev/api/prometheus/9383/api/v1/query');
 url.searchParams.set('query','expo_app_startup_tti');
 const reply=await fetchReadOnlyJson(url,token);
 confirmed=(reply.data?.result??[]).some((r:{value?:unknown[]})=>
  Array.isArray(r.value)&&Number(r.value[1])===0.38&&
  Number(r.value[0])*1000>=Date.now()-90_000);
 if(confirmed)break;
 await new Promise(resolve=>setTimeout(resolve,1200));
}
console.log(JSON.stringify({project:9383,signal:'expo.app_startup.tti',
  synthetic:true,uptraceAccepted:result.ok,readback:confirmed,
  userDimensionsExported:false}));
if(!confirmed)process.exitCode=3;

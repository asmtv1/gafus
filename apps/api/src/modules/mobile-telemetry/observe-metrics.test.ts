import {describe,it,expect,vi} from 'vitest';
import {normalizeObserveMetrics,exportObserveMetrics} from './observe-metrics.js';
const now=Date.now();
const attr=(key:string,stringValue:string)=>({key,value:{stringValue}});
const payload=(name='expo.app_startup.tti')=>({
 resourceMetrics:[{
  resource:{attributes:[
   attr('os.type','darwin'),attr('expo.sdk.version','57.0.28'),
   attr('service.version','1.8.0'),attr('expo.app.build_number','25'),
   attr('expo.app.updates.runtime_version','1.8.0'),
   attr('expo.app.updates.channel','preview'),
   attr('session.id','private-device-session'),
  ]},
  scopeMetrics:[{scope:{name:'expo-observe'},metrics:[{
   name,unit:'s',gauge:{dataPoints:[{
    timeUnixNano:(BigInt(now)*1000000n).toString(),asDouble:1.25,
    attributes:[attr('expo.route_name','/private/user/secret'),
      attr('expo.custom_params','token=my-secret')],
   }]},
  }]}],
 }],
});
const env={GAFUS_OBSERVE_METRICS_ENABLED:'true',
 GAFUS_TELEMETRY_ENVIRONMENT:'preview',UPTRACE_DSN:'SYNTHETIC_NONPROD_TOKEN_123'};
describe('Expo Observe metrics privacy and OTLP ACK',()=>{
 it('removes all user, route, device, session dimensions',()=>{
  const safe=normalizeObserveMetrics(payload(),now);
  expect(safe.metricPoints).toBe(1);
  expect(safe.scopes).toEqual([{
   platform:'ios',appVersion:'1.8.0',build:'25',
   runtime:'1.8.0',channel:'preview',environment:'preview',
  }]);
  const encoded=JSON.stringify(safe.payload);
  expect(encoded).toContain('expo.app_startup.tti');
  expect(encoded).toContain('gafus-mobile-ios');
  expect(encoded).not.toMatch(/private-device-session|private\/user|my-secret|session.id|expo.custom_params|expo.route_name/);
  expect(safe.payload.resourceMetrics[0]?.scopeMetrics[0]?.metrics[0]?.gauge.dataPoints[0]?.asDouble).toBe(1.25);
 });
 it('fails closed on unknown names, values and dynamic payload fields',()=>{
  expect(()=>normalizeObserveMetrics(payload('expo.unknown.user123'),now)).toThrow('OBSERVE_METRIC_NOT_ALLOWED');
  const out=payload();out.resourceMetrics[0]!.scopeMetrics[0]!.metrics[0]!.gauge.dataPoints[0]!.asDouble=-1;
  expect(()=>normalizeObserveMetrics(out,now)).toThrow('OBSERVE_METRIC_VALUE_OUT_OF_RANGE');
  const rogue=payload() as unknown as {resourceMetrics:Array<{scopeMetrics:Array<{metrics:Array<{histogram?:unknown}>}>}>};
  rogue.resourceMetrics[0]!.scopeMetrics[0]!.metrics[0]!.histogram={dataPoints:[{attributes:[attr('user.id','secret')]}]};
  expect(()=>normalizeObserveMetrics(rogue,now)).toThrow('OBSERVE_METRIC_NOT_ALLOWED');
 });
 it('requires explicit preview and DSN, never uses production endpoint',async()=>{
  const safe=normalizeObserveMetrics(payload(),now);
  expect(await exportObserveMetrics(safe,{env:{}})).toMatchObject({ok:false,status:503});
  expect(await exportObserveMetrics(safe,{env:{...env,GAFUS_TELEMETRY_ENVIRONMENT:'production'}}))
   .toMatchObject({ok:false,status:503});
  const sent=vi.fn(async(url:string,options:RequestInit)=>{
   expect(url).toBe('https://api.uptrace.dev/v1/metrics');
   expect(options.redirect).toBe('error');
   expect(options.headers).toMatchObject({'uptrace-dsn':env.UPTRACE_DSN});
   expect(String(options.body)).not.toContain(env.UPTRACE_DSN);
   return new Response('{}',{status:200,headers:{'content-type':'application/json'}});
  });
  expect(await exportObserveMetrics(safe,{env,fetchImpl:sent as typeof fetch})).toEqual({ok:true,status:200});
  expect(sent).toHaveBeenCalledOnce();
 });
 it('rejects partial success and never lies to native sender about storage',async()=>{
  const safe=normalizeObserveMetrics(payload(),now);
  const partial=vi.fn(async()=>new Response('{"partialSuccess":{"rejectedDataPoints":1}}',
    {status:200,headers:{'content-type':'application/json'}}));
  expect(await exportObserveMetrics(safe,{env,fetchImpl:partial as typeof fetch}))
   .toMatchObject({ok:false,status:503,errorCode:'OBSERVE_METRICS_PARTIAL_ACK'});
  const bad=vi.fn(async()=>new Response('bad-json',{status:200}));
  expect(await exportObserveMetrics(safe,{env,fetchImpl:bad as typeof fetch}))
   .toMatchObject({ok:false,status:503,errorCode:'OBSERVE_METRICS_ACK_INVALID'});
  const auth=vi.fn(async()=>new Response('bad key',{status:401}));
  expect(await exportObserveMetrics(safe,{env,fetchImpl:auth as typeof fetch}))
   .toMatchObject({ok:false,status:503,errorCode:'OBSERVE_METRICS_AUTH_CONFIGURATION'});
 });
});

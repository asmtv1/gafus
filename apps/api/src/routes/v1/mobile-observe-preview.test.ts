import {describe,it,expect,vi} from 'vitest';
import {createObservePreviewRoutes} from './mobile-observe-preview.js';
import {TelemetryIngressRateGate} from '../../modules/mobile-telemetry/ingest.js';
import type {ObservePreviewRepository} from '../../modules/mobile-telemetry/observe-repository.js';
const P='6c36fab5-6226-450f-8ee5-64e9beeea7db';
const attr=(key:string,stringValue:string)=>({key,value:{stringValue}});
const payload=()=>({resourceLogs:[{resource:{attributes:[
  attr('os.type','darwin'),attr('expo.sdk.version','57.0.28'),
  attr('service.version','1.8.0'),attr('expo.app.build_number','25'),
  attr('expo.app.updates.runtime_version','1.8.0'),
  attr('expo.app.updates.channel','preview'),
 ]},scopeLogs:[{scope:{name:'expo-observe'},logRecords:[{
  timeUnixNano:(BigInt(Date.now())*1_000_000n).toString(),severityNumber:21,
  body:{stringValue:'secret@example.com user private'},
  attributes:[attr('session.id','secret-user-session'),attr('exception.type','TypeError'),
  attr('event.name','native.crash'),attr('exception.stacktrace','Error: private@example.com\n at UI (https://example.com/a?token=123:12:15)')],
 }]}]}]});
const env={GAFUS_OBSERVE_EXPERIMENT_INGEST_ENABLED:'true',
 GAFUS_TELEMETRY_ENVIRONMENT:'preview',GAFUS_OBSERVE_EXPERIMENT_PROJECT_ID:P};
const make=()=>{
 const repo:ObservePreviewRepository={store:vi.fn(async()=>1)};
 return {repo,app:createObservePreviewRoutes({repo,env,gate:new TelemetryIngressRateGate(20,20)})};
};
describe('Observe preview bounded OTLP ingress',()=>{
 it('is disabled without opt-in and never responds to unknown project id',async()=>{
  const {repo}=make();
  const disabled=createObservePreviewRoutes({repo,env:{}});
  expect((await disabled.request(`/${P}/v1/logs`,{method:'POST'})).status).toBe(503);
  expect((await createObservePreviewRoutes({repo,env}).request('/wrong/v1/logs',{method:'POST'})).status).toBe(503);
 });
 it('only acknowledges normalized errors and never logs raw private bodies',async()=>{
  const {app,repo}=make();
  const response=await app.request(`/${P}/v1/logs`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload())});
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  const sent=JSON.stringify((repo.store as ReturnType<typeof vi.fn>).mock.calls);
  expect(sent).not.toMatch(/example.com|secret-user-session|private@example|token=123/);
  expect(sent).toContain('bundle:12:15');
 });
 it('only acknowledges a safe metric after release verification and upstream OTLP ACK',async()=>{
  const repo:ObservePreviewRepository={store:vi.fn(async()=>1)};
  const verifyReleaseScopes=vi.fn(async()=>undefined);
  const reserveMetricQuota=vi.fn(async()=>undefined);
  const exportMetrics=vi.fn(async()=>({ok:true,status:200}));
  const route=createObservePreviewRoutes({
   env:{...env,GAFUS_OBSERVE_METRICS_ENABLED:'true'},repo,gate:new TelemetryIngressRateGate(20,20),
   verifyReleaseScopes,reserveMetricQuota,exportMetrics,
  });
  const native=payload();
  const metricBody={
   resourceMetrics:native.resourceLogs.map(item=>({
    resource:item.resource,
    scopeMetrics:[{scope:{name:'expo-observe'},metrics:[{
     name:'expo.app_startup.tti',unit:'s',gauge:{dataPoints:[{
      timeUnixNano:(BigInt(Date.now())*1_000_000n).toString(),asDouble:0.75,
      attributes:[attr('session.id','user-secret'),attr('expo.custom_params','private-chat')],
     }]},
    }]}],
   })),
  };
  const res=await route.request(`/${P}/v1/metrics`,{
   method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify(metricBody),
  });
  expect(res.status).toBe(200);
  expect(verifyReleaseScopes).toHaveBeenCalledOnce();
  expect(reserveMetricQuota).toHaveBeenCalledOnce();
  expect(exportMetrics).toHaveBeenCalledOnce();
  const safe=JSON.stringify(exportMetrics.mock.calls);
  expect(safe).not.toMatch(/user-secret|private-chat|session.id/);
  expect(safe).toContain('gafus-mobile-ios');

  const rejected=createObservePreviewRoutes({
   env:{...env,GAFUS_OBSERVE_METRICS_ENABLED:'true'},repo,gate:new TelemetryIngressRateGate(20,20),
   verifyReleaseScopes,reserveMetricQuota,exportMetrics:vi.fn(async()=>({ok:false,status:503,errorCode:'UPSTREAM_FAIL'})),
  });
  expect((await rejected.request(`/${P}/v1/metrics`,{
   method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify(metricBody),
  })).status).toBe(503);
 });
 it('explicitly refuses metrics and compressed requests',async()=>{
  const {app}=make();
  expect((await app.request(`/${P}/v1/metrics`,{method:'POST'})).status).toBe(501);
  const encoded=await app.request(`/${P}/v1/logs`,{method:'POST',headers:{'content-type':'application/json','content-encoding':'gzip'},body:'x'});
  expect(encoded.status).toBe(415);
 });
});

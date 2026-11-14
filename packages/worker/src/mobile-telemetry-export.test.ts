import {describe,expect,it,vi} from 'vitest';
import {buildMobileOtlpLog,exportMobileTelemetryEvent,mobileOtlpLogsUrl,mobileTelemetryBackoffMs} from './mobile-telemetry-export';
const event=()=>({schemaVersion:1,eventId:'b6b9dc0d-7e53-4da4-8f20-910fd3520be6',
 appStartId:'b6b9dc0d-7e53-4da4-8f20-910fd3520be7',platform:'android',kind:'js_fatal',severity:'FATAL',
 occurredAt:new Date().toISOString(),appVersion:'1.8.0',build:'25',runtime:'1.8.0',channel:'preview',
 updateId:'embedded',exceptionType:'TypeError',errorCode:'TEST_FATAL',
 stack:'Error: api-key: SECRET https://host/path?id=123 user@example.com\n at MyFunction (https://host/private.js:123:14)',
 traceparent:'00-0123456789abcdef0123456789abcdef-0123456789abcdef-01',
});
const row=()=>({eventId:event().eventId,environment:'preview',service:'gafus-mobile-android',payload:event(),attempts:0});
describe('SDK57 sanitized OTLP logs exporter',()=>{
 it('exports only safe release attributes and function offsets, never raw error messages',()=>{
  const encoded=JSON.stringify(buildMobileOtlpLog(row()));
  expect(encoded).toContain('gafus-mobile-android');
  expect(encoded).toContain('MyFunction');
  expect(encoded).toContain('TEST_FATAL');
  expect(encoded).toContain('0123456789abcdef0123456789abcdef');
  expect(encoded).not.toMatch(/SECRET|user@example|host\/private|api-key|path\?id=/);
 });
 it('rejects forged unknown payload fields before any vendor export',()=>{
  expect(()=>buildMobileOtlpLog({...row(),payload:{...event(),userId:'secret'}}))
    .toThrow('TELEMETRY_UNKNOWN_FIELD');
 });
 it('only accepts HTTPS/localhost and valid logs URLs',()=>{
  expect(mobileOtlpLogsUrl({OTEL_EXPORTER_OTLP_ENDPOINT:'https://api.uptrace.dev:4318'}))
    .toBe('https://api.uptrace.dev:4318/v1/logs');
  expect(mobileOtlpLogsUrl({OTEL_EXPORTER_OTLP_ENDPOINT:'http://uptrace.dev'})).toBeNull();
  expect(mobileOtlpLogsUrl({OTEL_EXPORTER_OTLP_LOGS_ENDPOINT:'http://localhost:4318/v1/logs'}))
    .toBe('http://localhost:4318/v1/logs');
  expect(mobileOtlpLogsUrl({OTEL_EXPORTER_OTLP_LOGS_ENDPOINT:'https://attacker.example/v1/logs'}))
    .toBeNull();

 });
 it('sends Uptrace DSN only as header and confirms full success',async()=>{
  const f=vi.fn(async (_url:string,_init:RequestInit)=>new Response('{}',{status:200,headers:{'content-type':'application/json'}}));
  const result=await exportMobileTelemetryEvent(row(),{endpoint:'https://uptrace.dev/v1/logs',dsn:'TEST-SECRET-DSN',fetchFn:f as typeof fetch});
  expect(result).toEqual({kind:'exported'});
  const args=f.mock.calls[0];
  expect(args?.[1]?.headers).toMatchObject({'uptrace-dsn':'TEST-SECRET-DSN'});
  expect(args?.[1]?.redirect).toBe('error'); // Never forward credentials to a 302 host.
  expect(args?.[1]?.body).not.toContain('TEST-SECRET-DSN');
 });
 it('never DLQs events on 401/403 ingest credential failures',async()=>{
  for(const status of [401,403]){
    const denied=vi.fn(async()=>new Response('',{status}));
    expect(await exportMobileTelemetryEvent(row(),{
      endpoint:'https://uptrace.dev/v1/logs',dsn:'TEST-SECRET-DSN',fetchFn:denied as typeof fetch,
    })).toEqual({kind:'suspended',code:'OTLP_AUTH_CONFIGURATION'});
  }
 });
 it('retries 429 and network failures with bounded backoff, never mis-ACKs partial',async()=>{
  const retry=vi.fn(async()=>new Response('',{status:429,headers:{'retry-after':'2'}}));
  const result=await exportMobileTelemetryEvent(row(),{endpoint:'https://uptrace.dev/v1/logs',dsn:'TEST-SECRET-DSN',fetchFn:retry as typeof fetch});
  expect(result.kind).toBe('retry');
  if(result.kind==='retry')expect(result.delayMs).toBeGreaterThanOrEqual(2000);
  const partial=vi.fn(async()=>new Response('{"partialSuccess":{"rejectedLogRecords":1}}',
    {status:200,headers:{'content-type':'application/json'}}));
  expect(await exportMobileTelemetryEvent(row(),{endpoint:'https://uptrace.dev/v1/logs',dsn:'TEST-SECRET-DSN',fetchFn:partial as typeof fetch}))
   .toEqual({kind:'dead',code:'OTLP_PARTIAL_REJECT'});
  expect(mobileTelemetryBackoffMs(100,row().eventId)).toBeLessThanOrEqual(900000);
  const malformed=vi.fn(async()=>new Response('{broken-json',
    {status:200,headers:{'content-type':'application/json'}}));
  expect(await exportMobileTelemetryEvent(row(),{endpoint:'https://uptrace.dev/v1/logs',dsn:'TEST-SECRET-DSN',fetchFn:malformed as typeof fetch}))
    .toMatchObject({kind:'retry',code:'OTLP_UNKNOWN_ACK'});
  const empty=vi.fn(async()=>new Response('',
    {status:200,headers:{'content-type':'application/json'}}));
  expect(await exportMobileTelemetryEvent(row(),{endpoint:'https://uptrace.dev/v1/logs',dsn:'TEST-SECRET-DSN',fetchFn:empty as typeof fetch}))
    .toEqual({kind:'exported'});
 });
});

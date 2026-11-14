import {describe,it,expect} from 'vitest';
import {normalizeObserveLogs} from './observe-normalizer.js';
const attr=(key:string,stringValue:string)=>({key,value:{stringValue}});
const input=()=>({resourceLogs:[{resource:{attributes:[
 attr('os.type','darwin'),attr('expo.sdk.version','57.0.33'),
 attr('service.version','1.8.0'),attr('expo.app.build_number','14'),
 attr('expo.app.updates.runtime_version','1.8.0'),
 attr('expo.app.updates.channel','preview'),
 attr('expo.eas_client.id','DEVICE-SECRET-999'),
 attr('user.id','PRIVATE-USER-ID'),
 ]},scopeLogs:[{scope:{name:'expo-observe'},logRecords:[{
 timeUnixNano:(BigInt(Date.now())*1_000_000n).toString(),severityNumber:21,
 body:{stringValue:'secret@example.com; bearer SecretJWT'},
 attributes:[attr('session.id','random-session-uuid'),attr('exception.type','TypeError'),
 attr('event.name','app.crash'),
 attr('exception.stacktrace','Error: secret@example.com\n at Videos.play (https://api.example/path?token=secret:101:22)'),
 attr('user.email','secret@example.com')],
 }]}]}]});
describe('Expo Observe native SDK57 OTLP preview normalizer',()=>{
 it('scrubs unauthorized metadata, bodies, device ID, and preserves bounded stack',()=>{
  const data=normalizeObserveLogs(input());
  expect(data.events).toHaveLength(1);
  expect(data.events[0]?.kind).toBe('native_crash');
  expect(data.events[0]?.exceptionType).toBe('TypeError');
  expect(data.events[0]?.stack).toContain('bundle:101:22');
  expect(JSON.stringify(data.events)).not.toMatch(/DEVICE-SECRET|PRIVATE-USER|SecretJWT|example\.com|secret@example|token=secret|random-session-uuid/);
 });
 it('generates same event id for an identical retry',()=>{
  const raw=input();
  const first=normalizeObserveLogs(raw).events[0];
  const second=normalizeObserveLogs(raw).events[0];
  expect(first?.eventId).toBe(second?.eventId);
 });
 it('rejects arbitrary non-SDK57 and invalid runtime or channel',()=>{
  const wrong=input();wrong.resourceLogs[0]!.resource.attributes[1]!.value.stringValue='55.0.32';
  expect(()=>normalizeObserveLogs(wrong)).toThrow('OBSERVE_SDK_NOT_57');
  const prod=input();prod.resourceLogs[0]!.resource.attributes[5]!.value.stringValue='production';
  expect(()=>normalizeObserveLogs(prod)).toThrow('OBSERVE_RELEASE_METADATA_REQUIRED');
 });
 it('drops nonerror log payload and rejects unsupported scope',()=>{
  const raw=input();raw.resourceLogs[0]!.scopeLogs[0]!.logRecords[0]!.severityNumber=9;
  const normalized=normalizeObserveLogs(raw);expect(normalized.events).toHaveLength(0);
  expect(normalized.rejectedLogCount).toBe(1);
  const bad=input();bad.resourceLogs[0]!.scopeLogs[0]!.scope.name='untrusted';
  expect(()=>normalizeObserveLogs(bad)).toThrow('OBSERVE_UNEXPECTED_SCOPE');
 });
});

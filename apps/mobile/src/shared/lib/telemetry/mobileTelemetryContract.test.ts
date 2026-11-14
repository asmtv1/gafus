import { describe, expect, it } from 'vitest';
import { parseMobileTelemetryBatch, parseMobileTelemetryEvent, sanitizeMobileStack, parseMobileTraceparent } from '@gafus/types';
const event = () => ({
  schemaVersion: 1 as const,
  eventId: 'b6b9dc0d-7e53-4da4-8f20-910fd3520be6',
  appStartId: 'b6b9dc0d-7e53-4da4-8f20-910fd3520be7',
  platform: 'android', kind: 'js_handled', severity: 'ERROR',
  occurredAt: new Date().toISOString(), appVersion: '1.8.0', build: '24',
  runtime: '1.8.0', channel: 'preview', updateId: 'embedded',
  errorCode: 'VIDEO_PROBE_FAILED',
  stack: 'Error: signed https://cdn.private/path?X-Amz-Signature=secret user@example.com\n    at VideoProbe (https://cdn.private/bundle.js:123:45)\n  at GalleryUpload (file:///Users/person/hidden.ts:345:67)',
});
describe('SDK57 mobile telemetry allowlist and PII policy', () => {
 it('retains map offsets without URLs, credentials, email or absolute paths', () => {
   const e = parseMobileTelemetryEvent(event());
   expect(e.stack).toContain('bundle:123:45');
   expect(e.stack).toContain('bundle:345:67');
   expect(e.stack).not.toMatch(/https:|private|signed|secret|person|user@|X-Amz|Users/);
   expect(JSON.stringify(e)).not.toMatch(/person|secret|user@/);
 });
 it('refuses arbitrary user context and identity in nested payload', () => {
   expect(() => parseMobileTelemetryEvent({...event(), userId:'private'})).toThrow('TELEMETRY_UNKNOWN_FIELD');
   expect(() => parseMobileTelemetryBatch({...{schemaVersion:1,events:[event()]}, authorization: 'Bearer secret'})).toThrow('TELEMETRY_BATCH_SCHEMA');
 });
 it('rejects duplicate IDs, too many events and invalid time', () => {
   expect(() => parseMobileTelemetryBatch({schemaVersion:1,events:[event(),event()]})).toThrow('TELEMETRY_BATCH_DUPLICATE_ID');
   expect(() => parseMobileTelemetryBatch({schemaVersion:1,events:Array.from({length:51}, event)})).toThrow('TELEMETRY_BATCH_SIZE');
   expect(() => parseMobileTelemetryEvent({...event(),occurredAt:'2020-11-13T00:00:00.000Z'})).toThrow('TELEMETRY_EVENT_TIME_WINDOW');
 });
 it('never trusts W3C flags as an authorization token', () => {
   expect(parseMobileTraceparent('00-00000000000000000000000000000000-0123456789abcdef-01')).toBeUndefined();
   expect(parseMobileTraceparent('00-0123456789abcdef0123456789abcdef-0123456789abcdef-01')).toEqual('00-0123456789abcdef0123456789abcdef-0123456789abcdef-01');
 });
 it('discards arbitrary text and raw OS dumps', () => {
   const stack=sanitizeMobileStack('Token: session-secret\nregisters: r0 = 12345\n at MyClass.method(MyFile.kt:120)\nlibfoo.so+0x2ab');
   expect(stack).not.toMatch(/secret|registers|r0/);
   expect(stack).toContain('libfoo.so+0x2ab');
 });
});

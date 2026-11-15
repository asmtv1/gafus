import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sanitizeMobileStack,parseMobileTelemetryEvent} from './mobileTelemetry.js';

test('MetricKit binary offsets and safe symbols survive without addresses or private text',()=>{
 const frames=sanitizeMobileStack([
  'EXC_BAD_ACCESS at secret@example.com /Users/private/notes',
  'applicationDidBecomeActive (Gafus + 19160)',
  'Gafus + 2048',
  '0x0000000100abcdef',
 ].join('\n'));
 assert.equal(frames,'Gafus!applicationDidBecomeActive+0x4ad8\nGafus+0x800');
 assert(!frames?.includes('private'));
});
test('Android Kotlin class methods and source lines are bounded',()=>{
 const frames=sanitizeMobileStack('at ru.gafus.mobile.Camera.upload(Camera.kt:45)\njava.lang.Thread.run');
 assert.equal(frames,'at ru.gafus.mobile.Camera.upload (native:45)\nat java.lang.Thread.run (native)');
});
test('new native-crash record passes same strict client schema as JS errors',()=>{
 const now=new Date().toISOString();
 const event=parseMobileTelemetryEvent({
  schemaVersion:1,eventId:'b6b9dc0d-7e53-4da4-8f20-910fd3520be6',
  appStartId:'bd13130e-62ad-4ce2-b3ab-dde0c5c8c566',platform:'ios',
  kind:'native_crash',severity:'FATAL',occurredAt:now,appVersion:'1.7.5',build:'175',
  runtime:'1.7.5',channel:'production',updateId:'embedded',
  errorCode:'NATIVE_CRASH',stack:'applicationDidBecomeActive (Gafus + 19160)',
 });
 assert.equal(event.stack,'Gafus!applicationDidBecomeActive+0x4ad8');
});

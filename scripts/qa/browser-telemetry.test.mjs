import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeBrowserFrames,startBrowserTelemetry,reportBrowserDiagnostic,
} from '../../packages/error-handling/dist/browserTelemetry.js';

test('browser errors strip full URLs, auth tokens, query, and message body',()=>{
  const e=new Error('Authorization Bearer PRIVATE-JWT secret@example.com lat=52.12');
  e.stack=`Error: PRIVATE-JWT secret@example.com lat=52.12
    at uploadFrame (https://cdn.example/foo/private/user123.js?token=PRIVATE-JWT:123:56)
    at anonymous (https://cdn.example/assets/chunk.abc.js?sig=signed-secret:2:3)
    unexpected secret@example.com https://gafus.ru/private`;
  const safe=sanitizeBrowserFrames(e);
  assert.equal(safe,'at uploadFrame (bundle:123:56)\nat anonymous (bundle:2:3)');
  assert.doesNotMatch(safe,/PRIVATE|user123|secret@example|cdn\.example|token|\/private|gafus\.ru|lat=/);
});
test('browser sanitizer fails closed for non-errors and path-only stacks',()=>{
  assert.equal(sanitizeBrowserFrames('my private body'),undefined);
  assert.equal(sanitizeBrowserFrames({stack:'secret'}),undefined);
  const e=new Error('other');
  e.stack='Error: secret\n  at malicious (<file:///Users/secret/raw-path>)';
  assert.equal(sanitizeBrowserFrames(e),undefined);
});
test('SSR and disabled collector have no browser side effects',()=>{
  assert.equal(startBrowserTelemetry({
    service:'gafus-web',enabled:true,appVersion:'1.7.3',build:'a'.repeat(40),
  }),false);
  reportBrowserDiagnostic(new Error('JWT abc'));
});

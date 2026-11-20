import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {inspectMaestroFlow} from './mobile-maestro-flow.mjs';
const root=resolve(import.meta.dirname,'../..');
const fixture={login:'common/login.yaml','android-ota':'android/mandatory-ota.yaml','ios-ota':'ios/mandatory-ota.yaml'};
const source=(kind)=>readFileSync(resolve(root,'tests/e2e/mobile/flows',fixture[kind]),'utf8');
test('Maestro login, Android and iOS OTA flow YAML have exact IDs and actions',()=>{
 for(const kind of Object.keys(fixture))assert.ok(inspectMaestroFlow(source(kind),{kind}).actionCount>=4);
});
test('Maestro static contract rejects missing app ID, step, flow assertion, and malformed YAML',()=>{
 assert.throws(()=>inspectMaestroFlow(source('login').replace('ru.gafus.app','wrong.app'),{kind:'login'}));
 assert.throws(()=>inspectMaestroFlow(source('login').replace('username-input','wrong-input'),{kind:'login'}));
 assert.throws(()=>inspectMaestroFlow(source('android-ota').replace('- pressKey: back',''),{kind:'android-ota'}));
 assert.throws(()=>inspectMaestroFlow(source('ios-ota').replace('required-ota-screen','wrong-gate'),{kind:'ios-ota'}));
 assert.throws(()=>inspectMaestroFlow('not: [valid',{kind:'login'}));
});

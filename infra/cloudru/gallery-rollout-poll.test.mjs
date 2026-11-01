import assert from 'node:assert/strict';
import { test } from 'node:test';
import { waitForGalleryJobRollout } from './gallery-rollout-poll.mjs';
const name='gafus-gallery-process-2', projectId='primary-project';
const from='gafus.cr.cloud.ru/gafus-gallery-worker@sha256:'+'a'.repeat(64);
const to='gafus.cr.cloud.ru/gafus-gallery-worker@sha256:'+'b'.repeat(64);
const state=(status,image,good=true)=>({name,projectId,status,
  template:{containers:[{image}]},good});
function options(read,override={}) {
  let time=0;
  return {get:read,jobName:name,projectId,previousImage:from,desiredImage:to,
    isDesired:r=>r.good&&r.template.containers[0].image===to,
    timeoutMs:240000,intervalMs:5000,clock:()=>time,
    sleep:async ms=>{time+=ms;},...override};
}
test('waits beyond the old 18 second timeout until ready and exact target',async()=>{
 const values=[...Array(10).fill(state('updating',from)),
   ...Array(3).fill(state('updating',to)),state('ready',to)];
 let calls=0;
 await waitForGalleryJobRollout(options(async()=>values[Math.min(calls++,values.length-1)]));
 assert.equal(calls,14);
});
test('a ready image with non-image config drift is never accepted',async()=>{
 let calls=0;
 await assert.rejects(waitForGalleryJobRollout(options(async()=>{
   calls++;return state('ready',to,false);
 },{timeoutMs:15000})),/CLOUDRU_POSTPATCH_VERIFICATION_.*config_false/);
 assert.equal(calls,4);
});
test('fails shut on a different image or project identity',async()=>{
 await assert.rejects(waitForGalleryJobRollout(options(async()=>state('ready','evil@sha256:x'))),/UNEXPECTED_IMAGE/);
 await assert.rejects(waitForGalleryJobRollout(options(async()=>({...state('ready',to),projectId:'other'}))),/IDENTITY/);
});
test('only transient timeout and provider 5xx retry; 401 never retries',async()=>{
 let count=0;
 await waitForGalleryJobRollout(options(async()=>{
   count++;
   if(count===1)throw Object.assign(Error('timed out'),{name:'TimeoutError'});
   if(count===2)throw Error('CLOUDRU_GET_HTTP_503_/v2/jobs/gafus-gallery-process-2');
   return state('ready',to);
 }));
 assert.equal(count,3);
 let unauthorized=0;
 await assert.rejects(waitForGalleryJobRollout(options(async()=>{
   unauthorized++;throw Error('CLOUDRU_GET_HTTP_401_/v2/jobs');
 })),/401/);
 assert.equal(unauthorized,1);
});

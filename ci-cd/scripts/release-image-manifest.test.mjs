import {test} from 'node:test';
import assert from 'node:assert/strict';
import {COMPONENTS,createEntry,aggregate,verifyManifest,canonicalReceipt,digestReceipt} from './release-image-manifest.mjs';
const sourceSha='a'.repeat(40),runId='123',runAttempt='2',digest='sha256:'+'b'.repeat(64);
const entries=Object.entries(COMPONENTS).map(([component,repository])=>createEntry({component,repository,sourceSha,runId,runAttempt,digest,platform:'linux/amd64',smoke:'passed'}));
const expected={sourceSha,runId,runAttempt};
const reject=(mut,needle)=>assert.throws(()=>mut(),e=>e.message.includes(needle),needle);
test('exact seven SHA+run+attempt digest and deterministic checksum',()=>{
 const manifest=aggregate(entries,expected);assert.equal(Object.keys(manifest.images).length,7);
 assert.equal(verifyManifest(manifest,expected),manifest);
 assert.equal(digestReceipt(canonicalReceipt(manifest)),digestReceipt(canonicalReceipt(aggregate(entries.slice().reverse(),expected))));
});
test('reject partial/duplicate/unknown/cross-SHA/cross-attempt and invalid smoke/arch',()=>{
 reject(()=>aggregate(entries.slice(1),expected),'SEVEN_REQUIRED');
 reject(()=>aggregate([entries[0],entries[0],...entries.slice(2)],expected),'DUPLICATE');
 reject(()=>aggregate(entries.map((v,i)=>i===2?{...v,sourceSha:'c'.repeat(40)}:v),expected),'CROSS_SHA');
 reject(()=>aggregate(entries.map((v,i)=>i===2?{...v,runAttempt:'1'}:v),expected),'CROSS_ATTEMPT');
 reject(()=>createEntry({...entries[0],component:'debug'}),'UNRECOGNIZED');
 reject(()=>createEntry({...entries[0],digest:'sha256:'+'c'.repeat(32)}),'DIGEST');
 reject(()=>createEntry({...entries[0],platform:'linux/arm64'}),'ARCHITECTURE');
 reject(()=>createEntry({...entries[0],smoke:'skipped'}),'SMOKE');
});
test('deployment verifies exact repository and disallows stale/extra fields',()=>{
 const m=aggregate(entries,expected);
 reject(()=>verifyManifest(m,{...expected,sourceSha:'d'.repeat(40)}),'SOURCE_SHA_MISMATCH');
 reject(()=>verifyManifest(m,{...expected,runId:'124'}),'RUN_ID_MISMATCH');
 reject(()=>verifyManifest(m,{...expected,runAttempt:'3'}),'ATTEMPT_MISMATCH');
 reject(()=>verifyManifest({...m,extra:'anything'},expected),'EXTRA_FIELDS');
 reject(()=>verifyManifest({...m,images:{...m.images,web:'ghcr.io/evil/web@'+digest}},expected),'REPOSITORY:web');
 reject(()=>verifyManifest({...m,images:{...m.images,prisma:'ghcr.io/asmtv1/gafus-prisma@latest'}},expected),'DIGEST:prisma');
});

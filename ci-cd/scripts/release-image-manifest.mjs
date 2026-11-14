#!/usr/bin/env node
/** Immutable seven-image release receipts: reject stale, cross-run and partial builds. */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const COMPONENTS = Object.freeze({
  web: 'ghcr.io/asmtv1/gafus-web',
  'trainer-panel': 'ghcr.io/asmtv1/gafus-trainer-panel',
  'admin-panel': 'ghcr.io/asmtv1/gafus-admin-panel',
  api: 'ghcr.io/asmtv1/gafus-api',
  worker: 'ghcr.io/asmtv1/gafus-worker',
  'bull-board': 'ghcr.io/asmtv1/gafus-bull-board',
  prisma: 'ghcr.io/asmtv1/gafus-prisma',
});
const SHA=/^[a-f0-9]{40}$/;
const DIGEST=/^sha256:[a-f0-9]{64}$/;
const ID=/^[1-9]\d*$/;
const assert=(v,reason)=>{if(!v) throw Error(reason);};
const keys=Object.keys(COMPONENTS);
export function createEntry(v) {
  assert(Object.hasOwn(COMPONENTS,v.component), 'UNRECOGNIZED_IMAGE_COMPONENT');
  assert(v.repository===COMPONENTS[v.component], 'IMAGE_REPOSITORY_MISMATCH');
  assert(SHA.test(v.sourceSha??''), 'IMAGE_SOURCE_SHA_INVALID');
  assert(ID.test(String(v.runId??'')) && ID.test(String(v.runAttempt??'')), 'IMAGE_RUN_INVALID');
  assert(DIGEST.test(v.digest??''), 'IMAGE_DIGEST_INVALID');
  assert(v.platform==='linux/amd64', 'IMAGE_ARCHITECTURE_MISMATCH');
  assert(v.smoke==='passed', 'IMAGE_RUNTIME_SMOKE_NOT_PASS');
  return {schemaVersion:1,component:v.component,repository:v.repository,
    digest:v.digest,platform:v.platform,sourceSha:v.sourceSha,
    runId:String(v.runId),runAttempt:String(v.runAttempt),smoke:'passed'};
}
export function aggregate(entries, expected) {
  const {sourceSha,runId,runAttempt}=expected;
  assert(SHA.test(sourceSha??''), 'MANIFEST_SOURCE_SHA_INVALID');
  assert(ID.test(String(runId??'')) && ID.test(String(runAttempt??'')), 'MANIFEST_RUN_INVALID');
  assert(Array.isArray(entries) && entries.length===keys.length, 'MANIFEST_SEVEN_REQUIRED');
  const images=Object.create(null);
  for(const raw of entries) {
    assert(raw && raw.schemaVersion===1, 'MANIFEST_ENTRY_SCHEMA_INVALID');
    const entry=createEntry(raw);
    assert(entry.sourceSha===sourceSha, 'MANIFEST_CROSS_SHA');
    assert(entry.runId===String(runId) && entry.runAttempt===String(runAttempt), 'MANIFEST_CROSS_ATTEMPT');
    assert(!Object.hasOwn(images,entry.component), 'MANIFEST_DUPLICATE_COMPONENT');
    images[entry.component]=`${entry.repository}@${entry.digest}`;
  }
  assert(keys.every(k=>Object.hasOwn(images,k)), 'MANIFEST_COMPONENT_MISSING');
  return {schemaVersion:1,sourceSha,runId:String(runId),runAttempt:String(runAttempt),
    images:Object.fromEntries(keys.map(k=>[k,images[k]]))};
}
export function verifyManifest(manifest, expected) {
  assert(manifest?.schemaVersion===1, 'MANIFEST_INVALID_SCHEMA');
  assert(Object.keys(manifest).sort().join(',') === 'images,runAttempt,runId,schemaVersion,sourceSha', 'MANIFEST_EXTRA_FIELDS');
  assert(manifest.sourceSha===expected.sourceSha, 'MANIFEST_SOURCE_SHA_MISMATCH');
  if(expected.runId!==undefined) assert(manifest.runId===String(expected.runId), 'MANIFEST_RUN_ID_MISMATCH');
  if(expected.runAttempt!==undefined) assert(manifest.runAttempt===String(expected.runAttempt), 'MANIFEST_ATTEMPT_MISMATCH');
  assert(manifest.images && typeof manifest.images==='object' && !Array.isArray(manifest.images), 'MANIFEST_IMAGES_INVALID');
  assert(Object.keys(manifest.images).sort().join(',')===keys.slice().sort().join(','), 'MANIFEST_SEVEN_REQUIRED');
  assert(ID.test(manifest.runId??'')&&ID.test(manifest.runAttempt??''), 'MANIFEST_RUN_INVALID');
  for(const component of keys) {
    const ref=manifest.images[component];
    assert(typeof ref==='string' && ref.startsWith(`${COMPONENTS[component]}@`), `MANIFEST_REPOSITORY:${component}`);
    assert(DIGEST.test(ref.slice(COMPONENTS[component].length+1)), `MANIFEST_DIGEST:${component}`);
  }
  return manifest;
}
export function canonicalReceipt(manifest) {return JSON.stringify(manifest,null,2)+'\n';}
export function digestReceipt(raw) {return createHash('sha256').update(raw).digest('hex');}
function parseArgv(argv) {
  const result={};
  for(let i=0;i<argv.length;i+=2) {
    assert(argv[i]?.startsWith('--') && argv[i+1]!==undefined,'BAD_MANIFEST_CLI_ARGUMENTS');
    result[argv[i].slice(2)]=argv[i+1];
  }
  return result;
}
function cli(argv) {
  const [mode,...rest]=argv;const a=parseArgv(rest);
  if(mode==='entry') {
    const e=createEntry(a);assert(a.out,'MANIFEST_OUTPUT_REQUIRED');
    writeFileSync(a.out,canonicalReceipt(e),{flag:'wx',mode:0o600});
    process.stdout.write(`RELEASE_IMAGE_ENTRY:${e.component}\n`);
  } else if(mode==='aggregate') {
    assert(a.dir && a.out,'MANIFEST_INPUT_OUTPUT_REQUIRED');
    const names=readdirSync(a.dir).filter(n=>n.endsWith('.json'));
    const manifest=aggregate(names.map(n=>JSON.parse(readFileSync(resolve(a.dir,n),'utf8'))),a);
    const data=canonicalReceipt(manifest);
    writeFileSync(a.out,data,{flag:'wx',mode:0o600});
    writeFileSync(`${a.out}.sha256`,`${digestReceipt(data)}  ${a.out.split('/').at(-1)}\n`,{flag:'wx',mode:0o600});
    process.stdout.write(`RELEASE_MANIFEST_VERIFIED:${manifest.sourceSha}:${manifest.runId}:${manifest.runAttempt}\n`);
  } else if(mode==='verify') {
    assert(a.manifest,'MANIFEST_REQUIRED');
    const raw=readFileSync(a.manifest,'utf8');
    const manifest=verifyManifest(JSON.parse(raw),a);
    if(a.checksum) {
      const recorded=readFileSync(a.checksum,'utf8').trim().split(/\s+/)[0];
      assert(recorded===digestReceipt(raw),'MANIFEST_CHECKSUM_MISMATCH');
    }
    process.stdout.write(`RELEASE_MANIFEST_VERIFIED:${manifest.sourceSha}:${manifest.runId}:${manifest.runAttempt}\n`);
  } else throw Error('UNKNOWN_MANIFEST_OPERATION');
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {cli(process.argv.slice(2));}catch(e){process.stderr.write(`RELEASE_MANIFEST_REJECTED:${e.message}\n`);process.exitCode=1;}
}

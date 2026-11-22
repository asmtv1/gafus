import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import YAML from 'yaml';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const content=fs.readFileSync(path.join(root,'.github/workflows/gafus-self-hosted-ota-production.yml'),'utf8');
const doc=YAML.parseDocument(content,{uniqueKeys:true});
const wf=doc.toJS(), job=wf.jobs['signed-production'];
const steps=job.steps, names=steps.map(s=>s.name);
const step=name=>steps.find(s=>s.name.includes(name));
test('OTA production release is manually dispatched from owner main with production trust',()=>{
  assert.equal(doc.errors.length,0);
  assert.ok(wf.on.workflow_dispatch);
  assert.equal(job.environment,'ota-production');
  assert.match(job.if,/refs\/heads\/main/);
  assert.match(job.if,/asmtv1/);
  assert.equal(job.env.APP_ENV,'production');
  assert.equal(job.env.GAFUS_OTA_PRODUCTION_APPROVED,'true');
  assert.equal(job.env.EXPO_PUBLIC_TELEMETRY_ENABLED,'true');
  assert.equal(job.env.EXPO_PUBLIC_API_BASE_URL,'https://api.gafus.ru');
  assert.equal(job.env.GAFUS_OTA_TRANSPORT,'self-hosted');
  assert.equal(wf.on.workflow_dispatch.inputs.runtime_version.required,false);
  assert.equal(wf.on.workflow_dispatch.inputs.payment_content.default,'standard');
  assert.match(step('Resolve verified production native trust')?.run??'',/jq -er '\.runtimeVersion'/);
  assert.match(step('fully typed target')?.run??'',/OTA_EXPECTED_RUNTIME/);
  assert.deepEqual(Object.keys(wf.on), ['workflow_dispatch']);
});
test('iOS 1.7.5 release can only use the pinned legacy native-compatible branch',()=>{
  const run=step('Verify approved commit and fully typed target inputs')?.run ?? '';
  assert.match(run,/OTA_PLATFORM.*== ios &&.*OTA_EXPECTED_RUNTIME.*== 1\.7\.5/);
  assert.match(run,/ios-public-yookassa.*standard/);
  assert.match(run,/refs\/heads\/\$branch/);
  assert.match(run,/release\/ios-175-yookassa-ota-99/);
  assert.match(run,/release\/ios-175-yookassa-ota-98/);
  assert.match(run,/release\/ios-175-yookassa-ota-97/);
  assert.match(run,/git rev-parse "\$ref"/);
  assert.match(run,/\$matched.*== true/);
  assert.match(run,/git merge-base --is-ancestor.*origin\/main/);
  assert.match(step('Resolve verified production native trust')?.run??'',/git merge-base --is-ancestor "\$native_sha" "\$OTA_SOURCE_SHA"/);
});
test('release pins true production RSA native trust and immutable S3 asset prefix',()=>{
  assert.match(step('Resolve verified production native trust')?.run??'',/verify-ota-production-native-trust\.mjs/);
  assert.match(step('Resolve verified production native trust')?.run??'',/" production "/);
  assert.match(step('Prepare signed immutable')?.run??'',/--environment production[\s\S]*--channel production/);
  assert.match(step('Upload immutable production assets')?.run??'',/ota\/production\/gafus/);
  assert.ok(step('Prepare signed immutable')?.env?.OTA_SIGNING_PRIVATE_KEY_PEM);
  assert.equal(steps.filter(s=>s.env?.OTA_SIGNING_PRIVATE_KEY_PEM).length,1);
});
test('private source map verification is mandatory; vendor uploads and auto-publish absent',()=>{
  assert.ok(step('Prepare and verify SDK57 private maps'));
  assert.ok(step('Upload and verify private production SDK57'));
  assert.match(step('Upload and verify private production SDK57').run,/GAFUS_OTA_SYMBOLS_REF=symbols-s3:/);
  assert.equal(step('Upload and verify private production SDK57').env.GAFUS_SYMBOLS_PRODUCTION_APPROVED,'true');
  assert.ok(step('Register verified signed production release as READY'));
  assert.doesNotMatch(content,/upload-apptracer-sourcemaps|TRACER_SOURCEMAP_TOKEN_MOBILE|eas update|deployments\/[^\s]+\/publish/i);
  const ordered=['Resolve verified production native trust','Compare native source fingerprint',
    'Create isolated production Hermes','Prepare signed immutable','Upload immutable production assets',
    'Prepare and verify SDK57 private maps','Upload and verify private production SDK57',
    'Register verified signed production release'];
  const indices=ordered.map(name=>names.findIndex(n=>n.includes(name)));
  assert.ok(indices.every(n=>n>=0));
  assert.deepEqual(indices,[...indices].sort((a,b)=>a-b));
});
test('all production workflow shell steps parse as Bash and referenced scripts exist',()=>{
  for(const s of steps){
    if(!s.run) continue;
    const child=spawnSync('bash',['-n'],{input:s.run,encoding:'utf8'});
    assert.equal(child.status,0,`${s.name}: ${child.stderr}`);
    for(const match of s.run.matchAll(/\bnode\s+(apps\/mobile\/scripts\/[\w.-]+|packages\/cdn-upload\/scripts\/[\w.-]+)/g))
      assert.ok(fs.existsSync(path.join(root,match[1])),match[1]);
  }
});

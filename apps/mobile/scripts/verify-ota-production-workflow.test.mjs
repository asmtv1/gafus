import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
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
  assert.equal(wf.on.workflow_dispatch.inputs.runtime_version.required,true);
  assert.equal(wf.on.workflow_dispatch.inputs.payment_content.default,'standard');
  assert.match(step('Resolve verified production native trust')?.run??'',/jq -er '\.runtimeVersion'/);
  assert.match(step('fully typed target')?.run??'',/OTA_EXPECTED_RUNTIME/);
  assert.deepEqual(Object.keys(wf.on), ['workflow_dispatch']);
});
test('production source approval uses immutable annotated tags, main and verified native trust',()=>{
  const run=step('Verify approved commit and fully typed target inputs').run;
  assert.match(run,/git fetch --no-tags origin "\$ref:\$ref"/);
  assert.ok(run.includes('[[ "$(git cat-file -t "$ref")" == tag ]]'));
  assert.ok(run.includes('[[ "$(git rev-parse "$ref^{commit}")" == "$OTA_SOURCE_SHA" ]]'));
  assert.ok(run.includes('native_tag="ota-source-$OTA_PLATFORM-$OTA_NATIVE_ID-$OTA_SOURCE_SHA"'));
  assert.ok(run.includes('ota-source-ios-1.7.5-$OTA_SOURCE_SHA'));
  assert.doesNotMatch(run,/refs\/heads\/\$branch|release\/ios-175|release\/android-rustore/);
  assert.match(run,/cdb6b63e-e7fd-4943-902f-3e6b1507e0f4\|78a22462-2f2b-4c76-8ca8-eb08dabe27c5/);
  assert.match(run,/git merge-base --is-ancestor.*origin\/main/);
  assert.ok(!run.includes('-z "$OTA_EXPECTED_RUNTIME"'));
  const trust=step('Resolve verified production native trust').run;
  assert.ok(trust.includes('[[ "$OTA_RUNTIME" == "$OTA_EXPECTED_RUNTIME" ]]'));
  assert.match(trust,/git merge-base --is-ancestor "\$native_sha" "\$OTA_SOURCE_SHA"/);
  assert.match(step('Compare native source fingerprint').run,/NATIVE_FINGERPRINT_MISMATCH/);
});
test('source approval shell fails closed using real Git refs (no release secrets)',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gafus-ota-approval-'));
  const origin=path.join(dir,'remote.git'),repo=path.join(dir,'repo');
  const cmd=(cwd,...args)=>{const r=spawnSync('git',args,{cwd,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
  try {
    cmd(dir,'init','--bare',origin); fs.mkdirSync(repo); cmd(repo,'init','-b','main');
    cmd(repo,'config','user.name','Test');cmd(repo,'config','user.email','test@example.invalid');
    cmd(repo,'remote','add','origin',origin);
    cmd(repo,'commit','--allow-empty','-m','main');const trunk=cmd(repo,'rev-parse','HEAD');
    cmd(repo,'push','origin','main');cmd(repo,'checkout','-b','hotfix');cmd(repo,'commit','--allow-empty','-m','hotfix');
    const sha=cmd(repo,'rev-parse','HEAD');
    const a='cdb6b63e-e7fd-4943-902f-3e6b1507e0f4',b='78a22462-2f2b-4c76-8ca8-eb08dabe27c5';
    const tag=(name,target=sha,annotated=true)=>{cmd(repo,'tag',...(annotated?['-a',name,target,'-m','approved']:[name,target]));cmd(repo,'push','origin','refs/tags/'+name);};
    const run=step('Verify approved commit and fully typed target inputs').run;
    const check=(overrides={},expected=true)=>{
      const r=spawnSync('bash',['-c',run],{cwd:repo,encoding:'utf8',env:{...process.env,OTA_SOURCE_SHA:sha,OTA_NATIVE_ID:a,OTA_UPDATE_ID:a,OTA_OPERATION_ID:'test-operation-001',OTA_REVISION:'1',OTA_EXPECTED_RUNTIME:'1.7.5',OTA_RELEASE_TITLE:'test',OTA_RECOVERY_FOR:'',OTA_PAYMENT_CONTENT:'standard',OTA_CREATED_AT:'2026-11-26T00:00:00Z',OTA_PLATFORM:'android',...overrides}});
      assert.equal(r.status===0,expected,`${JSON.stringify(overrides)}: ${r.stderr}`);
    };
    check({},false); tag(`ota-source-android-${a}-${sha}`);check();
    check({OTA_NATIVE_ID:b},false);tag(`ota-source-android-${b}-${sha}`,trunk);check({OTA_NATIVE_ID:b},false);
    check({OTA_EXPECTED_RUNTIME:''},false);check({OTA_PAYMENT_CONTENT:'ios-public-yookassa'},false);
    check({OTA_PLATFORM:'ios'},false);tag(`ota-source-ios-1.7.5-${sha}`);check({OTA_PLATFORM:'ios'});
    check({OTA_PLATFORM:'ios',OTA_PAYMENT_CONTENT:'android-rustore-yookassa'},false);
    check({OTA_EXPECTED_RUNTIME:'1.7.6',OTA_NATIVE_ID:b},false);check({OTA_EXPECTED_RUNTIME:'1.7.6'});
    const c='00000000-0000-4000-8000-000000000000';tag(`ota-source-android-${c}-${sha}`,sha,false);check({OTA_EXPECTED_RUNTIME:'1.7.6',OTA_NATIVE_ID:c},false);
    cmd(repo,'checkout','main');check({OTA_SOURCE_SHA:trunk,OTA_EXPECTED_RUNTIME:'1.7.6',OTA_NATIVE_ID:c});
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
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
test('future production deploys preserve iOS 1.7.5 YooKassa gates from GitHub Environment',()=>{
  const deploy=fs.readFileSync(path.join(root,'.github/workflows/production-deploy-reusable.yml'),'utf8');
  const compose=fs.readFileSync(path.join(root,'ci-cd/docker/docker-compose.prod.yml'),'utf8');
  const deployDoc=YAML.parseDocument(deploy,{uniqueKeys:true});
  assert.equal(deployDoc.errors.length,0);
  const deployStep=deployDoc.toJS().jobs['deploy-production'].steps.find(s=>s.name==='Deploy to production server');
  assert.ok(deployStep);
  for(const name of ['MOBILE_OTA_IOS_YOOKASSA_ENABLED',
    'MOBILE_OTA_IOS_YOOKASSA_PUBLIC_ENABLED',
    'MOBILE_OTA_IOS_YOOKASSA_PUBLIC_PUBLISH_APPROVED']) {
    const declaration='echo "'+name+'=${{ vars.'+name+" == 'true' && 'true' || 'false' }}"+'"';
    assert.ok(deploy.includes(declaration),name+' is missing a fully quoted production .env declaration');
    assert.ok(compose.includes(name+'=${'+name+':-false}'),
      name+' must be passed to the API container with a fail-closed default');
  }
  assert.ok(deploy.includes('echo "MOBILE_IOS_MIN_VERSION=${{ vars.MOBILE_IOS_MIN_VERSION || \'1.7.5\' }}"'),
    'iOS minimum version must survive production .env regeneration');
  assert.ok(deploy.includes('echo "MOBILE_ANDROID_MIN_VERSION=${{ vars.MOBILE_ANDROID_MIN_VERSION || \'1.7.5\' }}"'),
    'Android minimum version must survive production .env regeneration');
  assert.ok(compose.includes('MOBILE_IOS_MIN_VERSION=${MOBILE_IOS_MIN_VERSION:-1.7.5}'));
  const fragments=deployStep.env;
  const shellUnits=[
    ['DEPLOY_SCRIPT_1',fragments.DEPLOY_SCRIPT_1],
    ['DEPLOY_SCRIPT_1B + DEPLOY_SCRIPT_2',fragments.DEPLOY_SCRIPT_1B+'\n'+fragments.DEPLOY_SCRIPT_2],
    ['DEPLOY_SCRIPT_3 + DEPLOY_SCRIPT_4',fragments.DEPLOY_SCRIPT_3+'\n'+fragments.DEPLOY_SCRIPT_4],
  ];
  for(const [name,script] of shellUnits) {
    const child=spawnSync('bash',['-n'],{input:script,encoding:'utf8'});
    assert.equal(child.status,0,`${name} contains invalid Bash syntax: ${child.stderr}`);
  }
  assert.match(deploy,/\}\s*> ci-cd\/docker\/\.env/);
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

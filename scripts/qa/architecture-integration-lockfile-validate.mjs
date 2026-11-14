#!/usr/bin/env node
/** Validate, without writes, regenerated A1 lock + committed A2 telemetry + patches. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const YAML = require('yaml');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const A2 = '/Users/asmtv1/Desktop/gafus-agent2-observability';
const arg=(name, fallback)=>{
  let i=process.argv.indexOf(name);
  return i===-1 ? fallback : process.argv[i+1];
};
const root = path.resolve(arg('--candidate',''));
const a1 = path.resolve(arg('--source','/Users/asmtv1/Desktop/gafus-refactor'));
const a2 = path.resolve(arg('--a2',A2));
const checks=[];
function check(id, ok, detail='') {checks.push({id,pass:!!ok,detail});}
function get(root,rel) {return fs.readFileSync(path.join(root,rel));}
function obj(root, rel) {return JSON.parse(get(root,rel).toString('utf8'));}
function loadLock(root) {
  const y=YAML.parseDocument(get(root,'pnpm-lock.yaml').toString('utf8'),{uniqueKeys:true});
  if(y.errors.length)throw new Error(y.errors.map(e=>e.message).join('|'));
  return y.toJS({maxAliasCount:100});
}
try {
  if(!root || root===a1 || root===a2 || !fs.existsSync(root))throw new Error('SEPARATE_EXISTING_COPY_REQUIRED');
  const la=loadLock(a1),lc=loadLock(root),lb=loadLock(a2);
  const lockA1=sha(get(a1,'pnpm-lock.yaml'));
  const lockOut=sha(get(root,'pnpm-lock.yaml'));
  const lockA2=sha(get(a2,'pnpm-lock.yaml'));
  check('LOCK_REGEN_EQUALS_A1_SNAPSHOT',lockOut===lockA1,`A1=${lockA1},candidate=${lockOut}`);
  check('LOCK_NOT_STALE_A2',lockOut!==lockA2,`A2 stale ${lockA2}`);
  check('PNPM_LOCK_V9',String(lc.lockfileVersion)==='9.0');
  check('WORKSPACE_IMPORTER_COUNT',Object.keys(lc.importers??{}).length===70,
    `found ${Object.keys(lc.importers??{}).length}`);
  check('OVERRIDES_PRESERVED',JSON.stringify(la.overrides)===JSON.stringify(lc.overrides));
  check('PATCH_SET_PRESERVED',JSON.stringify(la.patchedDependencies)===JSON.stringify(lc.patchedDependencies));
  check('PNPM_SETTINGS_PRESERVED',JSON.stringify(la.settings)===JSON.stringify(lc.settings));
  const loggerA1=obj(a1,'packages/logger/package.json');
  const loggerA2=obj(a2,'packages/logger/package.json');
  check('LOGGER_MANIFEST_A2_TELEMETRY_RETAINED',
    JSON.stringify(loggerA1)===JSON.stringify(loggerA2), 'A1 logger package agrees with committed A2 version');
  const otelNames=[
    '@opentelemetry/api',
    '@opentelemetry/context-async-hooks',
    '@opentelemetry/exporter-trace-otlp-http',
    '@opentelemetry/resources',
    '@opentelemetry/sdk-trace-base',
  ];
  for(const dep of otelNames){
    const a1spec=loggerA1.dependencies?.[dep];
    const a2spec=loggerA2.dependencies?.[dep];
    const a2imp=lb.importers?.['packages/logger']?.dependencies?.[dep];
    const actual=lc.importers?.['packages/logger']?.dependencies?.[dep];
    check('OTEL_LOCK:'+dep,
      !!actual && !!a2imp && a1spec===a2spec && actual.specifier===a1spec &&
      actual.version===a2imp.version, `A2=${a2imp?.version}; combined=${actual?.version}`);
  }
  const critical=['expo-modules-core@55.0.27','react-native-reanimated@4.2.1',
                  'react-native-compressor@1.16.0'];
  for(const key of critical){
    const e=lc.patchedDependencies?.[key];
    const patch=e?.path;
    const real=patch && fs.existsSync(path.join(root,patch)) ? sha(get(root,patch)):null;
    check('PATCH_HASH:'+key,!!e && e.hash===real && la.patchedDependencies?.[key]?.hash===real,
      `manifest=${e?.hash}; actual=${real}`);
  }
  // Every manifest in this workspace copy must be represented in pnpm importers.
  const manifests=[];
  const names=new Map();
  for(const cat of ['apps','packages'])for(const item of fs.readdirSync(path.join(root,cat),{withFileTypes:true})){
    if(!item.isDirectory())continue;
    const rel=`${cat}/${item.name}`;
    const filename=path.join(root,rel,'package.json');
    if(!fs.existsSync(filename))continue;
    const manifest=obj(root,rel+'/package.json');
    manifests.push({rel,manifest});
    if(manifest.name)names.set(manifest.name,rel);
  }
  check('WORKSPACE_MANIFEST_COUNT',manifests.length===69,`found ${manifests.length}`);
  manifests.push({rel:'.',manifest:obj(root,'package.json')});
  for(const {rel,manifest} of manifests){
    const importer=lc.importers?.[rel];
    check('WORKSPACE_IMPORTER:'+rel,!!importer);
    if(!importer)continue;
    const types=['dependencies','devDependencies','optionalDependencies'];
    const declared=[...new Set(types.flatMap(field=>Object.keys(manifest[field]||{})))].sort();
    const locked=[...new Set(types.flatMap(field=>Object.keys(importer[field]||{})))].sort();
    check('IMPORTER_EXACT_NAMES:'+rel,
      JSON.stringify(declared)===JSON.stringify(locked),
      `declared ${declared.length}, locked ${locked.length}`);
    for(const field of types){
      for(const [name,spec] of Object.entries(manifest[field]||{})){
        const row=importer[field]?.[name] ?? (field==='devDependencies' ? importer.dependencies?.[name] : null);
        check('SPEC_PRESENT:'+rel+':'+name,!!row,`${field} ${name}`);
        if(!row)continue;
        const isWorkspace=String(spec).startsWith('workspace:') || name.startsWith('@gafus/');
        if(isWorkspace) {
          let dirname=rel==='.'?'.':rel;
          const target=names.get(name);
          const expectedLink=target&&'link:'+path.posix.relative(dirname,target);
          check('WORKSPACE_LINK:'+rel+':'+name,
            target && row.specifier===spec && row.version===expectedLink,
            `got ${row.specifier}/${row.version}, expected ${spec}/${expectedLink}`);
        }
      }
    }
  }
  for(const consumer of ['apps/api','packages/worker']){
    const row=lc.importers?.[consumer]?.dependencies?.['@gafus/subscription-payment-server'];
    const pkg=obj(root,consumer+'/package.json');
    check('A1_PAYMENT_PACKAGE_MANIFEST:'+consumer,
      pkg.dependencies?.['@gafus/subscription-payment-server']==='workspace:*');
    check('A1_PAYMENT_WORKSPACE:'+consumer,!!row && row.specifier==='workspace:*' &&
      row.version==='link:'+path.posix.relative(consumer,'packages/subscription-payment-server'));
  }
  const schema=get(root,'packages/prisma/schema.prisma').toString('utf8');
  check('PRISMA_METRICS_GENERATOR',/generator client\s*\{[^}]*previewFeatures\s*=\s*\["metrics"\]/s.test(schema));
  for(const model of ['AppSubscription','AppSubscriptionPayment','QuestionLegacyPhotoDeletion','Chat2OutboxEvent'])
    check('PRISMA_MODEL:'+model,schema.includes(`model ${model} {`));
  const chat2=schema.split('model Chat2OutboxEvent {')[1]?.split('\n}')[0]??'';
  for(const field of ['claimToken','operationId','traceId','lastErrorCode','deadLetteredAt'])
    check('PRISMA_CHAT2_LEASE_FIELD:'+field,new RegExp('\\b'+field+'\\s+').test(chat2));
  const failed=checks.filter(x=>!x.pass);
  const result={kind:'gafus/a2-lockfile-regeneration-proof/v1',
    verdict:failed.length?'FAIL':'PASS_LOCKFILE_ONLY_NOT_INTEGRATION_ACCEPTANCE',
    candidate:root,source:a1,a2Root:a2,
    lockSha256:lockOut,a1LockSha256:lockA1,a2StaleLockSha256:lockA2,
    importerCount:Object.keys(lc.importers).length,packageManifestCount:manifests.length,
    patches:Object.keys(lc.patchedDependencies),
    checksTotal:checks.length,passed:checks.length-failed.length,failed,
    noGitHistoryMutation:true,noProduction:true};
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
  process.exitCode=failed.length?1:0;
}catch(e){process.stderr.write('LOCK_PROOF_ERROR: '+String(e)+'\n');process.exitCode=2;}

#!/usr/bin/env node
/**
 * Opt-in, network-blocked inventory-gap smoke pilot.
 * Called by 13 package test:unit scripts, excluded from turbo test and CI/full.
 * A passing group proves only the listed existing test files, not the package.
 */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const inventory=JSON.parse(readFileSync(join(root,'tests/catalog/inventory.json'),'utf8'));
const groups=JSON.parse(readFileSync(join(root,'tests/catalog/workspace-advisory-groups.json'),'utf8')).groups;
const args=process.argv.slice(2);
const singlePackage=args[0]==='--run'&&args.length===3&&args[1]==='--package' ? args[2] : null;
if(!((args.length===1 && ['--list','--run'].includes(args[0])) || singlePackage))
  throw Error('Usage: node scripts/qa/workspace-gap-advisory.mjs --list|--run [--package @gafus/name]');

function sha(content){return createHash('sha256').update(content).digest('hex');}
function checkedInventory(){
  assert.equal(inventory.schema,1,'INVENTORY_SCHEMA');
  const byName=new Map(inventory.workspaces.map(w=>[w.name,w]));
  const routed=inventory.workspaces.filter(w=>w.advisoryUnitOnly===true);
  assert.equal(routed.length,13,'REVIEWED_13_ADVISORY_ROUTES_CHANGED');
  assert.equal(groups.length,13,'ALL_THIRTEEN_EXPECTED_PARTIAL_ROUTES');
  for(const g of groups){
    const ws=byName.get(g.name);
    const expected='node ../../scripts/qa/workspace-gap-advisory.mjs --run --package '+g.name;
    assert(ws && !ws.scripts.test && ws.scripts.unitTest===expected &&
      ws.advisoryUnitOnly===true && ws.route==='advisory-unit-script',
      'NOT_AN_ADVISORY_PACKAGE_ROUTE:'+g.name);
    for(const file of g.files){
      assert(ws.tests.includes(file),'UNKNOWN_TEST_FILE:'+file);
      assert(existsSync(join(root,file)),'MISSING_TEST_FILE:'+file);
    }
  }
  return routed.filter(w=>!groups.some(g=>g.name===w.name)).map(w=>w.name);
}
const unresolved=checkedInventory();
const selectedGroups=singlePackage ? groups.filter(g=>g.name===singlePackage) : groups;
assert(selectedGroups.length>0,'UNKNOWN_ADVISORY_PACKAGE:'+singlePackage);
if(args[0]==='--list'){
  for(const g of groups)console.log('PARTIAL_ADVISORY',g.name,g.kind,
    g.files.length+' files',g.minCases+' minimum passing cases');
  console.log('NO_DIRECT_TEST_ROUTE_YET',unresolved.join(', '));
  process.exit(0);
}
const runId='workspace-gaps-'+randomUUID();
const dir=join(root,'.qa/testing',runId);
mkdirSync(dir,{recursive:true,mode:0o700});
const allowed=['PATH','HOME','TMPDIR','LANG','LC_ALL','TZ','PNPM_HOME','XDG_CACHE_HOME','XDG_CONFIG_HOME'];
const env=Object.fromEntries(allowed.filter(k=>process.env[k]!==undefined).map(k=>[k,process.env[k]]));
Object.assign(env,{
  NODE_ENV:'test',CI:'1',FORCE_COLOR:'0',
  NODE_OPTIONS:'--require '+join(root,'scripts/qa/block-nonlocal-network.cjs'),
});
function execute(bin,argv,timeout=90000){
  return spawnSync(bin,argv,{cwd:root,env,encoding:'utf8',timeout,maxBuffer:2*1024*1024});
}
function tapCount(output){
  const match=[...output.matchAll(/^# tests (\d+)\s*$/gm)].at(-1);
  const passed=[...output.matchAll(/^# pass (\d+)\s*$/gm)].at(-1);
  const failed=[...output.matchAll(/^# fail (\d+)\s*$/gm)].at(-1);
  const skipped=[...output.matchAll(/^# skipped (\d+)\s*$/gm)].at(-1);
  const cancelled=[...output.matchAll(/^# cancelled (\d+)\s*$/gm)].at(-1);
  if(!match||!passed||!failed||!skipped||!cancelled)
    throw Error('MISSING_NODE_TAP_TOTALS');
  const [total,pass,fail,skip,cancel]=[match,passed,failed,skipped,cancelled].map(x=>Number(x[1]));
  assert(total===pass+fail+skip+cancel && !fail && !skip && !cancel,'NODE_TAP_NOT_CLEAN');
  return total;
}
function vitestCount(file,expectedFiles){
  assert(existsSync(file),'MISSING_VITEST_JSON');
  const data=JSON.parse(readFileSync(file,'utf8'));
  const rows=Array.isArray(data.testResults)?data.testResults:[];
  assert(rows.length===expectedFiles.length,'MISSING_OR_EXTRA_TEST_FILES');
  const expected=new Set(expectedFiles.map(f=>resolve(root,f)));
  const actual=new Set(rows.map(r=>resolve(r.name)));
  assert.equal(actual.size,expected.size,'DUPLICATE_TEST_FILES');
  for(const file of expected)assert(actual.has(file),'WRONG_TEST_FILE:'+relative(root,file));
  const tests=rows.flatMap(r=>r.assertionResults||[]);
  assert(tests.length>0,'EMPTY_TEST_RUN');
  assert(tests.every(t=>t.status==='passed'),'FAIL_SKIP_OR_PENDING_VITEST');
  assert(data.success===true,'VITEST_NOT_SUCCESS');
  return tests.length;
}
const results=[];
for(const g of selectedGroups){
  const groupDir=join(dir,g.name.replace(/^@gafus\//,''));
  mkdirSync(groupDir,{recursive:true,mode:0o700});
  const fingerprint=Object.fromEntries(g.files.map(f=>[f,sha(readFileSync(join(root,f)))]));
  const report=join(groupDir,'tests.json');
  let action,build=null,processResult=null,cases=0,error=null;
  try{
    if(g.kind==='vitest'){
      action=['pnpm','exec','vitest','run','--config','vitest.config.ts',...g.files,
        '--maxWorkers=1','--reporter=json','--outputFile='+report];
    }else if(g.kind==='tsx'){
      action=['pnpm','exec','tsx','--test',...g.files];
    }else if(g.kind==='node'){
      build=execute('pnpm',['--filter','@gafus/logger','build']);
      assert(build.status===0 && !build.error,'LOGGER_BUILD_FAILED');
      action=['node','--test',...g.files];
    }else throw Error('UNKNOWN_TEST_KIND');
    processResult=execute(action[0],action.slice(1));
    assert(processResult.status===0 && !processResult.error && !processResult.signal,
      'RUNNER_NONZERO_OR_TIMEOUT:'+String(processResult.status??processResult.error??processResult.signal));
    cases=g.kind==='vitest'?vitestCount(report,g.files):
      tapCount(String(processResult.stdout||'')+'\n'+String(processResult.stderr||''));
    assert(cases>=g.minCases,'TEST_COUNT_REGRESSION:'+g.name+':'+cases);
    for(const [f,digest] of Object.entries(fingerprint))
      assert(sha(readFileSync(join(root,f)))===digest,'TEST_FILE_MUTATED_DURING_RUN:'+f);
  }catch(e){error=String(e?.message||e);}
  const result={name:g.name,status:error?'failed':'passed',
    scope:'partial-owned-test-files-only',files:g.files,caseCount:cases,minCases:g.minCases,
    fingerprints:fingerprint,exitCode:processResult?.status??null,
    reason:error,networkGuard:'nonlocal-blocked',source:'original test files'};
  results.push(result);
  writeFileSync(join(groupDir,'group.json'),JSON.stringify(result,null,2)+'\n',{mode:0o600});
  console.log(result.status.toUpperCase(),g.name,cases+' cases',error||'');
}
const allPassed=results.every(r=>r.status==='passed');
const commit=execute('git',['rev-parse','HEAD']).stdout.trim();
const summary={schema:1,runId,commit,advisoryOnly:true,requiredReleaseGate:false,
  status:allPassed?'pass-partial':'failed',groupsSelected:selectedGroups.length,
  groupsPassed:results.filter(r=>r.status==='passed').length,
  testCasesPassed:results.reduce((n,r)=>n+(r.status==='passed'?r.caseCount:0),0),
  testFilesSelected:results.reduce((n,r)=>n+r.files.length,0),
  inventoryGapWorkspaces:13,unroutedWithoutDirectSmoke:unresolved,
  caveat:'Partial smoke coverage only. No guarantee for all package tests, consumer tests, real services, devices or CI.',
  results};
writeFileSync(join(dir,'summary.json'),JSON.stringify(summary,null,2)+'\n',{mode:0o600});
console.log('WORKSPACE_GAP_ADVISORY_REPORT',allPassed?'PASS_PARTIAL':'FAILED',relative(root,join(dir,'summary.json')));
if(!allPassed)process.exitCode=1;

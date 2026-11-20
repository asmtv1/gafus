#!/usr/bin/env node
/**
 * Read-only reconciliation of legacy architecture-regression and
 * acceptance matrices. A historical log is NEVER promoted to a current
 * commit's release approval.
 */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const source=p=>readFileSync(join(root,p),'utf8');
const fingerprint=x=>createHash('sha256').update(x).digest('hex');
const sanitize=x=>x.replaceAll('|','/').replace(/\s+/g,' ').trim();

export function discoverLegacyRegression(script) {
  const fixed=[...script.matchAll(/^run_gate ([a-z0-9-]+)\s/gm)].map(x=>x[1]);
  const loops=[...script.matchAll(/^for pkg in ([^;\n]+); do\s*$/gm)]
    .map(x=>x[1].trim().split(/\s+/));
  assert.equal(loops.length,2,'EXPECTED_TWO_REGRESSION_PACKAGE_LOOPS');
  assert.equal(loops[0].length,22,'EXPECTED_22_DOMAIN_PACKAGE_TESTS');
  assert.equal(loops[1].length,3,'EXPECTED_THREE_CLIENT_PACKAGE_TESTS');
  const expanded=[...fixed.slice(0,5),
    ...loops[0].map(name=>'test-'+name),
    ...fixed.slice(5,6),
    ...loops[1].map(name=>'test-'+name),
    ...fixed.slice(6)];
  assert.equal(expanded.length,33,'EXPECTED_33_ARCHITECTURE_STAGES');
  assert.equal(new Set(expanded).size,33,'DUPLICATE_ARCHITECTURE_STAGE');
  return expanded;
}
export function discoverLegacyFaults(script){
  const names=[...script.matchAll(/^run ([a-z0-9-]+) scripts\/qa\/([^\s]+)\s*$/gm)]
    .map(x=>({id:x[1],script:'scripts/qa/'+x[2]}));
  assert.equal(names.length,10,'CURRENT_FAULT_PROBES_MUST_BE_TEN');
  assert.equal(new Set(names.map(x=>x.id)).size,names.length,'DUPLICATE_FAULT_IDS');
  return names;
}
export function discoverAcceptance(source1,source2,source3){
  const rows=[];
  for(const [owner,path,body] of [
    ['agent-1','docs/audit/gafus-agent-1-architecture-20261111.md',source1],
    ['agent-3','docs/audit/gafus-agent-3-reliability-20261111.md',source3],
  ]){
    for(const m of body.matchAll(/^\| (\d{1,2}) \| ([^\n]+?) \|\s*$/gm)){
      const n=Number(m[1]);
      if(owner==='agent-1' && ![1,2,3,15].includes(n))continue;
      if(owner==='agent-3' && !([4,5,6,7,8,9,10,11,12,13,14,18].includes(n)))continue;
      rows.push({id:n,owner,source:path,requirement:sanitize(m[2]),status:'pending-full-acceptance'});
    }
  }
  for(const n of [16,17]){
    const pattern=new RegExp('^\\*\\*№'+n+':\\*\\* (.+)$','m');
    const m=pattern.exec(source2);
    assert(m,'MISSING_AGENT_2_SOURCE_ACCEPTANCE:'+n);
    rows.push({id:n,owner:'agent-2',source:'docs/audit/gafus-agent-2-observability-20261111.md',
      requirement:sanitize(m[1]),status:'pending-full-acceptance'});
  }
  rows.sort((a,b)=>a.id-b.id);
  assert.equal(rows.length,18,'ACCEPTANCE_18_ROW_COUNT_CHANGED');
  assert.deepEqual(rows.map(x=>x.id),Array.from({length:18},(_,i)=>i+1),
    'REQUIRED_ACCEPTANCE_ROW_MISSING');
  return rows;
}
export function parseLegacyResults(tsv,expected){
  const lookup=new Map(expected.map(id=>[id,{id,status:'not-executed'}]));
  const lines=tsv.split(/\r?\n/).filter(x=>x.trim());
  for(const line of lines){
    const [id,...statusParts]=line.split('\t');
    assert(lookup.has(id),'UNEXPECTED_OR_UNMAPPED_ARCHITECTURE_RESULT:'+id);
    const current=lookup.get(id);
    assert(current.status==='not-executed','DUPLICATE_LEGACY_RESULT:'+id);
    const result=statusParts.join('\t');
    assert(result==='PASS'||/^FAIL exit=\d+$/.test(result),'UNKNOWN_LEGACY_RESULT:'+result);
    lookup.set(id,{id,status:result==='PASS'?'historical-pass':'historical-fail',
      detail:result});
  }
  return [...lookup.values()];
}

async function main(){
  const args=process.argv.slice(2);
  if(args.length%2!==0)throw Error('LEGACY_MATRIX_OPTION_VALUE_MISSING');
  const options=new Map();
  for(let i=0;i<args.length;i+=2){
    const [name,value]=[args[i],args[i+1]];
    assert(['--historical-run-id','--chaos-run-id'].includes(name),
      'LEGACY_MATRIX_UNKNOWN_OPTION:'+name);
    assert(!options.has(name),'LEGACY_MATRIX_DUPLICATE_OPTION:'+name);
    assert(/^[a-z][a-z0-9-]{0,40}$/.test(value),'LEGACY_MATRIX_RUN_ID_INVALID');
    options.set(name,value);
  }
  const oldId=options.get('--historical-run-id')||null;
  const chaosId=options.get('--chaos-run-id')||null;
  const regressionPath='scripts/qa/architecture-final-regression.sh';
  const chaosPath='scripts/qa/architecture-chaos-local.sh';
  const docPaths=[
    'docs/audit/gafus-agent-1-architecture-20261111.md',
    'docs/audit/gafus-agent-2-observability-20261111.md',
    'docs/audit/gafus-agent-3-reliability-20261111.md',
  ];
  const regression=discoverLegacyRegression(source(regressionPath));
  const faults=discoverLegacyFaults(source(chaosPath));
  const acceptance=discoverAcceptance(...docPaths.map(source));
  const logRoot=join(homedir(),'Library/Logs/gafus-refactor-regression');
  const saved=oldId?join(logRoot,oldId,'results.tsv'):null;
  const chaosSaved=chaosId?join(logRoot,chaosId,'chaos-results.tsv'):null;
  if(saved)assert(existsSync(saved),'MISSING_REQUESTED_HISTORICAL_REGRESSION');
  if(chaosSaved)assert(existsSync(chaosSaved),'MISSING_REQUESTED_LOCAL_CHAOS_RECEIPT');
  const historical=saved?parseLegacyResults(readFileSync(saved,'utf8'),regression):null;
  const historicalFaults=chaosSaved?parseLegacyResults(readFileSync(chaosSaved,'utf8'),
    faults.map(x=>x.id)):null;
  const faultStatus=new Map((historicalFaults||[]).map(x=>[x.id,x]));
  const faultTotals=historicalFaults?{
    historicalPassed:historicalFaults.filter(x=>x.status==='historical-pass').length,
    historicalFailed:historicalFaults.filter(x=>x.status==='historical-fail').length,
    historicalUnexecuted:historicalFaults.filter(x=>x.status==='not-executed').length,
  }:null;
  const totals=historical?{
    historicalPassed:historical.filter(x=>x.status==='historical-pass').length,
    historicalFailed:historical.filter(x=>x.status==='historical-fail').length,
    historicalUnexecuted:historical.filter(x=>x.status==='not-executed').length,
  }:null;
  const git=(...args)=>{
    const result=spawnSync('git',args,{cwd:root,encoding:'utf8',timeout:10000});
    assert.equal(result.status,0,'MATRIX_GIT_SOURCE_UNAVAILABLE');
    return result.stdout.trim();
  };
  const commit=git('rev-parse','HEAD');
  const workingTreeDirty=git('status','--porcelain=v1').length>0;
  const id='qa-legacy-matrix-'+randomUUID();
  const dir=join(root,'.qa/testing',id);
  mkdirSync(dir,{recursive:true,mode:0o700});
  const inputPaths=[regressionPath,chaosPath,...docPaths];
  const routes=JSON.parse(source('tests/catalog/legacy-acceptance-routing.json')).rows;
  assert.deepEqual(routes.map(({id})=>id),acceptance.map(({id})=>id),'ACCEPTANCE_ROUTING_DRIFT');
  const report={
    schema:1,runId:id,commit,workingTreeDirty,
    status:'incomplete-full-acceptance',
    releaseReady:false,
    liveWorkflowExecuted:false,
    sourceFingerprint:Object.fromEntries(inputPaths.map(p=>[p,fingerprint(source(p))])),
    expectedArchitectureStages:33,
    expectedCurrentFaultProbes:10,
    expectedAcceptanceRows:18,
    regressionStages:historical||regression.map(id=>({id,status:'not-executed'})),
    historicalRunId:oldId,
    historicalSource:saved?basename(resolve(saved)):'none',
    historicalUntrustedForCurrentCommit:true,
    historicalTotals:totals,
    historicalChaosRunId:chaosId,
    historicalFaultTotals:faultTotals,
    faultProbes:faults.map(x=>({...x,...(faultStatus.get(x.id)||{
      status:'not-verified-on-this-candidate',
    })})),
    acceptance:acceptance.map((row)=>{
      const route=routes.find(({id})=>row.id===id);
      assert(route,'ACCEPTANCE_ROUTE_UNMAPPED:'+row.id);
      return {...row,local:route.local,remaining:route.remaining};
    }),
    acceptedFullScenarios:0,
    caveat:'Old source logs do not bind a candidate SHA. Historical PASS is not live or current PASS; provider/device/staging evidence is separately required.',
  };
  writeFileSync(join(dir,'summary.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
  console.log('LEGACY_MATRIX_LEDGER',JSON.stringify({
    stages:regression.length,faultProbes:faults.length,
    acceptance:acceptance.length,historicalTotals:totals,
    historicalFaultTotals:faultTotals,
    status:report.status,receipt:join(dir,'summary.json'),
  }));
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url))
  main().catch(e=>{console.error('LEGACY_MATRIX_ERROR',e.stack||String(e));process.exitCode=2;});

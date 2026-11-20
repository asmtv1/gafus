#!/usr/bin/env node
// Opt-in baseline: source-wide V8/Istanbul for Vitest-based package groups.
// Never convert a missing provider or a zero denominator into 100% coverage.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const groups=JSON.parse(readFileSync(join(root,'tests/catalog/workspace-advisory-groups.json'),'utf8')).groups;
const inventory=JSON.parse(readFileSync(join(root,'tests/catalog/inventory.json'),'utf8'));
const byName=new Map(inventory.workspaces.map(w=>[w.name,w]));
const runId='workspace-coverage-'+randomUUID(),dir=join(root,'.qa/testing',runId);
mkdirSync(dir,{recursive:true,mode:0o700});
const env=Object.fromEntries(['PATH','HOME','LANG','LC_ALL','TZ','TMPDIR','PNPM_HOME','XDG_CONFIG_HOME','XDG_CACHE_HOME']
 .filter(k=>process.env[k]!==undefined).map(k=>[k,process.env[k]]));
Object.assign(env,{NODE_ENV:'test',CI:'1',FORCE_COLOR:'0',
 NODE_OPTIONS:'--require '+join(root,'scripts/qa/block-nonlocal-network.cjs')});
const sha=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const sums=()=>({lines:{total:0,covered:0},branches:{total:0,covered:0}});
const merged=sums(),output=[];
for(const group of groups){
 const workspace=byName.get(group.name);
 assert(workspace?.advisoryUnitOnly===true,'NOT_ADVISORY_GROUP:'+group.name);
 const groupId=group.name.split('/')[1];
 const reportDir=join(dir,groupId);
 mkdirSync(reportDir,{recursive:true,mode:0o700});
 const current={name:group.name,kind:group.kind,status:'unmeasured',
  scope:'source-wide for this workspace; only selected pilot tests execute',
  selectedCasesMinimum:group.minCases,sourceFiles:0,lines:null,branches:null,reason:null};
 if(group.kind!=='vitest'){
   current.reason='Original package uses Node test runner; no comparable source-mapped Istanbul coverage from this baseline';
   output.push(current);
   continue;
 }
 const pathRoot=join(root,workspace.path,'src');
 function gather(directory){
   const files=[];
   for(const entry of readdirSync(directory,{withFileTypes:true})){
     if(entry.isDirectory()){files.push(...gather(join(directory,entry.name)));continue;}
     const pathname=join(directory,entry.name);
     if(!/\.(?:ts|tsx)$/.test(entry.name) ||
       /\.(?:test|spec|d)\.(?:ts|tsx)$/.test(entry.name))continue;
     files.push(pathname);
   }
   return files;
 }
 const sources=gather(pathRoot).sort();
 assert(sources.length>0,'WORKSPACE_SOURCE_DENOMINATOR_EMPTY:'+group.name);
 const before=new Map(sources.map(f=>[f,sha(f)]));
 const testsPath=join(reportDir,'tests.json');
 const proc=spawnSync('pnpm',['exec','vitest','run','--config','vitest.config.ts',...group.files,
   '--maxWorkers=1','--reporter=json','--outputFile='+testsPath,
   '--coverage.enabled','--coverage.provider=v8',
   '--coverage.include='+workspace.path+'/src/**/*.{ts,tsx}',
   '--coverage.exclude=**/*.{test,spec}.{ts,tsx}',
   '--coverage.reporter=json-summary','--coverage.reporter=json',
   '--coverage.reporter=lcovonly','--coverage.reportsDirectory='+reportDir],
   {cwd:root,env,encoding:'utf8',timeout:120000,maxBuffer:2*1024*1024});
 try{
   assert.equal(proc.status,0,'VITEST_COVERAGE_FAILED:'+String(proc.stderr||proc.stdout).slice(-650));
   const cases=JSON.parse(readFileSync(testsPath,'utf8'));
   const rows=cases.testResults||[];
   const actualFiles=new Set(rows.map(r=>resolve(r.name)));
   assert.equal(actualFiles.size,group.files.length,'REPORTED_TEST_FILE_COUNT');
   for(const file of group.files)assert(actualFiles.has(join(root,file)),'MISSING_NAMED_TEST:'+file);
   const assertions=rows.flatMap(row=>row.assertionResults||[]);
   assert(assertions.length>=group.minCases && assertions.every(x=>x.status==='passed'),
     'MISSING_FAILED_SKIPPED_OR_RETRIED_TEST');
   const coverage=JSON.parse(readFileSync(join(reportDir,'coverage-summary.json'),'utf8'));
   const present=Object.keys(coverage).filter(k=>k!=='total').map(p=>resolve(p));
   assert(present.length===new Set(present).size,'DUPLICATE_SOURCE_COVERAGE');
   const absent=sources.filter(f=>!present.includes(f));
   assert.equal(absent.length,0,'UNMEASURED_SOURCE_FILES:'+absent.map(f=>relative(root,f)).join(','));
   assert(present.every(f=>f.startsWith(pathRoot+'/')),'FOREIGN_SOURCE_IN_COVERAGE');
   for(const metric of ['lines','branches']){
     const {total,covered}=coverage.total?.[metric]||{};
     assert(Number.isInteger(total)&&total>0 && Number.isInteger(covered)&&covered>=0&&covered<=total,
       'ZERO_OR_INVALID_COVERAGE_DENOMINATOR:'+metric);
     const sum=present.reduce((n,f)=>n+(coverage[f]?.[metric]?.total||0),0);
     assert.equal(sum,total,'SOURCE_COUNTER_SUM_MISMATCH:'+metric);
   }
   for(const [file,digest] of before)
     assert.equal(sha(file),digest,'SOURCE_CHANGED_DURING_COVERAGE:'+file);
   current.status='measured';
   current.sourceFiles=present.length;
   current.assertionsPassed=assertions.length;
   current.lines={total:coverage.total.lines.total,covered:coverage.total.lines.covered};
   current.branches={total:coverage.total.branches.total,covered:coverage.total.branches.covered};
   for(const metric of ['lines','branches']){
     merged[metric].total+=current[metric].total;
     merged[metric].covered+=current[metric].covered;
   }
 }catch(e){
   current.status='incomplete';
   current.reason=String(e.message);
 }
 output.push(current);
 console.log('WORKSPACE_COVERAGE',current.status,group.name,
   current.lines?current.lines.covered+'/'+current.lines.total+' lines':'',current.reason||'');
}
const measured=output.filter(x=>x.status==='measured');
const incomplete=output.filter(x=>x.status==='incomplete');
assert.equal(output.length,groups.length,'GROUP_COVERAGE_INVENTORY_MISMATCH');
const receipt={schema:1,runId,source:'V8 Istanbul coverage-summary JSON per original workspace',
  advisory:true,releaseReady:false,groups:groups.length,
  measured:measured.length,unmeasured:output.filter(x=>x.status==='unmeasured').length,
  incomplete:incomplete.length,status:incomplete.length?'incomplete':'measured-partial',
  mergeRule:'integer counters summed; never average rounded per-group percentages',
  totals:merged,results:output};
writeFileSync(join(dir,'summary.json'),JSON.stringify(receipt,null,2)+'\n',{mode:0o600});
console.log('WORKSPACE_COVERAGE_REPORT',receipt.status,relative(root,join(dir,'summary.json')));
if(incomplete.length||measured.length===0) process.exitCode=2;

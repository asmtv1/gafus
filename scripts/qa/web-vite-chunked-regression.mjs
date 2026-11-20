#!/usr/bin/env node
/** Full local Vite Web regression, with a fresh Vitest worker for each batch.
 * The normal monolithic run has exhausted the 8 GiB development Mac after
 * several hundred JSDOM mounts. This preserves every test file and asserts
 * that Vitest accounts for every selected file; NO --retry and NO --passWithNoTests.
 * All logs and exact completion receipt live in ~/Library/Logs.
 * Call via: node scripts/qa/web-vite-chunked-regression.mjs
 */
import {readdirSync,existsSync,mkdirSync,openSync,closeSync,readFileSync,writeFileSync} from 'node:fs';
import {join,relative,resolve,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {homedir} from 'node:os';
const root=resolve(import.meta.dirname,'../..');
const appDir=join(root,'apps/web-vite');
const repoSrc=join(appDir,'src');
const runArg=process.argv.find(x=>x.startsWith('--run-id='));
const runId=runArg?runArg.slice('--run-id='.length):'manual';
if(!/^[a-z][a-z0-9-]{0,32}$/.test(runId))throw Error('WEB_QA_RUN_ID_INVALID');
const legacyRoot = process.env.GAFUS_LEGACY_QA_OUTPUT_ROOT;
if (legacyRoot && (!legacyRoot.startsWith(join(process.cwd(),'.qa/testing')+'/') ||
    !legacyRoot.endsWith('/legacy') || legacyRoot.includes('..'))) throw Error('WEB_QA_ARTIFACT_ROOT_INVALID');
const artifacts=join(legacyRoot || join(homedir(),'Library/Logs/gafus-refactor-regression'),runId+'-web-chunks');
const sizeArg=process.argv.find(x=>x.startsWith('--chunk-size='));
const chunkSize= sizeArg?Number(sizeArg.split('=')[1]):12;
if(!Number.isInteger(chunkSize)||chunkSize<1||chunkSize>40)throw Error('WEB_CHUNK_SIZE_INVALID');
const sourceFiles=[];
function enumerate(dir){
 for(const entry of readdirSync(dir,{withFileTypes:true})){
  const p=join(dir,entry.name);
  if(entry.isDirectory())enumerate(p);
  else if(entry.isFile()&&/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(entry.name))
   sourceFiles.push(relative(appDir,p));
 }
}
enumerate(repoSrc);sourceFiles.sort();
if(sourceFiles.length<300)throw Error(`WEB_FULL_TEST_DISCOVERY_UNDERFLOW:${sourceFiles.length}`);
// Mount-heavy React suites create suspended lazy resources and large JSDOM
// trees. Keep them in separate fresh Vitest processes to prevent cross-suite
// act() overlap and resource contention. They are NEVER skipped or retried.
// ExcusesRoute timed out starting a fork as batch-10's 12th mount suite
// during 2026-11-19 v13 on 8 GB macOS; its own 12 tests pass isolated.
const isolatedTestFiles=new Set([
 'src/features/articles/ArticleGuestRoutes.mounted.test.tsx',
 'src/features/excuses/ExcusesRoute.mounted.test.tsx',
 'src/features/consultations/ConsultationsConnectedFlow.mounted.test.tsx',
 'src/features/consultations/ConsultationsLivePage.mounted.test.tsx',
 'src/shared/auth/PrincipalIsolation.test.tsx',
]);
for(const file of isolatedTestFiles)if(!sourceFiles.includes(file))
 throw Error(`WEB_ISOLATED_TEST_MISSING:${file}`);
const testBatches=[];
let pending=[];
const flush=()=>{if(pending.length){testBatches.push(pending);pending=[];}};
for(const file of sourceFiles){
 if(isolatedTestFiles.has(file)){flush();testBatches.push([file]);continue;}
 pending.push(file);
 if(pending.length===chunkSize)flush();
}
flush();
const scheduledFiles=testBatches.flat();
if(scheduledFiles.length!==sourceFiles.length ||
 scheduledFiles.some((file,index)=>file!==sourceFiles[index]))
 throw Error('WEB_TEST_PLAN_NOT_EXHAUSTIVE_OR_OUT_OF_ORDER');

mkdirSync(artifacts,{recursive:true});
// A stale completion marker must never survive a new invocation.
const summary={state:'running',runId,filesDiscovered:sourceFiles.length,chunkSize,
 startedAt:new Date().toISOString(),batches:[],testsPassed:0,testsSkipped:0,
 filesPassed:0,filesSkipped:0};
const receipt=join(artifacts,'completion.json');
function persist(){writeFileSync(receipt,JSON.stringify(summary,null,2)+'\n');}
function invoke(label,args,filename){
 const out=join(artifacts,filename);
 const fd=openSync(out,'w',0o600);
 let result;
 try{result=spawnSync('pnpm',['exec',...args],{cwd:appDir,stdio:['ignore',fd,fd],timeout:900_000});}
 finally{closeSync(fd);}
 const content=readFileSync(out,'utf8').replace(/\x1b\[[0-9;]*m/g,'');
 const code=result.status;
 if(result.error||code!==0){
  const tail=content.split('\n').slice(-70).join('\n');
  console.error(`${label} FAILED: exit=${code} error=${result.error??'none'}\n${tail}`);
  summary.state='failed';summary.failedAt=new Date().toISOString();
  summary.error=`${label} exit ${code} ${String(result.error??'')}`;
  persist();process.exit(1);
 }
 return content;
}
persist();
console.log(`WEB_BATCHED_DISCOVERY ${sourceFiles.length} files, chunks=${testBatches.length}, isolated=${isolatedTestFiles.size}; logs=${artifacts}`);
invoke('VITE_CONFIG',['node','--test','vite.config.test.mjs'],'vite-config.log');
console.log('WEB_VITE_CONFIG_PASS');
for(const [batchIndex,list] of testBatches.entries()){
 const n=batchIndex+1;
 const filename=`batch-${String(n).padStart(3,'0')}.log`;
 const log=invoke(`WEB_BATCH_${n}`,['vitest','run',...list,'--maxWorkers=1'],filename);
 const tests=log.match(/Tests\s+(\d+) passed(?:\s*\|\s*(\d+) skipped)?\s+\((\d+)\)/);
 const files=log.match(/Test Files\s+(\d+) passed(?:\s*\|\s*(\d+) skipped)?\s+\((\d+)\)/);
 if(!tests||!files||Number(files[3])!==list.length||Number(files[1])+Number(files[2]??0)!==list.length||Number(tests[1])+Number(tests[2]??0)!==Number(tests[3])){
  summary.state='failed';summary.error=`WEB_BATCH_${n}_COVERAGE_RECEIPT_INVALID`;
  persist();throw Error(summary.error);
 }
 const batch={n,files:list.length,passed:Number(files[1]),skipped:Number(files[2]??0),
  testsPassed:Number(tests[1]),testsSkipped:Number(tests[2]??0),log:filename};
 summary.batches.push(batch);
 summary.filesPassed+=batch.passed;summary.filesSkipped+=batch.skipped;
 summary.testsPassed+=batch.testsPassed;summary.testsSkipped+=batch.testsSkipped;
 persist();
 console.log(`WEB_BATCH_PASS ${n}/${testBatches.length}: files=${list.length} tests=${batch.testsPassed} skipped=${batch.testsSkipped} cumulative=${summary.testsPassed}`);
}
if(summary.filesPassed+summary.filesSkipped!==sourceFiles.length)throw Error('WEB_FULL_TEST_COVERAGE_INCOMPLETE');
summary.state='passed';summary.completedAt=new Date().toISOString();persist();
console.log(`WEB_ALL_CHUNKS_PASS: ${summary.filesPassed} passed files, ${summary.filesSkipped} skipped files; ${summary.testsPassed} passed tests, ${summary.testsSkipped} skipped tests; all ${sourceFiles.length} source test files accounted`);

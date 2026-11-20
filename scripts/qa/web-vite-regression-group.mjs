#!/usr/bin/env node
/** One named, fresh-process group of the existing web-vite regression suite.
 * Each group writes a real, file-complete named test artifact and duration.
 * No retries or passWithNoTests; never changes the legacy package test script.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { verifyWebViteGroupReport } from '../../tests/support/web-vite-group-report.mjs';
import { discoverWebTests, generateWebViteGroups, groupFingerprint } from './web-vite-groups.mjs';
const root=resolve(import.meta.dirname,'../..');
const appDir=join(root,'apps/web-vite');
const manifestPath=join(root,'tests/catalog/web-vite-groups.json');
function main(){
 const [action,groupId]=process.argv.slice(2);
 if(action!=='run' || !/^[a-z0-9-]{3,70}$/.test(groupId||''))throw Error('Usage: node scripts/qa/web-vite-regression-group.mjs run <group-id>');
 const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
 const groups=generateWebViteGroups(discoverWebTests(appDir));
 if(manifest.schema!==1 || manifest.groupFingerprint!==groupFingerprint(groups)||
    JSON.stringify(manifest.groups)!==JSON.stringify(groups))throw Error('WEB_VITE_GROUPS_MANIFEST_STALE');
 const group=groups.find(x=>x.id===groupId);
 if(!group)throw Error('UNKNOWN_WEB_VITE_GROUP:'+groupId);
 let reportPath=process.env.VITEST_REPORT_PATH;
 if(!reportPath){reportPath=join(root,'.qa/testing/web-vite-manual',groupId,'tests.json');}
 if(!reportPath.startsWith(join(root,'.qa/testing')+'/')||!reportPath.endsWith('/tests.json')||reportPath.includes('..'))throw Error('WEB_VITE_REPORT_PATH_UNSAFE');
 mkdirSync(dirname(reportPath),{recursive:true,mode:0o700});
 const outputLog=join(dirname(reportPath),'group-output.log');
 const timeStart=Date.now();
 let args;
 if(group.mode==='node')args=['exec','node','--test','--test-reporter=tap',...group.files];
 else args=['exec','vitest','run',...group.files,'--maxWorkers=1','--reporter=json','--outputFile='+reportPath];
 const result=spawnSync('pnpm',args,{cwd:appDir,encoding:'utf8',timeout:24*60*1000,maxBuffer:40*1024*1024,env:{...process.env,CI:'true'}});
 const wallMs=Date.now()-timeStart;
 const stdio=String(result.stdout||'')+'\n'+String(result.stderr||'');
 writeFileSync(outputLog,stdio,{mode:0o600});
 if(result.error||result.status!==0){
   console.error(`WEB_VITE_GROUP_FAILED:${groupId} exit=${result.status} error=${result.error?.message||'-'} durationMs=${wallMs}\n${stdio.slice(-3200)}`);
   process.exitCode=1;return;
 }
 let report;
 if(group.mode==='node'){
   const extract=(field)=>Number(stdio.match(new RegExp('^# '+field+' (\\d+)$','m'))?.[1]??NaN);
   const total=extract('tests'),passed=extract('pass'),failed=extract('fail'),skipped=extract('skipped'),todo=extract('todo');
   const matched=[...stdio.matchAll(/^ok \d+ - (.+)$/gm)].map(x=>x[1].trim());
   if(!Number.isInteger(total)||total<1||total!==passed||failed!==0||skipped!==0||todo!==0||matched.length!==total)
     throw Error('WEB_VITE_NODE_CONFIG_TAP_EVIDENCE_INVALID:'+JSON.stringify({total,passed,failed,skipped,todo,cases:matched.length}));
   report={success:true,numTotalTests:total,numPassedTests:passed,numFailedTests:0,numPendingTests:0,
     testResults:[{name:join(appDir,'vite.config.test.mjs'),status:'passed',assertionResults:matched.map(name=>({fullName:name,title:name,status:'passed'}))}]};
   writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n',{mode:0o600});
 }else report=JSON.parse(readFileSync(reportPath,'utf8'));
 const expected=group.files.map(f=>'apps/web-vite/'+f);
 const evidence=verifyWebViteGroupReport(report,expected,root);
 const timings=(report.testResults||[]).map(t=>({file:t.name.split('/').at(-1),ms:
   Number.isFinite(t.perfStats?.end-t.perfStats?.start)?t.perfStats.end-t.perfStats.start:
   Number.isFinite(t.endTime-t.startTime)?t.endTime-t.startTime:null})).sort((a,b)=>(b.ms||0)-(a.ms||0));
 const profile={schema:1,group:groupId,mode:group.mode,wallMs,sourceFiles:evidence.fileCount,
   passedCases:evidence.passedCount,startedAt:new Date(timeStart).toISOString(),completedAt:new Date().toISOString(),
   slowestFiles:timings.slice(0,10),retryCount:0,skipCount:evidence.skippedCount,
   skippedNames:evidence.skippedNames,manifestFingerprint:manifest.groupFingerprint};
 writeFileSync(join(dirname(reportPath),'group-profile.json'),JSON.stringify(profile,null,2)+'\n',{mode:0o600});
 console.log(`WEB_VITE_GROUP_PASS ${groupId} files=${evidence.fileCount} cases=${evidence.passedCount} skipped=${evidence.skippedCount} durationMs=${wallMs} profile=${join(dirname(reportPath),'group-profile.json')}`);
}
try{main();}catch(e){console.error('WEB_VITE_GROUP_INCOMPLETE '+(e?.stack||e));process.exitCode=2;}

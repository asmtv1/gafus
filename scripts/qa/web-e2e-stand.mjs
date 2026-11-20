#!/usr/bin/env node
/** Real web + Hono, ephemeral Compose DB. Never launches another Chrome profile. */
import { randomBytes } from 'node:crypto';
import { copyFileSync, createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve, join, dirname } from 'node:path';
import net from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { seedTrainingFixture } from '../../tests/support/training-fixture.mjs';
import { verifyPlaywrightJson } from '../../tests/support/playwright-report-contract.mjs';
import { selectWebE2eExecution } from '../../tests/support/web-e2e-mode.mjs';
const root=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const pg = createRequire(join(root, 'packages/worker/package.json'))('pg');
const project=process.env.GAFUS_QA_PROJECT||'';
const database=new URL(process.env.DATABASE_URL||'postgresql://invalid/');
const redis=new URL(process.env.REDIS_URL||'redis://invalid/');
if (!/^gafusqa[a-f0-9]{12}$/.test(project) || database.hostname!=='127.0.0.1'||
    database.pathname!=='/'+project || redis.hostname!=='127.0.0.1' ||
    process.env.GAFUS_QA_ISOLATED!=='1')throw Error('REFUSE_NONDISPOSABLE_WEB_E2E_STAND');
const out=join(root,'.qa/testing','web-e2e-'+project);
mkdirSync(out,{recursive:true,mode:0o700});
const children=[];
const servers=[];
let cleanup;
const isRunning = (child) => child.pid && child.exitCode === null && child.signalCode === null;
function stop() {
  cleanup ||= (async () => {
    for (const child of children.filter(isRunning)) {
      try { process.kill(-child.pid,'SIGTERM'); } catch {}
    }
    await sleep(1100);
    for (const child of children.filter(isRunning)) {
      try { process.kill(-child.pid,'SIGKILL'); } catch {}
    }
  })();
  return cleanup;
}
async function allocatePort(port=0) {
  return new Promise((resolve,reject) => {
    const socket=net.createServer();
    socket.once('error',reject);
    socket.listen(port,'127.0.0.1',() => {
      const { port }=socket.address();
      socket.close(() => resolve(port));
    });
  });
}
function start(name,args,env){const child=spawn('pnpm',args,{cwd:root,env,stdio:['ignore','pipe','pipe'],detached:true});const log=createWriteStream(join(out,name+'.log'),{flags:'w',mode:0o600});child.stdout.pipe(log,{end:false});child.stderr.pipe(log,{end:false});child.on('close',()=>log.end());children.push(child);return child;}
async function awaitHttp(url, timeoutMs){const until=Date.now()+timeoutMs;while(Date.now()<until){if(servers.some(c=>c.exitCode!==null || c.signalCode!==null))throw Error('SERVICE_EARLY_EXIT');try{const res=await fetch(url,{signal:AbortSignal.timeout(1500)});if(res.status!==502 && res.status!==503 && res.status!==500) return res.status;}catch{}await sleep(450);}throw Error('SERVICE_TIMEOUT '+url);}
async function verify(fixture){const db=new pg.Client({connectionString:database.toString()});await db.connect();try{
 const q=await db.query('SELECT us.status,ut."userId",us."stepOnDayId" FROM "UserStep" us JOIN "UserTraining" ut ON ut.id=us."userTrainingId" WHERE ut."dayOnCourseId"=$1 AND us."stepOnDayId"=$2',[fixture.ids.dayOnCourse,fixture.ids.stepOnDay]);
 const c=await db.query('SELECT status FROM "UserCourse" WHERE "courseId"=$1 AND "userId"=$2',[fixture.ids.course,fixture.ids.learner]);
 return {stepCount:q.rowCount,owner:q.rows[0]?.userId===fixture.ids.learner,step:q.rows[0]?.status,course:c.rows[0]?.status??null};
}finally{await db.end();}}
async function main(){try{
 const automated=selectWebE2eExecution(process.env);
 const apiPort=await allocatePort();
 let webPort;
 do { webPort=await allocatePort(); } while (webPort===apiPort);
 const webOrigin='http://127.0.0.1:'+webPort;
 const fixture=await seedTrainingFixture(database);
 fixture.login=webOrigin+'/login';
 fixture.training=webOrigin+'/trainings/'+fixture.type+'/'+fixture.ids.dayOnCourse;
 const env={...process.env,NODE_ENV:'development',API_HOST:'127.0.0.1',API_PORT:String(apiPort),
    GAFUS_QA_WEB_PORT:String(webPort),
    GAFUS_QA_FRESH_BROWSER_E2E:'1',GAFUS_LOCAL_ISOLATED_API:'1',GAFUS_LOCAL_BROWSER_AUTH:'1',
    CDN_HEALTH_MONITOR_ENABLED:'false',FEED_ENABLED:'false',GALLERY_ENABLED:'false',
    GAFUS_WEB_DEV_API_MODE:'local-hono',VITE_API_BASE_URL:'http://127.0.0.1:4174',
    JWT_SECRET:randomBytes(48).toString('hex'),JWT_REFRESH_SECRET:randomBytes(48).toString('hex'),
    NODE_OPTIONS:'--require '+join(root,'scripts/qa/block-nonlocal-network.cjs')};
 servers.push(start('api',['--filter','@gafus/api','exec','tsx','src/index.ts'],env));
 servers.push(start('web',['--filter','@gafus/web-vite','dev'],env));
 const api=await awaitHttp('http://127.0.0.1:'+apiPort+'/api/v1/auth/me',80000);
 const web=await awaitHttp(fixture.login,80000);
 const ready={runId:project,webOrigin,gitCommit:process.env.GAFUS_TEST_COMMIT||'',apiStatus:api,webStatus:web,fixture,readyAt:new Date().toISOString()};
 writeFileSync(join(out,'ready.json'),JSON.stringify(ready,null,2)+'\n',{mode:0o600});
 console.log('WEB_E2E_STAND_READY '+JSON.stringify({path:out,apiStatus:api,webStatus:web,courseType:fixture.type}));
 const receipt=join(out,'browser-evidence.json');const deadline=Date.now()+15*60*1000;
 let convertedReport=null;
 if(automated){
   const raw=join(out,'playwright-raw.json');
   const browserEnv={PATH:env.PATH,HOME:env.HOME,CI:env.CI,GAFUS_WEB_E2E_READY_FILE:join(out,'ready.json'),
     GAFUS_WEB_E2E_PLAYWRIGHT_REPORT:raw,GAFUS_WEB_E2E_PLAYWRIGHT_ARTIFACTS:join(out,'playwright-artifacts')};
   const code=await new Promise((resolveCode)=>{
     const child=start('playwright',['exec','playwright','test','--config','tests/e2e/web/playwright.config.ts'],browserEnv);
     child.once('close',c=>resolveCode(c??2));child.once('error',()=>resolveCode(2));
   });
   if (code === 1 && existsSync(raw)) {
     const result = JSON.parse(readFileSync(raw, 'utf8'));
     if (result.stats?.unexpected > 0 && !result.errors?.length) process.exitCode = 1;
   }
   if(code!==0||!existsSync(raw))throw Error('PLAYWRIGHT_ASSERTIONS_OR_REPORT_FAILED:'+code);
   convertedReport=verifyPlaywrightJson(JSON.parse(readFileSync(raw,'utf8')),'learner completes training after fresh session');
 }
 while(Date.now()<deadline){
   if(servers.some(c=>c.exitCode!==null || c.signalCode!==null))throw Error('SERVER_EXITED_DURING_BROWSER_E2E');
   if(existsSync(receipt)){
     const evidence=JSON.parse(readFileSync(receipt,'utf8'));
     const sql=await verify(fixture);
     const success=evidence?.runId===project && evidence?.browserCompletion===true && evidence?.freshLoginReadback===true && evidence?.post200===true && sql.stepCount===1 && sql.owner && sql.step==='COMPLETED' && sql.course==='COMPLETED';
     writeFileSync(join(out,'verified.json'),JSON.stringify({schema:1,success,runId:project,sql,observations:evidence},null,2)+'\n');
     if(!success)throw Error('WEB_E2E_BROWSER_OR_SQL_EVIDENCE_MISSING');
     const reportPath=process.env.GAFUS_TEST_REPORT_PATH;
     if(reportPath){
       if(!reportPath.startsWith(join(root,'.qa/testing')+'/') ||
          !reportPath.endsWith('/tests.json') || reportPath.includes('..')){
         throw Error('PLAYWRIGHT_TEST_SYSTEM_REPORT_PATH_UNSAFE');
       }
       // Local Mac: evidence comes from the personal Chrome Playwright Extension,
       // never a fabricated Playwright CLI run. GitHub Actions uses its actual
       // Playwright JSON report; both require the authoritative SQL readback.
       const report=automated?convertedReport:{
         success:true,numFailedTests:0,numPendingTests:0,numPassedTests:1,
         source:'mcpgo-playwright-extension-with-sql-verification',
         testResults:[{name:'tests/e2e/web/training.complete.spec.ts',assertionResults:[{
           title:'learner completes training after fresh session',
           fullName:'learner completes training after fresh session',status:'passed'
         }]}]
       };
       const taskDir=dirname(reportPath);
       if (automated) copyFileSync(join(out,'playwright-raw.json'),join(taskDir,'playwright-raw.json'));
       writeFileSync(join(taskDir,'training-web.json'),JSON.stringify({
         schema:1,commit:ready.gitCommit,testRunId:process.env.GAFUS_TEST_RUN_ID,
         fingerprint:process.env.GAFUS_TEST_PLAN_FINGERPRINT,project,sql,browser:evidence,automated,
       },null,2)+'\n',{mode:0o600,flag:'wx'});
       writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n',{mode:0o600,flag:'wx'});
     } else if(automated) throw Error('PLAYWRIGHT_TEST_SYSTEM_REPORT_PATH_MISSING');
     console.log('WEB_E2E_STAND_PASS '+JSON.stringify({runId:project,sql,mode:automated?'headless-playwright':'personal-chrome'}));return;
   }
   await sleep(650);
 }
 throw Error('BROWSER_E2E_EVIDENCE_TIMEOUT');
}catch(e){console.error('WEB_E2E_STAND_FAILED: '+e.message);process.exitCode ||= 2;}finally{await stop();}}
for(const s of ['SIGINT','SIGTERM'])process.once(s,()=>{process.exitCode=2;void stop();});
main().catch(e=>{console.error(e);process.exitCode=2;void stop();});

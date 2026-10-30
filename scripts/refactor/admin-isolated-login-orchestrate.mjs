/**
 * Starts and stops ONLY OWN ephemeral WORK 3301/5373 process groups.
 * No shared-server shutdown, no remote connections, no production paths.
 * Use via ChatTerminalHub job_start; this script always stops its children.
 */
import { spawn, execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import net from 'node:net';
const root = '/Users/asmtv1/Desktop/gafus-refactor';
const verify = (value, code) => { if (!value) throw Error(code); };
verify(process.cwd() === root && realpathSync(root) === root, 'ROOT_DENIED');
verify(execFileSync('git',['-C',root,'rev-parse','--show-toplevel'],{encoding:'utf8'}).trim()===root,'GIT_ROOT_DENIED');
verify(execFileSync('git',['-C',root,'branch','--show-current'],{encoding:'utf8'}).trim()==='vite','BRANCH_DENIED');
for(const path of ['apps/api','apps/web-vite','scripts/refactor','.local-pg-scratch'])
  verify(realpathSync(`${root}/${path}`).startsWith(root+'/'),`PROJECT_PATH_DENIED_${path}`);
const occupied = (port) => new Promise(resolve => {
  const socket=net.connect({host:'127.0.0.1',port});
  socket.setTimeout(800);
  socket.once('connect',()=>{socket.destroy(); resolve(true)});
  socket.once('error',()=>resolve(false));
  socket.once('timeout',()=>{socket.destroy(); resolve(true)});
});
verify(!(await occupied(3301)) && !(await occupied(5373)),'QA_PORT_IN_USE');
const env = {
  ...process.env,
  GAFUS_ADMIN_ISOLATED_ALTERNATE:'1', GAFUS_WEB1_ALT_HONO:'1',
  GAFUS_LOCAL_ISOLATED_API:'1', GAFUS_LOCAL_BROWSER_AUTH:'1',
  GAFUS_WEB_DEV_API_MODE:'local-hono', GAFUS_WEB_QA_BASE_DIR:root,
  VITE_API_BASE_URL:'http://127.0.0.1:4174',
  GAFUS_CHECK_LIVE_BROWSER_LOGIN:'1',
  API_HOST:'127.0.0.1', API_PORT:'3301',
};
const children=[];
const diagnostics=[];
let terminating=false;
const start=(binary,args)=>{
  const child=spawn(binary,args,{cwd:root,env,detached:true,stdio:['ignore','pipe','pipe']});
  children.push(child);
  for (const stream of [child.stdout,child.stderr]) stream.on('data',chunk=>{
    const raw=String(chunk);
    for(const line of raw.split('\n')) {
      if(line.includes('ISOLATED_HONO_PREFLIGHT_OK')) diagnostics.push('PREFLIGHT_OK');
      if(line.includes('ISOLATED_HONO_PRECHECK_DENIED')) diagnostics.push(line.match(/ISOLATED_HONO_PRECHECK_DENIED:[a-z_]+/)?.[0]??'PREFLIGHT_DENIED');
      if(line.includes('LOCAL_API_ISOLATION_PREFLIGHT_DENIED')) diagnostics.push('API_PREFLIGHT_DENIED');
      if(line.includes('ERR_PNPM')) diagnostics.push('PNPM_ERROR');
      if(line.includes('Cannot find module') || line.includes('ERR_MODULE_NOT_FOUND')) diagnostics.push('MODULE_NOT_FOUND');
      if(line.includes('EADDRINUSE')) diagnostics.push('ADDRESS_ALREADY_IN_USE');
      if(line.includes('Cannot access') || line.includes('ReferenceError')) diagnostics.push('JS_REFERENCE_ERROR');
      if(line.includes('Prisma') && line.includes('error')) diagnostics.push('PRISMA_ERROR');
      if(line.includes('SyntaxError')) {
        diagnostics.push('JS_SYNTAX_ERROR');
        const msg=line.match(/SyntaxError: [A-Za-z0-9 _.:()'-]{1,120}/);
        if(msg) diagnostics.push(msg[0].replace(/\s+/g,'_'));
        const exportName=line.match(/does not provide an export named '([A-Za-z0-9_]+)'/);
        if(exportName) diagnostics.push('MISSING_EXPORT_'+exportName[1]);
        const moduleName=line.match(/requested module '(@gafus\/[A-Za-z0-9_/-]+)'/);
        if(moduleName) diagnostics.push('SOURCE_PACKAGE_'+moduleName[1]);
      }
      const source=line.match(/\/(?:apps|packages)\/[A-Za-z0-9_./-]+\.(?:ts|tsx|js|mjs)(?::\d+(?::\d+)?)?/);
      if(source) diagnostics.push('SRC_'+source[0]);
      if(line.includes('GAFUS_') && line.includes('DENIED')) diagnostics.push('GAFUS_GUARD_DENIED');
    }
  }); // Never log raw server traffic, credentials or PII.
  return child;
};
function cleanup(){
  if(terminating) return;
  terminating=true;
  for(const child of children){
    if(child.pid){try{process.kill(-child.pid,'SIGTERM')}catch{ /* child already exited */ }}
  }
}
process.on('SIGINT',()=>{cleanup(); process.exitCode=130});
process.on('SIGTERM',()=>{cleanup(); process.exitCode=143});
process.on('exit',cleanup);
const pause=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));
const healthy=async(port,path)=>{
  try{const r=await fetch(`http://127.0.0.1:${port}${path}`,{signal:AbortSignal.timeout(1000)});return r.status===200}
  catch{return false}
};
try{
  const hono=start('/bin/zsh',['scripts/refactor/web1-hono-alt.sh','--run']);
  for(let i=0;i<40;i++){
    if(hono.exitCode!==null) throw Error('OWN_HONO_PROCESS_EXITED');
    if(await healthy(3301,'/ready')) break;
    if(i===39) throw Error('OWN_HONO_NOT_READY');
    await pause(500);
  }
  process.stdout.write('OWN_ISOLATED_HONO_3301_READY\n');
  const vite=start('/opt/homebrew/bin/pnpm',['--filter','@gafus/web-vite','exec','vite','--config',`${root}/scripts/refactor/admin-work-vite.config.mjs`]);
  for(let i=0;i<50;i++){
    if(vite.exitCode!==null) throw Error('OWN_VITE_PROCESS_EXITED');
    if(await healthy(5373,'/main-panel')) break;
    if(i===49) throw Error('OWN_VITE_NOT_READY');
    await pause(500);
  }
  process.stdout.write('OWN_ISOLATED_VITE_5373_READY\n');
  const test=spawn('/bin/zsh',['scripts/refactor/admin-moderator-safe-work-run.sh'],{
    cwd:root,env,stdio:['ignore','pipe','pipe'],detached:true,
  });
  children.push(test);
  const output=[];
  test.stdout.on('data',chunk=>{
    // The acceptance runner prints only scenario counts and fixture cleanup.
    const clean=String(chunk).replace(/\x1b\[[0-9;]*m/g,'');
    for(const line of clean.split('\n')) if(line.startsWith('LIVE_WORK_')||line.startsWith('CHROMIUM_')||line.startsWith('WORK_BROWSER_'))
      output.push(line.slice(0,200));
  });
  let failedInfo='';
  test.stderr.on('data',chunk=>{failedInfo=String(chunk).slice(-250)});
  const result=await new Promise(resolve=>test.on('exit',(code,signal)=>resolve({code,signal})));
  for(const item of output) process.stdout.write(item+'\n');
  verify(result.code===0&&!result.signal,`OWN_WORK_ACCEPTANCE_FAILED_${result.code}_${failedInfo.slice(0,80)}`);
  process.stdout.write('OWN_ISOLATED_BROWSER_ADMIN_LOGIN_E2E_PASS\n');
}catch(error){
  process.stdout.write(`OWN_ISOLATED_BROWSER_ACCEPTANCE_FAILED ${error instanceof Error?error.message:'UNKNOWN'} DIAGNOSTIC=${[...new Set(diagnostics)].join(',')}\n`);
  process.exitCode=1;
}finally{
  cleanup();
  await pause(900);
  process.stdout.write('OWN_WORK_SERVERS_TERMINATED\n');
}

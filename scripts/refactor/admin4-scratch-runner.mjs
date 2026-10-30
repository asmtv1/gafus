/** ADMIN-4 only: disposable 127.0.0.1 PG14 cluster, real Hono HTTP + Prisma, zero providers. */
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { createConnection } from 'node:net';
const root='/Users/asmtv1/Desktop/gafus-refactor';
const scratchRoot=join(root,'node_modules','.cache');
const pgPort=55459;
const httpPort=55460;
const name='admin4_scratch_only';
const user='admin4_scratch';
const admin='admin4_pg_admin';
const DATABASE_URL=`postgresql://${user}@127.0.0.1:${pgPort}/${name}?schema=public`;
function run(program,args,env,timeout=120000){
  const result=spawnSync(program,args,{cwd:root,env,encoding:'utf8',timeout,maxBuffer:16*1024*1024});
  if(result.error||result.status!==0){
    const evidence=[result.stdout,result.stderr].filter(Boolean).join('\n').slice(-5500);
    throw Error(`COMMAND_${program.replaceAll('/','_')}_FAILED status=${result.status} ${result.error?.message??''}\n${evidence}`);
  }
  if(result.stdout?.trim()) console.log(program.replace(/.*\//,''),result.stdout.trim().slice(-1800));
}
function portIsFree(port){return new Promise(resolve=>{
  const socket=createConnection({host:'127.0.0.1',port});
  socket.once('connect',()=>{socket.destroy(); resolve(false)});
  socket.once('error',e=>{socket.destroy();resolve(e.code==='ECONNREFUSED')});
  socket.setTimeout(1400,()=>{socket.destroy();resolve(false)});
});}
const expectedRoot=spawnSync('git',['-C',root,'rev-parse','--show-toplevel'],{encoding:'utf8'});
const expectedBranch=spawnSync('git',['-C',root,'branch','--show-current'],{encoding:'utf8'});
if(process.cwd()!==root||resolve(root)!==root||expectedRoot.stdout.trim()!==root||
  expectedBranch.stdout.trim()!=='vite')throw Error('STRICT_REFACTOR_GIT_ROOT_BRANCH_DENIED');
for(const pathname of [root,scratchRoot,join(root,'packages','prisma','schema.prisma')]){
  if(existsSync(pathname)&&lstatSync(pathname).isSymbolicLink())throw Error('SYMLINK_DENIED');
}
if(!(await portIsFree(pgPort))||!(await portIsFree(httpPort)))throw Error('OWN_TEST_PORT_IN_USE_DENIED');
mkdirSync(scratchRoot,{recursive:true});
const owned=mkdtempSync(join(scratchRoot,'admin4-scratch-'));
const marker=join(owned,'ADMIN4_ISOLATED_TEST_ONLY');
writeFileSync(marker,'This empty PG cluster was created only by admin4-scratch-runner and is safe for removal after stopped.\n',{flag:'wx',mode:0o600});
const data=join(owned,'pgdata'), log=join(owned,'pg.log');
const executable=process.env.PATH ?? '/opt/homebrew/bin:/usr/bin:/bin';
const base={PATH:executable, HOME:owned, TMPDIR:owned, PGHOST:'127.0.0.1', PGPORT:String(pgPort), PGUSER:admin, PGCONNECT_TIMEOUT:'5'};
const testEnv={...base, DATABASE_URL, NODE_ENV:'test',
  JWT_SECRET:'admin4-scratch-fake-local-signing-key-0123456789-0123456789',
  JWT_REFRESH_SECRET:'admin4-scratch-local-refresh-key-0123456789-0123456789',
  API_PORT:String(httpPort), API_HOST:'127.0.0.1',
  REDIS_URL:'redis://127.0.0.1:55495/15',
  CDN_HEALTH_MONITOR_ENABLED:'false', GALLERY_ENABLED:'false', FEED_ENABLED:'false',
};
let started=false,stopped=false;
try {
  console.log('ADMIN4_ISOLATION_READY',{postgresPort:pgPort,httpPort,db:name,root,cluster:owned});
  run('initdb',['-D',data,'-U',admin,'--auth-local=trust','--auth-host=trust','--no-instructions'],base,45000);
  run('pg_ctl',['-D',data,'-l',log,'-o',`-p ${pgPort} -h 127.0.0.1 -c unix_socket_directories=`,'-w','start'],base,25000);
  started=true;
  run('psql',['-X','-w','-v','ON_ERROR_STOP=1','-d','postgres','-c',`CREATE ROLE ${user} LOGIN CREATEDB`],base);
  run('createdb',['-w','-O',user,name],base);
  // Absolute URL and isolated role override any implicit package .env values.
  run('pnpm',['--filter','@gafus/prisma','exec','prisma','db','push','--skip-generate','--schema',join(root,'packages/prisma/schema.prisma')],testEnv,360000);
  run('psql',['-X','-w','-v','ON_ERROR_STOP=1','-1','-U',user,'-d',name,'-f',join(root,'packages/prisma/scripts/fresh-db-extras.sql')],testEnv,90000);
  run('pnpm',['--dir','apps/api','exec','tsx','src/test/admin4-real-http.ts'],testEnv,250000);
  console.log('ADMIN4_SCRATCH_REAL_HTTP_PG_PASS');
} catch(error){
  console.error('ADMIN4_SCRATCH_FAILED',String(error).slice(-5800));
  process.exitCode=1;
  if(existsSync(log))console.error('OWN_PG_LOG_LAST',readFileSync(log,'utf8').split('\n').slice(-12).join('\n'));
} finally {
  if(started){try{
    run('pg_ctl',['-D',data,'-m','immediate','-w','stop'],base,30000);
    stopped=true;
  }catch(err){console.error('OWN_PG_STOP_FAILED',String(err));process.exitCode=1;}}
  if((!started||stopped)&&existsSync(marker)&&resolve(owned).startsWith(scratchRoot+sep)&&
    lstatSync(owned).isDirectory()&&!lstatSync(owned).isSymbolicLink()){
    rmSync(owned,{recursive:true});
    console.log('ADMIN4_ONLY_OWN_DISPOSABLE_PG_REMOVED');
  }else console.error('OWN_SCRATCH_RETAINED_FOR_SAFE_MANUAL_INSPECTION',owned);
}

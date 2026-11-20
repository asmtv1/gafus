#!/usr/bin/env node
/** Disposable Compose environment: never accepts an external database or Redis URL. */
import { randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const compose=join(root,'tests/support/compose.yaml');
const token=randomBytes(6).toString('hex');
const project='gafusqa'+token;
const pgUser='qa'+token;
const pgDB='gafusqa'+token;
const pgPass=randomBytes(24).toString('hex');
const redisPass=randomBytes(24).toString('hex');
// Allowlist prevents accidental leakage of production credentials into test children.
const safeEnvNames=['PATH','HOME','TMPDIR','LANG','LC_ALL','TZ','CI','PNPM_HOME','XDG_CACHE_HOME','XDG_CONFIG_HOME','GITHUB_ACTIONS','GAFUS_WEB_E2E_AUTOMATED','GAFUS_TEST_COMMIT','GAFUS_TEST_RUN_ID','GAFUS_TEST_PLAN_FINGERPRINT'];
const env=Object.fromEntries(safeEnvNames.filter(k=>process.env[k]!==undefined).map(k=>[k,process.env[k]]));
Object.assign(env,{QA_PG_USER:pgUser,QA_PG_DB:pgDB,QA_PG_PASSWORD:pgPass,QA_REDIS_PASSWORD:redisPass});
// Forward only a report path owned by this repo's test runner; no other inherited QA secrets.
const reportPath=process.env.GAFUS_TEST_REPORT_PATH;
if(reportPath){
 const safeBase=join(root,'.qa/testing')+'/';
 if(!reportPath.startsWith(safeBase)||reportPath.includes('..')||!reportPath.endsWith('/tests.json')){
   throw Error('REFUSE_NON_QA_REPORT_PATH');
 }
 env.GAFUS_TEST_REPORT_PATH=reportPath;
}

const postgresImages = new Map([['15','postgres:15.15-alpine'],['18','postgres:18-alpine']]);
const postgresVersion = process.env.GAFUS_QA_POSTGRES || '15';
if (!postgresImages.has(postgresVersion)) throw Error('Unsupported QA PostgreSQL compatibility profile');
env.QA_PG_IMAGE = postgresImages.get(postgresVersion);
// PostgreSQL 18 changed the image volume target and default PGDATA.
env.QA_PG_VOLUME_TARGET = postgresVersion === '18' ? '/var/lib/postgresql' : '/var/lib/postgresql/data';

const common=['compose','--project-name',project,'--file',compose];
function docker(args, timeout=120000){
 const r=spawnSync('docker',[...common,...args],{cwd:root,env,encoding:'utf8',timeout,maxBuffer:2_000_000});
 if(r.error || r.status!==0)throw new Error(`Docker Compose ${args[0]} failed (${r.status??'start'}): ${String(r.stderr||r.error||'').slice(0,900)}`);
 return r.stdout.trim();
}
let attempted=false,child=null,cleaned=false;
function cleanup(){if(cleaned||!attempted)return;cleaned=true;
 try{docker(['down','--volumes','--remove-orphans'],90000);}catch(e){console.error('TEST_ENV_CLEANUP_INCOMPLETE:',e.message);process.exitCode=2;}
}
function fail(message){console.error('TEST_ENV_INCOMPLETE:',message);process.exitCode=2;}
function assertLocalAddress(text,service){
 const candidate=text.trim().split('\n').at(-1);
 const m=candidate?.match(/^(?:127\.0\.0\.1|\[::1\]):(\d{2,5})$/);
 if(!m)throw Error(`${service}: unexpected published port ${JSON.stringify(candidate)}`);
 const port=Number(m[1]);if(port<1024||port>65535)throw Error(`${service}: invalid port`);
 return port;
}
async function main(){
 if(!['with','with-functional'].includes(process.argv[2])||process.argv[3]!=='--'||!process.argv[4]){
  fail('Usage: node tests/support/test-env.mjs with|with-functional -- <command> [args...]');return;
 }
 const available=spawnSync('docker',['info','--format','{{.ServerVersion}}'],{encoding:'utf8',timeout:7000});
 if(available.status!==0){fail('Docker Engine not running or inaccessible; no environment was created');return;}
 for(const sig of ['SIGINT','SIGTERM'])process.once(sig,()=>{child?.kill(sig);cleanup();process.exitCode=2;});
 try {
  attempted=true;
  docker(['up','--detach','--wait','--wait-timeout','90'],150000);
  const pgPort=assertLocalAddress(docker(['port','postgres','5432']), 'PostgreSQL');
  const redisPort=assertLocalAddress(docker(['port','redis','6379']), 'Redis');
  // The child gets only newly generated loopback credentials. No .env files and no inherited production DB endpoints.
  env.DATABASE_URL=`postgresql://${pgUser}:${pgPass}@127.0.0.1:${pgPort}/${pgDB}?schema=public`;
  env.REDIS_URL=`redis://:${redisPass}@127.0.0.1:${redisPort}/0`;
  env.NODE_ENV='test';env.GAFUS_QA_ISOLATED='1';env.GAFUS_QA_PROJECT=project;
  console.log(`TEST_ENV_READY project=${project} postgres=127.0.0.1:${pgPort} redis=127.0.0.1:${redisPort}`);
  // Strict default tests the actual migration ledger. Functional mode only checks behavior
  // against the current schema, and MUST NOT be used as a migration or release approval.
  const functional=process.argv[2]==='with-functional';
  if(functional)console.error('TEST_ENV_FUNCTIONAL_DB_PUSH_NOT_MIGRATION_PROOF');
  const prismaArgs=functional?['db','push','--skip-generate']:['migrate','deploy'];
  const migration=spawnSync('pnpm',['--filter','@gafus/prisma','exec','prisma',...prismaArgs],{cwd:root,env,encoding:'utf8',timeout:120000});
  if(migration.status!==0)throw Error(`schema preparation (${prismaArgs.join(' ')}) failed: ${(migration.stderr||migration.stdout||'').slice(-1200)}`);
  child=spawn(process.argv[4],process.argv.slice(5),{cwd:root,env,stdio:'inherit',shell:false});
  const exit=await new Promise((res)=>{child.once('error',e=>{console.error('TEST_ENV_CHILD_ERROR:',e.message);res(2);});child.once('close',code=>res(code??2));});
  if(exit!==0)process.exitCode=exit;
 }catch(e){fail(e.message);}finally{cleanup();}
}
main().catch(e=>{fail(e.message);cleanup();});

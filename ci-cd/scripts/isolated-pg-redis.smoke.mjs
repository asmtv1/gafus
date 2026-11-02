/** Explicit opt-in local real PostgreSQL/Redis concurrency and failure smoke.
 * No .env, no production hosts, no user data. Creates a unique INTERNAL Docker
 * Docker bridge, ephemeral tmpfs databases, and loopback-only random host ports.
 * Own resources are removed in finally; existing containers are never touched.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const { Client }=require('pg');
const Redis=require('ioredis');
const suffix=crypto.randomBytes(5).toString('hex');
const network=`gafus-archqa-${suffix}`;
const postgres=`gafus-archqa-pg-${suffix}`;
const redisName=`gafus-archqa-redis-${suffix}`;
const password=crypto.randomBytes(24).toString('hex');
const user='gafus_refactor_qa',database='gafus_refactor_archqa';
const owned=[];
function docker(...args){
 const r=spawnSync('docker',args,{encoding:'utf8',timeout:45_000});
 if(r.status!==0)throw new Error(`ISOLATED_DOCKER_COMMAND_FAILED: ${args[0]} ${args[1]??''}: ${String(r.stderr).slice(-220)}`);
 return r.stdout.trim();
}
function port(name,service){
 const value=docker('port',name,service).split('\n')[0];
 const match=/127\.0\.0\.1:(\d+)$/.exec(value);
 if(!match)throw Error('ISOLATED_PORT_NOT_LOOPBACK');
 return Number(match[1]);
}
async function waitFor(check,label){
 for(let i=0;i<65;i++){
  try{await check();return;}catch{await new Promise(r=>setTimeout(r,200));}
 }
 throw Error(`ISOLATED_${label}_NOT_READY`);
}
let first,second,redis;
try{
 docker('network','create','--driver','bridge',network);owned.push(['network',network]);
 docker('run','-d','--rm','--name',postgres,'--network',network,
  '-p','127.0.0.1::5432','--tmpfs','/var/lib/postgresql/data:rw,size=512m',
  '-e',`POSTGRES_PASSWORD=${password}`,'-e',`POSTGRES_USER=${user}`,
  '-e',`POSTGRES_DB=${database}`,'-e','PGDATA=/var/lib/postgresql/data/pgdata',
  'postgres:18-alpine');owned.push(['container',postgres]);
 docker('run','-d','--rm','--name',redisName,'--network',network,
  '-p','127.0.0.1::6379','--tmpfs','/data:rw,size=16m',
  'redis:7-alpine','redis-server','--save','','--appendonly','no');
 owned.push(['container',redisName]);
 const pgPort=port(postgres,'5432/tcp'),redisPort=port(redisName,'6379/tcp');
 const connect=()=>new Client({host:'127.0.0.1',port:pgPort,user,password,database,
  connectionTimeoutMillis:2000,statement_timeout:3000});
 await waitFor(async()=>{
  const probe=connect();
  try{await probe.connect();await probe.query('SELECT 1');}
  finally{await probe.end().catch(()=>{});}
 },'POSTGRES');
 first=connect();second=connect();
 await first.connect();await second.connect();
 redis=new Redis({host:'127.0.0.1',port:redisPort,enableOfflineQueue:false,
  maxRetriesPerRequest:0,retryStrategy:()=>null,connectTimeout:1000,lazyConnect:true});
 await waitFor(async()=>{if(redis.status!=='ready')await redis.connect();await redis.ping();},'REDIS');

 await first.query(`CREATE TABLE IF NOT EXISTS synthetic_task (
    id integer primary key, status text not null, attempts integer not null default 0,
    lease_until timestamptz, next_attempt_at timestamptz not null default now())`);
 await first.query("INSERT INTO synthetic_task(id,status) VALUES(1,'QUEUED'),(2,'QUEUED')");
 await first.query('BEGIN');
 const claim=await first.query(`UPDATE synthetic_task SET status='PROCESSING',attempts=attempts+1,
    lease_until=now()+interval '5 seconds' WHERE id IN (
    SELECT id FROM synthetic_task WHERE status='QUEUED' ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1
    ) RETURNING id`);
 assert.deepEqual(claim.rows.map(row=>row.id),[1]);
 await second.query('BEGIN');
 const parallel=await second.query(`UPDATE synthetic_task SET status='PROCESSING',attempts=attempts+1,
    lease_until=now()+interval '5 seconds' WHERE id IN (
    SELECT id FROM synthetic_task WHERE status='QUEUED' ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1
    ) RETURNING id`);
 assert.deepEqual(parallel.rows.map(row=>row.id),[2]);
 await second.query('COMMIT');
 await first.query('ROLLBACK'); // Simulated worker failure: unfinished claim becomes QUEUED.
 const afterCrash=await first.query('SELECT id,status,attempts FROM synthetic_task ORDER BY id');
 assert.deepEqual(afterCrash.rows,[{id:1,status:'QUEUED',attempts:0},
   {id:2,status:'PROCESSING',attempts:1}]);
 const reclaim=await first.query(`UPDATE synthetic_task SET status='PROCESSING',attempts=attempts+1,
   lease_until=now()+interval '5 seconds' WHERE id IN (
    SELECT id FROM synthetic_task WHERE status='QUEUED' ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1
   ) RETURNING id`);
 assert.equal(reclaim.rows[0].id,1);
 const claimed=await first.query("SELECT count(*)::integer AS value FROM synthetic_task WHERE status='PROCESSING'");
 assert.equal(claimed.rows[0].value,2);
 console.log('POSTGRES_SKIP_LOCKED_CONCURRENT_CLAIM_AND_ROLLBACK_RECOVERY_PASS');

 const key='gafus_archqa:dedupe:'+suffix;
 assert.equal(await redis.set(key,'job-a','PX',5000,'NX'),'OK');
 assert.equal(await redis.set(key,'job-b','PX',5000,'NX'),null);
 assert.equal(await redis.get(key),'job-a');
 await redis.del(key);
 assert.equal(await redis.set(key,'job-b','PX',5000,'NX'),'OK');
 console.log('REDIS_NX_IDEMPOTENCY_AND_RETRY_PASS');

 // Lease expiry is a recoverable state; processor state remains in durable PG.
 await first.query("UPDATE synthetic_task SET lease_until=now()-interval '1 second' WHERE id=1");
 const stalled=await first.query("SELECT id FROM synthetic_task WHERE status='PROCESSING' AND lease_until < now() ORDER BY id");
 assert.deepEqual(stalled.rows.map(row=>row.id),[1]);
 console.log('POSTGRES_STALE_MEDIA_LEASE_DETECTED_PASS');

 // Simulated Redis outage: an unavailable queue must fail rather than falsely
 // acknowledge a wake, while the durable PostgreSQL task remains recoverable.
 redis.disconnect();
 await assert.rejects(() => redis.set(key,'job-c','PX',5000,'NX'));
 const stillDurable=await first.query("SELECT count(*)::integer AS value FROM synthetic_task");
 assert.equal(stillDurable.rows[0].value,2);
 console.log('REDIS_OUTAGE_FAIL_CLOSED_POSTGRES_TASKS_INTACT_PASS');
} finally {
 if(redis)try{redis.disconnect();}catch{}
 for(const client of [second,first])if(client)try{await client.end();}catch{}
 for(const [kind,name] of owned.reverse()){
  try{
    if(kind==='container')docker('rm','-f',name);
    else docker('network','rm',name);
  }catch(error){console.error('ISOLATED_RESOURCE_CLEANUP_FAILED',kind,name,String(error).slice(0,160));}
 }
}

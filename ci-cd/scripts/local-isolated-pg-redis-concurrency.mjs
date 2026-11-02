/** Real PostgreSQL and Redis concurrency/failure checks, synthetic data only.
 * All containers are ephemeral, internal-only, have NO published ports, and
 * use locally cached images. This never reads .env or project databases.
 */
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
const tag=randomUUID().replaceAll('-', '').slice(0,12);
const network=`gafus-audit-private-${tag}`;
const pg=`gafus-audit-pg-${tag}`;
const redis=`gafus-audit-redis-${tag}`;
const db=`gafus_refactor_audit_${tag}`;
const password=`synthetic-${tag}`;
function run(args, timeout=12000) {
  const r=spawnSync('docker',args,{encoding:'utf8',timeout});
  if(r.error || r.status!==0) throw Error(`DOCKER_COMMAND_FAILED(${args[0]}):${r.stderr||r.error}`);
  return r.stdout.trim();
}
function sql(statement){
  return run(['exec',pg,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','audit','-d',db,'-c',statement]);
}
async function ready(cmd, expectValue) {
  for(let i=0;i<30;i++) {
    const r=spawnSync('docker',cmd,{encoding:'utf8',timeout:2000});
    if(r.status===0 && r.stdout.includes(expectValue)) return;
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  throw Error(`CONTAINER_READINESS_TIMEOUT:${cmd[1]}`);
}
async function execute() {
  for(const image of ['postgres:18-alpine','redis:7-alpine']) {
    run(['image','inspect',image]); // fail rather than download any image
  }
  run(['network','create','--internal',network]);
  run(['run','-d','--rm','--network',network,'--name',pg,
    '-e','POSTGRES_USER=audit','-e',`POSTGRES_PASSWORD=${password}`,
    '-e',`POSTGRES_DB=${db}`,'postgres:18-alpine']);
  run(['run','-d','--rm','--network',network,'--name',redis,'redis:7-alpine',
    'redis-server','--save','','--appendonly','no']);
  await ready(['exec',pg,'pg_isready','-U','audit','-d',db], 'accepting connections');
  await ready(['exec',redis,'redis-cli','PING'],'PONG');
  sql("CREATE TABLE audit_lease (id integer PRIMARY KEY, status text NOT NULL); INSERT INTO audit_lease VALUES (1,'pending')");
  // Parallel clients: one transaction owns a row, the other must SKIP it.
  const holder=spawn('docker',['exec','-i',pg,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','audit','-d',db],
    {stdio:['pipe','pipe','pipe']});
  const acquired=new Promise((resolve,reject)=>{
    let output='';const timeout=setTimeout(()=>reject(Error('LOCK_ACQUIRE_TIMEOUT')),6000);
    holder.stdout.on('data',chunk=>{
      output+=chunk; if(output.includes('LOCK_HELD')){clearTimeout(timeout);resolve();}
    });
    holder.on('error',reject);
  });
  holder.stdin.write("BEGIN;\nSELECT 'LOCK_HELD' FROM audit_lease WHERE id=1 FOR UPDATE;\n");
  await acquired;
  assert.equal(sql('SELECT count(*) FROM (SELECT id FROM audit_lease FOR UPDATE SKIP LOCKED) t'),'0');
  const finished=new Promise((resolve,reject)=>holder.once('exit',code=>code===0?resolve():reject(Error('HOLDER_FAILED'))));
  holder.stdin.end("UPDATE audit_lease SET status='committed' WHERE id=1;\nCOMMIT;\n");
  await finished;
  assert.equal(sql('SELECT status FROM audit_lease WHERE id=1'),'committed');
  assert.equal(sql('SELECT count(*) FROM (SELECT id FROM audit_lease FOR UPDATE SKIP LOCKED) t'),'1');
  // SQL failure simulates a processor crash mid-write: no half-commit.
  const failed=spawnSync('docker',['exec',pg,'psql','-X','-qAt','-v','ON_ERROR_STOP=1',
    '-U','audit','-d',db,'-c',"BEGIN; UPDATE audit_lease SET status='partial' WHERE id=1; SELECT 1/0; COMMIT;"],
    {encoding:'utf8',timeout:7000});
  assert.notEqual(failed.status,0);
  assert.equal(sql('SELECT status FROM audit_lease WHERE id=1'),'committed');
  const redisCli=(...a)=>run(['exec',redis,'redis-cli','--raw',...a]);
  assert.equal(redisCli('SET','audit:lease','owner1','PX','5000','NX'),'OK');
  assert.equal(redisCli('SET','audit:lease','owner2','PX','5000','NX'),'');
  const compareDelete="if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end";
  assert.equal(redisCli('EVAL',compareDelete,'1','audit:lease','owner2'),'0');
  assert.equal(redisCli('GET','audit:lease'),'owner1');
  assert.equal(redisCli('EVAL',compareDelete,'1','audit:lease','owner1'),'1');
  assert.equal(redisCli('SET','audit:lease','owner2','PX','5000','NX'),'OK');
  // Real Redis outage: client operation must fail, never claim a new lease.
  const stopped=spawnSync('docker',['exec',redis,'redis-cli','SHUTDOWN','NOSAVE'],{encoding:'utf8',timeout:5000});
  assert.notEqual(stopped.status,124); // Redis exits; CLI result may be 0 or connection closed.
  const outage=spawnSync('docker',['exec',redis,'redis-cli','PING'],{encoding:'utf8',timeout:5000});
  assert.notEqual(outage.status,0);
  console.log('PASS isolated real PostgreSQL SKIP LOCKED/rollback; Redis NX/compare-delete/outage');
}
try { await execute(); }
catch(error) {
  const pgLogs=spawnSync('docker',['logs','--tail','25',pg],{encoding:'utf8',timeout:5000});
  console.error('PG_DIAGNOSTIC:',(pgLogs.stderr||pgLogs.stdout).slice(-1800));
  throw error;
} finally {
  for(const name of [pg,redis]) spawnSync('docker',['rm','-f',name],{stdio:'ignore',timeout:12000});
  spawnSync('docker',['network','rm',network],{stdio:'ignore',timeout:12000});
}

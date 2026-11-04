/**
 * Opt-in Chat2 V2 queue crash/retry/lease/cleanup acceptance on fresh own PG18.
 * No registry, Docker, S3, MinIO, production or existing PostgreSQL connections.
 * Refuse to run if < 12GiB available, preserving 8GiB fixed host reserve.
 */
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const isVideoMinio = process.argv[2] === '--video-minio';
const isFeedVideoMinio = process.argv[2] === '--feed-video-minio';
const isQuestionsPhotoMinio = process.argv[2] === '--questions-photo-minio';
const isRealtimeAcl = process.argv[2] === '--realtime-acl';
const isRealtimeWs = process.argv[2] === '--realtime-ws';
const useMinio = isVideoMinio || isFeedVideoMinio || isQuestionsPhotoMinio;
assert(process.argv.length <= 3 && (!process.argv[2] || useMinio || isRealtimeAcl || isRealtimeWs), 'ONLY_EXPLICIT_VIDEO_MINIO_OR_ACL_OR_WS_OPTION');
const scratch = join(root, '.gafus-refactoring/architecture-qa-20261103-local/queue');
const pgBin = '/opt/homebrew/opt/postgresql@18/bin';
const cli = join(root, 'packages/prisma/node_modules/.bin/prisma');
const postgres = command => join(pgBin,command);
const disk = spawnSync('df',['-k',root],{encoding:'utf8',timeout:3000});
assert.equal(disk.status,0,'DISK_GATE_FAILED');
const freeKiB = Number(disk.stdout.trim().split('\n').at(-1).trim().split(/\s+/)[3]);
assert(freeKiB >= 12*1024*1024,`NOT_ENOUGH_DISK_RESERVE freeKiB=${freeKiB}`);
for (const executable of ['initdb','pg_ctl','postgres','createdb'])
  assert(existsSync(postgres(executable)),`POSTGRES_18_LOCAL_BINARY_MISSING:${executable}`);
const v = spawnSync(postgres('postgres'),['--version'],{encoding:'utf8',timeout:3000});
assert.equal(v.status,0);
assert(/PostgreSQL\) 18\./.test(v.stdout),'POSTGRES_18_REQUIRED');
mkdirSync(scratch,{recursive:true});
const dir = mkdtempSync(join(scratch,'own-pg18-'));
const data=join(dir,'data');
const db=`${isFeedVideoMinio || isQuestionsPhotoMinio ? 'archqa_schema' : 'archqa_queue'}_${randomUUID().replaceAll('-','').slice(0,12)}`;
const user=`qa_${randomUUID().replaceAll('-','')}`;
const baseEnv={PATH:`${pgBin}:${process.env.PATH??'/usr/bin:/bin'}`,
  HOME:dir,LC_ALL:'C',LANG:'C',NODE_ENV:'test',PRISMA_HIDE_UPDATE_MESSAGE:'true',
  PGAPPNAME:'gafus_refactor_chat2_archqa_queue',PGCONNECT_TIMEOUT:'3'};
const exec=(command,args,{timeout=15000,allowFailure=false,env={}}={})=>{
  const r=spawnSync(command,args,{cwd:root,env:{...baseEnv,...env},encoding:'utf8',
    timeout,maxBuffer:4*1024*1024});
  if (!allowFailure) assert.equal(r.status,0,`${command.split('/').at(-1)} FAILED: ${String(r.stderr).slice(-1150)} ${String(r.stdout).slice(-500)}`);
  return r;
};
async function freePort(){
  const s=createServer();
  await new Promise((yes,no)=>{s.once('error',no);s.listen(0,'127.0.0.1',yes);});
  const addr=s.address();assert(addr && typeof addr==='object');
  await new Promise(resolve=>s.close(resolve));return addr.port;
}
let booted=false;
let minio=null;
let localBroker=null, localRedis=null;
let realtimeOptions={};
async function stopOwnIsolated(name, child) {
  if(!child) return;
  if(child.exitCode!==null) return;
  const finished=new Promise(resolve=>child.once('exit',resolve));
  child.kill('SIGTERM');
  await Promise.race([finished,pause(4000)]);
  if(child.exitCode===null){child.kill('SIGKILL');await Promise.race([finished,pause(2000)]);}
  assert(child.exitCode!==null,`OWN_${name}_NOT_STOPPED_REFUSE_TO_DELETE`);
}

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function stopOwnMinio() {
  if(!minio)return;
  const child=minio;minio=null;
  if(child.exitCode!==null)return;
  const exited=new Promise(resolve=>child.once('exit',resolve));
  child.kill('SIGTERM');
  await Promise.race([exited,pause(3000)]);
  if(child.exitCode===null){child.kill('SIGKILL');await Promise.race([exited,pause(1500)]);}
  assert(child.exitCode!==null,'OWN_MINIO_NOT_STOPPED_REFUSE_TO_DELETE');
}
try {
  const port=await freePort();
  exec(postgres('initdb'),['-D',data,'--no-instructions','--encoding=UTF8',
    '--no-locale','--auth-host=trust','--auth-local=trust','--username',user],{timeout:30000});
  appendFileSync(join(data,'postgresql.conf'),`\nlisten_addresses='127.0.0.1'\nport=${port}\nunix_socket_directories=''\nmax_connections=20\nshared_buffers='32MB'\n`);
  const logfile=join(dir,'postgres.log');
  const started=exec(postgres('pg_ctl'),['-D',data,'-l',logfile,'-w','-t','20','start'],
    {allowFailure:true,timeout:35000});
  if(started.status !== 0)throw Error('OWN_PG18_BOOT_FAIL '+started.stderr.slice(-200)+' '+
    (existsSync(logfile)?readFileSync(logfile,'utf8').slice(-500):''));
  booted=true;
  exec(postgres('createdb'),['-h','127.0.0.1','-p',String(port),'-U',user,db]);
  const url=`postgresql://${user}@127.0.0.1:${port}/${db}?schema=public`;
  exec(cli,['db','push','--skip-generate','--schema',join(root,'packages/prisma/schema.prisma')],
    {timeout:120000,env:{DATABASE_URL:url}});
  console.log(`OWN_LOCAL_PG18_QUEUE_DB_CREATED=db_archqa_nonprod port=${port} databaseNameVerifiedByTest=yes`);
  const optionalS3 = {};
  if (useMinio) {
    const binary=join(root,'.gafus-refactoring/architecture-qa-20261103-local/minio-source/bin/minio');
    assert(existsSync(binary),'PINNED_LOCAL_MINIO_BINARY_REQUIRED_NO_DOWNLOAD');
    const s3Port=await freePort(), consolePort=await freePort();
    assert(s3Port!==consolePort,'MINIO_PORTS_MUST_DIFFER');
    const objects=join(dir,'objects');mkdirSync(objects);
    const accessKey=`qa${randomBytes(9).toString('hex')}`;
    const secretKey=randomBytes(32).toString('hex');
    const logFd=join(dir,'minio.log');
    minio=spawn(binary,['server',objects,'--address',`127.0.0.1:${s3Port}`,
      '--console-address',`127.0.0.1:${consolePort}`],{
      cwd:dir,env:{PATH:baseEnv.PATH,HOME:dir,TMPDIR:dir,
        MINIO_ROOT_USER:accessKey,MINIO_ROOT_PASSWORD:secretKey,MINIO_BROWSER:'off',
        MINIO_UPDATE:'off',GOMAXPROCS:'2',GOMEMLIMIT:'512MiB'},
      stdio:['ignore','ignore','ignore'],
    });
    let healthy=false;
    for(let i=0;i<80;i++){
      if(minio.exitCode!==null)break;
      try{
        const res=await fetch(`http://127.0.0.1:${s3Port}/minio/health/live`,{
          signal:AbortSignal.timeout(700)});
        if(res.status===200){healthy=true;break;}
      }catch{/* startup */}
      await pause(250);
    }
    assert(healthy, 'OWN_MINIO_NOT_HEALTHY');
    const require=createRequire(join(root,'packages/gallery-storage/package.json'));
    const {S3Client,CreateBucketCommand}=require('@aws-sdk/client-s3');
    const client=new S3Client({endpoint:`http://127.0.0.1:${s3Port}`,forcePathStyle:true,
      region:'us-east-1',credentials:{accessKeyId:accessKey,secretAccessKey:secretKey},maxAttempts:1});
    const bucket = isFeedVideoMinio || isQuestionsPhotoMinio
      ? `gafus-archqa-gallery-${randomBytes(6).toString('hex')}` : 'gafus-chat2-media-2026';
    try{await client.send(new CreateBucketCommand({Bucket:bucket}));}
    finally{client.destroy();}
    if(isFeedVideoMinio || isQuestionsPhotoMinio) Object.assign(optionalS3,{
      GAFUS_ARCHQA_FEED_REALPG:'1',GAFUS_ARCHQA_DB_NAME:db,
      GAFUS_ARCHQA_GALLERY_ENDPOINT:`http://127.0.0.1:${s3Port}`,
      GAFUS_ARCHQA_GALLERY_BUCKET:bucket,GAFUS_ARCHQA_GALLERY_KEY:accessKey,
      GAFUS_ARCHQA_GALLERY_SECRET:secretKey,GAFUS_ARCHQA_VIDEO_OWN_DIR:dir,
      GAFUS_ARCHQA_QUESTIONS_REALPG:isQuestionsPhotoMinio ? '1' : '0',
    });
    else Object.assign(optionalS3,{
      GAFUS_ARCHQA_VIDEO_MINIO_PG:'1',GAFUS_ARCHQA_VIDEO_S3_ENDPOINT:`http://127.0.0.1:${s3Port}`,
      GAFUS_ARCHQA_VIDEO_S3_KEY:accessKey,GAFUS_ARCHQA_VIDEO_S3_SECRET:secretKey,
      GAFUS_ARCHQA_VIDEO_OWN_DIR:dir,GAFUS_ARCHQA_VIDEO_DB:db,
    });
  }
  if(isRealtimeWs){
    // An existing 8039 Centrifugo and .local-pg-scratch are FOREIGN. Reuse only
    // its immutable pinned v6 binary as executable; never its process/config.
    const brokerBin=join(root,'.local-pg-scratch/chat2-bin/centrifugo');
    const redisBin='/opt/homebrew/bin/redis-server';
    assert(existsSync(brokerBin) && existsSync(redisBin),'OWN_WS_RUNTIME_BINARY_MISSING');
    const fingerprint=exec('/usr/bin/shasum',['-a','256',brokerBin],{timeout:10000}).stdout.split(/\s+/)[0];
    assert.equal(fingerprint,'e0068f14dbafe5032448395159c83315f375793dcca545a13ffab39a51964e12',
      'CENTRIFUGO_V6_LOCAL_BINARY_CHANGED_REVIEW_BEFORE_EXECUTION');
    const redisPort=await freePort();
    localRedis=spawn(redisBin,['--bind','127.0.0.1','--port',String(redisPort),
      '--save','','--appendonly','no','--protected-mode','yes','--maxmemory','64mb',
      '--dir',dir,'--logfile',join(dir,'redis.log')],{
      cwd:dir,env:{PATH:baseEnv.PATH,HOME:dir},stdio:['ignore','ignore','ignore']});
    const redisCli='/opt/homebrew/bin/redis-cli';
    let redisHealthy=false;
    for(let k=0;k<60;k++){
      if(localRedis.exitCode!==null)break;
      const probe=exec(redisCli,['-h','127.0.0.1','-p',String(redisPort),'ping'],
        {timeout:1300,allowFailure:true});
      if(probe.status===0&&probe.stdout.trim()==='PONG'){redisHealthy=true;break;}
      await pause(100);
    }
    assert(redisHealthy,'OWN_REDIS_NOT_READY');
    const brokerPort=await freePort();
    const subscribeProxyPort=await freePort();
    assert(subscribeProxyPort!==brokerPort && subscribeProxyPort!==redisPort);
    const jwtSecret=`gafus-archqa-only-${randomBytes(32).toString('hex')}`;
    const apiSecret=`gafus-archqa-api-${randomBytes(32).toString('hex')}`;
    // Only proxy-only subscriptions may pass; legacy room JWT key is invalid.
    const dedicatedSubscriptionSecret=randomBytes(32).toString('hex');
    const proxySecret=`gafus-archqa-proxy-${randomBytes(32).toString('hex')}`;
    const configPath=join(dir,'own-centrifugo.json');
    // Load the real reviewed broker configuration template, replacing only
    // local synthetic secrets/ports. Never use or alter the live config.
    const source=join(root,'infra/chat2/centrifugo.proxy-only.review.json');
    const conf=JSON.parse(readFileSync(source,'utf8'));
    assert(conf.channel?.namespaces?.find(n=>n.name==='chat2')?.subscribe_proxy_enabled===true,
      'REVIEWED_BROKER_TEMPLATE_PROXY_GATE_REQUIRED');
    assert(conf.client?.subscription_token?.enabled===true,
      'REVIEWED_BROKER_TEMPLATE_DISTINCT_KEY_REQUIRED');
    conf.client.allowed_origins=['http://127.0.0.1'];
    conf.client.token.hmac_secret_key=jwtSecret;
    conf.client.subscription_token.hmac_secret_key=dedicatedSubscriptionSecret;
    conf.channel.proxy.subscribe.endpoint=`http://127.0.0.1:${subscribeProxyPort}/internal/chat2/chat2-subscribe`;
    conf.channel.proxy.subscribe.http.static_headers['X-GAFUS-Subscribe-Proxy-Key']=proxySecret;
    conf.engine={type:'memory'};
    conf.broker={type:'memory'};
    conf.http_api={key:apiSecret};
    assert(jwtSecret!==dedicatedSubscriptionSecret && proxySecret!==jwtSecret,
      'OWN_BROKER_SECRETS_MUST_DIFFER');
    writeFileSync(configPath,JSON.stringify(conf),{mode:0o600});
    exec(brokerBin,['checkconfig','-c',configPath,'--strict'],{timeout:10000});
    localBroker=spawn(brokerBin,['--config',configPath,
      '--http_server.address','127.0.0.1','--http_server.port',String(brokerPort),
      '--log.level','error'],{cwd:dir,
      env:{PATH:baseEnv.PATH,HOME:dir,TMPDIR:dir,GOMAXPROCS:'2',GOMEMLIMIT:'256MiB'},
      stdio:['ignore','ignore','ignore']});
    let brokerHealthy=false;
    for(let k=0;k<80;k++){
      if(localBroker.exitCode!==null)break;
      try{
        const res=await fetch(`http://127.0.0.1:${brokerPort}/health`,
          {signal:AbortSignal.timeout(700)});
        if(res.status===200){brokerHealthy=true;break;}
      }catch{/*startup*/}
      await pause(125);
    }
    assert(brokerHealthy,'OWN_CENTRIFUGO_NOT_HEALTHY');
    realtimeOptions={
      GAFUS_ARCHQA_REALTIME_WS:'1',
      GAFUS_ARCHQA_PROXY_ONLY:'1',
      JWT_SECRET:`gafus-archqa-access-${randomBytes(32).toString('hex')}`,
      GAFUS_ARCHQA_BROKER_URL:`http://127.0.0.1:${brokerPort}`,
      GAFUS_ARCHQA_SUBSCRIBE_PROXY_PORT:String(subscribeProxyPort),
      GAFUS_ARCHQA_SUBSCRIBE_PROXY_SECRET:proxySecret,
      CHAT2_SUBSCRIBE_PROXY_ENABLED:'true',
      CHAT2_SUBSCRIBE_PROXY_SHARED_SECRET:proxySecret,
      CHAT2_CENTRIFUGO_TOKEN_SECRET:jwtSecret,
      CHAT2_CENTRIFUGO_API_KEY:apiSecret,
      CHAT2_CENTRIFUGO_HTTP_API:`http://127.0.0.1:${brokerPort}/api/publish`,
      CHAT2_PUBLIC_WS_URL:`ws://127.0.0.1:${brokerPort}/connection/websocket`,
      CHAT2_API_ENABLED:'enabled',
      REDIS_URL:`redis://127.0.0.1:${redisPort}`,
    };
    console.log('OWN_CENTRIFUGO_LOCAL_PG_REDIS_READY all random 127.0.0.1 ports; foreign 8039 untouched');
  }
  const args=isVideoMinio ? ['--dir','apps/gallery-cloud','exec','vitest','run',
    '--config','vitest.archqa-chat2-video.config.ts']
    : isFeedVideoMinio ? ['--dir','apps/gallery-cloud','exec','vitest','run',
      '--config','vitest.archqa-feed-video.config.ts']
    : isQuestionsPhotoMinio ? ['--dir','apps/gallery-cloud','exec','vitest','run',
      '--config','vitest.archqa-questions.config.ts']
    : ['--filter','@gafus/api','exec','vitest','run','--config',
      isRealtimeWs ? 'vitest.archqa-realtime-ws.config.ts' :
      isRealtimeAcl ? 'vitest.archqa-realtime-acl.config.ts' : 'vitest.archqa-queue.config.ts'];
  const test=exec('/opt/homebrew/bin/pnpm',args,{timeout:useMinio?240000:150000,allowFailure:true,
    env:{DATABASE_URL:url,GAFUS_ARCHQA_CHAT2_QUEUE_DB:db,
      GAFUS_ARCHQA_CHAT2_QUEUE_REALPG:'1',GAFUS_LOCAL_ISOLATED_API:'1',...optionalS3,
      ...realtimeOptions,
      ...(isRealtimeAcl ? {
        GAFUS_ARCHQA_REALTIME_ACL:'1',
        CHAT2_CENTRIFUGO_TOKEN_SECRET:`gafus-archqa-only-${randomBytes(32).toString('hex')}`,
        CHAT2_PUBLIC_WS_URL:'ws://127.0.0.1:9919/connection/websocket',
        CHAT2_V2_MEDIA_ENABLED:'true',CHAT2_V2_CORE_ENABLED:'true',
        CHAT2_PROCESSOR_READY:'true',
      } : {}),
      COREPACK_ENABLE_NETWORK:'0',
      COREPACK_HOME:join(process.env.HOME??'/nonexistent','.cache/node/corepack')}});
  if(test.stdout)process.stdout.write(test.stdout.slice(-12500));
  if(test.stderr)process.stderr.write(test.stderr.slice(-4000));
  assert.equal(test.status,0,'REAL_PG18_CHAT2_QUEUE_ACCEPTANCE_FAILED');
  console.log(isRealtimeWs ? 'PASS LOCAL_REAL_PG_REDIS_CENTRIFUGO_WS_RECONNECT_REVOCATION' :
    isRealtimeAcl ? 'PASS LOCAL_REAL_PG_CHAT2_REALTIME_ACL_JWT' :
    isQuestionsPhotoMinio ? 'PASS LOCAL_QUESTIONS_PHOTO_REALPG_MINIO_SHARP' :
    useMinio ? `PASS LOCAL_${isFeedVideoMinio ? 'FEED' : 'CHAT2'}_VIDEO_S3_REALPG_MINIO_FFMPEG` :
    'PASS real PostgreSQL 18 Chat2 queue crash/lease/ACK/retry/cleanup; S3 callbacks synthetic');
 } finally {
  await stopOwnIsolated('CENTRIFUGO',localBroker);
  await stopOwnIsolated('REDIS',localRedis);
  await stopOwnMinio();
  // Stop only our ephemeral cluster; never inspect or stop other databases.
  const probe=existsSync(data)?exec(postgres('pg_ctl'),['-D',data,'status'],
    {timeout:5000,allowFailure:true}):null;
  if(probe?.status===0){
    exec(postgres('pg_ctl'),['-D',data,'-m','immediate','-w','-t','12','stop'],{timeout:22000});
    booted=false;
  }
  const after=existsSync(data)?exec(postgres('pg_ctl'),['-D',data,'status'],
    {timeout:5000,allowFailure:true}):null;
  assert(!after || after.status!==0,'OWN_PG18_STILL_RUNNING_REFUSE_TO_DELETE');
  rmSync(dir,{recursive:true,force:true});
  console.log('PASS only this run own ephemeral PG18 directory cleaned');
}

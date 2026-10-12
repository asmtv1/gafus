/**
 * Creates isolated localhost-only PostgreSQL 14 + Redis for temporary GAFUS
 * staging Core acceptance. Nothing connects to or modifies production DB/Redis.
 * Intentional local state survives process exit until operator deletes it.
 */
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const root=join(homedir(),'.codex/cloudru/gafus-media-core-staging');
const data=join(root,'pg14');
const envFile=join(root,'core.env');
const ports={postgres:55448,redis:56389,api:31339};
if(process.env.GAFUS_ISOLATED_CORE_CONFIRM!=='localhost-test-only')throw Error('UNAUTHORIZED_STAGE_CORE');
await mkdir(root,{recursive:true,mode:0o700});
let secrets;
try{
 const text=await readFile(envFile,'utf8');
 secrets=Object.fromEntries(text.split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1)]}));
}catch{
 secrets={PG_ROOT_PASSWORD:randomBytes(24).toString('base64url'),PG_APP_PASSWORD:randomBytes(24).toString('base64url'),
 REDIS_PASSWORD:randomBytes(24).toString('base64url'),GALLERY_INTERNAL_HMAC_SECRET:randomBytes(36).toString('base64url'),
 FEED_INTERNAL_HMAC_SECRET:randomBytes(36).toString('base64url')};
 await writeFile(envFile,Object.entries(secrets).map(([k,v])=>`${k}=${v}`).join('\n')+'\n',{mode:0o600,flag:'wx'});
}
const run=(exe,args,opts={})=>{
 const out=spawnSync(exe,args,{encoding:'utf8',timeout:120000,...opts});
 if(out.status!==0)throw Error(`${exe} returned nonzero ${out.status??out.error?.code??'unknown'}`);
 return out.stdout;
};
let init=false;
try {await readFile(join(data,'PG_VERSION'));}catch{init=true;}
if(init){
 await mkdir(data,{recursive:true,mode:0o700});
 const passwordFile=join(root,'postgres-init-pw');
 await writeFile(passwordFile,secrets.PG_ROOT_PASSWORD+'\n',{mode:0o600});
 try{run('initdb',['-D',data,'--auth-local=scram-sha-256','--auth-host=scram-sha-256','--pwfile',passwordFile,'--no-instructions']);}
 finally{await import('node:fs/promises').then(x=>x.rm(passwordFile,{force:true}));}
}
const pgRunning=spawnSync('pg_isready',['-h','127.0.0.1','-p',String(ports.postgres)],{encoding:'utf8'}).status===0;
if(!pgRunning){
 const res=spawnSync('pg_ctl',['-D',data,'-l',join(root,'postgres.log'),'-o',`-h 127.0.0.1 -p ${ports.postgres}`,'start','-w'],{encoding:'utf8',timeout:25000});
 if(res.status!==0)throw Error('STAGING_POSTGRES_START_FAILED');
}
const cmd=(sql)=>{
 const out=spawnSync('psql',['-h','127.0.0.1','-p',String(ports.postgres),'-U',process.env.USER||'asmtv1','-d','postgres','-X','-v','ON_ERROR_STOP=1','-tAc',sql],{encoding:'utf8',env:{...process.env,PGPASSWORD:secrets.PG_ROOT_PASSWORD},timeout:25000});
 if(out.status!==0)throw Error('STAGING_SQL_SETUP_FAILED');return out.stdout.trim();
};
const role='gafus_media_stage', db='gafus_media_stage';
if(cmd(`select count(*) from pg_roles where rolname='${role}'`)==='0')
 cmd(`CREATE ROLE ${role} LOGIN PASSWORD '${secrets.PG_APP_PASSWORD}'`);
if(cmd(`select count(*) from pg_database where datname='${db}'`)==='0')
 cmd(`CREATE DATABASE ${db} OWNER ${role}`);
const redisRunning=spawnSync('redis-cli',['-h','127.0.0.1','-p',String(ports.redis),'--no-auth-warning','-a',secrets.REDIS_PASSWORD,'ping'],{encoding:'utf8'}).stdout?.trim()==='PONG';
if(!redisRunning){
 const r=spawnSync('redis-server',['--port',String(ports.redis),'--bind','127.0.0.1','--save','','--appendonly','no','--daemonize','yes','--pidfile',join(root,'redis.pid'),'--logfile',join(root,'redis.log'),'--requirepass',secrets.REDIS_PASSWORD],{encoding:'utf8',timeout:12000});
 if(r.status!==0)throw Error('STAGING_REDIS_START_FAILED');
}
const conn=`postgresql://${role}:${secrets.PG_APP_PASSWORD}@127.0.0.1:${ports.postgres}/${db}?schema=public`;
const reds=`redis://:${secrets.REDIS_PASSWORD}@127.0.0.1:${ports.redis}`;
const runner=join(root,'run-prisma.sh');
await writeFile(runner,`#!/bin/sh\nexport DATABASE_URL='${conn}'\nexport REDIS_URL='${reds}'\nexport NODE_ENV=production\nexec pnpm --filter @gafus/prisma exec prisma db push --skip-generate\n`,{mode:0o700});
console.log(JSON.stringify({mode:'isolated-local-staging',pgPort:ports.postgres,redisPort:ports.redis,apiPort:ports.api,postgresInitialized:init,postgresReady:true,redisReady:true,projectData:'separate-directory',hasProductionConnections:false}));

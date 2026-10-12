/**
 * Explicit staging-only Cloud.ru Container Apps creation. Never updates production
 * or runs a regular media Origin before the CDN edge HIT gate is validated.
 * Read-only real production media paths: staging image rejects every real owner.
 */
import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'dotenv';
const env = process.env;
const revision = 'stg-20261012-05c5b67f';
const targets = [
  ['gallery', 'gafus-gallery-origin-staging', 'gafus-gallery-private'],
  ['feed', 'gafus-feed-origin-staging', 'gafus-feed-private'],
];
if (env.GAFUS_STAGE_DEPLOY_CONFIRM !== 'synthetic-only-no-production' ||
    env.CLOUDRU_S3_ENDPOINT !== 'https://s3.cloud.ru' ||
    !/^[a-f0-9-]{32,40}$/.test(env.CLOUDRU_PROJECT_ID ?? ''))
  throw new Error('STAGING_DEPLOY_NOT_AUTHORIZED');
for (const name of ['CLOUDRU_KEY_ID','CLOUDRU_KEY_SECRET','CLOUDRU_S3_ACCESS_KEY_ID','CLOUDRU_S3_SECRET_ACCESS_KEY'])
  if (!env[name]) throw new Error(`STAGING_DEPLOY_MISSING_${name}`);
const gitSecret = parse(await readFile('.env'))?.TF_VAR_origin_secret;
if (Buffer.byteLength(gitSecret ?? '') < 32) throw new Error('MISSING_YANDEX_DEV_ORIGIN_SECRET');
const secretsFile = join(homedir(), '.codex/cloudru/staging-origin-feed-secret');
let feedSecret;
try { feedSecret = (await readFile(secretsFile, 'utf8')).trim(); }
catch { feedSecret = randomBytes(36).toString('base64url'); await writeFile(secretsFile, feedSecret, { mode: 0o600, flag: 'wx' }); }
if (feedSecret.length < 32) throw new Error('INVALID_STAGING_SECRET');
const tokenResponse = await fetch('https://iam.api.cloud.ru/api/v1/auth/token', {
  method: 'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({keyId:env.CLOUDRU_KEY_ID,secret:env.CLOUDRU_KEY_SECRET}),signal:AbortSignal.timeout(13000),
});
if(!tokenResponse.ok) throw Error('CLOUDRU_TOKEN_DENIED');
const token=(await tokenResponse.json()).access_token;
const api=async(method,url,payload)=>{
  const r=await fetch(url,{method,headers:{authorization:`Bearer ${token}`,...(payload?{'content-type':'application/json'}:{})},
    body:payload?JSON.stringify(payload):undefined,signal:AbortSignal.timeout(25000)});
  if(!r.ok){
    let fault = {}; try { fault=await r.json(); } catch {}
    let detail=JSON.stringify({code:fault.code??null,message:fault.message??null,details:fault.details??null});
    for(const value of [env.CLOUDRU_KEY_SECRET,env.CLOUDRU_S3_SECRET_ACCESS_KEY,env.CLOUDRU_S3_ACCESS_KEY_ID,gitSecret,feedSecret].filter(Boolean))
      detail=detail.replaceAll(value,'[REDACTED]');
    console.log('API_FAIL',method,r.status,new URL(url).pathname,detail.slice(0,1100));
    throw Error('CLOUDRU_DEPLOY_RESPONSE_DENIED');
  }
  return r.json();
};
const list=await api('GET',`https://containers.api.cloud.ru/v1/containers?projectId=${env.CLOUDRU_PROJECT_ID}&pageSize=100`);
for(const [scope,name,bucket] of targets){
  if((list.data??[]).some(x=>x.name===name)){console.log('STAGING_ALREADY_EXISTS',name);continue;}
  const secrets=scope==='gallery'?{GALLERY_ORIGIN_SECRET:gitSecret}:{FEED_ORIGIN_SECRET:feedSecret};
  const pairs={
    GAFUS_STAGING_ORIGIN_MODE:'validation-only',
    [`${scope.toUpperCase()}_BUCKET`]:bucket,
    [`${scope.toUpperCase()}_S3_ENDPOINT`]:'https://s3.cloud.ru',
    [`${scope.toUpperCase()}_S3_ACCESS_KEY_ID`]:env.CLOUDRU_S3_ACCESS_KEY_ID,
    [`${scope.toUpperCase()}_S3_SECRET_ACCESS_KEY`]:env.CLOUDRU_S3_SECRET_ACCESS_KEY,
    ...secrets,
  };
  const resource={
    name,projectId:env.CLOUDRU_PROJECT_ID,
    description:'GAFUS SYNTHETIC-ONLY nonproduction origin; real user paths hard-denied',
    configuration:{ingress:{publiclyAccessible:true},autoDeployments:{enabled:false,pattern:''},privileged:false},
    template:{timeout:'30s',idleTimeout:'60s',protocol:'http_1',scaling:{minInstanceCount:0,maxInstanceCount:1},
      containers:[{name,image:`gafus.cr.cloud.ru/gafus-${scope}-origin-stageonly:${revision}`,
        containerPort:8080,resources:{cpu:'0.2',memory:'512Mi'},
        env:Object.entries(pairs).map(([key,value])=>({name:key,value}))}]},
  };
  const created=await api('POST','https://containers.api.cloud.ru/v2/containers/',resource);
  console.log(JSON.stringify({name,created:true,operationId:created.id??created.operationId??null}));
}

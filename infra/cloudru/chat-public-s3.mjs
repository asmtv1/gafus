/**
 * GAFUS Refactor chat-only Cloud.ru S3 control/verification.
 * No general-purpose bucket management or interaction with existing Main assets.
 * Run only inside /Users/asmtv1/Desktop/gafus-refactor on branch vite.
 *
 * --check: signed S3 policy/CORS reads and anonymous alias checks, read only.
 * --apply: only chat bucket managed policy/CORS, guarded by explicit confirm env.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, lstatSync, realpathSync } from 'node:fs';
import { Agent, request } from 'node:https';
import path from 'node:path';
import {
  S3Client, HeadBucketCommand, GetBucketPolicyCommand, PutBucketPolicyCommand,
  GetBucketCorsCommand, PutBucketCorsCommand, GetPublicAccessBlockCommand,
} from '@aws-sdk/client-s3';
import { NodeHttpHandler } from '@smithy/node-http-handler';

const ROOT = '/Users/asmtv1/Desktop/gafus-refactor';
const PROJECT = '4c590727-4133-475b-a4bc-564c90a9e686';
const BUCKET = 'gafus-chat-public';
const mode = process.argv[2] ?? '--check';
if (!['--check', '--apply'].includes(mode)) throw Error('CHAT_S3_INVALID_ACTION');
if (realpathSync(process.cwd()) !== ROOT ||
    execFileSync('git', ['-C', ROOT, 'rev-parse', '--show-toplevel'], { encoding:'utf8' }).trim() !== ROOT ||
    execFileSync('git', ['-C', ROOT, 'branch', '--show-current'], { encoding:'utf8' }).trim() !== 'vite')
  throw Error('CHAT_S3_WORKSPACE_OR_BRANCH_MISMATCH');
if (mode === '--apply' && process.env.GAFUS_CHAT_S3_CONFIRM !== 'only-gafus-chat-public')
  throw Error('CHAT_S3_APPLY_CONFIRM_REQUIRED');

const credsFile = path.join(ROOT, '.local-pg-scratch/cloudru/refactor-api-credentials.json');
if (lstatSync(credsFile).isSymbolicLink() || !realpathSync(credsFile).startsWith(ROOT + '/'))
  throw Error('CHAT_S3_CREDENTIAL_SCOPE');
const creds = JSON.parse(readFileSync(credsFile, 'utf8'));
if (creds.project_id !== PROJECT || !/^[a-f0-9-]{36}$/.test(creds.tenant_id) ||
    !creds.key_id || !creds.key_secret) throw Error('CHAT_S3_INVALID_CREDENTIALS');
const localAddress = execFileSync('ipconfig', ['getifaddr', 'en0'], {encoding:'utf8'}).trim();
if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(localAddress)) throw Error('CHAT_S3_EN0_UNAVAILABLE');
const createClient = () => new S3Client({
  endpoint: 'https://s3.cloud.ru',region: 'ru-central-1',forcePathStyle: true,maxAttempts:1,
  credentials:{accessKeyId:`${creds.tenant_id}:${creds.key_id}`,secretAccessKey:creds.key_secret},
  requestHandler:new NodeHttpHandler({
    httpsAgent:new Agent({localAddress,family:4,keepAlive:false}),connectionTimeout:4500,requestTimeout:6500,
  }),
});
const policyStatement = {Sid:'GafusChatPublicRead', Effect:'Allow', Principal:'*',
  Action:'s3:GetObject', Resource:`arn:aws:s3:::${BUCKET}/chat2/*/v1/*`};
const corsRule = {
  ID:'gafus-chat-v1',
  AllowedOrigins:['https://gafus.ru','https://www.gafus.ru','http://localhost:5173','http://127.0.0.1:5173'],
  AllowedMethods:['GET','HEAD','POST'],
  AllowedHeaders:['content-type','x-amz-*','if-none-match','range'],
  ExposeHeaders:['ETag','Accept-Ranges','Content-Range','Content-Length','Content-Type','x-amz-request-id'],
  MaxAgeSeconds:300,
};
function policyIsSafe(p) {
  const statements = p?.Statement;
  if (!Array.isArray(statements) || statements.length !== 1) return false;
  const s=statements[0];
  const actions=Array.isArray(s.Action)?s.Action:[s.Action];
  return s.Effect==='Allow' && s.Principal==='*' && actions.length===1 && actions[0]==='s3:GetObject'
    && s.Resource===policyStatement.Resource && (!s.Condition || Object.keys(s.Condition).length===0);
}
function policyIsLegacyBroad(p) {
  const ss=p?.Statement;
  if (!Array.isArray(ss)||ss.length!==1) return false;
  const t=ss[0];
  return t.Effect==='Allow' && t.Principal==='*' && t.Action==='s3:GetObject' &&
    t.Resource===`arn:aws:s3:::${BUCKET}/*` &&
    (!t.Condition || Object.keys(t.Condition).length===0) &&
    (!t.NotResource || t.NotResource.length===0) &&
    (!t.NotAction || t.NotAction.length===0) &&
    (!t.NotPrincipal || Object.keys(t.NotPrincipal).length===0);
}
const getPolicy=async s3=>{
  try{return JSON.parse((await s3.send(new GetBucketPolicyCommand({Bucket:BUCKET}))).Policy);}
  catch(e){if(e.name==='NoSuchBucketPolicy')return null;throw e;}
};
const getCors=async s3=>{
  try{return (await s3.send(new GetBucketCorsCommand({Bucket:BUCKET}))).CORSRules??[];}
  catch(e){if(e.name==='NoSuchCORSConfiguration')return [];throw e;}
};
function corsCovers(r) {
  return r && corsRule.AllowedOrigins.every(x=>r.AllowedOrigins?.includes(x)) &&
    corsRule.AllowedMethods.every(x=>r.AllowedMethods?.includes(x)) &&
    corsRule.AllowedHeaders.every(x=>r.AllowedHeaders?.includes(x)) &&
    corsRule.ExposeHeaders.every(x=>r.ExposeHeaders?.includes(x)) &&
    (r.MaxAgeSeconds??0)>=corsRule.MaxAgeSeconds;
}
async function aliasProbe(url) {
  return new Promise((resolve,reject)=>{
    const parsed=new URL(url);
    const req=request({hostname:parsed.hostname,path:parsed.pathname,method:'GET',localAddress,family:4,timeout:4500},res=>{
      let data='';res.on('data',x=>{if(data.length<16000)data+=x.toString()});
      res.on('end',()=>resolve({status:res.statusCode,code:(data.match(/<Code>([^<]+)</)||[])[1]??''}));
    });
    req.on('error',reject);req.on('timeout',()=>req.destroy(Error('CHAT_S3_ALIAS_TIMEOUT')));req.end();
  });
}
const s3=createClient();
try {
  const head=await s3.send(new HeadBucketCommand({Bucket:BUCKET}));
  if(head.$metadata.httpStatusCode!==200)throw Error('CHAT_S3_NO_ACCESS');
  const currentPolicy=await getPolicy(s3),currentCors=await getCors(s3);
  if(currentPolicy && !policyIsSafe(currentPolicy) && !policyIsLegacyBroad(currentPolicy)) throw Error('CHAT_S3_EXISTING_POLICY_DIFFERS_REFUSE_OVERWRITE');
  if(mode==='--apply'){
    if(!policyIsSafe(currentPolicy)){await s3.send(new PutBucketPolicyCommand({Bucket:BUCKET,Policy:JSON.stringify({Version:'2012-10-17',Statement:[policyStatement]})}));}
    if(!currentCors.some(corsCovers)){
      const rules=currentCors.filter(x=>x.ID!==corsRule.ID);
      if(rules.length>=100)throw Error('CHAT_S3_CORS_OVERFLOW');
      await s3.send(new PutBucketCorsCommand({Bucket:BUCKET,CORSConfiguration:{CORSRules:[...rules,corsRule]}}));
    }
  }
  const p=await getPolicy(s3),cors=await getCors(s3);
  let blockStatus='not_configured';
  try{
    const a=await s3.send(new GetPublicAccessBlockCommand({Bucket:BUCKET}));
    const b=a.PublicAccessBlockConfiguration;
    if(b?.BlockPublicPolicy || b?.RestrictPublicBuckets)throw Error('CHAT_S3_PUBLIC_ACCESS_BLOCKS_POLICY');
    blockStatus=JSON.stringify(b??{});
  }catch(e){if(e.name!=='NoSuchPublicAccessBlockConfiguration')throw e;}
  const virtual=await aliasProbe(`https://${BUCKET}.s3.cloud.ru/__gafus_chat_probe__not_existing_20261027`);
  const global=await aliasProbe(`https://global.s3.cloud.ru/${BUCKET}/__gafus_chat_probe__not_existing_20261027`);
  const result={bucket:BUCKET,head:200,policyVerified:policyIsSafe(p),corsVerified:cors.some(corsCovers),corsRules:cors.length,
    publicAccessBlock:blockStatus,aliases:{virtual,global},anonymousAddressReady:virtual.code==='AccessDenied' || virtual.code==='NoSuchKey'};
  console.log(JSON.stringify(result,null,2));
  if(!result.policyVerified || !result.corsVerified || !result.anonymousAddressReady)
    process.exitCode=4;
} finally{s3.destroy()}

#!/usr/bin/env node
/** External monitoring runner. Deploy OUTSIDE the GAFUS VPS and Uptrace.
 * No history beyond 24h dedup state; no raw HTTP bodies, headers or URLs in logs.
 */
import { lstat, readFile, mkdir, writeFile, rename, open } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readViewerToken, makeReadUrl, fetchReadOnlyJson, summariseResponse } from './uptrace-read.mjs';

const allowedTargets = new Set(['api.gafus.ru','gafus.ru']);
const TTL=24*60*60*1000;
const ISSUE_CODES=new Set(['OK','HTTP_DOWN','HTTP_BAD_STATUS','HTTP_NETWORK',
  'UPTRACE_NO_DATA','UPTRACE_READ_UNAVAILABLE','UPTRACE_AUTH_FAILURE']);
export function safePublicTarget(value) {
  if(typeof value!=='string')throw Error('TARGET_REQUIRED');
  const url=new URL(value);
  if(url.protocol!=='https:'||!allowedTargets.has(url.hostname)||
    url.username||url.password||url.search||url.hash||url.port||!/^[a-zA-Z0-9/._-]{1,90}$/.test(url.pathname))
    throw Error('TARGET_NOT_ALLOWED');
  return url;
}
export function safeWebhook(value) {
  if(!value)return null;
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password||url.hash||
    !['api.telegram.org','hooks.slack.com'].includes(url.hostname))
    throw Error('WEBHOOK_NOT_ALLOWED');
  if(url.hostname==='api.telegram.org' &&
     !/^\/bot[0-9]{6,15}:[A-Za-z0-9_-]{20,90}\/sendMessage$/.test(url.pathname))
    throw Error('WEBHOOK_NOT_ALLOWED');
  if(url.hostname==='hooks.slack.com' &&
     !/^\/services\/[A-Za-z0-9_-]{5,100}\/[A-Za-z0-9_-]{5,100}\/[A-Za-z0-9_-]{5,100}$/.test(url.pathname))
    throw Error('WEBHOOK_NOT_ALLOWED');
  return url;
}
async function checkHealth(url, fetchImpl) {
  try {
    const response=await fetchImpl(url,{method:'GET',redirect:'error',signal:AbortSignal.timeout(5000)});
    return response.ok?'OK':'HTTP_BAD_STATUS';
  }catch{return 'HTTP_NETWORK';}
}
export function updateWatchdogState(previous,checks,now=Date.now()) {
  const old=previous&&typeof previous==='object'?previous:{};
  const states={};
  const changes=[];
  for(const [service,code] of Object.entries(checks)) {
    if(!/^(api|web|uptrace)$/.test(service)||!ISSUE_CODES.has(code))throw Error('WATCHDOG_SCHEMA');
    const prior=old[service];
    const consecutive=code==='OK'?0:(prior?.code===code?Math.min(100,prior.consecutive+1):1);
    const firstAt=code==='OK'?now:(prior?.code===code&&Number.isFinite(prior.firstAt)?prior.firstAt:now);
    states[service]={code,consecutive,firstAt,lastAt:now};
    // Page after 2 failed checks; recovery after 1 healthy sample.
    if(consecutive===2)changes.push({service,code,transition:'incident'});
    if(code==='OK' && prior?.code && prior.code!=='OK' && prior.consecutive>=2)
      changes.push({service,code:'OK',transition:'recovery'});
  }
  return {states,changes};
}
async function loadState(filename,now) {
  try {
    const stat=await lstat(filename);
    if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077)!==0||
      stat.size>4096||stat.size<2)return {};
    const input=JSON.parse(await readFile(filename,'utf8'));
    if(!input||typeof input!=='object'||!input.updatedAt||
      now-input.updatedAt>TTL||Math.abs(now-input.updatedAt)>TTL)return {};
    return input.states??{};
  }catch{return {};}
}
async function saveState(filename,states,now) {
  await mkdir(dirname(filename),{recursive:true,mode:0o700});
  const temp=filename+'.tmp.'+process.pid;
  const file=await open(temp,'wx',0o600);
  try {
    await file.writeFile(JSON.stringify({updatedAt:now,states}));
    await file.sync();
  }finally{await file.close();}
  await rename(temp,filename);
}
async function sendNotification(url,body,fetchImpl,env) {
  // The alert never contains exception/trace content, request metadata or URLs.
  const message=`GAFUS production: ${body.service} ${body.transition} (${body.code})`;
  const isTelegram=url.hostname==='api.telegram.org';
  const chatId=env.GAFUS_WATCHDOG_TELEGRAM_CHAT_ID;
  if(isTelegram && (!chatId||!/^(-?[0-9]{4,20}|@[a-zA-Z0-9_]{5,32})$/.test(chatId)))
    throw Error('WATCHDOG_CHAT_ID_REQUIRED');
  const payload=isTelegram
    ? {chat_id:chatId,text:message,disable_web_page_preview:true}
    : {text:message};
  const response=await fetchImpl(url,{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify(payload),redirect:'error',signal:AbortSignal.timeout(5000),
  });
  if(!response.ok)throw Error('WATCHDOG_NOTIFICATION_FAILED');
}
export async function watchdog({
  env=process.env,now=Date.now(),fetchImpl=fetch,
  readUptrace=async(token) => fetchReadOnlyJson(makeReadUrl('spans',env.UPTRACE_PROJECT_ID??'9378',now,5),token),
}={}) {
  const urls={
    api:safePublicTarget(env.GAFUS_WATCHDOG_API_URL),
    web:safePublicTarget(env.GAFUS_WATCHDOG_WEB_URL),
  };
  const token=await readViewerToken(env.UPTRACE_VIEWER_TOKEN_FILE);
  const stateFile=resolve(env.GAFUS_WATCHDOG_STATE_FILE??'./watchdog-state.json');
  const webhook=safeWebhook(env.GAFUS_WATCHDOG_ALERT_WEBHOOK);
  if(!webhook && env.GAFUS_WATCHDOG_DRY_RUN!=='true')
    throw Error('WATCHDOG_ALERT_CHANNEL_REQUIRED');
  const codes={api:await checkHealth(urls.api,fetchImpl),web:await checkHealth(urls.web,fetchImpl)};
  try {
    const raw=await readUptrace(token);
    codes.uptrace=summariseResponse('spans',raw,env.UPTRACE_PROJECT_ID??'9378').count?'OK':'UPTRACE_NO_DATA';
  }catch(error){
    codes.uptrace=error?.exitCode===2?'UPTRACE_AUTH_FAILURE':'UPTRACE_READ_UNAVAILABLE';
  }
  // Before the production canary is scheduled/verified, the *absence of data*
  // is an important acceptance finding, not an outage. Auth/API errors remain
  // actionable. Explicitly arm missing-data alerts only after cutover.
  const ingestHeartbeatArmed=env.GAFUS_WATCHDOG_INGEST_EXPECTED==='true';
  const actionableChecks={...codes,
    uptrace:!ingestHeartbeatArmed&&codes.uptrace==='UPTRACE_NO_DATA'?'OK':codes.uptrace};
  const {states,changes}=updateWatchdogState(
    await loadState(stateFile,now),actionableChecks,now);
  await saveState(stateFile,states,now);
  if(webhook)for(const incident of changes)await sendNotification(webhook,{
    source:'gafus-external-watchdog',environment:'production',...incident,
  },fetchImpl,env);
  return {checks:codes,actionableChecks,ingestHeartbeatArmed,
    wouldNotify:changes.length,notifications:webhook?changes.length:0,
    configuredChannel:!!webhook};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  watchdog().then(result=>{
    // Never print the URL, token, raw data or responses.
    console.log(JSON.stringify(result));
    if(Object.values(result.actionableChecks).some(code=>code!=='OK'))process.exitCode=3;
  }).catch(error=>{
    console.error(error?.message==='WATCHDOG_NOTIFICATION_FAILED'
      ? 'WATCHDOG_NOTIFICATION_FAILED':'WATCHDOG_CONFIGURATION_FAILURE');
    process.exitCode=4;
  });
}

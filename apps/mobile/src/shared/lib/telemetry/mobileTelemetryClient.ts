/** SDK 57 signed-preview diagnostics transport. No auth token, user ID,
 * hardware ID, request URL, or error.message crosses this boundary.
 * Disabled by default. Does not replace native crash capture. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { AppState, Platform } from 'react-native';
import { mayUploadMobileTelemetry } from './mobileTelemetryDeviceEligibility';
import * as Crypto from 'expo-crypto';
import * as Application from 'expo-application';
import * as Device from 'expo-device';
import * as Updates from 'expo-updates';
import Constants from 'expo-constants';
import { parseMobileTelemetryEvent, sanitizeMobileStack,
  type MobileTelemetryEventV1, type MobileTelemetryHealth } from '@gafus/types';
import { applyTelemetryAck, emptyTelemetryQueue, enqueueNormalizedTelemetryEvent,
  nextTelemetryBatch, normalizeTelemetryQueue, telemetryRetryMs, markTelemetryRejected, markTelemetryDispatched, restrictTelemetryQueue, TELEMETRY_BATCH_EVENTS,
  type TelemetryQueueState } from './mobileTelemetryQueue';

import { mobilePerformance, startMobileTimerDelaySampling } from "./mobilePerformance";
import { snapshotDiagnosticContext } from "./mobileDiagnosticContext";

const INSTALLATION_KEY = "@gafus/telemetry/v1/installation";
const STORAGE_KEY = '@gafus/telemetry/v1/pending';
const FLAG = process.env.EXPO_PUBLIC_TELEMETRY_ENABLED === 'true';
const APP_START_ID = Crypto.randomUUID();
const MAX_REQUEST_TIME_MS = 8_000;
const URL_PATH = '/api/v1/telemetry/mobile';
type TransportConfig = {baseUrl: string; environment:'preview'|'production';
  nativeFingerprint: string; platform:'ios'|'android';
  appVersion: string; build: string; channel:string; runtime:string};
type Grant = {token:string;expiresAt:number;maxEvents:number};
let grant:Grant | undefined;
let batchLimit=TELEMETRY_BATCH_EVENTS;
let enabled=false;
let started=false;
let busy=false;
let attempt=0;
let nextRetryAt=0;
let queueLock=Promise.resolve();
let installation: string | undefined;
let sessionQueued=false;
let timer:ReturnType<typeof setTimeout>|null=null;
const selfHealth={incompatible:0,storageReadFailures:0,storageWriteFailures:0,uploadFailures:0,invalidQueue:0};
type HealthCounter=keyof typeof selfHealth;
const bump=(key:HealthCounter,amount=1)=>{selfHealth[key]=Math.min(1000000,selfHealth[key]+amount);};
let healthLastAt=0;

const own = <T>(fn:()=>Promise<T>):Promise<T> => {
  const next=queueLock.then(fn,fn);queueLock=next.then(()=>{},()=>{});return next;
};
const readQueue = async ():Promise<TelemetryQueueState> => {
  let raw:string|null;
  try {raw=await AsyncStorage.getItem(STORAGE_KEY);}
  catch(error){bump('storageReadFailures');throw error;}
  if(!raw)return emptyTelemetryQueue();
  try {
    const parsed=JSON.parse(raw);
    if(parsed?.schemaVersion!==1||!Array.isArray(parsed.entries))throw Error('INVALID_QUEUE');
    return normalizeTelemetryQueue(parsed,Date.now());
  }catch{ /* diagnostic: expected Malformed stored queue is counted by telemetry health instead of recursive reporter. */
    // Do not mistake an unavailable storage read for an empty queue.
    bump('invalidQueue');return emptyTelemetryQueue();
  }
};
const writeQueue=async(value:TelemetryQueueState)=>{
  try {await AsyncStorage.setItem(STORAGE_KEY,JSON.stringify(value));}
  catch(error){bump('storageWriteFailures');throw error;}
};
async function readScopedQueue(config:TransportConfig) {
  const q=restrictTelemetryQueue(await readQueue(),config);
  if(q.incompatible) {
    await writeQueue(q.state);
    bump('incompatible',q.incompatible);
  }
  return q.state;
}
// Independent random identifier, not an account/OTA grant/hardware identifier.
// Called under the queue lock so concurrent events cannot create different IDs.
async function getDiagnosticInstallation():Promise<string|undefined> {
  if(installation)return installation;
  try {
    const existing=await AsyncStorage.getItem(INSTALLATION_KEY);
    // Rotate the independent pseudonym every 30 days. Do not reuse the
    // pre-rotation indefinite ID or any product/account identifier.
    try {
      const saved=existing?JSON.parse(existing):null;
      if(saved&&typeof saved.id==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(saved.id)&&
        Number.isSafeInteger(saved.createdAt)&&Date.now()>=saved.createdAt&&Date.now()-saved.createdAt<30*86400000)
        return installation=saved.id;
    }catch{/* diagnostic: expected old unversioned or invalid pseudonym is replaced */}
    const created=Crypto.randomUUID();
    await AsyncStorage.setItem(INSTALLATION_KEY,JSON.stringify({id:created,createdAt:Date.now()}));
    return installation=created;
  } catch { /* diagnostic: expected Diagnostic installation unavailable; avoid recursive reporting. */  return undefined; }
}
async function persistDiagnostic(payload:MobileTelemetryEventV1):Promise<void> {
  await own(async()=>{
    const id=await getDiagnosticInstallation();
    const parsed=parseMobileTelemetryEvent({...payload,...(id?{installationId:id}:{})});
    await writeQueue(enqueueNormalizedTelemetryEvent(await readQueue(),parsed,Date.now()));
  });
}


function getTransportConfig():TransportConfig|null {
  // Ad-hoc simulator/emulator builds are not registered trusted native releases.
  // Never weaken the server grant verification just to accept development traffic.
  if (!mayUploadMobileTelemetry(FLAG, Device.isDevice, Platform.OS))return null;
  const extra=Constants.expoConfig?.extra as Record<string,unknown>|undefined;
  const transport=extra?.otaTransport;
  const environment=extra?.otaEnvironment;
  const nativeFingerprint=extra?.otaNativeFingerprint;
  const channel=extra?.otaChannel ?? Updates.channel;
  const appVersion=Application.nativeApplicationVersion;
  const runtime=Updates.runtimeVersion;
  const build=Application.nativeBuildVersion;
  const url=process.env.EXPO_PUBLIC_API_BASE_URL;
  if(transport!=='self-hosted' || (environment!=='preview' && environment!=='production') ||
    typeof nativeFingerprint!=='string' || !/^[a-f\d]{64}$/i.test(nativeFingerprint) ||
    typeof channel!=='string' || !/^[a-zA-Z\d_.-]{1,48}$/.test(channel) ||
    !appVersion || !/^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(appVersion) ||
    !runtime || !/^[a-zA-Z\d_.-]{1,100}$/.test(runtime) ||
    !build || !/^[a-zA-Z\d_.-]{1,40}$/.test(build) || !url)return null;
  let origin:URL;
  try{origin=new URL(url);}catch{ /* diagnostic: expected Unsupported transport configuration disables telemetry only. */ return null;}
  if(origin.protocol!=='https:'||origin.username||origin.password||origin.search||origin.hash||
    !['api.gafus.ru','api-preview.gafus.ru'].includes(origin.hostname)||
    !['','/'].includes(origin.pathname))return null;
  if(environment==='production' && origin.hostname!=='api.gafus.ru')return null;
  if(environment==='preview') {
    // The signed native preview descriptor pins the origin at build time;
    // this prevents build-time public variables from silently choosing a new host.
    const embeddedUpdateUrl=Constants.expoConfig?.updates?.url;
    if(!embeddedUpdateUrl)return null;
    let embedded:URL;
    try{embedded=new URL(embeddedUpdateUrl);}catch{ /* diagnostic: expected Unsupported transport configuration disables telemetry only. */ return null;}
    if(embedded.protocol!=='https:' || embedded.username||embedded.password||
      embedded.search||embedded.hash || embedded.hostname==='gafus.ru'||
      embedded.pathname!=='/ota/manifest')return null;
  }
  return {baseUrl:origin.origin,environment,nativeFingerprint,
    platform:Platform.OS,appVersion,build,channel,runtime};
}
export function isMobileTelemetryV1Enabled():boolean {return getTransportConfig()!==null;}

async function request(config:TransportConfig, path:string, body:object, token?:string):Promise<Response> {
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),MAX_REQUEST_TIME_MS);
  try {
    return await fetch(config.baseUrl+path, {method:'POST',signal:controller.signal,
      headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},
      body:JSON.stringify(body),credentials:'omit'});
  }finally{clearTimeout(timeout);}
}
function validGrant(raw:unknown):Grant|null {
  if(!raw || typeof raw!=='object')return null;
  const o=raw as Record<string,unknown>;
  const expiresAt=typeof o.expiresAt==='string'?Date.parse(o.expiresAt):NaN;
  if(typeof o.token!=='string'||!/^[a-zA-Z\d_-]{43}$/.test(o.token)||
    !Number.isFinite(expiresAt)||expiresAt<=Date.now()||expiresAt>Date.now()+16*60_000 ||
    typeof o.maxEvents!=='number'||!Number.isSafeInteger(o.maxEvents)||o.maxEvents<1||o.maxEvents>100)return null;
  return {token:o.token,expiresAt,maxEvents:o.maxEvents as number};
}
async function ensureGrant(config:TransportConfig):Promise<Grant> {
  if(grant&&grant.maxEvents>0&&grant.expiresAt>Date.now()+15_000)return grant;
  const response=await request(config,URL_PATH+'/session',{
    platform:config.platform,appVersion:config.appVersion,build:config.build,
    runtime:config.runtime,channel:config.channel,nativeFingerprint:config.nativeFingerprint,
  });
  if(!response.ok)throw new UploadFailure(response.status,response.headers.get('retry-after'));
  const next=validGrant(await response.json());
  if(!next)throw new UploadFailure(503);
  grant=next;return next;
}
class UploadFailure extends Error {
  constructor(readonly status:number,readonly retryAfter:string|null=null){super('TELEMETRY_UPLOAD_FAILED');}
}
function schedule(retryMs:number):void {
  if(timer)clearTimeout(timer);
  timer=setTimeout(()=>{timer=null;void flushMobileTelemetryQueue();},Math.min(900_000,retryMs));
}
async function flushOnce(config:TransportConfig):Promise<boolean> {
  const available=await own(async()=>nextTelemetryBatch(await readScopedQueue(config),batchLimit));
  if(available.length===0)return false;
  const activeGrant=await ensureGrant(config);
  const batch=await own(async()=>{
    const current=await readScopedQueue(config);
    const selected=nextTelemetryBatch(current,Math.min(batchLimit,activeGrant.maxEvents));
    if(selected.length)await writeQueue(markTelemetryDispatched(current,selected));
    return selected;
  });
  if(batch.length===0){grant=undefined;throw new UploadFailure(503);}
  const response=await request(config,URL_PATH,{schemaVersion:1,events:batch},activeGrant.token);
  if(response.status===401){grant=undefined;throw new UploadFailure(401);}
  if(response.status===429)grant=undefined;
  if(response.status===400||response.status===413) {
    // Isolate invalid data without discarding an entire valid batch.
    if(batch.length>1)batchLimit=Math.max(1,Math.floor(batch.length/2));
    else {
      await own(async()=>writeQueue(markTelemetryRejected(await readQueue(),batch[0]!.eventId)));
      batchLimit=TELEMETRY_BATCH_EVENTS;
    }
    // The caller uses bounded backoff before the next isolation attempt.
    throw new UploadFailure(response.status,response.headers.get('retry-after'));
  }
  if(!response.ok)throw new UploadFailure(response.status,response.headers.get('retry-after'));
  if(response.status!==202)throw new UploadFailure(503);
  const ack=await response.json() as {durable?:unknown;accepted?:unknown;schemaVersion?:unknown};
  if(ack.durable!==true || ack.schemaVersion!==1 || !Array.isArray(ack.accepted))
    throw new UploadFailure(503);
  const submitted=new Set(batch.map(e=>e.eventId));
  if(ack.accepted.some(id=>typeof id!=='string'||!submitted.has(id)))throw new UploadFailure(503);
  if(ack.accepted.length===0)throw new UploadFailure(503);
  activeGrant.maxEvents=Math.max(0,activeGrant.maxEvents-new Set(ack.accepted).size);
  if(activeGrant.maxEvents===0)grant=undefined;
  batchLimit=Math.min(TELEMETRY_BATCH_EVENTS,Math.max(1,batchLimit*2));
  await own(async()=>{
    const current=await readQueue();
    await writeQueue(applyTelemetryAck(current,ack.accepted));
  });
  return true;
}
export async function flushMobileTelemetryQueue():Promise<void> {
  const config=getTransportConfig();
  if(!config||busy||Date.now()<nextRetryAt)return;
  busy=true;
  try {
    let loop=0;
    for(;loop<4;loop++) {
      if(!(await flushOnce(config)))break;
      attempt=0;nextRetryAt=0;
    }
    if(loop===4&&enabled)schedule(1000);
  }catch(error){ /* diagnostic: expected Upload failure is counted and handled by bounded retry logic. */
    bump('uploadFailures');
    const failure=error instanceof UploadFailure?error:new UploadFailure(503);
    if(failure.status===401) {
      // At most one immediate refresh; then exponential retry on a failed grant.
      attempt+=1;
    }else if(failure.status===400||failure.status===413||failure.status===403){
      // Never loop on permanent invalid data; keep bounded TTL for offline review.
      attempt=Math.max(attempt,5);
    }else attempt+=1;
    const delay=telemetryRetryMs(attempt,Date.now(),failure.retryAfter);
    nextRetryAt=Date.now()+delay;schedule(delay);
  }finally{busy=false;}
}
export async function enqueueMobileTelemetryError(error:unknown,options?:{
  fatal?:boolean;errorCode?:string;kind?:MobileTelemetryEventV1['kind'];
  severity?:MobileTelemetryEventV1['severity'];http?:MobileTelemetryEventV1['http'];module?:string;screen?:string;operation?:string;
}):Promise<void> {
  const config=getTransportConfig();if(!config)return;
  const rawStack=error instanceof Error?error.stack:undefined;
  const exceptionType=error instanceof Error?error.name:undefined;
  const type=exceptionType&&/^[a-zA-Z_$][a-zA-Z\d_.$<>-]{0,99}$/.test(exceptionType)
    ? exceptionType:undefined;
  const code=options?.errorCode;
  const stack=sanitizeMobileStack(rawStack);
  const osVersion=(Device.osVersion??'').match(/^\d{1,3}(?:\.\d{1,3}){0,2}/)?.[0];
  const payload:MobileTelemetryEventV1={
    schemaVersion:1,eventId:Crypto.randomUUID(),platform:config.platform,
    kind:options?.kind??(options?.fatal?'js_fatal':'js_handled'),
    severity:options?.fatal?'FATAL':options?.severity??'ERROR',
    occurredAt:new Date().toISOString(),appVersion:config.appVersion,
    build:config.build,runtime:config.runtime,channel:config.channel,
    updateId:Updates.updateId??'embedded',appStartId:APP_START_ID,
    ...(osVersion?{osVersion}:{}),...(type?{exceptionType:type}:{}),
    ...(code&&/^[A-Z][A-Z0-9_]{0,63}$/.test(code)?{errorCode:code}:{}),
    ...(stack?{stack}:{}),
    stackStatus:stack?'captured':rawStack?'sanitized_empty':'unavailable',
    ...(options?.module?{module:options.module}:{}),
    ...(options?.screen?{screen:options.screen}:{}),
    ...(options?.operation?{operation:options.operation}:{}),
    ...(options?.http?{http:options.http}:{}),
    ...snapshotDiagnosticContext(),
  };
  await persistDiagnostic(payload);
  // Never await transport on a product request or fatal error path.
  if(started)void flushMobileTelemetryQueue();
}
let nativeDrainRunning=false;
async function drainNativeTerminationReports(config:TransportConfig):Promise<void> {
  if(nativeDrainRunning)return;
  nativeDrainRunning=true;
  try {
    // Optional for existing binaries; the next native build autolinks it.
    const {requireOptionalNativeModule}=require('expo') as typeof import('expo');
    const native=requireOptionalNativeModule<{
      pending():Promise<unknown>;
      acknowledge(ids:string[]):Promise<unknown>;
    }>('GafusNativeDiagnostics');
    if(!native)return;
    const {normalizeNativeTermination}=await import('./nativeTerminationReports');
    const rows=await native.pending();
    if(!Array.isArray(rows))return;
    const accepted:string[]=[];
    await own(async()=>{
      const now=Date.now();
      let queue=await readQueue();
      const id=await getDiagnosticInstallation();
      for(const row of rows.slice(0,64)){
        const event=normalizeNativeTermination(row,config,now);
        if(!event)continue;
        const parsed=parseMobileTelemetryEvent({...event,...(id?{installationId:id}:{})});
        queue=enqueueNormalizedTelemetryEvent(queue,parsed,now);
        if(queue.entries.some(entry=>entry.event.eventId===parsed.eventId))accepted.push(parsed.eventId);
      }
      const durable=accepted.filter(eventId=>queue.entries.some(entry=>entry.event.eventId===eventId));
      accepted.splice(0,accepted.length,...durable);
      if(accepted.length)await writeQueue(queue);
    });
    // If storage failed or capacity evicted a report, leave the native
    // record available to retry. Server deduplicates stable IDs on replay.
    if(accepted.length)await native.acknowledge(accepted);
    if(started&&accepted.length)void flushMobileTelemetryQueue();
  }catch{ /* diagnostic: expected Native diagnostic transfer must never block startup; OS records stay pending for later retry. */ }
  finally{nativeDrainRunning=false;}
}

async function persistHealth(config:TransportConfig):Promise<void> {
  if(Date.now()-healthLastAt<300_000)return;
  try {
    await own(async()=>{
      const q=await readScopedQueue(config);
      const now=Date.now();
      const counters={...selfHealth};
      const oldestMs=Math.min(604800000,Math.max(0,now-Math.min(now,...q.entries.map(e=>e.enqueuedAt))));
      if(!q.dropped&&oldestMs<300000&&!Object.values(counters).some(Boolean))return;
      const health:MobileTelemetryHealth={...counters,dropped:Math.min(1000000,q.dropped),
        pending:q.entries.length,oldestMs};
      const payload=parseMobileTelemetryEvent({
        schemaVersion:1,eventId:Crypto.randomUUID(),platform:config.platform,kind:'telemetry_health',severity:'INFO',
        occurredAt:new Date(now).toISOString(),appVersion:config.appVersion,build:config.build,runtime:config.runtime,
        channel:config.channel,updateId:Updates.updateId??'embedded',appStartId:APP_START_ID,health,
      });
      const next=enqueueNormalizedTelemetryEvent({...q,dropped:0},payload,now);
      if(!next.entries.some(entry=>entry.event.eventId===payload.eventId))return;
      await writeQueue(next);
      for(const key of Object.keys(counters) as HealthCounter[])selfHealth[key]=Math.max(0,selfHealth[key]-counters[key]);
      healthLastAt=now;
    });
    if(started)void flushMobileTelemetryQueue();
  }catch{ /* diagnostic: expected Health persistence failure must not recurse into the same reporter. */ /* never recurse into the reporter when storage is unavailable */}
}
async function persistPerformance(config:TransportConfig):Promise<void> {
  const performance=mobilePerformance.take();
  if(!performance.length)return;
  try {
    await persistDiagnostic({
      schemaVersion:1,eventId:Crypto.randomUUID(),platform:config.platform,
      kind:'performance_summary',severity:'INFO',occurredAt:new Date().toISOString(),
      appVersion:config.appVersion,build:config.build,runtime:config.runtime,channel:config.channel,
      updateId:Updates.updateId??'embedded',appStartId:APP_START_ID,performance,
    });
    if(started)void flushMobileTelemetryQueue();
  } catch { /* diagnostic: expected Failed histogram persistence restores samples for a later attempt. */ mobilePerformance.restore(performance);}
}
async function recordObservedSession(config:TransportConfig):Promise<void> {
  if(sessionQueued)return;
  sessionQueued=true;
  try {
    await persistDiagnostic({
      schemaVersion:1,eventId:Crypto.randomUUID(),platform:config.platform,
      kind:'session_start',severity:'INFO',occurredAt:new Date().toISOString(),
      appVersion:config.appVersion,build:config.build,runtime:config.runtime,
      channel:config.channel,updateId:Updates.updateId??'embedded',appStartId:APP_START_ID,
    });
    if(started)void flushMobileTelemetryQueue();
  } catch { /* diagnostic: expected Failed session persistence clears queued flag so session can be retried. */  sessionQueued=false; }
}
export function startMobileTelemetryUploadWorker():()=>void {
  const config=getTransportConfig();
  if(started||!config)return ()=>{};
  started=true;enabled=true;
  void recordObservedSession(config);
  void drainNativeTerminationReports(config);
  void persistHealth(config);
  const stopDelaySampling=startMobileTimerDelaySampling(()=>AppState.currentState==="active");
  const performanceTimer=setInterval(()=>{if(AppState.currentState==='active'){void persistPerformance(config);void persistHealth(config);}},120_000);
  const appSub=AppState.addEventListener('change',state=>{
    if(state==='active'){void drainNativeTerminationReports(config);void flushMobileTelemetryQueue();}
    else if(state==='background'){void persistPerformance(config);void persistHealth(config);}
  });
  const netSub=NetInfo.addEventListener(state=>{
    if(state.isConnected&&state.isInternetReachable!==false)void flushMobileTelemetryQueue();
  });
  void flushMobileTelemetryQueue();
  return ()=>{
    if(!enabled)return;
    appSub.remove();netSub();stopDelaySampling();clearInterval(performanceTimer);if(timer)clearTimeout(timer);
    timer=null;enabled=false;started=false;
  };
}

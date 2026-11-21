/** SDK 57 signed-preview diagnostics transport. No auth token, user ID,
 * device ID, request URL, or error.message crosses this boundary.
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
  type MobileTelemetryEventV1 } from '@gafus/types';
import { applyTelemetryAck, emptyTelemetryQueue, enqueueTelemetryEvent,
  nextTelemetryBatch, normalizeTelemetryQueue, telemetryRetryMs,
  type TelemetryQueueState } from './mobileTelemetryQueue';

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
let enabled=false;
let started=false;
let busy=false;
let attempt=0;
let nextRetryAt=0;
let queueLock=Promise.resolve();
let timer:ReturnType<typeof setTimeout>|null=null;
const own = <T>(fn:()=>Promise<T>):Promise<T> => {
  const next=queueLock.then(fn,fn);queueLock=next.then(()=>{},()=>{});return next;
};
const readQueue = async ():Promise<TelemetryQueueState> => {
  try {
    const raw=await AsyncStorage.getItem(STORAGE_KEY);
    return normalizeTelemetryQueue(raw?JSON.parse(raw):emptyTelemetryQueue(),Date.now());
  }catch{return emptyTelemetryQueue();}
};
const writeQueue=(value:TelemetryQueueState)=>AsyncStorage.setItem(STORAGE_KEY,JSON.stringify(value));

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
  try{origin=new URL(url);}catch{return null;}
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
    try{embedded=new URL(embeddedUpdateUrl);}catch{return null;}
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
  if(grant&&grant.expiresAt>Date.now()+15_000)return grant;
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
  const batch=await own(async()=>nextTelemetryBatch(await readQueue()));
  if(batch.length===0)return false;
  const activeGrant=await ensureGrant(config);
  const response=await request(config,URL_PATH,{schemaVersion:1,events:batch},activeGrant.token);
  if(response.status===401){grant=undefined;throw new UploadFailure(401);}
  if(!response.ok)throw new UploadFailure(response.status,response.headers.get('retry-after'));
  if(response.status!==202)throw new UploadFailure(503);
  const ack=await response.json() as {durable?:unknown;accepted?:unknown;schemaVersion?:unknown};
  if(ack.durable!==true || ack.schemaVersion!==1 || !Array.isArray(ack.accepted))
    throw new UploadFailure(503);
  const submitted=new Set(batch.map(e=>e.eventId));
  if(ack.accepted.some(id=>typeof id!=='string'||!submitted.has(id)))throw new UploadFailure(503);
  if(ack.accepted.length===0)throw new UploadFailure(503);
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
    for(let loop=0;loop<4;loop++) {
      if(!(await flushOnce(config)))break;
      attempt=0;nextRetryAt=0;
    }
  }catch(error){
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
}):Promise<void> {
  const config=getTransportConfig();if(!config)return;
  const rawStack=error instanceof Error?error.stack:undefined;
  const exceptionType=error instanceof Error?error.name:undefined;
  const type=exceptionType&&/^[a-zA-Z_$][a-zA-Z\d_.$<>-]{0,99}$/.test(exceptionType)
    ? exceptionType:undefined;
  const code=options?.errorCode;
  const osVersion=(Device.osVersion??'').match(/^\d{1,3}(?:\.\d{1,3}){0,2}/)?.[0];
  const payload:MobileTelemetryEventV1={
    schemaVersion:1,eventId:Crypto.randomUUID(),platform:config.platform,
    kind:options?.kind??(options?.fatal?'js_fatal':'js_handled'),
    severity:options?.fatal?'FATAL':'ERROR',
    occurredAt:new Date().toISOString(),appVersion:config.appVersion,
    build:config.build,runtime:config.runtime,channel:config.channel,
    updateId:Updates.updateId??'embedded',appStartId:APP_START_ID,
    ...(osVersion?{osVersion}:{}),...(type?{exceptionType:type}:{}),
    ...(code&&/^[A-Z][A-Z0-9_]{0,63}$/.test(code)?{errorCode:code}:{}),
    ...(rawStack?{stack:sanitizeMobileStack(rawStack)}:{}),
  };
  let parsed:MobileTelemetryEventV1;
  try{parsed=parseMobileTelemetryEvent(payload);}catch{return;}
  await own(async()=>writeQueue(enqueueTelemetryEvent(await readQueue(),parsed,Date.now())));
  // Never await transport on a product request or fatal error path.
  if(started)void flushMobileTelemetryQueue();
}
export function startMobileTelemetryUploadWorker():()=>void {
  if(started||!getTransportConfig())return ()=>{};
  started=true;enabled=true;
  const appSub=AppState.addEventListener('change',state=>{
    if(state==='active')void flushMobileTelemetryQueue();
  });
  const netSub=NetInfo.addEventListener(state=>{
    if(state.isConnected&&state.isInternetReachable!==false)void flushMobileTelemetryQueue();
  });
  void flushMobileTelemetryQueue();
  return ()=>{
    if(!enabled)return;
    appSub.remove();netSub();if(timer)clearTimeout(timer);
    timer=null;enabled=false;started=false;
  };
}

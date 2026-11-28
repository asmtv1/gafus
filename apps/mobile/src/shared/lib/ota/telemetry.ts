/**
 * Best-effort anonymous device-reported OTA lifecycle. No account, IP or error
 * text. Queue survives offline restarts and is capped to prevent local growth.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Crypto from "expo-crypto";
import * as Updates from "expo-updates";
import { Platform } from "react-native";
import { ensureOtaInstallationIdentity, selfHostedOtaActive } from "./installationIdentity";

export type OtaEventName = "LAUNCHED" | "CHECKED" | "DOWNLOADED" | "UPDATE_ERROR" | "ROLLBACK_DETECTED"
  | "SIGNATURE_REJECTED" | "MANDATORY_ATTEMPT" | "MANDATORY_INCOMPLETE";
export type OtaFailure = "CHECK_FAILED" | "FETCH_FAILED" | "RELOAD_FAILED" | "NATIVE_UNAVAILABLE" | "OTHER";
type Payload = {
  eventId:string;installationId:string;platform:"ios"|"android";channel:string;
  runtimeVersion:string;nativeFingerprint:string;updateId?:string;
  event:OtaEventName;failureCode?:OtaFailure;
};
const QUEUE_KEY="@gafus/ota/telemetry-queue-v1";
const LAUNCH_KEY="@gafus/ota/last-launch-v1";
const MAX_QUEUE=30;
const UUID=/^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
// Persisting a DOWNLOADED receipt before reload must not wait for telemetry HTTP.
let queueProgress:Promise<void>=Promise.resolve();
let transportProgress:Promise<void>=Promise.resolve();
function withQueue<T>(fn:()=>Promise<T>):Promise<T> {
  const next=queueProgress.then(fn,fn);
  queueProgress=next.then(()=>undefined,()=>undefined);
  return next;
}

function context() {
  if(!selfHostedOtaActive() || !Updates.isEnabled) return null;
  const config=Constants.expoConfig;
  const url=config?.updates?.url;
  if(!url || Platform.OS!=="ios" && Platform.OS!=="android") return null;
  try {
    const parsed=new URL(url);
    if(parsed.protocol!=="https:" || parsed.pathname!=="/ota/manifest" || parsed.search || parsed.hash)
      return null;
    const extra=config?.extra;
    const fingerprint=extra?.otaNativeFingerprint;
    const channel=extra?.otaChannel;
    const runtimeVersion=Updates.runtimeVersion;
    if(typeof fingerprint!=="string" || !/^[a-f\d]{64}$/i.test(fingerprint) ||
      typeof channel!=="string" || !/^[a-z0-9_-]{1,48}$/.test(channel) ||
      !runtimeVersion || !/^[A-Za-z0-9_.+-]{1,100}$/.test(runtimeVersion)) return null;
    return {url:`${parsed.origin}/ota/telemetry`,fingerprint:fingerprint.toLowerCase(),
      channel,runtimeVersion,platform:Platform.OS as "ios"|"android"};
  } catch { /* diagnostic: expected Missing OTA diagnostic context disables transport only. */ return null;}
}
async function readQueue():Promise<Payload[]> {
  const raw=await AsyncStorage.getItem(QUEUE_KEY);
  if(!raw || raw.length>16000) return [];
  try {
    const parsed:unknown=JSON.parse(raw);
    return Array.isArray(parsed)?parsed.slice(-MAX_QUEUE).filter(item=>item && typeof item==="object") as Payload[]:[];
  }catch{ /* diagnostic: expected Unreadable OTA diagnostic queue is unavailable; update remains independent. */ return [];}
}
async function flush(url:string) {
  const queued=await withQueue(readQueue);
  if(!queued.length) return;
  let accepted=0;
  for(const item of queued) {
    const controller = new AbortController();
    const timeout = setTimeout(()=>controller.abort(),2500);
    try {
      const result=await fetch(url,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify(item),signal:controller.signal,
      });
      const additive = item.event === "SIGNATURE_REJECTED" || item.event === "MANDATORY_ATTEMPT" ||
        item.event === "MANDATORY_INCOMPLETE";
      // Mixed-version rollback: old server rejects these new events with 400.
      // Discard only unsupported extensions, not transient errors or legacy events.
      if(result.status!==202 && !(additive && result.status===400)) break;
      accepted++;
    } catch { /* diagnostic: expected OTA transport failure stops drain and retains retry behavior. */  break; }
    finally {clearTimeout(timeout);}
  }
  if(accepted) {
    const acknowledged=new Set(queued.slice(0,accepted).map(item=>item.eventId));
    await withQueue(async()=>{
      const latest=await readQueue();
      await AsyncStorage.setItem(QUEUE_KEY,JSON.stringify(latest.filter(item=>!acknowledged.has(item.eventId))));
    });
  }
}
function scheduleFlush(url:string):Promise<void> {
  transportProgress=transportProgress.then(()=>flush(url)).catch(()=>{ /* diagnostic: expected Background diagnostic flush cannot block update processing. */ return undefined; });
  return transportProgress;
}
/** Called only while holding the local queue serialization lock. */
async function enqueueDirect(event:OtaEventName, updateId?:string, failureCode?:OtaFailure):Promise<string|undefined> {
    const ctx=context();
    if(!ctx) return;
    const installationId=await ensureOtaInstallationIdentity();
    if(!installationId) return;
    const body:Payload={eventId:Crypto.randomUUID(),installationId,platform:ctx.platform,
      channel:ctx.channel,runtimeVersion:ctx.runtimeVersion,nativeFingerprint:ctx.fingerprint,
      event,
      ...(updateId && UUID.test(updateId)?{updateId}:{}),
      ...(event==="UPDATE_ERROR"?{failureCode:failureCode??"OTHER"}:{}),
    };
    const old=await readQueue();
    await AsyncStorage.setItem(QUEUE_KEY,JSON.stringify([...old,body].slice(-MAX_QUEUE)));
    return ctx.url;
}
export function trackOtaEvent(event:OtaEventName, updateId?:string,
  failureCode?:OtaFailure, queueOnly=false):Promise<void> {
  return withQueue(()=>enqueueDirect(event,updateId,failureCode))
    .then(url=>url&&!queueOnly?scheduleFlush(url):undefined).catch(()=>{ /* diagnostic: expected Operational event tracking is isolated from OTA user actions. */ return undefined; });
}
let launchTracked=false;
export function trackOtaLaunch():Promise<void> {
  if(launchTracked) return Promise.resolve();
  launchTracked=true;
  return withQueue(async()=>{
    const ctx=context();if(!ctx) return;
    // Native embedded bundle IDs are not necessarily present in the signed OTA
    // release registry. Only send a release ID for a downloaded OTA update.
    const id=Updates.isEmbeddedLaunch ? undefined : Updates.updateId ?? undefined;
    const commit=Updates.createdAt?.getTime() ?? null;
    const previousRaw=await AsyncStorage.getItem(LAUNCH_KEY);
    let previous: {runtime:string;commit:number}|null=null;
    try {previous=previousRaw?JSON.parse(previousRaw):null;}catch{ /* diagnostic: expected Unreadable previous launch marker is unknown, not verified rollback. */ previous=null;}
    if(previous && previous.runtime===ctx.runtimeVersion &&
      Number.isFinite(previous.commit) && commit!==null && commit<previous.commit)
      await enqueueDirect("ROLLBACK_DETECTED",id??undefined);
    await AsyncStorage.setItem(LAUNCH_KEY,JSON.stringify({runtime:ctx.runtimeVersion,commit}));
    return enqueueDirect("LAUNCHED",id??undefined);
  }).then(url=>url?scheduleFlush(url):undefined).catch(()=>{ /* diagnostic: expected OTA launch diagnostics are isolated from successful app startup. */ return undefined; });
}

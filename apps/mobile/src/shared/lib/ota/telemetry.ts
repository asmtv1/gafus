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

export type OtaEventName = "LAUNCHED" | "CHECKED" | "DOWNLOADED" | "UPDATE_ERROR" | "ROLLBACK_DETECTED";
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
let inProgress:Promise<void>=Promise.resolve();

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
  } catch {return null;}
}
async function readQueue():Promise<Payload[]> {
  const raw=await AsyncStorage.getItem(QUEUE_KEY);
  if(!raw || raw.length>16000) return [];
  try {
    const parsed:unknown=JSON.parse(raw);
    return Array.isArray(parsed)?parsed.slice(-MAX_QUEUE).filter(item=>item && typeof item==="object") as Payload[]:[];
  }catch{return [];}
}
async function flush(url:string) {
  const queued=await readQueue();
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
      if(result.status!==202) break;
      accepted++;
    } catch { break; }
    finally {clearTimeout(timeout);}
  }
  if(accepted) await AsyncStorage.setItem(QUEUE_KEY,JSON.stringify(queued.slice(accepted)));
}
async function emitDirect(event:OtaEventName, updateId?:string, failureCode?:OtaFailure, queueOnly=false):Promise<void> {
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
    if(!queueOnly)await flush(ctx.url);
}
export function trackOtaEvent(event:OtaEventName, updateId?:string,
  failureCode?:OtaFailure, queueOnly=false):Promise<void> {
  inProgress=inProgress.catch(()=>undefined).then(()=>emitDirect(event,updateId,failureCode,queueOnly)).catch(()=>undefined);
  return inProgress;
}
let launchTracked=false;
export function trackOtaLaunch():Promise<void> {
  if(launchTracked) return Promise.resolve();
  launchTracked=true;
  inProgress=inProgress.catch(()=>undefined).then(async()=>{
    const ctx=context();if(!ctx) return;
    // Native embedded bundle IDs are not necessarily present in the signed OTA
    // release registry. Only send a release ID for a downloaded OTA update.
    const id=Updates.isEmbeddedLaunch ? undefined : Updates.updateId ?? undefined;
    const commit=Updates.createdAt?.getTime() ?? null;
    const previousRaw=await AsyncStorage.getItem(LAUNCH_KEY);
    let previous: {runtime:string;commit:number}|null=null;
    try {previous=previousRaw?JSON.parse(previousRaw):null;}catch{previous=null;}
    if(previous && previous.runtime===ctx.runtimeVersion &&
      Number.isFinite(previous.commit) && commit!==null && commit<previous.commit)
      await emitDirect("ROLLBACK_DETECTED",id??undefined);
    await AsyncStorage.setItem(LAUNCH_KEY,JSON.stringify({runtime:ctx.runtimeVersion,commit}));
    await emitDirect("LAUNCHED",id??undefined);
  }).catch(()=>undefined);
  return inProgress;
}

import { normalizeUsernameAvailabilityInput } from "@gafus/types";
/**
 * G03 bounded local Web source/mock consumer.
 * These DTOs map CURRENT Hono source and legacy Next actions; AG1 has NOT
 * published a frozen G03 producer or accepted a specific HTTP409 contract.
 * This is NOT a browser TLS or real PostgreSQL acceptance receipt.
 */
export const G03_AVAILABLE_PATH = "/api/v1/auth/username-available" as const;
export const G03_CHANGE_PATH = "/api/v1/auth/username-change" as const;

export type LegacyAvailableDto = {available:boolean}|{error:string};
export type LegacyChangeDto = {success?:true;username?:string;error?:string};
export type HonoAvailableDto = {success:true;data:{available:boolean}};
export type HonoChangeDto = {
  success:true; data:{user:{id:string;username:string;role:string}};
};
export type G03GetPlan = {method:"GET";path:string;hasBody:false};
export type G03PostPlan = {method:"POST";path:typeof G03_CHANGE_PATH;json:{newUsername:string}};
export type Candidate = {ok:true;username:string}|{ok:false;reason:"invalid-format"};
export type ErrorClass =
  "unauthenticated"|"forbidden"|"rate-limited"|"validation-or-conflict-unfrozen"|
  "temporarily-unavailable"|"unknown-outcome";
export type NotConfirmed = {
  kind:"not-confirmed";
  error:ErrorClass;
  /** Even source-level 500 may mean committed, so never automatically retry. */
  autoRetry:false;
  message:string;
};
export type CommitAck = {
  kind:"committed";source:"legacy"|"hono";actorId:string;
  canonicalUsername:string;profileHref:string;
  /** Legacy action has NO server principal id, unlike current Hono source. */
  serverPrincipalValidated:boolean;
  role?:string;
};
export type MutationDecision = CommitAck|NotConfirmed|{kind:"discard-stale-actor";autoRetry:false};
export type AvailabilityDecision =
  {kind:"known";available:boolean}|{kind:"stale"|"fail-closed";autoRetry:false};
export type Reconciliation = {kind:"stale-actor"|"await-identity-sync"|"navigate-profile"|"require-reauth";
  autoRetry:false;url?:string;mayUpdateUserCache:boolean};

const record=(v:unknown):v is Record<string,unknown> =>
  typeof v==="object" && v!==null && !Array.isArray(v);

export function canonicalCandidate(input:unknown):Candidate{
  const username=normalizeUsernameAvailabilityInput(input,true);
  return username!==null ? {ok:true,username} : {ok:false,reason:"invalid-format"};
}
function ackUsername(raw:unknown):string|null{
  if(typeof raw!=="string")return null;
  // A server ACK must already be canonical, not repaired by the client.
  return normalizeUsernameAvailabilityInput(raw,true)===raw ? raw : null;
}
/** This is a method/path preview. Transport (JWT/cookie Origin) is NOT frozen for G03. */
export function availablePlan(input:unknown):G03GetPlan|null{
  const candidate=canonicalCandidate(input);
  if(!candidate.ok)return null;
  return {method:"GET",path:G03_AVAILABLE_PATH+"?username="+encodeURIComponent(candidate.username),hasBody:false};
}
export function changePlan(input:unknown):G03PostPlan|null{
  const candidate=canonicalCandidate(input);
  if(!candidate.ok)return null;
  return {method:"POST",path:G03_CHANGE_PATH,json:{newUsername:candidate.username}};
}
function classify(status:number):NotConfirmed{
  if(status===401)return {kind:"not-confirmed",error:"unauthenticated",
    message:"Сессия завершена. Войдите снова.",autoRetry:false};
  if(status===403)return {kind:"not-confirmed",error:"forbidden",
    message:"Действие недоступно для этого аккаунта.",autoRetry:false};
  if(status===429)return {kind:"not-confirmed",error:"rate-limited",
    message:"Слишком много запросов. Повторите попытку позже вручную.",autoRetry:false};
  // 400 can be username collision OR format; AG1 has NOT frozen 409.
  if(status===400 || status===409)return {kind:"not-confirmed",
    error:"validation-or-conflict-unfrozen",
    message:"Проверьте логин. Возможно, он уже занят.",autoRetry:false};
  if(status>=500)return {kind:"not-confirmed",error:"unknown-outcome",
    message:"Ответ сервера не подтверждает результат. Проверьте логин перед новой попыткой.",autoRetry:false};
  return {kind:"not-confirmed",error:"unknown-outcome",
    message:"Результат изменения не подтверждён. Не отправляйте запрос повторно автоматически.",autoRetry:false};
}
export function transportFailure():NotConfirmed{
  return classify(0);
}
/** Mapping old Server Action contract with no response-bound actor id. */
export function legacyChangeAck(payload:unknown, expectedActorId:string):MutationDecision{
  if(!expectedActorId.trim())return {kind:"discard-stale-actor",autoRetry:false};
  if(!record(payload) || payload.success!==true || payload.error!==undefined)
    return classify(0);
  const username=ackUsername(payload.username);
  if(!username)return classify(0);
  return {kind:"committed",source:"legacy",actorId:expectedActorId,
    canonicalUsername:username,profileHref:profileHref(username),
    serverPrincipalValidated:false};
}
/** Convert current Hono POST only when HTTP200 and full principal/id match. */
export function honoChangeAck(
  status:number,payload:unknown,expectedActorId:string,
):MutationDecision{
  if(!expectedActorId.trim())return {kind:"discard-stale-actor",autoRetry:false};
  if(status!==200)return classify(status);
  if(!record(payload) || payload.success!==true || !record(payload.data) ||
     !record(payload.data.user))return classify(0);
  const user=payload.data.user;
  const username=ackUsername(user.username);
  if(!username || typeof user.id!=="string" || user.id!==expectedActorId ||
    typeof user.role!=="string" || !user.role.trim())
    return {kind:"discard-stale-actor",autoRetry:false};
  return {kind:"committed",source:"hono",actorId:expectedActorId,
    canonicalUsername:username,profileHref:profileHref(username),
    role:user.role,serverPrincipalValidated:true};
}
/** Old Next Server Action availability is flat {available:boolean}, not Hono data.available. */
export function legacyAvailableAck(
  payload:unknown,requestActor:string,currentActor:string,
  requestSeq:number,latestSeq:number,
):AvailabilityDecision{
  if(!requestActor || requestActor!==currentActor || requestSeq!==latestSeq)
    return {kind:"stale",autoRetry:false};
  if(record(payload) && typeof payload.available==="boolean" && payload.error===undefined)
    return {kind:"known",available:payload.available};
  return {kind:"fail-closed",autoRetry:false};
}
/** Availability is a hint, never an ownership reservation. */
export function honoAvailableAck(
  status:number,payload:unknown,requestActor:string,currentActor:string,
  requestSeq:number,latestSeq:number,
):AvailabilityDecision{
  if(!requestActor || requestActor!==currentActor || requestSeq!==latestSeq)
    return {kind:"stale",autoRetry:false};
  if(status===200 && record(payload) && payload.success===true &&
      record(payload.data) && typeof payload.data.available==="boolean")
    return {kind:"known",available:payload.data.available};
  return {kind:"fail-closed",autoRetry:false};
}
/** Separate ACK from session refresh. Failed refresh is NOT failed mutation. */
export function reconcileAfterAck(
  ack:CommitAck,currentActorId:string,sessionRefresh:"pending"|"succeeded"|"failed",
):Reconciliation{
  if(currentActorId!==ack.actorId)return {kind:"stale-actor",autoRetry:false,mayUpdateUserCache:false};
  if(sessionRefresh==="pending")return {kind:"await-identity-sync",autoRetry:false,
    mayUpdateUserCache:ack.serverPrincipalValidated};
  if(sessionRefresh==="failed")return {kind:"require-reauth",url:"/login",
    autoRetry:false,mayUpdateUserCache:false};
  return {kind:"navigate-profile",url:ack.profileHref,autoRetry:false,
    mayUpdateUserCache:ack.serverPrincipalValidated};
}
function profileHref(username:string):string{
  return "/profile?username="+encodeURIComponent(username);
}

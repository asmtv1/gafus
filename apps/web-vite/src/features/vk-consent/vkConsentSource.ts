import {apiRequest} from "../../shared/api/client";

/** Existing Hono mobile-context GET, NOT an approved Web OAuth-state bridge. */
export type VkConsentStatus={savedPromoCode:string|null;completed:boolean};
export type VkConsentPayload={acceptPersonalData:true;
  acceptPrivacyPolicy:true;acceptDataDistribution:true};
export type VkConsentAttempt={
  contextToken:string;state:string;consentPayload:VkConsentPayload;
  promoCode?:string;tempSessionId?:string;
};
export type VkConsentWire={
  fixtureKind:"AG2_VK_CONSENT_SYNTHETIC_NO_REAL_AUTH";
  inspect:(contextToken:string,state:string)=>Promise<unknown>;
  submit:(payload:VkConsentAttempt)=>Promise<unknown>;
};
const object=(v:unknown):Record<string,unknown>|null=>
  v!==null&&typeof v==="object"&&!Array.isArray(v)?
  v as Record<string,unknown>:null;
const safeOpaque=(v:unknown):v is string=>typeof v==="string"&&
  /^[a-zA-Z0-9_-]{32,256}$/.test(v);
const promo=(v:unknown):v is string=>typeof v==="string"&&
  /^[a-zA-Z0-9_-]{1,64}$/.test(v);
export function validateVkConsentContext(contextToken:unknown,state:unknown){
  if(!safeOpaque(contextToken)||!safeOpaque(state))
    throw Error("INVALID_VK_CONTEXT");
  return {contextToken,state};
}
export function projectVkConsentSummary(raw:unknown):VkConsentStatus{
  const v=object(raw);
  if(!v||typeof v.completed!=="boolean"||
    !(v.savedPromoCode===null||promo(v.savedPromoCode)))
    throw Error("INVALID_VK_CONTEXT_SUMMARY");
  return {savedPromoCode:v.savedPromoCode as string|null,
    completed:v.completed};
}
/** Mobile POST returns credential material: discard, never render, cache, or persist. */
export function projectVkConsentCompletion(raw:unknown):{accepted:true}{
  const v=object(raw),user=object(v?.user);
  if(!v||!user||typeof user.username!=="string"||
    user.username.length===0||user.username.length>128||
    typeof v.accessToken!=="string"||!v.accessToken||
    typeof v.refreshToken!=="string"||!v.refreshToken||
    typeof v.needsPhone!=="boolean")throw Error("INVALID_VK_ACK");
  return {accepted:true};
}
export function buildVkConsentAttempt(contextToken:string,state:string,
  checked:{acceptPersonalData:boolean;acceptPrivacyPolicy:boolean;
    acceptDataDistribution:boolean},promoCode:string):VkConsentAttempt{
  validateVkConsentContext(contextToken,state);
  if(!checked.acceptPersonalData||!checked.acceptPrivacyPolicy||
    !checked.acceptDataDistribution)throw Error("VK_CONSENTS_REQUIRED");
  const value=promoCode.trim();
  if(value&&!promo(value))throw Error("INVALID_VK_PROMO");
  return {contextToken,state,consentPayload:{
    acceptPersonalData:true,acceptPrivacyPolicy:true,
    acceptDataDistribution:true,
  },...(value?{promoCode:value}:{})};
}
export function isDefiniteVkConsentDenial(e:unknown):boolean{
  const objectError=object(e);
  return !!objectError&&typeof objectError.status==="number"&&
    [400,401,403,404,409,422,429].includes(objectError.status)&&
    objectError.code!=="INVALID_RESPONSE"&&
    objectError.code!=="STATUS_MISMATCH";
}
/** GET only. Web Next uses HttpOnly vk_registration_state cookie, NOT URL state. */
export async function getVkConsentSummary(contextToken:string,state:string){
  validateVkConsentContext(contextToken,state);
  return projectVkConsentSummary(await apiRequest<unknown>(
    "/api/v1/auth/vk-consent/"+contextToken+"?state="+encodeURIComponent(state),
    {method:"GET",expectedStatus:200}));
}

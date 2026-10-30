/** Server-owned DTO projections for an explicitly INJECTED subscription fixture.
 * This module has NO fetch/apiRequest: existing Hono GET /status can trigger
 * YooKassa reconcile, GET /offer can ensure/write an Apple account token.
 * These are NOT proven read-only and MUST NOT be invoked by AG2.
 */
export type SubscriptionStatus={
  hasActiveSubscription:boolean;
  canUseCynologistChat:boolean;
  canBookConsultations:boolean;
  isLifetime:boolean;
  isTrial:boolean;
  activeUntil:string|null;
  nextChargeAt:string|null;
  cancelAtPeriodEnd:boolean;
  provider:"YOOKASSA"|"APPLE"|"MANUAL"|null;
  planCode:"WEEKLY"|"TWO_WEEKS"|"MONTHLY"|"THREE_MONTHS"|null;
  status:"ACTIVE"|"PENDING"|"PAST_DUE"|"CANCELED"|"EXPIRED"|
    "REFUNDED"|"REVOKED"|null;
};
export type SubscriptionPlan={
  code:"TWO_WEEKS"|"MONTHLY"|"THREE_MONTHS";
  title:string;label:string;
  intervalDays:number;priceRub:number;
  enabled:boolean;consultationBookingIncluded:boolean;
  cynologistChatIncluded:boolean;
  badge:"TRY"|"POPULAR"|"MAX_SAVINGS"|null;
};
export type SubscriptionOffer={
  plans:SubscriptionPlan[];
  promoAvailable:boolean;
  savedPromoStatus:"ACTIVE"|"INACTIVE"|"ARCHIVED"|null;
};
export type SubscriptionSnapshot={status:SubscriptionStatus;offer:SubscriptionOffer};
export type SubscriptionReadLoader=(userId:string)=>Promise<{
  status:unknown;offer:unknown;
}>;
const obj=(v:unknown):Record<string,unknown>|null=>
  v!==null&&typeof v==="object"&&!Array.isArray(v)?
    v as Record<string,unknown>:null;
const bool=(v:unknown):v is boolean=>typeof v==="boolean";
const cleanText=(v:unknown,max:number):v is string=>
  typeof v==="string"&&v.trim().length>0&&v.length<=max;
const date=(v:unknown):v is string=>typeof v==="string"&&
  /(?:Z|[+-]\d\d:\d\d)$/.test(v)&&
  Number.isFinite(Date.parse(v));
const statusValues=["ACTIVE","PENDING","PAST_DUE","CANCELED",
  "EXPIRED","REFUNDED","REVOKED"] as const;
const planValues=["TWO_WEEKS","MONTHLY","THREE_MONTHS"] as const;
function parseStatus(raw:unknown):SubscriptionStatus{
  const d=obj(raw);
  if(!d||!bool(d.hasActiveSubscription)||!bool(d.canUseCynologistChat)||
    !bool(d.canBookConsultations)||!bool(d.isLifetime)||!bool(d.isTrial)||
    !bool(d.cancelAtPeriodEnd)||
    !(d.activeUntil===null||date(d.activeUntil))||
    !(d.nextChargeAt===null||date(d.nextChargeAt))||
    !(d.provider===null||["YOOKASSA","APPLE","MANUAL"].includes(String(d.provider)))||
    !(d.planCode===null||["WEEKLY",...planValues].includes(String(d.planCode)))||
    !(d.status===null||statusValues.includes(d.status as typeof statusValues[number]))||
    (d.hasActiveSubscription&&d.status!=="ACTIVE")||
    (d.isLifetime&&!d.hasActiveSubscription))
    throw Error("INVALID_SUBSCRIPTION_STATUS");
  return {
    hasActiveSubscription:d.hasActiveSubscription,
    canUseCynologistChat:d.canUseCynologistChat,
    canBookConsultations:d.canBookConsultations,
    isLifetime:d.isLifetime,isTrial:d.isTrial,
    activeUntil:d.activeUntil,nextChargeAt:d.nextChargeAt,
    cancelAtPeriodEnd:d.cancelAtPeriodEnd,
    provider:d.provider as SubscriptionStatus["provider"],
    planCode:d.planCode as SubscriptionStatus["planCode"],
    status:d.status as SubscriptionStatus["status"],
  };
}
function parseOffer(raw:unknown):SubscriptionOffer{
  const d=obj(raw), promo=obj(d?.promoCode);
  if(!d||!Array.isArray(d.yookassaPlans)||d.yookassaPlans.length>10||
    !promo||!bool(promo.entryEnabled)||!bool(promo.eligible))
    throw Error("INVALID_SUBSCRIPTION_OFFER");
  const saved=d.savedRegistrationPromoCode;
  const savedObject=saved===null?null:obj(saved);
  if(savedObject&&(!cleanText(savedObject.code,80)||
    !["ACTIVE","INACTIVE","ARCHIVED"].includes(String(savedObject.status))))
    throw Error("INVALID_SAVED_PROMO");
  if(saved!==null&&!savedObject)throw Error("INVALID_SAVED_PROMO");
  const codes=new Set<string>();
  const plans:SubscriptionPlan[]=d.yookassaPlans.map((rawPlan:unknown)=>{
    const p=obj(rawPlan);
    if(!p||!planValues.includes(p.code as typeof planValues[number])||
      codes.has(String(p.code))||!cleanText(p.title,180)||
      !cleanText(p.label,180)||!Number.isSafeInteger(p.intervalDays)||
      Number(p.intervalDays)<=0||Number(p.intervalDays)>365||
      !Number.isSafeInteger(p.yookassaPriceRub)||
      Number(p.yookassaPriceRub)<0||Number(p.yookassaPriceRub)>1000000||
      p.currency!=="RUB"||!bool(p.enabled)||
      !bool(p.consultationBookingIncluded)||!bool(p.cynologistChatIncluded)||
      !(p.badge===null||["TRY","POPULAR","MAX_SAVINGS"].includes(String(p.badge))))
      throw Error("INVALID_SUBSCRIPTION_PLAN");
    codes.add(p.code as string);
    return {
      code:p.code as SubscriptionPlan["code"],title:p.title as string,
      label:p.label as string,intervalDays:p.intervalDays as number,
      priceRub:p.yookassaPriceRub as number,enabled:p.enabled as boolean,
      consultationBookingIncluded:p.consultationBookingIncluded as boolean,
      cynologistChatIncluded:p.cynologistChatIncluded as boolean,
      badge:p.badge as SubscriptionPlan["badge"],
    };
  });
  return {plans:plans.filter(p=>p.enabled),promoAvailable:
    Boolean(promo.entryEnabled&&promo.eligible),
    savedPromoStatus:savedObject?.status as SubscriptionOffer["savedPromoStatus"]??null};
}
export function projectSubscriptionSnapshot(raw:unknown):SubscriptionSnapshot{
  const d=obj(raw);
  if(!d)throw Error("INVALID_SUBSCRIPTION_SNAPSHOT");
  return {status:parseStatus(d.status),offer:parseOffer(d.offer)};
}
export function displaySubscriptionDate(raw:string|null):string|null{
  if(!raw||!date(raw))return null;
  return new Intl.DateTimeFormat("ru-RU",{
    timeZone:"Europe/Moscow",year:"numeric",month:"long",day:"numeric",
  }).format(new Date(raw))+" МСК";
}
export const planLabel=(code:SubscriptionStatus["planCode"]):string=>{
  if(code==="TWO_WEEKS")return "Самостоятельный";
  if(code==="MONTHLY")return "Поддержка в чате";
  if(code==="THREE_MONTHS")return "Полное сопровождение";
  if(code==="WEEKLY")return "Исторический недельный";
  return "Не указан";
};

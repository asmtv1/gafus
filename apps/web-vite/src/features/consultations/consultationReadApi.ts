import {ApiError} from "../../shared/api/client";

/** Existing Hono /api/v1/consultations GET contracts. All private
 * projections omit intake phone, problem, Voximplant and payment details.
 * No booking, verify, admission, cancellation or POST is imported.
 */
export type Eligibility={
  canBook:boolean;reason:"ACTIVE_BOOKING"|"WEEKLY_COOLDOWN"|null;
  nextBookingAt:string|null;message:string|null;
};
export type Specialist={
  id:string;userId:string;username:string;name:string;
  about:string|null;slotDurationMin:number;avatarUrl?:string|null;
};
export type Slot={
  id:string;startAtUtc:string;endAtUtc:string;
  status:"FREE"|"BOOKED"|"BLOCKED";
};
export type Booking={
  id:string;status:"PENDING_TRAINER_CONFIRMATION"|"CONFIRMED"|
    "CANCELLED_BY_TRAINER"|"CANCELLED_BY_USER"|"CANCELLED_BY_SLA"|
    "CANCELLED_BY_SYSTEM"|"COMPLETED"|"NO_SHOW";
  slot:Slot;cynologistUserId:string;
  cynologistName:string|null;clientOwnerName?:string|null;
  petName:string|null;cancelReason:string|null;
};
export type Catalog={items:Specialist[];eligibility:Eligibility};
export type SlotsView={items:Slot[];eligibility:Eligibility};
/** Source Next calendar includes occupied slots and trainer day-offs. Never
 * expose booking/client metadata: project only the public slot fields. */
export type CalendarSlotsView=SlotsView&{dayOffDates:string[]};
export type BookingsPage={items:Booking[];nextCursor:string|null};
export type SlotRange={from:string;to:string};
const obj=(x:unknown):Record<string,unknown>|null=>
  x&&typeof x==="object"&&!Array.isArray(x)?x as Record<string,unknown>:null;
const id=(x:unknown):x is string=>
  typeof x==="string"&&/^[A-Za-z0-9_-]{1,128}$/.test(x);
const text=(x:unknown):x is string|null=>x===null||typeof x==="string";
const time=(x:unknown):x is string=>typeof x==="string"&&
  Number.isFinite(Date.parse(x))&&/Z$/.test(x);
const count=(x:unknown):x is number=>Number.isSafeInteger(x)&&Number(x)>0;
const bookingStatuses:Booking["status"][]=[
  "PENDING_TRAINER_CONFIRMATION","CONFIRMED","CANCELLED_BY_TRAINER",
  "CANCELLED_BY_USER","CANCELLED_BY_SLA","CANCELLED_BY_SYSTEM",
  "COMPLETED","NO_SHOW",
];
function eligibility(raw:unknown):Eligibility{
  const d=obj(raw);
  if(!d||typeof d.canBook!=="boolean"||
    !(d.reason===null||d.reason==="ACTIVE_BOOKING"||d.reason==="WEEKLY_COOLDOWN")||
    !text(d.message)||!(d.nextBookingAt===null||time(d.nextBookingAt)))
    throw Error("INVALID_CONSULTATION_ELIGIBILITY");
  return {canBook:d.canBook,reason:d.reason,
    nextBookingAt:d.nextBookingAt,message:d.message};
}
function unique<T extends {id:string}>(values:T[],error:string){
  const seen=new Set<string>();
  for(const item of values){
    if(seen.has(item.id))throw Error(error);
    seen.add(item.id);
  }
  return values;
}
/** Source Next catalog displays trainer avatars. Only public user-avatar CDN
 * objects are allowed; private raw S3 keys, signed URLs and arbitrary hosts
 * must never appear in the read-only catalog DOM or JSON cache.
 */
export function safePublicCynologistAvatar(raw:unknown):string|null{
  if(typeof raw!=="string"||raw.length>2048||raw.includes("%")||
    raw.includes("..")||raw.includes("\\")||
    Array.from(raw).some(char=>char.charCodeAt(0)<32))return null;
  const relative=raw.replace(/^\/+/,"");
  const path=/^uploads\/users\/[A-Za-z0-9_-]+\/[A-Za-z0-9_./-]+$/;
  if(path.test(relative))return "https://storage.yandexcloud.net/gafus-media/"+relative;
  try{
    const url=new URL(raw);
    if(url.protocol!=="https:"||url.username||url.password||url.port||
      url.search||url.hash)return null;
    if(url.hostname==="storage.yandexcloud.net"&&
      path.test(url.pathname.replace(/^\/gafus-media\//,"")))return url.href;
    if(url.hostname==="gafus-media.storage.yandexcloud.net"&&
      path.test(url.pathname.slice(1)))return url.href;
  }catch{return null;}
  return null;
}
export function projectCatalog(data:unknown,rawEligibility:unknown):Catalog{
  if(!Array.isArray(data)||data.length>200)throw Error("INVALID_CONSULTATION_CATALOG");
  const items=unique(data.map((x:unknown)=>{
    const d=obj(x);
    if(!d||!id(d.id)||!id(d.userId)||!id(d.username)||
      !text(d.displayName)||!text(d.about)||!count(d.slotDurationMin)||
      Number(d.slotDurationMin)>180)
      throw Error("INVALID_CONSULTATION_SPECIALIST");
    return {id:d.id,userId:d.userId,username:d.username,
      name:d.displayName?.trim()||"Кинолог",
      about:d.about,slotDurationMin:d.slotDurationMin,
      avatarUrl:safePublicCynologistAvatar(d.avatarUrl)};
  }),"DUPLICATE_CONSULTATION_SPECIALIST");
  if(new Set(items.map(x=>x.userId)).size!==items.length)
    throw Error("DUPLICATE_CONSULTATION_USER");
  return {items,eligibility:eligibility(rawEligibility)};
}
function slot(raw:unknown):Slot{
  const d=obj(raw);
  if(!d||!id(d.id)||!time(d.startAtUtc)||!time(d.endAtUtc)||
    Date.parse(d.endAtUtc)<=Date.parse(d.startAtUtc)||
    !["FREE","BOOKED","BLOCKED"].includes(String(d.status)))
    throw Error("INVALID_CONSULTATION_SLOT");
  return {id:d.id,startAtUtc:d.startAtUtc,endAtUtc:d.endAtUtc,
    status:d.status as Slot["status"]};
}
export function projectSlots(data:unknown,rawEligibility:unknown):SlotsView{
  if(!Array.isArray(data)||data.length>2000)throw Error("INVALID_CONSULTATION_SLOTS");
  const items=unique(data.map(slot),"DUPLICATE_CONSULTATION_SLOT")
    .filter(s=>s.status==="FREE")
    .sort((a,b)=>a.startAtUtc.localeCompare(b.startAtUtc));
  return {items,eligibility:eligibility(rawEligibility)};
}
export function projectMyBookings(data:unknown,username:string):BookingsPage{
  const d=obj(data);
  if(!d||!Array.isArray(d.items)||d.items.length>50||
    !(d.nextCursor===null||id(d.nextCursor)))
    throw Error("INVALID_CONSULTATION_BOOKING_PAGE");
  const items=unique(d.items.map((raw:unknown)=>{
    const b=obj(raw);
    if(!b||!id(b.id)||!bookingStatuses.includes(b.status as Booking["status"])||
      !id(b.cynologistUserId)||!text(b.cynologistDisplayName)||
      !text(b.clientOwnerName)||!text(b.petName)||!text(b.cancelReason)||
      b.clientUsername!==username)
      throw Error("CONSULTATION_BOOKING_OWNER_MISMATCH");
    return {id:b.id,status:b.status as Booking["status"],
      slot:slot(b.slot),cynologistUserId:b.cynologistUserId,
      cynologistName:b.cynologistDisplayName,
      clientOwnerName:b.clientOwnerName,
      petName:b.petName,cancelReason:b.cancelReason};
  }),"DUPLICATE_CONSULTATION_BOOKING");
  return {items,nextCursor:d.nextCursor};
}
export function mskLabel(iso:string):string{
  return new Intl.DateTimeFormat("ru-RU",{
    timeZone:"Europe/Moscow",day:"2-digit",month:"2-digit",year:"numeric",
    hour:"2-digit",minute:"2-digit",
  }).format(new Date(iso))+" МСК";
}
export function consultationRange(now=new Date()):SlotRange{
  // Next uses tomorrow 00:00 through day 15 23:59 Moscow. Convert using
  // calendar parts in Europe/Moscow, not viewer's device timezone.
  const parts=new Intl.DateTimeFormat("en-US",{
    timeZone:"Europe/Moscow",year:"numeric",month:"2-digit",day:"2-digit",
  }).formatToParts(now);
  const value=(key:string)=>Number(parts.find(p=>p.type===key)?.value);
  const day0=Date.UTC(value("year"),value("month")-1,value("day"));
  const from=new Date(day0+86400000-3*3600000);
  const to=new Date(day0+16*86400000-3*3600000-1);
  return {from:from.toISOString(),to:to.toISOString()};
}
async function consultationGet(path:string):Promise<Record<string,unknown>>{
  if(!/^\/api\/v1\/consultations\/[a-zA-Z0-9/_?%=&.-]+$/.test(path))
    throw Error("INVALID_CONSULTATION_GET_PATH");
  const response=await fetch(path,{method:"GET",credentials:"include",
    cache:"no-store",headers:{Accept:"application/json",
      "X-Gafus-Auth-Transport":"cookie"}});
  let envelope:unknown;
  try{envelope=await response.json();}catch{
    throw new ApiError(response.status,"Некорректный ответ","INVALID_RESPONSE");
  }
  const result=obj(envelope);
  if(!result||typeof result.success!=="boolean")
    throw new ApiError(response.status,"Некорректный ответ","INVALID_RESPONSE");
  if(!response.ok||result.success!==true)
    throw new ApiError(response.status,"Не удалось получить консультации",
      typeof result.code==="string"?result.code:undefined);
  return result;
}
export async function getSpecialists():Promise<Catalog>{
  const raw=await consultationGet("/api/v1/consultations/cynologists");
  return projectCatalog(raw.data,raw.bookingEligibility);
}
export async function getSpecialistSlots(userId:string,range:SlotRange):
Promise<SlotsView>{
  if(!id(userId)||!time(range.from)||!time(range.to)||
    Date.parse(range.to)<Date.parse(range.from)||
    Date.parse(range.to)-Date.parse(range.from)>60*86400000)
    throw Error("INVALID_CONSULTATION_SLOT_RANGE");
  const query=new URLSearchParams({from:range.from,to:range.to,
    includeBusy:"0"}).toString();
  const raw=await consultationGet("/api/v1/consultations/cynologists/"+
    userId+"/slots?"+query);
  return projectSlots(raw.data,raw.bookingEligibility);
}
export async function getSpecialistCalendarSlots(userId:string,range:SlotRange):
Promise<CalendarSlotsView>{
  if(!id(userId)||!time(range.from)||!time(range.to)||
    Date.parse(range.to)<Date.parse(range.from)||
    Date.parse(range.to)-Date.parse(range.from)>60*86400000)
    throw Error("INVALID_CONSULTATION_SLOT_RANGE");
  const query=new URLSearchParams({from:range.from,to:range.to,
    includeBusy:"1"}).toString();
  const raw=await consultationGet("/api/v1/consultations/cynologists/"+
    userId+"/slots?"+query);
  if(!Array.isArray(raw.data)||raw.data.length>2000)
    throw Error("INVALID_CONSULTATION_CALENDAR_SLOTS");
  const items=unique(raw.data.map(slot),"DUPLICATE_CONSULTATION_SLOT")
    .sort((a,b)=>a.startAtUtc.localeCompare(b.startAtUtc));
  // The real Hono includeBusy=1 response supplies dayOffDates. An older
  // source-only provider is tolerated when the property is absent, not when
  // malformed dates or non-array values are returned.
  const rawDays=raw.dayOffDates===undefined?[]:raw.dayOffDates;
  if(!Array.isArray(rawDays)||rawDays.length>65||
    rawDays.some(x=>typeof x!=="string"||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(x)||
      Number.isNaN(Date.parse(x+"T12:00:00Z"))))
    throw Error("INVALID_CONSULTATION_CALENDAR_DAYS_OFF");
  const dayOffDates:string[]=rawDays;
  if(new Set(dayOffDates).size!==dayOffDates.length)
    throw Error("DUPLICATE_CONSULTATION_CALENDAR_DAYS_OFF");
  return {items,dayOffDates,eligibility:eligibility(raw.bookingEligibility)};
}
export async function getMyConsultations(username:string,cursor:string|null=null):
Promise<BookingsPage>{
  if(!id(username)||!(cursor===null||id(cursor)))
    throw Error("INVALID_CONSULTATION_CURSOR");
  const query=new URLSearchParams({limit:"20",...(cursor?{cursor}:{})});
  const raw=await consultationGet("/api/v1/consultations/my?"+query);
  return projectMyBookings(raw.data,username);
}

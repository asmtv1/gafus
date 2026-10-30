import {apiRequest} from "../../shared/api/client";
/** WEB-URL-028 authoritative Hono GET /api/v1/partners/me; no payouts. */
export type PartnerDashboard={
  referralCode:string;referrals:number;earnedKopecks:number;
  reservedKopecks:number;availableKopecks:number;active:boolean;
};
export type PartnerSourceWire={
  fixtureKind:"AG2_PARTNER_READONLY_SYNTHETIC";
  get:()=>Promise<unknown>;
};
const obj=(x:unknown):Record<string,unknown>|null=>
 x!==null&&typeof x==="object"&&!Array.isArray(x)?
 x as Record<string,unknown>:null;
const amount=(n:unknown):n is number=>typeof n==="number"&&
 Number.isSafeInteger(n)&&Math.abs(n)<=1_000_000_000_000;
const qty=(n:unknown):n is number=>amount(n)&&n>=0;
const code=(s:unknown):s is string=>typeof s==="string"&&
 /^[a-zA-Z0-9_-]{1,64}$/.test(s);
export function projectPartnerDashboard(raw:unknown):PartnerDashboard{
 const x=obj(raw);
 if(!x||!code(x.referralCode)||typeof x.active!=="boolean"||
  !qty(x.referrals)||!amount(x.earnedKopecks)||
  !qty(x.reservedKopecks)||!amount(x.availableKopecks)||
  x.availableKopecks!==x.earnedKopecks-x.reservedKopecks)
  throw Error("INVALID_PARTNER_DASHBOARD");
 return {
  referralCode:x.referralCode,referrals:x.referrals as number,
  earnedKopecks:x.earnedKopecks as number,
  reservedKopecks:x.reservedKopecks as number,
  availableKopecks:x.availableKopecks as number,active:x.active,
 };
}
export const formatKopecks=(value:number)=>{
 if(!amount(value))throw Error("INVALID_KOPECKS");
 return new Intl.NumberFormat("ru-RU",{style:"currency",currency:"RUB",
  maximumFractionDigits:2}).format(value/100);
};
export function safePartnerReferralLink(codeValue:string,origin:string){
 if(!code(codeValue)||!/^https?:\/\/([a-z0-9.-]+|localhost)(:\d{2,5})?$/i.test(origin)||
  origin.includes("@")||origin.endsWith("."))
  throw Error("INVALID_PARTNER_LINK");
 return origin+"/register?promoCode="+encodeURIComponent(codeValue);
}
export async function getPartnerDashboard(){
 return projectPartnerDashboard(await apiRequest<unknown>(
  "/api/v1/partners/me",{method:"GET",browserAuth:true,expectedStatus:200}));
}

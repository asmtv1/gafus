import {apiRequest} from "../../shared/api/client";

/** WEB-URL-005: exact Hono server status only. Never derive entitlement from
 * a profile field, client/localStorage flag or subscription OFFER.
 *
 * This adapter is NOT wired into normal Vite; AG1/AG4 must verify Hono
 * subscription-gate parity and rate-limiter isolation before any live GET.
 */
export const ACHIEVEMENTS_ENTITLEMENT_PATH="/api/v1/app-subscription/status" as const;
export type ServerAchievementsEntitlementWire={
 fixtureKind:"AG2_ACHIEVEMENTS_SERVER_ENTITLEMENT_SYNTHETIC_GET_ONLY"|
  "AG2_ACHIEVEMENTS_HONO_STATUS_PRESENTATION_GET_ONLY";
 load:(request:{ownerId:string;method:"GET";path:typeof ACHIEVEMENTS_ENTITLEMENT_PATH})=>Promise<unknown>;
};
const obj=(v:unknown):Record<string,unknown>|null=>
 v!==null&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:null;
/** Projection strips all payment method, plan, user and token metadata. */
export function projectAchievementsEntitlement(raw:unknown):{allowed:boolean}{
 const d=obj(raw);
 if(!d||typeof d.hasActiveSubscription!=="boolean"||
  !(d.status==="ACTIVE"||d.status==="PENDING"||
    d.status==="PAST_DUE"||d.status==="CANCELED"||
    d.status==="EXPIRED"||d.status==="REFUNDED"||
    d.status==="REVOKED"||d.status===null)||
  (d.hasActiveSubscription&&d.status!=="ACTIVE"))
  throw Error("ACHIEVEMENT_ENTITLEMENT_UNKNOWN");
 return {allowed:d.hasActiveSubscription&&d.status==="ACTIVE"};
}
/** Optional registered status projection, NEVER a client access decision. */
export async function readHonoAchievementsEntitlement(){
 const raw=await apiRequest<unknown>(ACHIEVEMENTS_ENTITLEMENT_PATH,{
  method:"GET",browserAuth:true,expectedStatus:200,
 });
 return projectAchievementsEntitlement(raw);
}

/** Explicit opt-in status read: presentation ONLY. It never authorizes or
 * denies the achievement GETs. Feature flag may intentionally disable gating. */
export const achievementsHonoStatus:ServerAchievementsEntitlementWire={
 fixtureKind:"AG2_ACHIEVEMENTS_HONO_STATUS_PRESENTATION_GET_ONLY",
 load:()=>apiRequest<unknown>(ACHIEVEMENTS_ENTITLEMENT_PATH,{
  method:"GET",browserAuth:true,expectedStatus:200,
 }),
};

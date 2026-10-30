import {afterEach,describe,expect,it,vi} from "vitest";
import {ACHIEVEMENTS_ENTITLEMENT_PATH,projectAchievementsEntitlement,
 readHonoAchievementsEntitlement} from "./achievementsEntitlement";
afterEach(()=>vi.unstubAllGlobals());
describe("WEB-URL-005 canonical server-only entitlement, not UI flag",()=>{
 it("E01 exactly Hono status path, never offer/payment writes",()=>{
  expect(ACHIEVEMENTS_ENTITLEMENT_PATH).toBe("/api/v1/app-subscription/status");
 });
 it("E02 active server response whitelists ONLY one boolean",()=>{
  expect(projectAchievementsEntitlement({
   hasActiveSubscription:true,status:"ACTIVE",
   paymentMethodLast4:"1234",privateUserId:"SECRET_USER",providerToken:"PRIVATE",
  })).toEqual({allowed:true});
 });
 it.each(["PENDING","PAST_DUE","CANCELED","EXPIRED","REVOKED","REFUNDED",null])(
  "E03 status %s denied even when subscription inactive",status=>{
   expect(projectAchievementsEntitlement({status,
    hasActiveSubscription:false})).toEqual({allowed:false});
  });
 it("E10 active-code but server says no = denied",()=>{
  expect(projectAchievementsEntitlement({
   status:"ACTIVE",hasActiveSubscription:false})).toEqual({allowed:false});
 });
 it.each([null,{},[], {status:"ACTIVE",hasActiveSubscription:"true"},
  {status:"ACTIVE"}, {hasActiveSubscription:true,status:"PENDING"},
  {hasActiveSubscription:true,status:null},
  {hasActiveSubscription:true,status:"BANNED"},
 ])("E11 unknown/malformed status fails closed",value=>{
  expect(()=>projectAchievementsEntitlement(value)).toThrow();
 });
 it("E18 prospective Hono adapter exact same-origin GET credentials, no POST",async()=>{
  const fetcher=vi.fn(async()=>new Response(JSON.stringify({success:true,data:{
   hasActiveSubscription:true,status:"ACTIVE",paymentMethodLast4:"SECRET_CARD",
  }}),{status:200}));
  vi.stubGlobal("fetch",fetcher);
  expect(await readHonoAchievementsEntitlement()).toEqual({allowed:true});
  expect(fetcher).toHaveBeenCalledExactlyOnceWith(
   "/api/v1/app-subscription/status",
   expect.objectContaining({method:"GET",credentials:"include",cache:"no-store",
    headers:expect.objectContaining({"X-Gafus-Auth-Transport":"cookie"})}));
 });
 it("E19 401 cannot be interpreted as false result or active",async()=>{
  vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({
   success:false,error:"PRIVATE_BACKEND",
  }),{status:401})));
  await expect(readHonoAchievementsEntitlement()).rejects.toMatchObject({status:401});
 });
});

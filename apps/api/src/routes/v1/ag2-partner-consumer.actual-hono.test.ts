/**
 * AG2 WEB-URL-028 synthetic-JWT Hono in-process -> Web strict six-field adapter.
 * Source/mock ONLY: mock Core and Prisma; no cookie/TLS/PG/payment/device.
 * Do not change AG1 ECON060 tests or invoke any payout endpoint.
 */
import {randomBytes} from "node:crypto";
import {beforeAll,beforeEach,describe,expect,it,vi} from "vitest";
import type * as PartnerService from "@gafus/core/services/appSubscription";
import type * as PrismaModule from "@gafus/prisma";
const m=vi.hoisted(()=>({profile:vi.fn(),dashboard:vi.fn(),registration:vi.fn(),findUser:vi.fn(),
 rateCalls:[] as string[]}));
vi.mock("@hono-rate-limiter/redis",()=>({RedisStore:class{
 windowMs=60_000;
 init(o:{windowMs:number}){this.windowMs=o.windowMs;}
 async increment(key:string){m.rateCalls.push(key);return{
  totalHits:1,resetTime:new Date(Date.now()+this.windowMs)};}
 async decrement(){return undefined;} async resetKey(){return undefined;}
}}));
vi.mock("@gafus/prisma",async importOriginal=>{
 const original=await importOriginal<typeof PrismaModule>();
 return {...original,prisma:{...original.prisma,user:{...original.prisma.user,
  findUnique:m.findUser}}};
});
vi.mock("@gafus/core/services/auth",async importOriginal=>({
 ...await importOriginal<object>(),isRegistrationCompleted:m.registration,
}));
vi.mock("@gafus/core/services/appSubscription",async importOriginal=>({
 ...await importOriginal<typeof PartnerService>(),
 getPartnerProfile:m.profile,getPartnerDashboard:m.dashboard,
}));
import {app} from "../../app";
import {generateAccessToken} from "@gafus/auth/jwt";
import {PartnerProgramError} from "@gafus/core/services/appSubscription";
import {projectPartnerDashboard} from "../../../../web-vite/src/features/partner/partnerReadApi";
const URL="/api/v1/partners/me";
const PII="SECRET_BANK_ACCOUNT_EMAIL_TOKEN";
const jwt:Record<string,string>={};
beforeAll(async()=>{
 process.env.JWT_SECRET=randomBytes(48).toString("hex");
 for(const name of ["A","B","USER"]){
  jwt[name]=await generateAccessToken({id:"ACTOR_"+name,
   role:name==="USER"?"USER":"PARTNER",username:name.toLowerCase()});
 }
});
beforeEach(()=>{
 vi.clearAllMocks();m.rateCalls.length=0;
 m.registration.mockResolvedValue(true);
 m.findUser.mockImplementation(async ({where}:{where:{id:string}}) => {
    const who=where.id.replace("ACTOR_","");
    const role=who==="USER"?"USER":["A","B"].includes(who)?"PARTNER":null;
    return role ? {sessionsRevokedAt:null,registrationPending:false,role} : null;
  });
 m.profile.mockImplementation(async(id:string)=>({isActive:id!=="ACTOR_B",
  bankAccount:PII,fullBankDetails:{holder:PII}}));
 m.dashboard.mockImplementation(async(id:string)=>({
  referralCode:"REF_"+id,referrals:id==="ACTOR_A"?4:0,
  earnedKopecks:id==="ACTOR_A"?1000:0,
  reservedKopecks:id==="ACTOR_A"?300:0,
  availableKopecks:id==="ACTOR_A"?700:0,
  buyerEmail:PII,internalNotes:PII,
 }));
});
const request=(name:string)=>app.request(URL,{method:"GET",
 headers:name?{authorization:"Bearer "+(jwt[name]??name)}:{}});
const privateResponse=(r:Response)=>{
 expect(r.headers.get("cache-control")).toBe("private, no-store");
 expect(r.headers.get("referrer-policy")).toBe("no-referrer");
};
describe("AG2 Partner strict adapter against actual app Hono GET",()=>{
 it("A -> B -> A: exact six-key projection from owner JWT, no PII, zero POST",async()=>{
  for(const [name,code,balance,active] of [
   ["A","REF_ACTOR_A",700,true],["B","REF_ACTOR_B",0,false],
   ["A","REF_ACTOR_A",700,true],
  ] as const){
   const r=await request(name);
   expect(r.status).toBe(200);privateResponse(r);
   const envelope=await r.json();
   expect(envelope.success).toBe(true);
   const dashboard=projectPartnerDashboard(envelope.data);
   expect(Object.keys(dashboard).sort()).toEqual([
    "referralCode","referrals","earnedKopecks","reservedKopecks",
    "availableKopecks","active"].sort());
   expect(dashboard.referralCode).toBe(code);
   expect(dashboard.availableKopecks).toBe(balance);
   expect(dashboard.active).toBe(active);
   expect(JSON.stringify(envelope)+JSON.stringify(dashboard)).not.toContain(PII);
  }
  expect(m.profile.mock.calls).toEqual([["ACTOR_A"],["ACTOR_B"],["ACTOR_A"]]);
  expect(m.dashboard.mock.calls).toEqual([["ACTOR_A"],["ACTOR_B"],["ACTOR_A"]]);
 });
 it("guest invalid JWT 401 before Core; no cross-user access",async()=>{
  for(const name of ["","bad.jwt.value"]){
   const r=await request(name);privateResponse(r);expect(r.status).toBe(401);
  }
  expect(m.dashboard).not.toHaveBeenCalled();
  expect(m.profile).not.toHaveBeenCalled();
 });
 it("non-partner 403 and missing promo 400 never become a fake dashboard",async()=>{
  m.profile.mockRejectedValueOnce(new PartnerProgramError("PARTNER_REQUIRED"));
  const forbidden=await request("USER");privateResponse(forbidden);
  expect(forbidden.status).toBe(403);
  expect((await forbidden.json()).success).toBe(false);
  expect(m.dashboard).not.toHaveBeenCalled();
  m.dashboard.mockRejectedValueOnce(new PartnerProgramError("PARTNER_PROMO_REQUIRED"));
  const noPromo=await request("A");privateResponse(noPromo);
  expect(noPromo.status).toBe(400);
  expect((await noPromo.json()).success).toBe(false);
 });
 it("unexpected Core exception masked 500, never exposed to strict adapter",async()=>{
  m.dashboard.mockRejectedValueOnce(Error(PII));
  const r=await request("A");privateResponse(r);
  expect(r.status).toBe(500);
  const envelope=await r.json();
  expect(envelope).toEqual({success:false,code:"PARTNER_ERROR",error:"Внутренняя ошибка"});
  expect(JSON.stringify(envelope)).not.toContain(PII);
  expect(()=>projectPartnerDashboard(envelope.data)).toThrow("INVALID_PARTNER_DASHBOARD");
 });
 it("malformed Core balance across actual Hono -> Web adapter rejects",async()=>{
  m.dashboard.mockResolvedValueOnce({referralCode:"BAD_PROMO",referrals:2,
   earnedKopecks:100,reservedKopecks:99,availableKopecks:88});
  const r=await request("A");privateResponse(r);
  expect(r.status).toBe(200);
  const envelope=await r.json();
  expect(()=>projectPartnerDashboard(envelope.data)).toThrow("INVALID_PARTNER_DASHBOARD");
 });
});

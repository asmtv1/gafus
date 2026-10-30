import {afterEach,describe,expect,it,vi} from "vitest";
import {projectPartnerDashboard,formatKopecks,safePartnerReferralLink,
 getPartnerDashboard} from "./partnerReadApi";
const dto=(extra:Record<string,unknown>={})=>({
 referralCode:"PARTNER_2026",referrals:3,earnedKopecks:152500,
 reservedKopecks:50000,availableKopecks:102500,active:true,
 userId:"PRIVATE_USER",bankAccount:"SECRET_BANK",...extra,
});
afterEach(()=>vi.unstubAllGlobals());
describe("WEB-URL-028 existing Hono /partners/me GET",()=>{
 it("P01 exact DTO and private-field whitelist",()=>{
  const p=projectPartnerDashboard(dto());
  expect(p).toEqual({
   referralCode:"PARTNER_2026",referrals:3,earnedKopecks:152500,
   reservedKopecks:50000,availableKopecks:102500,active:true,
  });
  expect(JSON.stringify(p)).not.toMatch(/PRIVATE_|SECRET_/);
 });
 it("P02 active=false allowed, referral count zero allowed",()=>{
  expect(projectPartnerDashboard(dto({active:false,referrals:0})).active).toBe(false);
 });
 it.each([
  ["no referral",dto({referralCode:""})],
  ["path referral",dto({referralCode:"../secret"})],
  ["negative referrals",dto({referrals:-1})],
  ["float earned",dto({earnedKopecks:23.5})],
  ["no active",dto({active:"yes"})],
  ["negative reserved",dto({reservedKopecks:-1})],
  ["inconsistent available",dto({availableKopecks:0})],
  ["overflow",dto({referrals:Number.MAX_SAFE_INTEGER})],
  ["null",null],
 ])("P03 bad DTO %s fail-closed",(_name,data)=>{
  expect(()=>projectPartnerDashboard(data)).toThrow();
 });
 it("P12 rubles formatting from integer kopecks, not float money input",()=>{
  expect(formatKopecks(102500)).toMatch(/1\s*025,00|1\s*025/);
  expect(formatKopecks(-200)).toContain("2");
  expect(()=>formatKopecks(1.1)).toThrow();
 });
 it("P13 same-origin safe referral link; no external URL input",()=>{
  expect(safePartnerReferralLink("PARTNER_2026","http://127.0.0.1:5216"))
   .toBe("http://127.0.0.1:5216/register?promoCode=PARTNER_2026");
  expect(()=>safePartnerReferralLink("../a","http://127.0.0.1:5216")).toThrow();
  expect(()=>safePartnerReferralLink("SAFE","https://attacker@domain.ru")).toThrow();
  expect(()=>safePartnerReferralLink("SAFE","javascript:alert(1)")).toThrow();
 });
 it("P14 getPartnerDashboard sends precise read-only Hono GET",async()=>{
  const fetcher=vi.fn(async(_url:string,_opts:RequestInit)=>
   new Response(JSON.stringify({success:true,data:dto()}),{status:200}));
  vi.stubGlobal("fetch",fetcher);
  const p=await getPartnerDashboard();
  expect(p.availableKopecks).toBe(102500);
  expect(fetcher.mock.calls[0][0]).toBe("/api/v1/partners/me");
  expect(fetcher.mock.calls[0][1]).toMatchObject({
   method:"GET",credentials:"include",cache:"no-store",
  });
  expect((fetcher.mock.calls[0][1].headers as Record<string,string>)["X-Gafus-Auth-Transport"]).toBe("cookie");
 });
 it.each([401,403,404,409,500])("P15 Hono %d not fake wallet",async status=>{
  vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({
   success:false,error:"PRIVATE_INFO",
  }),{status})));
  await expect(getPartnerDashboard()).rejects.toMatchObject({status});
 });
});

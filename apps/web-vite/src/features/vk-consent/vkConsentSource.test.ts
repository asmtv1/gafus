import {describe,it,expect,vi,afterEach} from "vitest";
import {buildVkConsentAttempt,validateVkConsentContext,
  projectVkConsentSummary,projectVkConsentCompletion,
  isDefiniteVkConsentDenial,getVkConsentSummary} from "./vkConsentSource";
const token="syntheticcontexttoken_xxxxxxxxxxxxxxxxxxxxxxx";
const state="syntheticstatevalue_yyyyyyyyyyyyyyyyyyyyyy";
const legal={acceptPersonalData:true,acceptPrivacyPolicy:true,
 acceptDataDistribution:true};
const ack={user:{id:"PRIVATE_USER",username:"student",role:"USER"},
 accessToken:"PRIVATE_ACCESS_BEARER",refreshToken:"SECRET_REFRESH_JWT",needsPhone:false};
afterEach(()=>vi.unstubAllGlobals());
describe("WEB-URL-004 Hono VK GET and synthetic-only consent POST",()=>{
 it("S01 context and state strict, invalid forbidden",()=>{
  expect(validateVkConsentContext(token,state)).toEqual({contextToken:token,state});
  for(const [a,b] of [["../bad",state],[token,"short"],
    [token,"S".repeat(300)],["https://bad",state]])
    expect(()=>validateVkConsentContext(a,b)).toThrow();
 });
 it("S02 public context projection only",()=>{
  const x=projectVkConsentSummary({savedPromoCode:"PROMO123",completed:false,
   accessToken:"PRIVATE"});
  expect(x).toEqual({savedPromoCode:"PROMO123",completed:false});
  expect(projectVkConsentSummary({savedPromoCode:null,completed:true}))
   .toEqual({savedPromoCode:null,completed:true});
  expect(JSON.stringify(x)).not.toContain("PRIVATE");
 });
 it.each([null,[],{savedPromoCode:null,completed:"yes"},
  {savedPromoCode:"bad promo",completed:false},{savedPromoCode:34,completed:false}])(
   "S03 invalid context status rejects",raw=>
    expect(()=>projectVkConsentSummary(raw)).toThrow());
 it("S08 exact consent payload without token persistence",()=>{
  expect(buildVkConsentAttempt(token,state,legal," PROMO1 ")).toEqual({
   contextToken:token,state,consentPayload:legal,promoCode:"PROMO1"});
  expect(buildVkConsentAttempt(token,state,legal,""))
   .not.toHaveProperty("promoCode");
 });
 it.each(["acceptPersonalData","acceptPrivacyPolicy","acceptDataDistribution"] as const)(
  "S09 unchecked %s never valid",key=>
   expect(()=>buildVkConsentAttempt(token,state,{...legal,[key]:false},""))
    .toThrow());
 it.each(["../x","x".repeat(70),"bad promo","КОД"])(
  "S12 forbidden promo %s",promo=>
   expect(()=>buildVkConsentAttempt(token,state,legal,promo)).toThrow());
 it("S16 mobile credential ACK stripped, never DOM/cache fields",()=>{
  expect(projectVkConsentCompletion(ack)).toEqual({accepted:true});
  expect(JSON.stringify(projectVkConsentCompletion(ack)))
   .not.toMatch(/PRIVATE|SECRET|accessToken|refreshToken/);
 });
 it.each([null,{}, {...ack,refreshToken:""}, {...ack,needsPhone:"false"}])(
  "S17 malformed POST ACK unknown",raw=>
   expect(()=>projectVkConsentCompletion(raw)).toThrow());
 it("S21 400/403 definite; 500/timeout/ambiguous unknown",()=>{
  expect(isDefiniteVkConsentDenial({status:400,code:"CONTEXT_EXPIRED"})).toBe(true);
  expect(isDefiniteVkConsentDenial({status:403})).toBe(true);
  expect(isDefiniteVkConsentDenial({status:500})).toBe(false);
  expect(isDefiniteVkConsentDenial(new Error("timeout"))).toBe(false);
  expect(isDefiniteVkConsentDenial({status:400,code:"STATUS_MISMATCH"})).toBe(false);
 });
 it("S22 GET exact Hono path; only GET, cookie include",async()=>{
  const fetcher=vi.fn(async(_url:string,_init:RequestInit)=>
   new Response(JSON.stringify({success:true,data:{
    savedPromoCode:"PROMO",completed:false,secret:"PRIVATE",
   }}),{status:200}));
  vi.stubGlobal("fetch",fetcher);
  expect(await getVkConsentSummary(token,state)).toEqual({
   savedPromoCode:"PROMO",completed:false});
  expect(fetcher.mock.calls[0][0]).toBe(
   "/api/v1/auth/vk-consent/"+token+"?state="+state);
  expect(fetcher.mock.calls[0][1].method).toBe("GET");
  expect(fetcher.mock.calls[0][1].credentials).toBe("include");
 });
 it("S23 bad state before GET no network",async()=>{
  const f=vi.fn();vi.stubGlobal("fetch",f);
  await expect(getVkConsentSummary(token,"bad")).rejects.toThrow();
  expect(f).not.toHaveBeenCalled();
 });
 it.each([400,403,404,500])("S24 Hono status %d propagated",async status=>{
  vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({
   success:false,error:"PRIVATE",
  }),{status})));
  await expect(getVkConsentSummary(token,state)).rejects.toMatchObject({status});
 });
});

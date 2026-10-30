import {afterEach,describe,it,expect,vi} from "vitest";
import {projectMiniGuides,projectGuideRead,getGuideCatalog,
  getAuthorizedGuide} from "./guidesReadApi";
const guide=(overrides:Record<string,unknown>={})=>({
  courseId:"guide1",title:"Поведение собаки",description:"Учимся спокойно",
  imageUrl:"https://signed.invalid/a?token=SECRET_S3",
  unlocked:true,accessSource:"SUBSCRIPTION",expiresAt:null,
  canPurchase:false,price:1,secret:"PRIVATE_DATA",...overrides,
});
const response=(data:unknown,status=200)=>new Response(JSON.stringify({
  success:status===200,data,error:"PRIVATE_TRACE",
}),{status});
afterEach(()=>vi.unstubAllGlobals());
describe("WEB-URL-026 read-only mini guide Hono DTO",()=>{
 it("A01 whitelist guide metadata, omit signed image, secret and private fields",()=>{
   const list=projectMiniGuides([guide()]);
   expect(list).toEqual([{courseId:"guide1",title:"Поведение собаки",
     description:"Учимся спокойно",unlocked:true,accessSource:"SUBSCRIPTION",
     expiresAt:null,canPurchase:false,price:1}]);
   expect(JSON.stringify(list)).not.toMatch(/SECRET_|PRIVATE_|imageUrl/);
 });
 it("A02 empty list supported",()=>expect(projectMiniGuides([])).toEqual([]));
 it.each([
   ["id",guide({courseId:"../bad"})],["name",guide({title:""})],
   ["price",guide({price:-1})],["fraction",guide({price:0.4})],
   ["locked flag",guide({unlocked:"yes"})],
   ["expiry",guide({expiresAt:"bad"})],["source",guide({accessSource:null})],
 ])("A03 invalid %s rejected",(_label,g)=>{
   expect(()=>projectMiniGuides([g])).toThrow();
 });
 it("A10 duplicate guide rejected",()=>expect(()=>
   projectMiniGuides([guide(),guide()])).toThrow());
 it("A11 guide content strips HTML and never evaluates markup",()=>{
   const r=projectGuideRead({courseId:"guide1",guideContent:
     '<h1>Полезно</h1><script>alert("PRIVATE_EXEC")</script><p>Тренируемся &amp; играем</p>'},
   "guide1");
   expect(r.text).toContain("Полезно");
   expect(r.text).toContain("Тренируемся & играем");
   expect(r.text).not.toContain("PRIVATE_EXEC");
   expect(r.text).not.toContain("<h1>");
 });
 it("A12 mismatch, long content, malformed guide fail closed",()=>{
   expect(()=>projectGuideRead({courseId:"other",guideContent:"ok"},"guide1")).toThrow();
   expect(()=>projectGuideRead({courseId:"guide1",guideContent:"A".repeat(200001)},
     "guide1")).toThrow();
   expect(()=>projectGuideRead({courseId:"guide1",guideContent:null},
     "guide1")).toThrow();
 });
 it("A13 exact existing Hono GET paths and cookie transport, no unlock",async()=>{
   const fetcher=vi.fn(async(path:string,_init:RequestInit)=>response(
     path.endsWith("mini-guides")?[guide()]:
       {courseId:"guide1",guideContent:"<p>Статья</p>"}));
   vi.stubGlobal("fetch",fetcher);
   expect(await getGuideCatalog()).toHaveLength(1);
   expect((await getAuthorizedGuide("guide1")).text).toEqual("Статья");
   expect(fetcher.mock.calls.map(([url])=>url)).toEqual([
     "/api/v1/gafus/mini-guides","/api/v1/gafus/mini-guide/guide1"]);
   expect(fetcher.mock.calls.every(([,options])=>
     options?.method==="GET"&&options?.credentials==="include"&&
     (options?.headers as Record<string,string>)?.["X-Gafus-Auth-Transport"]==="cookie"))
     .toBe(true);
 });
 it("A14 path injection rejected before fetch",async()=>{
   const f=vi.fn();vi.stubGlobal("fetch",f);
   await expect(getAuthorizedGuide("../path")).rejects.toThrow();
   expect(f).not.toHaveBeenCalled();
 });
 it.each([401,402,403,404,500])("A15 Hono status %d propagates, no fake access",async status=>{
   vi.stubGlobal("fetch",vi.fn(async()=>response(null,status)));
   await expect(getAuthorizedGuide("guide1")).rejects.toMatchObject({status});
 });
});

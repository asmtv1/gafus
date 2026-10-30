import {describe,it,expect} from "vitest";
import {EXCUSES_NEXT_ONLY_PATH,EXCUSE_OPTIONS,validSituation,
 buildExcuseRequest,projectExcuseResult} from "./excuseSourceMock";
const result=(overrides:Record<string,unknown>={})=>({
 success:true,data:{
  excuse:"Извините за задержку, в следующий раз предупрежу заранее.",
  plausibility:75,tone:"деловой",session:"PRIVATE_SESSION",...overrides,
 },metadata:"SECRET_UPSTREAM",
});
describe("WEB-URL-051 actual Next POST /api/excuses source/mock contract",()=>{
 it("E01 legacy endpoint exact, not invented Hono v1",()=>{
  expect(EXCUSES_NEXT_ONLY_PATH).toBe("/api/excuses");
 });
 it("E02 exact five source situations",()=>{
  expect(EXCUSE_OPTIONS.map(x=>x.id)).toEqual([
   "late-work","homework","birthday","missed-meeting","ignored-message"]);
 });
 it.each(["late-work","homework","birthday","missed-meeting","ignored-message"])(
  "E03 %s accepted",id=>expect(validSituation(id)).toBe(true));
 it.each(["../bad","boss","",null,"late work",{},6])(
  "E08 invalid situation %s fails closed",id=>expect(validSituation(id)).toBe(false));
 it("E15 request exactly POST to public Next endpoint, with abort signal",()=>{
  const signal=new AbortController().signal;
  expect(buildExcuseRequest("birthday",signal)).toEqual({
   method:"POST",path:"/api/excuses",json:{situationId:"birthday"},signal});
 });
 it("E16 unknown situation cannot produce POST",()=>{
  expect(()=>buildExcuseRequest("foo",new AbortController().signal)).toThrow();
 });
 it("E17 response projects only text/rating/tone and strips secret",()=>{
  const dto=projectExcuseResult(result());
  expect(dto).toEqual({excuse:"Извините за задержку, в следующий раз предупрежу заранее.",
   plausibility:75,tone:"деловой"});
  expect(JSON.stringify(dto)).not.toMatch(/PRIVATE_|SECRET_|metadata/);
 });
 it.each([null,[],{}, {success:false,data:result().data},
  {success:true,data:{...result().data,plausibility:34}},
  {success:true,data:{...result().data,plausibility:97}},
  {success:true,data:{...result().data,plausibility:75.1}},
  {success:true,data:{...result().data,excuse:"no"}},
  {success:true,data:{...result().data,tone:""}},
 ])("E18 invalid payload rejected",v=>expect(()=>projectExcuseResult(v)).toThrow());
});

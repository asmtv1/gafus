import {describe,it,expect,vi,afterEach} from "vitest";
import {projectHonoVetDetail,projectHonoVetList,vetReadPath,
 vetReadFailure,vetMutation400FieldErrors,
 VET_HONO_LIST,VET_HONO_DETAIL,sourceOnlyHonoVetListRead,
 sourceOnlyHonoVetDetailRead} from "./vetVisitsHonoReadConsumer";
const one={id:"visit1",petId:"pet1",visitedOn:"2026-10-01",
 specialty:"терапевт",doctorName:"врач",clinic:"клиника",
 diagnosis:"PRIVATE_DIAGNOSIS",conclusion:"текст",notes:"PRIVATE_MED",
 attachments:[],originalKey:"SECRET_S3",signedUrl:"SECRET_CDN"};
afterEach(()=>vi.unstubAllGlobals());
describe("AG1 list/detail & mutation structured400 read-only typed consumer",()=>{
 it("V01 exactly existing GET routes, no invented cursor",()=>{
  expect(VET_HONO_LIST).toBe("/api/v1/pets/:petId/vet-visits");
  expect(VET_HONO_DETAIL).toBe("/api/v1/pets/:petId/vet-visits/:visitId");
  expect(vetReadPath("pet1")).toBe("/api/v1/pets/pet1/vet-visits");
  expect(vetReadPath("pet1","visit1")).toBe("/api/v1/pets/pet1/vet-visits/visit1");
  expect(()=>vetReadPath("../secret")).toThrow();
  expect(()=>vetReadPath("pet1","../secret")).toThrow();
 });
 it("V06 exact source-only GET list: Web cookie, no-store, no POST",async()=>{
  const fetcher=vi.fn(async(path:string,opts:RequestInit)=>{
   expect(path).toBe("/api/v1/pets/pet1/vet-visits");
   expect(opts.method).toBe("GET");
   expect(opts.credentials).toBe("include");
   expect(opts.cache).toBe("no-store");
   expect((opts.headers as Record<string,string>)["X-Gafus-Auth-Transport"])
    .toBe("cookie");
   expect((opts.headers as Record<string,string>).Authorization).toBeUndefined();
   return new Response(JSON.stringify({success:true,data:[one]}),{status:200});
  });
  vi.stubGlobal("fetch",fetcher);
  expect((await sourceOnlyHonoVetListRead("pet1")).map(v=>v.id))
   .toEqual(["visit1"]);
  expect(fetcher).toHaveBeenCalledTimes(1);
 });
 it("V07 exact source-only GET detail; sanitized 404 not empty200",async()=>{
  const fetcher=vi.fn(async(path:string,opts:RequestInit)=>{
   expect(path).toBe("/api/v1/pets/pet1/vet-visits/visit1");
   expect(opts.method).toBe("GET");
   return new Response(JSON.stringify({
    success:false,code:"VET_VISIT_NOT_FOUND",
    error:"SECRET_CLINICAL",
   }),{status:404});
  });
  vi.stubGlobal("fetch",fetcher);
  await expect(sourceOnlyHonoVetDetailRead("pet1","visit1"))
   .rejects.toMatchObject({status:404,code:"VET_VISIT_NOT_FOUND"});
  expect(fetcher).toHaveBeenCalledTimes(1);
 });
 it("V02 list 200[] distinct from foreign visit; detail whitelist",()=>{
  expect(projectHonoVetList([],"pet1")).toEqual([]);
  const d=projectHonoVetDetail(one,"pet1","visit1");
  expect(d.diagnosis).toBe("PRIVATE_DIAGNOSIS");
  expect(JSON.stringify(d)).not.toMatch(/SECRET_|originalKey|signedUrl/);
  expect(()=>projectHonoVetDetail(one,"pet1","foreign")).toThrow();
  expect(()=>projectHonoVetDetail({...one,petId:"other"},"pet1","visit1")).toThrow();
 });
 it("V03 404/401/403/503 sanitized codes separate empty status",()=>{
  expect(vetReadFailure({status:404,message:"SECRET_MEDICAL"})).toBe("NOT_FOUND");
  expect(vetReadFailure({status:401})).toBe("UNAUTHORIZED");
  expect(vetReadFailure({status:403})).toBe("UNAUTHORIZED");
  expect(vetReadFailure({status:503})).toBe("ERROR");
 });
 it("V04 AG1 malformed JSON structured400 typed fieldErrors without raw PII",()=>{
  expect(vetMutation400FieldErrors({success:false,
   code:"VET_VISIT_INVALID_JSON",error:"PRIVATE_RAW_JSON",
   fieldErrors:{body:"INVALID_JSON",doctorName:"SECRET_HOSPITAL"}}))
   .toEqual({code:"VET_VISIT_INVALID_JSON",fieldErrors:{body:"INVALID_JSON"}});
 });
 it("V05 AG1 Zod fieldErrors stable codes only, no mutation request",()=>{
  const parsed=vetMutation400FieldErrors({success:false,
   code:"VET_VISIT_VALIDATION_ERROR",error:"PRIVATE_DIAGNOSIS",
   fieldErrors:{visitedOn:"INVALID_VALUE",doctorName:"REQUIRED",
    notes:"OUT_OF_RANGE",clinic:"INVALID_TYPE",
    "attachments.0.originalKey":"PRIVATE_KEY"}});
  expect(parsed).toEqual({code:"VET_VISIT_VALIDATION_ERROR",
   fieldErrors:{visitedOn:"INVALID_VALUE",doctorName:"REQUIRED",
    notes:"OUT_OF_RANGE",clinic:"INVALID_TYPE"}});
  expect(JSON.stringify(parsed)).not.toMatch(/PRIVATE_|originalKey/);
  expect(vetMutation400FieldErrors({success:true,code:"VET_VISIT_VALIDATION_ERROR"}))
   .toBeNull();
 });
});

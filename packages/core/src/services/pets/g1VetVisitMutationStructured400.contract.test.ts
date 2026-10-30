/** AG1 VetVisits create/update/delete boundary: stable 400 errors with no user medical values. */
import { z } from "zod/v3";
import { beforeEach, describe, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({save:vi.fn(),remove:vi.fn(),list:vi.fn(),detail:vi.fn()}));
vi.mock("./petVetVisitService",()=>({
  VetVisitError:class VetVisitError extends Error {
    constructor(message:string,public readonly status=400){super(message);}
  },
  savePetVetVisit:m.save,deletePetVetVisit:m.remove,listPetVetVisits:m.list,
  getPetVetMedia:vi.fn(),addPetVetAttachment:vi.fn(),deletePetVetAttachment:vi.fn(),
}));
vi.mock("./g1VetVisitDetailRead.review",()=>({
  VetVisitDetailNotFoundError:class VetVisitDetailNotFoundError extends Error{},
  getOwnVetVisitDetail:m.detail,
}));
import { handlePetVetVisitRequest } from "./petVetVisitHttp";
const base="http://local.test/api/v1/pets/pet-A/vet-visits";
const call=(verb:string,body:string|null,path="",owner="owner-A")=>
  handlePetVetVisitRequest(new Request(base+path,{
    method:verb,headers:{"content-type":"application/json"},
    ...(body===null?{}:{body}),
  }),"pet-A",owner,path?[path.slice(1)]:[]);
beforeEach(()=>{vi.clearAllMocks();m.save.mockResolvedValue({id:"visit-A"});});
describe("VetVisits mutation structured errors RED/GREEN, no SQL or providers",()=>{
  it.each(["POST","PUT"])("V01 %s malformed JSON returns explicit stable code, no write",async verb=>{
    const res=await call(verb,'{"diagnosis":"PRIVATE_SECRET"',verb==="PUT"?"/visit-A":"");
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({success:false,code:"VET_VISIT_INVALID_JSON",fieldErrors:{body:"INVALID_JSON"}});
    expect(m.save).not.toHaveBeenCalled();
    expect(res.headers.get("cache-control")).toContain("no-store");
  });
  it.each(["POST","PUT"])("V02 %s schema errors typed field map, no submitted clinical content",async verb=>{
    m.save.mockImplementationOnce(async()=>{
      z.object({visitedOn:z.string(),specialty:z.string().min(1),diagnosis:z.string().max(4)})
        .parse({visitedOn:null,specialty:"",diagnosis:"SYNTHETIC_PRIVATE_DIAGNOSIS"});
    });
    const res=await call(verb,'{"visitedOn":null,"specialty":""}',verb==="PUT"?"/visit-A":"");
    expect(res.status).toBe(400);
    const result=await res.json();
    expect(result).toMatchObject({success:false,code:"VET_VISIT_VALIDATION_ERROR",fieldErrors:{
      visitedOn:"INVALID_TYPE",specialty:"REQUIRED",diagnosis:"OUT_OF_RANGE",
    }});
    expect(JSON.stringify(result)).not.toContain("SYNTHETIC_PRIVATE_DIAGNOSIS");
    expect(Object.values(result.fieldErrors).every(x=>typeof x==="string")).toBe(true);
  });
  it("V03 owner foreign update is masked as 404, no visit or owner oracle",async()=>{
    const { VetVisitError }=await import("./petVetVisitService");
    m.save.mockRejectedValueOnce(new VetVisitError("SYNTHETIC_PRIVATE_PET_ID",404));
    const res=await call("PUT","{}","/visit-A","owner-B");
    expect(res.status).toBe(404);
    const raw=await res.text();
    expect(JSON.parse(raw)).toMatchObject({success:false,code:"VET_VISIT_NOT_FOUND"});
    expect(raw).not.toContain("SYNTHETIC_PRIVATE_PET_ID");
    expect(m.save).toHaveBeenCalledWith("pet-A","owner-B",{},"visit-A");
  });
  it("V04 owner foreign delete is masked as 404, no deletion permitted",async()=>{
    const { VetVisitError }=await import("./petVetVisitService");
    m.remove.mockRejectedValueOnce(new VetVisitError("SYNTHETIC_PRIVATE_VISIT_ID",404));
    const res=await call("DELETE",null,"/visit-A","owner-B");
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({success:false,code:"VET_VISIT_NOT_FOUND"});
    expect(m.remove).toHaveBeenCalledWith("pet-A","owner-B","visit-A");
  });
  it("V05 legacy static validation messages preserved on 400",async()=>{
    const { VetVisitError }=await import("./petVetVisitService");
    m.save.mockRejectedValueOnce(new VetVisitError("Укажите специальность врача",400));
    const res=await call("POST","{}");
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      success:false,code:"VET_VISIT_VALIDATION_ERROR",
      error:"Укажите специальность врача",fieldErrors:{body:"INVALID_VALUE"},
    });
  });
  it("V06 valid legacy create/update keep original DTO and 201/200",async()=>{
    const body=JSON.stringify({visitedOn:"2026-10-01",specialty:"test"});
    const a=await call("POST",body);const b=await call("PUT",body,"/visit-A");
    expect(a.status).toBe(201);expect(b.status).toBe(200);
    expect((await a.json()).data.id).toBe("visit-A");
    expect((await b.json()).data.id).toBe("visit-A");
  });
});

/** Actual AG1 shared Core/Hono wildcard with signed JWT; synthetic storage only. */
import { randomBytes } from "node:crypto";
import { Hono } from "hono";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({list:vi.fn(),detail:vi.fn(),save:vi.fn(),media:vi.fn()}));
vi.mock("@gafus/prisma",()=>({prisma:{user:{findUnique:async()=>({
  sessionsRevokedAt:null,registrationPending:false, role: "USER",
})}}}));
vi.mock("@gafus/core/services/auth",()=>({isRegistrationCompleted:async()=>true}));
vi.mock("../../../../../packages/core/src/services/pets/petVetVisitService.ts",()=>({
  VetVisitError: class VetVisitError extends Error {
    constructor(message: string, public status = 400) { super(message); }
  },
  listPetVetVisits:m.list,savePetVetVisit:m.save,getPetVetMedia:m.media,
  addPetVetAttachment:vi.fn(),deletePetVetAttachment:vi.fn(),deletePetVetVisit:vi.fn(),
}));
vi.mock("../../../../../packages/core/src/services/pets/g1VetVisitDetailRead.review.ts",()=>({
  VetVisitDetailNotFoundError: class VetVisitDetailNotFoundError extends Error {
    readonly status = 404;
  },
  getOwnVetVisitDetail:m.detail,
}));
vi.mock("@gafus/core/services/pets",async()=>{
  const real=await import("../../../../../packages/core/src/services/pets/petVetVisitHttp.js");
  return {handlePetVetVisitRequest:real.handlePetVetVisitRequest};
});
import { generateAccessToken } from "@gafus/auth/jwt";
import { authMiddleware } from "../../middleware/auth";
import { petVetVisitRoutes } from "./pet-vet-visits";
const app=new Hono();
app.use("/api/v1/pets/*",authMiddleware);
app.route("/api/v1/pets",petVetVisitRoutes);
const root="http://local.test/api/v1/pets/pet-A/vet-visits";
let a="",b="";
beforeAll(async()=>{
  process.env.JWT_SECRET=randomBytes(48).toString("hex");
  a=await generateAccessToken({id:"owner-A",username:"ownerA",role:"USER"});
  b=await generateAccessToken({id:"owner-B",username:"ownerB",role:"USER"});
});
beforeEach(()=>{
  vi.clearAllMocks();m.list.mockResolvedValue([{id:"visit-A",petId:"pet-A",attachments:[]}]);
  m.detail.mockImplementation(async(owner:string)=>{
    if(owner==="owner-A")return {id:"visit-A",petId:"pet-A",attachments:[]};
    const {VetVisitDetailNotFoundError}=await import("../../../../../packages/core/src/services/pets/g1VetVisitDetailRead.review.js");
    throw new VetVisitDetailNotFoundError();
  });
});
const get=(suffix:string,token=a,cookie=false)=>app.request(root+suffix,{
  headers:cookie?{cookie:`gafus_access=${token}`}:{authorization:`Bearer ${token}`},
});
describe("Actual AG1 shared Vet Core dispatcher reached via mounted Hono JWT routes",()=>{
  it("M01 list owner A 200, metadata only, no-store",async()=>{
    const r=await get("");expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toContain("no-store");
    expect((await r.json()).data).toEqual([{id:"visit-A",petId:"pet-A",attachments:[]}]);
    expect(m.list).toHaveBeenCalledWith("pet-A","owner-A");
  });
  it("M02 empty owned history 200 []",async()=>{
    m.list.mockResolvedValueOnce([]);
    const r=await get("");expect(r.status).toBe(200);
    expect((await r.json()).data).toEqual([]);
  });
  it("M03 foreign list 404 with uniform code, no medical payload",async()=>{
    const {VetVisitError}=await import("../../../../../packages/core/src/services/pets/petVetVisitService.js");
    m.list.mockRejectedValueOnce(new VetVisitError("SYNTHETIC_CLINIC_PRIVATE",404));
    const r=await get("",b);
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({success:false,code:"VET_VISIT_NOT_FOUND"});
    expect(m.list).toHaveBeenCalledWith("pet-A","owner-B");
  });
  it("M04 detail A 200, actual Core dispatcher verifies owner forwarded",async()=>{
    const r=await get("/visit-A");expect(r.status).toBe(200);
    expect((await r.json()).data).toEqual({id:"visit-A",petId:"pet-A",attachments:[]});
    expect(m.detail).toHaveBeenCalledWith("owner-A","pet-A","visit-A");
    expect(m.media).not.toHaveBeenCalled();
  });
  it("M05 detail B 404, no cross owner leakage",async()=>{
    const r=await get("/visit-A",b);
    expect(r.status).toBe(404);expect(await r.json()).toEqual({success:false,code:"VET_VISIT_NOT_FOUND"});
    expect(m.detail).toHaveBeenCalledWith("owner-B","pet-A","visit-A");
  });
  it("M06 forged owner query on list ignored; on detail forbidden",async()=>{
    expect((await get("?ownerId=owner-B")).status).toBe(200);
    expect(m.list).toHaveBeenCalledWith("pet-A","owner-A");
    const r=await get("/visit-A?ownerId=owner-B");
    expect(r.status).toBe(404);expect(m.detail).not.toHaveBeenCalled();
  });
  it("M07 invalid detail id forwarded to Core validation; safe not-found response",async()=>{
    const {VetVisitDetailNotFoundError}=await import("../../../../../packages/core/src/services/pets/g1VetVisitDetailRead.review.js");
    m.detail.mockRejectedValueOnce(new VetVisitDetailNotFoundError());
    m.detail.mockRejectedValueOnce(new VetVisitDetailNotFoundError());
    const a=await get("/bad%25id");
    const b=await get("/"+"A".repeat(129));
    expect(a.status).toBe(404);expect(b.status).toBe(404);
    expect(await a.json()).toEqual({success:false,code:"VET_VISIT_NOT_FOUND"});
    expect(m.detail).toHaveBeenCalledTimes(2);
    // Direct Core detail tests independently prove pre-DB id validation.
  });
  it("M08 missing JWT blocks both list and detail",async()=>{
    expect((await app.request(root)).status).toBe(401);
    expect((await app.request(root+"/visit-A")).status).toBe(401);
    expect(m.list).not.toHaveBeenCalled();expect(m.detail).not.toHaveBeenCalled();
  });
  it("M09 signed cookie JWT GET owner A remains protected",async()=>{
    expect((await get("/visit-A",a,true)).status).toBe(200);
    expect(m.detail).toHaveBeenCalledWith("owner-A","pet-A","visit-A");
  });
  it("M10 unexpected provider/service failure sanitized 500",async()=>{
    m.detail.mockRejectedValueOnce(new Error("SYNTHETIC_SECRET_PHI_CDN"));
    const r=await get("/visit-A");expect(r.status).toBe(500);
    expect((await r.text())).not.toContain("SYNTHETIC_SECRET_PHI_CDN");
  });
});

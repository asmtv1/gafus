/** Existing shared Core HTTP GET list response used by Next + Hono. */
import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ list: vi.fn(), save: vi.fn(), media: vi.fn(), detail: vi.fn() }));
vi.mock("./petVetVisitService", () => ({
  VetVisitError: class VetVisitError extends Error {
    constructor(message: string, public readonly status = 400) { super(message); }
  },
  listPetVetVisits: m.list, savePetVetVisit: m.save,
  getPetVetMedia: m.media, addPetVetAttachment: vi.fn(),
  deletePetVetAttachment: vi.fn(), deletePetVetVisit: vi.fn(),
}));
vi.mock("./g1VetVisitDetailRead.review", () => ({
  getOwnVetVisitDetail: m.detail,
  VetVisitDetailNotFoundError: class VetVisitDetailNotFoundError extends Error {
    readonly status = 404;
  },
}));
import { handlePetVetVisitRequest } from "./petVetVisitHttp";
const req = (suffix = "", method = "GET") => new Request(
  `http://local.test/api/v1/pets/pet-A/vet-visits${suffix}`, { method },
);
beforeEach(() => {
  vi.clearAllMocks();
  m.detail.mockResolvedValue({ id:"visit-A",petId:"pet-A",attachments:[] });
  m.list.mockResolvedValue([
    { id:"visit-A",petId:"pet-A",visitedOn:"2026-10-18",specialty:"synthetic",
      doctorName:"",clinic:"",diagnosis:"SYNTHETIC_TEST_CLINICAL",
      conclusion:"",notes:"",attachments:[] },
  ]);
});
describe("Actual shared Next/Hono transport GET list is already implemented", () => {
  it("T01 returns list array as typed success data and private/no-store", async () => {
    const res=await handlePetVetVisitRequest(req(),"pet-A","owner-A",[]);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect((await res.json()).data).toMatchObject([{id:"visit-A",petId:"pet-A"}]);
    expect(m.list).toHaveBeenCalledWith("pet-A","owner-A");
    expect(m.save).not.toHaveBeenCalled();
  });
  it("T02 owned pet with no visits returns success and []", async () => {
    m.list.mockResolvedValueOnce([]);
    const res=await handlePetVetVisitRequest(req(),"pet-A","owner-A",[]);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({success:true,data:[]});
  });
  it("T03 foreign/nonexistent pet masked 404, no medical data", async () => {
    const { VetVisitError }=await import("./petVetVisitService");
    m.list.mockRejectedValueOnce(new VetVisitError("Питомец не найден",404));
    const res=await handlePetVetVisitRequest(req(),"pet-A","owner-B",[]);
    expect(res.status).toBe(404);
    expect((await res.text())).not.toContain("SYNTHETIC_TEST_CLINICAL");
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(m.list).toHaveBeenCalledWith("pet-A","owner-B");
  });
  it("T04 forged owner query never influences verified actor parameter", async () => {
    const res=await handlePetVetVisitRequest(req("?ownerId=owner-B"),"pet-A","owner-A",[]);
    expect(res.status).toBe(200);
    expect(m.list).toHaveBeenCalledWith("pet-A","owner-A");
  });
  it("T05 approved shared dispatcher GET detail 200, owner-bound, metadata only", async () => {
    const res=await handlePetVetVisitRequest(req("/visit-A"),"pet-A","owner-A",["visit-A"]);
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({id:"visit-A",petId:"pet-A",attachments:[]});
    expect(m.detail).toHaveBeenCalledWith("owner-A","pet-A","visit-A");
    expect(m.list).not.toHaveBeenCalled();expect(m.media).not.toHaveBeenCalled();
  });
  it("T06 foreign visit resolves to masked 404 and no personal details", async () => {
    const { VetVisitDetailNotFoundError }=await import("./g1VetVisitDetailRead.review");
    m.detail.mockRejectedValueOnce(new VetVisitDetailNotFoundError());
    const res=await handlePetVetVisitRequest(req("/visit-A"),"pet-A","owner-B",["visit-A"]);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({success:false,code:"VET_VISIT_NOT_FOUND"});
    expect(m.detail).toHaveBeenCalledWith("owner-B","pet-A","visit-A");
  });
  it("T07 forged detail query and invalid list id never reach storage", async () => {
    const forged=await handlePetVetVisitRequest(req("/visit-A?ownerId=owner-B"),"pet-A","owner-A",["visit-A"]);
    const invalid=await handlePetVetVisitRequest(req(),"pet%id","owner-A",[]);
    expect(forged.status).toBe(404);expect(invalid.status).toBe(404);
    expect(m.detail).not.toHaveBeenCalled();expect(m.list).not.toHaveBeenCalled();
  });
});

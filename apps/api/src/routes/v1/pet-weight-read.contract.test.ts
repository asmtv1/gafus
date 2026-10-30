import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseOwnedPetWeightHistoryData } from "@gafus/types";

const service = vi.hoisted(() => vi.fn());
vi.mock("@gafus/core/services/pets", async importOriginal => ({
  ...await importOriginal<object>(), getPetWeightHistory: service,
}));
import { petsRoutes } from "./pets";

const app = new Hono();
app.use("/api/v1/pets/*", async (c, next) => {
  if (c.req.header("Authorization") !== "Bearer owner") {
    return c.json({success:false,error:"Не авторизован"},401);
  }
  c.set("user",{id:"owner-A",username:"owner",role:"USER"});
  await next();
});
app.route("/api/v1/pets", petsRoutes);
const sample = {
  currentWeightKg: null, targetWeightKg: null,
  entries: [{
    id: "entry-1", petId: "pet-A", ownerId: "owner-A",
    weightKg: 12.2, measuredAt:"2026-10-01T10:00:00.000Z",
    createdAt:"2026-10-02T10:00:00.000Z",
  }],
};

describe("registered owner-scoped weight read ↔ shared data contract",()=>{
  beforeEach(()=>vi.resetAllMocks());
  it("actual HTTP 200 projection follows owner Core lookup and parses typed wire",async()=>{
    service.mockResolvedValueOnce(sample);
    const result=await app.request("/api/v1/pets/pet-A/weight",{
      headers:{Authorization:"Bearer owner"},
    });
    expect(result.status).toBe(200);
    expect(service).toHaveBeenCalledExactlyOnceWith("pet-A","owner-A");
    const body=await result.json();
    expect(body).toEqual({success:true,data:sample});
    expect(parseOwnedPetWeightHistoryData(body.data,"pet-A")?.entries).toEqual([{
      id:"entry-1",weightKg:12.2,
      measuredAt:"2026-10-01T10:00:00.000Z",
      createdAt:"2026-10-02T10:00:00.000Z",
    }]);
  });
  it("404 for owner missing/foreign pet, never fabricate history",async()=>{
    service.mockResolvedValueOnce(null);
    const result=await app.request("/api/v1/pets/foreign/weight",{
      headers:{Authorization:"Bearer owner"},
    });
    expect(result.status).toBe(404);
    expect(await result.json()).toEqual({success:false,error:"Питомец не найден"});
    expect(service).toHaveBeenCalledExactlyOnceWith("foreign","owner-A");
  });
  it.each(["pet.invalid","a".repeat(129),"..wrong","пёс"])(
    "invalid identifier %j returns old owner-obscuring 404, no Core read",
    async petId=>{
      const result=await app.request("/api/v1/pets/"+encodeURIComponent(petId)+"/weight",{
        headers:{Authorization:"Bearer owner"},
      });
      expect(result.status).toBe(404);
      expect(service).not.toHaveBeenCalled();
    });
  it("unauthenticated request denied before service",async()=>{
    const result=await app.request("/api/v1/pets/pet-A/weight");
    expect(result.status).toBe(401);
    expect(service).not.toHaveBeenCalled();
  });
});

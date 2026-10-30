import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ api: vi.fn(), tracer: vi.fn() }));
vi.mock("expo-secure-store", () => ({ getItemAsync: vi.fn() }));
vi.mock("./client", () => ({
  apiClient: (...args: unknown[]) => m.api(...args),
  apiClientMultipart: vi.fn(),
}));
vi.mock("@/shared/lib/tracer", () => ({
  reportClientError: (...args: unknown[]) => m.tracer(...args),
}));
import { petWeightApi } from "./pets";
beforeEach(() => {
  vi.stubGlobal("__DEV__", false);
  m.api.mockReset().mockResolvedValue({
    success: true,
    data: { currentWeightKg: null, targetWeightKg: null, entries: [] },
  });
  m.tracer.mockReset();
});
describe("V98 read-only existing private weight GET optional requestGuard", () => {
  it("passes verified native epoch requestGuard to original GET without new endpoint", async () => {
    const guard = vi.fn(() => true);
    await expect(petWeightApi.get("pet-X", guard)).resolves.toMatchObject({ success: true });
    expect(m.api).toHaveBeenCalledExactlyOnceWith("/api/v1/pets/pet-X/weight", {
      requestGuard: guard,
    });
    expect(guard()).toBe(true);
  });
  it("old get(petId) caller remains same GET path and no write method", async () => {
    await petWeightApi.get("pet-X");
    expect(m.api).toHaveBeenCalledExactlyOnceWith("/api/v1/pets/pet-X/weight", {});
  });
  it("valid owner history strips private petId/ownerId and ignores future fields",async()=>{
    m.api.mockResolvedValueOnce({
      success:true,data:{currentWeightKg:15,targetWeightKg:null,futureField:42,
        entries:[{id:"entry_1",petId:"pet-X",ownerId:"PRIVATE",weightKg:14.5,
          measuredAt:"2026-10-20T09:00:00.000Z",
          createdAt:"2026-10-21T09:00:00.000Z",hidden:"do not expose"}]},
    });
    const result=await petWeightApi.get("pet-X");
    expect(result).toEqual({success:true,data:{
      currentWeightKg:15,targetWeightKg:null,
      entries:[{id:"entry_1",weightKg:14.5,
        measuredAt:"2026-10-20T09:00:00.000Z",
        createdAt:"2026-10-21T09:00:00.000Z"}],
    }});
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
  });
  it.each([
    {currentWeightKg:"15",targetWeightKg:null,entries:[]},
    {currentWeightKg:null,targetWeightKg:null,entries:[{id:"x",petId:"other",weightKg:12,
      measuredAt:"2026-10-20T09:00:00.000Z",createdAt:"2026-10-21T09:00:00.000Z"}]},
    {currentWeightKg:null,targetWeightKg:null,entries:"forged"},
  ])("malformed HTTP 200 fails closed, not synthetic success: %j",async data=>{
    m.api.mockResolvedValueOnce({success:true,data});
    expect(await petWeightApi.get("pet-X")).toMatchObject({
      success:false,code:"INVALID_RESPONSE",
    });
    expect(m.api).toHaveBeenCalledTimes(1);
  });
  it("unsafe pet path never reaches native transport",async()=>{
    expect(await petWeightApi.get("../other")).toMatchObject({
      success:false,code:"INVALID_PET_ID",
    });
    expect(m.api).not.toHaveBeenCalled();
  });
  it("HTTP-style 404/429/500 stays failure and never fake successful empty", async () => {
    for (const failure of [
      { success: false, error: "Питомец не найден" },
      { success: false, code: "RATE_LIMITED" },
      { success: false, code: "INTERNAL_SERVER_ERROR" },
    ]) {
      m.api.mockResolvedValueOnce(failure);
      expect(await petWeightApi.get("pet-X", () => true)).toEqual(failure);
    }
    expect(m.api).toHaveBeenCalledTimes(3);
  });
});
describe("new original Hono weight writes: no 401 refresh replay and epoch request guard",()=>{
  it("POST weight forwards epoch fence and never repeats an ambiguous write", async()=>{
    const guard=vi.fn(()=>true);
    await petWeightApi.add("pet-X",14.5,"2026-10-20T09:00:00.000Z",guard);
    expect(m.api).toHaveBeenCalledExactlyOnceWith("/api/v1/pets/pet-X/weight",{
      method:"POST",body:{weightKg:14.5,measuredAt:"2026-10-20T09:00:00.000Z"},
      requestGuard:guard,skipAuthRefreshReplay:true,
    });
  });
  it("PUT target and reset use real Hono path and preserve owner guard",async()=>{
    const guard=()=>true;
    await petWeightApi.setTarget("pet-X",12,guard);
    await petWeightApi.setTarget("pet-X",null,guard);
    expect(m.api.mock.calls).toEqual([
      ["/api/v1/pets/pet-X/weight/target",{method:"PUT",body:{targetWeightKg:12},
        requestGuard:guard,skipAuthRefreshReplay:true}],
      ["/api/v1/pets/pet-X/weight/target",{method:"PUT",body:{targetWeightKg:null},
        requestGuard:guard,skipAuthRefreshReplay:true}],
    ]);
  });
  it("DELETE exact weight entry forwards current actor guard and forbids auth refresh replay",async()=>{
    const guard=vi.fn(()=>true);
    await petWeightApi.remove("pet-X","measurement_1",guard);
    expect(m.api).toHaveBeenCalledExactlyOnceWith(
      "/api/v1/pets/pet-X/weight/measurement_1",{
        method:"DELETE",requestGuard:guard,skipAuthRefreshReplay:true,
      });
  });
  it("legacy callers do not silently gain auth replay for any mutation",async()=>{
    await petWeightApi.add("pet-X",13,"2026-10-20T00:00:00.000Z");
    await petWeightApi.setTarget("pet-X",null);
    await petWeightApi.remove("pet-X","m1");
    expect(m.api.mock.calls.map(([,opts])=>opts)).toEqual([
      {method:"POST",body:{weightKg:13,measuredAt:"2026-10-20T00:00:00.000Z"},
        skipAuthRefreshReplay:true},
      {method:"PUT",body:{targetWeightKg:null},skipAuthRefreshReplay:true},
      {method:"DELETE",skipAuthRefreshReplay:true},
    ]);
  });
});

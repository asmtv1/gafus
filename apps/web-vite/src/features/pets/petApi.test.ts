import { afterEach, describe, expect, it, vi } from "vitest";
import {getMyPet, getMyPetWeightHistory, listMyPets} from "./petApi";

afterEach(() => vi.unstubAllGlobals());
const raw = {
  id: "dog-1", name: "Джек", type: "DOG", breed: null,
  showInProfile: false, notes: "sensitive", weightKg: 12,
  ownerId: "private-user-id", awards: [{ id: "private-award" }],
};

describe("Vite pets browser DTO projection", () => {
  it("rejects a path-breaking identifier before any card tries to link it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true, data: [{ ...raw, id: "../secret" }],
    }), { status: 200 })));
    await expect(listMyPets()).rejects.toThrow("некорректный список");
  });

  it("sends only cookies and discards sensitive raw pet fields", async () => {
    const mock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true, data: [raw],
    }), { status: 200 }));
    vi.stubGlobal("fetch", mock);
    expect(await listMyPets()).toEqual([{
      id: "dog-1", name: "Джек", type: "DOG", breed: null,
      showInProfile: false, weightKg: 12,
    }]);
    expect(mock.mock.calls[0][0]).toBe("/api/v1/pets");
    expect(mock.mock.calls[0][1].credentials).toBe("include");
  });

  it("projects only safe owner aggregate counts and strips private note rows",async()=>{
    const response=new Response(JSON.stringify({success:true,data:[{
      ...raw,_count:{preventionEntries:4,documents:2},
      notes:"SECRET_HEALTH_NOTES",ownerId:"PRIVATE_OWNER_ID",
    }]}),{status:200});
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(response));
    const pets=await listMyPets();
    expect(pets[0]).toMatchObject({preventionCount:4,documentCount:2});
    expect(JSON.stringify(pets)).not.toContain("SECRET_HEALTH_NOTES");
    expect(JSON.stringify(pets)).not.toContain("PRIVATE_OWNER_ID");
    expect(JSON.stringify(pets)).not.toContain("_count");
  });
  it("rejects forged or malformed owner summary counts",async()=>{
    const response=new Response(JSON.stringify({success:true,data:[{
      ...raw,_count:{preventionEntries:-1,documents:"infinite"},
    }]}),{status:200});
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(response));
    await expect(listMyPets()).rejects.toThrow("некорректный список");
  });
  it("retains only safe age/weight/height scalars from owner list",async()=>{
    const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success:true,data:[{...raw,birthDate:"2021-09-20T00:00:00.000Z",
        heightCm:55,weightKg:18,rawPrivateNotes:"MUST_NOT_RENDER"}],
    }),{status:200}));
    vi.stubGlobal("fetch",fetcher);
    const result=await listMyPets();
    expect(result[0]).toMatchObject({birthDate:"2021-09-20T00:00:00.000Z",
      weightKg:18,heightCm:55});
    expect(JSON.stringify(result)).not.toContain("MUST_NOT_RENDER");
  });
  it("rejects malformed owner measurements instead of rendering forged values",async()=>{
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success:true,data:[{...raw,weightKg:"100 кг"}],
    }),{status:200})));
    await expect(listMyPets()).rejects.toThrow("некорректный список");
  });
  it("refuses a valid-shaped but different pet ID at a private deep link",async()=>{
    const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success:true,data:{...raw,id:"dog-other",birthDate:null,
        heightCm:null,neckGirthCm:null,muzzleGirthCm:null,bellyGirthCm:null},
    }),{status:200}));
    vi.stubGlobal("fetch",fetcher);
    await expect(getMyPet("dog-1")).rejects.toThrow("некорректный профиль");
    expect(fetcher.mock.calls.map(([url])=>url))
      .toEqual(["/api/v1/pets/dog-1"]);
  });
  it("rejects incomplete DTO instead of silently showing wrong ownership", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true, data: [{ ...raw, name: null }],
    }), { status: 200 })));
    await expect(listMyPets()).rejects.toThrow("некорректный список");
  });
});

describe("Web owner weight-history API boundary", () => {
  const entry = {
    id: "measurement-1", petId: "dog-1", ownerId: "OTHER_PRIVATE_OWNER",
    weightKg: 13.5, measuredAt: "2026-10-20T11:00:00.000Z",
    createdAt: "2026-10-20T11:01:00.000Z",
  };
  const body = {
    currentWeightKg: 13.5, targetWeightKg: null, entries: [entry],
  };
  const fetchResponse = (data: unknown, code = 200) =>
    new Response(JSON.stringify({ success: code === 200, data }), { status: code });

  it("sends only owner GET, retains canonical ISO, strips private row metadata", async () => {
    const fetcher = vi.fn().mockResolvedValue(fetchResponse(body));
    vi.stubGlobal("fetch", fetcher);
    expect(await getMyPetWeightHistory("dog-1")).toEqual({
      currentWeightKg: 13.5, targetWeightKg: null,
      entries: [{ id: "measurement-1", weightKg: 13.5, measuredAt: entry.measuredAt }],
    });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0][0]).toBe("/api/v1/pets/dog-1/weight");
    expect(fetcher.mock.calls[0][1].method).toBe("GET");
    expect(fetcher.mock.calls[0][1].credentials).toBe("include");
  });

  it("forward-compatible extra fields never leak metadata from owner weight rows", async()=>{
    const fetcher=vi.fn().mockResolvedValue(fetchResponse({
      ...body, extraServerField: "private-extra",
      entries:[{...entry, futureField: "ignored"}],
    }));
    vi.stubGlobal("fetch",fetcher);
    const result=await getMyPetWeightHistory("dog-1");
    expect(result.entries).toEqual([{
      id:"measurement-1",weightKg:13.5,measuredAt:entry.measuredAt,
    }]);
    expect(JSON.stringify(result)).not.toMatch(
      /OTHER_PRIVATE_OWNER|private-extra|futureField|petId|createdAt/,
    );
  });
  it("rejects bad ID locally and never sends a network request", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(getMyPetWeightHistory("../other")).rejects.toThrow("идентификатор");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    ["other pet row", { ...body, entries: [{ ...entry, petId: "dog-2" }] }],
    ["nullable timestamp", { ...body, entries: [{ ...entry, measuredAt: null }] }],
    ["path breaking weight id", { ...body, entries: [{ ...entry, id: "../other" }] }],
    ["noncanonical timestamp", {
      ...body, entries: [{ ...entry, measuredAt: "2026-10-20" }],
    }],
    ["nonfinite metric", { ...body, targetWeightKg: "NaN" }],
    ["untyped history", { ...body, entries: null }],
    ["missing measuredAt", { ...body, entries: [{ ...entry, measuredAt: undefined }] }],
  ])("fails closed on malformed %s", async (_label, payload) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fetchResponse(payload)));
    await expect(getMyPetWeightHistory("dog-1")).rejects.toThrow("история веса");
  });

  it("propagates a protected owner 404 without fabricated history", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fetchResponse(null, 404)));
    await expect(getMyPetWeightHistory("dog-1")).rejects.toMatchObject({ status: 404 });
  });
});

import { describe, expect, it, vi } from "vitest";
import { createSmartFeedPreferences, type SmartFeedPreferencesPort } from "./smart-preferences";

describe("smart preferences pure contract and owner bound port",()=>{
  it("rejects foreign keys and unknown actors, forwards values only",async()=>{
    const actorExists=vi.fn().mockImplementation(async (id:string)=>id==="viewer");
    const read=vi.fn().mockResolvedValue(null);
    const patch=vi.fn().mockImplementation(async (_id:string, values:unknown, defaults:unknown)=>({...defaults as object,...values as object}));
    const resetDerived=vi.fn().mockResolvedValue(undefined);
    const service=createSmartFeedPreferences({actorExists,read,patch,resetDerived});
    expect((await service.get("viewer")).enabled).toBe(true);
    await expect(service.get("stranger")).rejects.toMatchObject({status:401});
    await expect(service.patch("viewer",{userId:"stranger"})).rejects.toMatchObject({status:400});
    const result=await service.patch("viewer",{usePets:false});
    expect(result.usePets).toBe(false);
    expect(patch).toHaveBeenCalledWith("viewer",{usePets:false},expect.objectContaining({enabled:true}));
    await service.reset("viewer");
    expect(resetDerived).toHaveBeenCalledWith("viewer",expect.any(Date),expect.objectContaining({enabled:true}));
  });
});

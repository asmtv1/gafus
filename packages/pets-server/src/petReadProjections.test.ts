import { beforeEach,describe,expect,it,vi } from "vitest";
const m=vi.hoisted(()=>({list:vi.fn(),detail:vi.fn(),update:vi.fn()}));
vi.mock("@gafus/prisma",()=>({prisma:{pet:{findMany:m.list,findFirst:m.detail,update:m.update}}}));
import {readOwnedPets,readOwnedPetDetail} from "./petReadProjections.js";
beforeEach(()=>{vi.clearAllMocks();m.list.mockResolvedValue([]);m.detail.mockResolvedValue(null)});
describe("Pet list and detail owner-scoped adapter",()=>{
  it("requires an owner and projects owner-only aggregate counts",async()=>{
    expect(await readOwnedPets("owner-A")).toEqual([]);
    expect(m.list).toHaveBeenCalledExactlyOnceWith({
      where:{ownerId:"owner-A"},
      include:{awards:{orderBy:{date:"desc"}},_count:{select:{preventionEntries:true,documents:true}}},
      orderBy:{createdAt:"asc"},
    });
    expect(m.update).not.toHaveBeenCalled();
  });
  it("selects a single pet with a matching authenticated owner",async()=>{
    expect(await readOwnedPetDetail("pet-A","owner-A")).toBeNull();
    expect(m.detail).toHaveBeenCalledExactlyOnceWith({
      where:{id:"pet-A",ownerId:"owner-A"},include:{awards:{orderBy:{date:"desc"}}},
    });
  });
  it("never queries for missing identity or pet",async()=>{
    expect(await readOwnedPets("")).toEqual([]);
    expect(await readOwnedPetDetail("pet-A","")).toBeNull();
    expect(await readOwnedPetDetail("","owner-A")).toBeNull();
    expect(m.list).not.toHaveBeenCalled();expect(m.detail).not.toHaveBeenCalled();
  });
});

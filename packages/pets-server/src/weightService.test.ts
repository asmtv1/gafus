import { beforeEach, describe, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({
 pet:vi.fn(),history:vi.fn(),transaction:vi.fn(),lock:vi.fn(),create:vi.fn(),
 remove:vi.fn(),latest:vi.fn(),update:vi.fn(),target:vi.fn(),
}));
vi.mock("@gafus/prisma",()=>({prisma:{
 pet:{findFirst:m.pet,updateMany:m.target},
 petWeightEntry:{findMany:m.history},
 $transaction:m.transaction,
}}));
import {
 getPetWeightHistory,addPetWeightEntry,deletePetWeightEntry,setPetTargetWeight
} from "./weightService.js";
describe("owner-locked pet weight persistence",()=>{
 beforeEach(()=>{
  vi.resetAllMocks();
  m.pet.mockResolvedValue({id:"pet-1",weightKg:12,targetWeightKg:null});
  m.history.mockResolvedValue([]);
  m.lock.mockResolvedValue([{id:"pet-1"}]);
  m.create.mockResolvedValue({id:"measure-1",weightKg:17});
  m.remove.mockResolvedValue({count:1});
  m.latest.mockResolvedValue({weightKg:17});
  m.update.mockResolvedValue({});
  m.target.mockResolvedValue({count:1});
  m.transaction.mockImplementation(fn=>fn({
    $queryRaw:m.lock,petWeightEntry:{create:m.create,deleteMany:m.remove,findFirst:m.latest},
    pet:{update:m.update},
  }));
 });
 it("denies history before fetching any foreign weight rows",async()=>{
  m.pet.mockResolvedValue(null);
  expect(await getPetWeightHistory("pet-other","owner-1")).toBeNull();
  expect(m.pet).toHaveBeenCalledWith({where:{id:"pet-other",ownerId:"owner-1"},
    select:{id:true,targetWeightKg:true,weightKg:true}});
  expect(m.history).not.toHaveBeenCalled();
 });
 it("scopes history rows by owner, rejects invalid stored timestamps",async()=>{
  const bad={id:"entry-1",petId:"pet-1",ownerId:"owner-1",weightKg:15,
    measuredAt:new Date(NaN),createdAt:new Date()};
  m.history.mockResolvedValueOnce([bad]);
  await expect(getPetWeightHistory("pet-1","owner-1"))
    .rejects.toThrow("PET_WEIGHT_HISTORY_INVALID_STORED_DATA");
  expect(m.history).toHaveBeenCalledWith({where:{petId:"pet-1",ownerId:"owner-1"},
    orderBy:[{measuredAt:"asc"},{createdAt:"asc"}]});
 });
 it("prevents unowned add from writing any measurement",async()=>{
  m.lock.mockResolvedValue([]);
  expect(await addPetWeightEntry("pet-other","owner-1",16,new Date())).toBeNull();
  expect(m.create).not.toHaveBeenCalled();
  expect(m.update).not.toHaveBeenCalled();
 });
 it("serializes add before recalculation and updates exactly the locked pet",async()=>{
  const now=new Date("2026-11-07T10:00:00Z");
  expect(await addPetWeightEntry("pet-1","owner-1",17,now)).toMatchObject({id:"measure-1"});
  expect(m.lock).toHaveBeenCalledOnce();
  expect(m.create).toHaveBeenCalledWith({data:{petId:"pet-1",ownerId:"owner-1",
    weightKg:17,measuredAt:now}});
  expect(m.latest).toHaveBeenCalledWith({where:{petId:"pet-1",ownerId:"owner-1"},
    orderBy:[{measuredAt:"desc"},{createdAt:"desc"}]});
  expect(m.update).toHaveBeenCalledWith({where:{id:"pet-1"},data:{weightKg:17}});
 });
 it("rejects foreign/deleted rows without recomputing current weight",async()=>{
  m.remove.mockResolvedValue({count:0});
  expect(await deletePetWeightEntry("pet-1","owner-1","other-entry")).toBe(false);
  expect(m.remove).toHaveBeenCalledWith({where:{
    id:"other-entry",petId:"pet-1",ownerId:"owner-1"}});
  expect(m.latest).not.toHaveBeenCalled();
  expect(m.update).not.toHaveBeenCalled();
 });
 it("deleting last measurement resets current weight but not target",async()=>{
  m.latest.mockResolvedValue(null);
  expect(await deletePetWeightEntry("pet-1","owner-1","entry-1")).toBe(true);
  expect(m.update).toHaveBeenCalledWith({where:{id:"pet-1"},data:{weightKg:null}});
 });
 it("updates only the owner's pet target; a foreign pet stays private",async()=>{
  m.target.mockResolvedValue({count:0});
  expect(await setPetTargetWeight("pet-other","owner-1",20)).toBe(false);
  expect(m.target).toHaveBeenCalledWith({where:{id:"pet-other",ownerId:"owner-1"},
    data:{targetWeightKg:20}});
 });
});

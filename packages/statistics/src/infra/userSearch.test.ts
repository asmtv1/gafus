import { beforeEach, describe, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({findMany:vi.fn(),error:vi.fn()}));
vi.mock("@gafus/prisma",()=>({prisma:{user:{findMany:m.findMany}}}));
vi.mock("@gafus/logger",()=>({createWebLogger:()=>({error:m.error})}));
import { searchUsersByUsername, searchStudentsByUsername, getStudentsByIds } from "./userSearch";
describe("staff-only username/student projection boundary",()=>{
 beforeEach(()=>vi.resetAllMocks());
 it("never queries database for blank inputs",async()=>{
  expect(await searchUsersByUsername("  ")).toEqual([]);
  expect(await searchStudentsByUsername("   ")).toEqual([]);
  expect(await getStudentsByIds([])).toEqual([]);
  expect(m.findMany).not.toHaveBeenCalled();
 });
 it("projects only id+username, filters USER role for trainer lookup",async()=>{
  m.findMany.mockResolvedValue([{id:"u",username:"example"}]);
  expect(await searchStudentsByUsername("EXAMPLE",5)).toEqual([{id:"u",username:"example"}]);
  expect(m.findMany).toHaveBeenCalledWith({
   where:{username:{contains:"EXAMPLE",mode:"insensitive"},role:"USER"},
   take:5,select:{id:true,username:true},
  });
 });
 it("does not substitute users of other roles in id lookup",async()=>{
  m.findMany.mockResolvedValue([]);
  await getStudentsByIds(["owned-id"]);
  expect(m.findMany).toHaveBeenCalledWith({
   where:{id:{in:["owned-id"]},role:"USER"},
   select:{id:true,username:true},
  });
 });
 it("never exposes private search strings or user identifiers in error log",async()=>{
  m.findMany.mockRejectedValue(new Error("PRIVATE_SQL_CONNECTION_STRING"));
  await expect(searchStudentsByUsername("private-email@example.invalid")).rejects.toThrow("PRIVATE_SQL_CONNECTION_STRING");
  expect(JSON.stringify(m.error.mock.calls)).not.toMatch(/PRIVATE_SQL_CONNECTION_STRING|private-email/);
 });
});

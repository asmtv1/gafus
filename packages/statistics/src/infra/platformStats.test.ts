import { describe, expect, it, vi } from "vitest";
const count=vi.hoisted(()=>vi.fn());
vi.mock("@gafus/prisma",()=>({prisma:{user:{count}}}));
import { countPlatformStudents } from "./platformStats";
describe("public aggregate is role-scoped and no identity is selected",()=>{
 it("only counts USER role",async()=>{
  count.mockResolvedValueOnce(19);
  expect(await countPlatformStudents()).toBe(19);
  expect(count).toHaveBeenCalledExactlyOnceWith({where:{role:"USER"}});
 });
});

import {beforeEach,describe,expect,it,vi} from "vitest";

const countMock=vi.hoisted(()=>vi.fn());
vi.mock("@gafus/prisma",()=>({prisma:{user:{count:countMock}}}));
vi.mock("@gafus/logger",()=>({createWebLogger:()=>({error:vi.fn()})}));

beforeEach(()=>{vi.resetModules();vi.clearAllMocks();});

describe("anonymous Next homepage aggregate statistics",()=>{
 it("uses the original Core count role whitelist without leaking user fields",async()=>{
  countMock.mockResolvedValueOnce(28);
  const {publicStatsRoutes}=await import("./public-stats");
  const result=await publicStatsRoutes.request("/");
  expect(result.status).toBe(200);
  expect(result.headers.get("cache-control")).toBe("public, max-age=3600");
  expect(await result.json()).toEqual({success:true,data:{students:28}});
  expect(countMock).toHaveBeenCalledExactlyOnceWith({where:{role:"USER"}});
  const second=await publicStatsRoutes.request("/");
  expect(second.status).toBe(200);
  expect(countMock).toHaveBeenCalledTimes(1);
 });
 it("fails closed when the public DB count is not available",async()=>{
  countMock.mockRejectedValueOnce(new Error("PRIVATE_DB_SECRET_CANNOT_EXPOSE"));
  const {publicStatsRoutes}=await import("./public-stats");
  const response=await publicStatsRoutes.request("/");
  expect(response.status).toBe(503);
  expect(response.headers.get("cache-control")).toBe("no-store");
  const serialized=await response.text();
  expect(serialized).not.toContain("PRIVATE_DB_SECRET_CANNOT_EXPOSE");
  expect(serialized).not.toContain("userId");
 });
});

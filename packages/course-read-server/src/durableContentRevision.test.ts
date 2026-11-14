import {beforeEach,describe,expect,it,vi} from "vitest";
const db=vi.hoisted(()=>({query:vi.fn()}));
vi.mock("@gafus/prisma",()=>({prisma:{$queryRaw:db.query}}));
import {readDurableCourseContentRevision} from "./durableContentRevision.js";
beforeEach(()=>{vi.clearAllMocks();db.query.mockResolvedValue([{revision:42n}]);});
describe("authoritative committed cache revision read",()=>{
 it("returns exact bigint decimal version without precision loss",async()=>{
  db.query.mockResolvedValueOnce([{revision:9007199254740997n}]);
  expect(await readDurableCourseContentRevision()).toBe("9007199254740997");
  expect(db.query).toHaveBeenCalledOnce();
 });
 it("missing/invalid rows do not fall back to cache revision zero",async()=>{
  db.query.mockResolvedValueOnce([]);
  await expect(readDurableCourseContentRevision()).rejects.toThrow("COURSE_CACHE_DURABLE_REVISION_MISSING");
  db.query.mockResolvedValueOnce([{revision:0}]);
  await expect(readDurableCourseContentRevision()).rejects.toThrow("COURSE_CACHE_DURABLE_REVISION_MISSING");
 });
 it("db exception is propagated for Core's cache fail-closed path",async()=>{
  db.query.mockRejectedValueOnce(new Error("db down"));
  await expect(readDurableCourseContentRevision()).rejects.toThrow("db down");
 });
});

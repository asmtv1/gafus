import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogCourseRow, CatalogReadPort } from "./catalogReadPort";
vi.mock("../contentAccess/policy", () => ({
  resolveCourseEntitlement: vi.fn(async () => ({allowed:false,source:"DENIED"})),
}));
vi.mock("../trainerCourse/courseVersionService",()=>({setCourseLogoVersioned: vi.fn()}));
vi.mock("@gafus/logger",()=>({
  createWebLogger:()=>({info:vi.fn(),warn:vi.fn(),error:vi.fn(),success:vi.fn()}),
}));
beforeEach(()=>{vi.resetModules();vi.clearAllMocks();});
const deny = async () => ({allowed:false,source:"DENIED" as const});
function testPort(courses:CatalogCourseRow[]=[]):CatalogReadPort {
  return {
    readCatalogCourseRows:vi.fn(async()=>courses),
    readCatalogProgressRows:vi.fn(async()=>[]),
    readCatalogFavoriteRows:vi.fn(async()=>[]),
    readCourseAccessByType:vi.fn(async()=>null),
    readCourseAccessById:vi.fn(async()=>null),
    readCourseMetadataRow:vi.fn(async()=>null),
    readCourseOutlineRow:vi.fn(async()=>null),
  };
}
function course(overrides:Partial<CatalogCourseRow>={}):CatalogCourseRow {
  return {
    id:"private-one",name:"Private",type:"training",description:"",shortDesc:"",
    duration:"30",logoImg:"",isPrivate:true,isPaid:true,
    avgRating:null,trainingLevel:"BEGINNER",equipment:"",createdAt:new Date(),updatedAt:new Date(),
    author:{username:"trainer",profile:null},reviews:[],_count:{userCourses:0},dayLinks:[],
    favoritedBy:[{userId:"other"}],access:[{userId:"other"}],...overrides,
  };
}
describe("catalog SQL read port and Core per-viewer ACL",()=>{
  it("requires dependencies at construction, rather than silently granting access",async()=>{
    const {createCatalogReadService}=await import("./courseService");
    expect(()=>createCatalogReadService(undefined as unknown as CatalogReadPort,deny)).toThrow("COURSE_CATALOG_DEPENDENCIES_REQUIRED");
  });
  it("filters foreign private memberships even when faulty adapter overfetches",async()=>{
    const {createCatalogReadService}=await import("./courseService");
    const rows=[course(),course({id:"public",isPrivate:false,isPaid:false}),course({id:"owned-private",access:[{userId:"owner"}],favoritedBy:[{userId:"other"},{userId:"owner"}]})];
    const p=testPort(rows);const c=createCatalogReadService(p,deny);
    const output=await c.getCoursesWithProgress("owner");
    expect(output.map(x=>x.id)).toEqual(["public","owned-private"]);
    expect(output.find(x=>x.id==="owned-private")?.favoritedBy).toEqual([{userId:"owner"}]);
    expect(output.every(x=>x.userCourses.length===0)).toBe(true);
    expect(p.readCatalogCourseRows).toHaveBeenCalledExactlyOnceWith("owner");
    expect(p.readCatalogProgressRows).toHaveBeenCalledExactlyOnceWith("owner");
    expect(p.readCatalogFavoriteRows).toHaveBeenCalledExactlyOnceWith("owner");
  });
  it("anonymous catalog never reveals private course or personal favorites",async()=>{
    const {createCatalogReadService}=await import("./courseService");
    const c=createCatalogReadService(testPort([course(),course({id:"public",isPrivate:false,isPaid:false})]),deny);
    const data=await c.getCoursesWithProgress();
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({id:"public",favoritedBy:[],isFavorite:false});
  });
  it("isolates two independently composed catalogs and their entitlement decisions",async()=>{
    const {createCatalogReadService}=await import("./courseService");
    const paid=course({id:"paid",isPrivate:false,isPaid:true});
    const first=createCatalogReadService(testPort([paid]),deny);
    const second=createCatalogReadService(testPort([paid]),async()=>({allowed:true,source:"SUBSCRIPTION"}));
    expect((await first.getCoursesWithProgress("owner"))[0]?.hasAccess).toBe(false);
    expect((await second.getCoursesWithProgress("owner"))[0]?.hasAccess).toBe(true);
    expect((await first.getCoursesWithProgress("owner"))[0]?.hasAccess).toBe(false);
  });
});

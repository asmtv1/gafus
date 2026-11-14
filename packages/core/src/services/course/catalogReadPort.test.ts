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
  it("does not return a public course catalog with missing Persistence binding",async()=>{
    const c=await import("./courseService");
    await expect(c.getCoursesWithProgress("owner")).rejects.toThrow("COURSE_CATALOG_READ_PORT_UNBOUND");
    await expect(c.checkCourseAccessById("paid","owner")).rejects.toThrow("COURSE_CATALOG_READ_PORT_UNBOUND");
    await expect(c.getCourseMetadata("training")).rejects.toThrow("COURSE_CATALOG_READ_PORT_UNBOUND");
  });
  it("filters foreign private memberships even when faulty adapter overfetches",async()=>{
    const db=await import("./catalogReadPort");const c=await import("./courseService");
    const rows=[course(),course({id:"public",isPrivate:false,isPaid:false}),course({id:"owned-private",access:[{userId:"owner"}],favoritedBy:[{userId:"other"},{userId:"owner"}]})];
    const p=testPort(rows);db.registerCatalogReadPort(p);
    const output=await c.getCoursesWithProgress("owner");
    expect(output.map(x=>x.id)).toEqual(["public","owned-private"]);
    expect(output.find(x=>x.id==="owned-private")?.favoritedBy).toEqual([{userId:"owner"}]);
    expect(output.every(x=>x.userCourses.length===0)).toBe(true);
    expect(p.readCatalogCourseRows).toHaveBeenCalledExactlyOnceWith("owner");
    expect(p.readCatalogProgressRows).toHaveBeenCalledExactlyOnceWith("owner");
    expect(p.readCatalogFavoriteRows).toHaveBeenCalledExactlyOnceWith("owner");
  });
  it("anonymous catalog never reveals private course or personal favorites",async()=>{
    const db=await import("./catalogReadPort");const c=await import("./courseService");
    db.registerCatalogReadPort(testPort([course(),course({id:"public",isPrivate:false,isPaid:false})]));
    const data=await c.getCoursesWithProgress();
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({id:"public",favoritedBy:[],isFavorite:false});
  });
  it("rejects replacement of authoritative SQL projections",async()=>{
    const db=await import("./catalogReadPort");const p=testPort();db.registerCatalogReadPort(p);
    db.registerCatalogReadPort(p);
    expect(()=>db.registerCatalogReadPort(testPort())).toThrow("COURSE_CATALOG_READ_PORT_ALREADY_BOUND");
  });
});

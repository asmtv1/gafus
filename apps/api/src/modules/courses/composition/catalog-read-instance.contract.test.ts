import { describe, expect, it, vi } from "vitest";
const sql=vi.hoisted(()=>({
  byId:vi.fn(async()=>null),
  metadata:vi.fn(async()=>({id:"public-1",name:"Course",shortDesc:"",logoImg:"",description:"",isPaid:false,isPrivate:false,videoUrl:null,equipment:"",trainingLevel:"BEGINNER"})),
}));
vi.mock("@gafus/course-read-server/legacy-catalog-rows",()=>({
  readCatalogCourseRows:vi.fn(async()=>[]),
  readCatalogProgressRows:vi.fn(async()=>[]),
  readCatalogFavoriteRows:vi.fn(async()=>[]),
  readCourseAccessByType:vi.fn(async()=>null),
  readCourseAccessById:sql.byId,
  readCourseMetadataRow:sql.metadata,
  readCourseOutlineRow:vi.fn(async()=>null),
}));
describe("API course catalog DB adapter composition",()=>{
  it("preserves public metadata, unknown course DENIED and exact SQL selectors",async()=>{
    const course=await import("./catalog-read-instance");
    await expect(course.getCourseMetadata("training")).resolves.toMatchObject({id:"public-1",isPaid:false});
    expect(sql.metadata).toHaveBeenCalledExactlyOnceWith("training");
    await expect(course.checkCourseAccessById("missing","visitor")).resolves.toEqual({hasAccess:false});
    expect(sql.byId).toHaveBeenCalledExactlyOnceWith("missing");
  });
});

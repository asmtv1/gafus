import {beforeEach,describe,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({header:vi.fn(),progress:vi.fn(),days:vi.fn(),update:vi.fn()}));
vi.mock("@gafus/prisma",()=>({prisma:{course:{findUnique:m.header},userCourse:{findUnique:m.progress},dayOnCourse:{findMany:m.days},user:{update:m.update}}}));
import {readCoursePathHeader,readOwnedCoursePathProgress,listCourseIdsForTrainingDay} from "./coursePathRead.js";
beforeEach(()=>{vi.clearAllMocks();m.header.mockResolvedValue(null);m.progress.mockResolvedValue(null);m.days.mockResolvedValue([])});
describe("course-path read adapter",()=>{
  it("selects only course name and type by exact id",async()=>{
    await readCoursePathHeader("course-A");
    expect(m.header).toHaveBeenCalledExactlyOnceWith({where:{id:"course-A"},select:{name:true,type:true}});
  });
  it("selects the authenticated learner enrollment only",async()=>{
    await readOwnedCoursePathProgress("owner-A","course-A");
    expect(m.progress).toHaveBeenCalledExactlyOnceWith({
      where:{userId_courseId:{userId:"owner-A",courseId:"course-A"}},
      select:{startedAt:true,completedAt:true},
    });
  });
  it("deduplicates course IDs without loading private users",async()=>{
    m.days.mockResolvedValueOnce([{courseId:"c1"},{courseId:"c1"},{courseId:"c2"}]);
    expect(await listCourseIdsForTrainingDay("day-A")).toEqual(["c1","c2"]);
    expect(m.days).toHaveBeenCalledExactlyOnceWith({where:{dayId:"day-A"},select:{courseId:true}});
  });
  it("missing identifiers never query data",async()=>{
    expect(await readCoursePathHeader("")).toBeNull();
    expect(await readOwnedCoursePathProgress("","c")).toBeNull();
    expect(await readOwnedCoursePathProgress("owner","")).toBeNull();
    expect(await listCourseIdsForTrainingDay("")).toEqual([]);
    expect(m.header).not.toHaveBeenCalled();expect(m.progress).not.toHaveBeenCalled();
    expect(m.days).not.toHaveBeenCalled();expect(m.update).not.toHaveBeenCalled();
  });
});

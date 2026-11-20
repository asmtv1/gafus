import {describe,expect,it,vi} from "vitest";
import {trainerCanEditCourse,getCourseDraftWithRelations} from "./trainerCourseService";
import type {TrainerCourseRowsPort} from "./trainerCourseRowsPort";

function rows(authorId:string) {
  const readAuthor=vi.fn().mockResolvedValue({authorId});
  const readDraft=vi.fn().mockResolvedValue({
    id:"course-A",authorId,name:"Course",guideContent:null,
    shortDesc:"",description:"",duration:"10",videoUrl:null,
    logoImg:"",isPrivate:false,isPaid:false,
    equipment:"",trainingLevel:"BEGINNER",dayLinks:[],access:[],
  });
  return {port:{readAuthor,readDraft} as unknown as TrainerCourseRowsPort,readAuthor,readDraft};
}
describe("trainer-course SQL owner scope via explicit instance ports",()=>{
  it("isolates owner permissions and draft visibility across two app instances",async()=>{
    const first=rows("owner-a"),second=rows("owner-b");
    expect(await trainerCanEditCourse("course-A","owner-a",{},first.port)).toBe(true);
    expect(await trainerCanEditCourse("course-A","owner-a",{},second.port)).toBe(false);
    expect(await getCourseDraftWithRelations("course-A","owner-a",{},first.port))
      .toMatchObject({id:"course-A",name:"Course"});
    expect(await getCourseDraftWithRelations("course-A","owner-a",{},second.port))
      .toBeNull();
    expect(await trainerCanEditCourse("course-A","owner-b",{},second.port)).toBe(true);
    expect(first.readAuthor).toHaveBeenCalledTimes(1);
    expect(second.readAuthor).toHaveBeenCalledTimes(2);
    expect(first.readDraft).toHaveBeenCalledTimes(1);
    expect(second.readDraft).toHaveBeenCalledTimes(1);
  });
});

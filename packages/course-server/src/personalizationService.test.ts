import {beforeEach,describe,expect,it,vi} from "vitest";

const db = vi.hoisted(() => ({findUnique:vi.fn(),upsert:vi.fn()}));
vi.mock("@gafus/prisma",()=>({prisma:{
  course:{findUnique:db.findUnique},userCourse:{upsert:db.upsert},
}}));
import {saveCoursePersonalization} from "./personalizationService.js";

const input={userDisplayName:"Актёр А",userGender:"male" as const,
  petName:"Пёс А",petGender:"female" as const,petNameGen:"Пса А"};

describe("owner-scoped course personalization SQL adapter",()=>{
  beforeEach(()=>{
    vi.resetAllMocks();
    db.findUnique.mockResolvedValue({isPersonalized:true});
    db.upsert.mockResolvedValue({});
  });
  it("denies personalization for regular or nonexistent courses without creating enrollment",async()=>{
    db.findUnique.mockResolvedValueOnce({isPersonalized:false}).mockResolvedValueOnce(null);
    expect(await saveCoursePersonalization("owner-A","course-regular",input))
      .toEqual({success:false,error:"Курс не поддерживает персонализацию"});
    expect(await saveCoursePersonalization("owner-A","course-missing",input))
      .toEqual({success:false,error:"Курс не поддерживает персонализацию"});
    expect(db.upsert).not.toHaveBeenCalled();
  });
  it("writes only the authenticated actor course composite key, never progress/status",async()=>{
    expect(await saveCoursePersonalization("owner-A","course-personalized",input))
      .toEqual({success:true});
    expect(db.findUnique).toHaveBeenCalledExactlyOnceWith({where:{id:"course-personalized"},select:{isPersonalized:true}});
    const mutation=db.upsert.mock.calls[0]![0];
    expect(mutation.where).toEqual({userId_courseId:{userId:"owner-A",courseId:"course-personalized"}});
    expect(mutation.create).toMatchObject({userId:"owner-A",courseId:"course-personalized",...input});
    expect(mutation.update).toMatchObject(input);
    for(const field of ["status","startedAt","completedAt","userId","courseId"])
      expect(mutation.update).not.toHaveProperty(field);
    for(const field of ["status","startedAt","completedAt"])
      expect(mutation.create).not.toHaveProperty(field);
  });
  it("nulls omitted pet cases identically in both insert and update",async()=>{
    await saveCoursePersonalization("owner-B","course-personalized",{
      userDisplayName:"Актёр Б",userGender:"female",petName:"Пёс Б",
    });
    const args=db.upsert.mock.calls[0]![0];
    for (const field of ["petGender","petNameGen","petNameDat","petNameAcc","petNameIns","petNamePre"]){
      expect(args.create[field]).toBeNull();
      expect(args.update[field]).toBeNull();
    }
    expect(args.create.userId).toBe("owner-B");
  });
  it("propagates failed database upsert instead of claiming successful persistence",async()=>{
    db.upsert.mockRejectedValueOnce(new Error("db unavailable"));
    await expect(saveCoursePersonalization("owner-A","course-personalized",input)).rejects.toThrow("db unavailable");
  });
});

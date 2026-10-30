import { beforeEach,describe,expect,it,vi } from "vitest";

const mocks=vi.hoisted(()=>({
  find:vi.fn(),remove:vi.fn(),deleteRow:vi.fn(),
  lock:vi.fn(),schedule:vi.fn(),janitorFind:vi.fn(),
}));
vi.mock("@gafus/cdn-upload",()=>({
  deleteFileFromCDN:mocks.remove,
  parsePrivateMediaLocation:(location:string)=>location.startsWith("cloudru:")
    ?{key:location}:null,
}));
vi.mock("./service",()=>({
  questionActor:vi.fn().mockResolvedValue({id:"owner-1"}),
}));
vi.mock("./mediaV2Cleanup",()=>({
  scheduleQuestionsV2Cleanup:mocks.schedule,
}));
vi.mock("@gafus/prisma",()=>({
  prisma:{
    $transaction:async (callback:(tx:unknown)=>Promise<unknown>)=>callback({
      $queryRaw:mocks.lock,
      questionPhoto:{findFirst:mocks.find,delete:mocks.deleteRow},
    }),
    questionPhoto:{findMany:mocks.janitorFind},
  },
}));
import { deleteUnusedQuestionPhoto,cleanupUnusedQuestionPhotos } from "./photos";
beforeEach(()=>{
  vi.resetAllMocks();
  mocks.lock.mockResolvedValue([{id:"owner-1"}]);
  mocks.schedule.mockResolvedValue(undefined);
  mocks.remove.mockResolvedValue(undefined);
  mocks.deleteRow.mockResolvedValue({id:"photo-1"});
  mocks.janitorFind.mockResolvedValue([]);
});
describe("Questions Photo V2 cancellation compensation",()=>{
  it("persists cleanup before deleting V2 photo row; never deletes S3 inside transaction",async()=>{
    mocks.find.mockResolvedValue({id:"photo-1",ownerId:"owner-1",
      storagePath:"questions-v2:questions/v2/owner-1/media/incoming/source.jpg",url:""});
    await expect(deleteUnusedQuestionPhoto("owner-1","photo-1"))
      .resolves.toEqual({id:"photo-1"});
    expect(mocks.schedule).toHaveBeenCalledOnce();
    expect(mocks.schedule).toHaveBeenCalledWith(expect.anything(),["photo-1"]);
    expect(mocks.deleteRow).toHaveBeenCalledWith({where:{id:"photo-1"}});
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("allows safe removal of existing legacy objects without reopening old upload",async()=>{
    mocks.find.mockResolvedValue({id:"old-photo",ownerId:"owner-1",
      storagePath:"questions/owner-1/old.jpg",url:"https://legacy.invalid/old.jpg"});
    await deleteUnusedQuestionPhoto("owner-1","old-photo");
    expect(mocks.schedule).not.toHaveBeenCalled();
    expect(mocks.remove).toHaveBeenCalledWith("questions/owner-1/old.jpg");
    expect(mocks.deleteRow).toHaveBeenCalledOnce();
  });
  it("refuses attached/foreign photos without S3 or DB deletion",async()=>{
    mocks.find.mockResolvedValue(null);
    await expect(deleteUnusedQuestionPhoto("owner-1","attached"))
      .rejects.toMatchObject({code:"PHOTO_FORBIDDEN",status:403});
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.schedule).not.toHaveBeenCalled();
    expect(mocks.deleteRow).not.toHaveBeenCalled();
  });
  it("retains legacy row when S3 deletion failed",async()=>{
    mocks.find.mockResolvedValue({id:"old-photo",ownerId:"owner-1",
      storagePath:"questions/owner-1/old.jpg",url:""});
    mocks.remove.mockRejectedValue(new Error("S3_OFFLINE"));
    await expect(deleteUnusedQuestionPhoto("owner-1","old-photo"))
      .rejects.toThrow("S3_OFFLINE");
    expect(mocks.deleteRow).not.toHaveBeenCalled();
  });
  it("janitor retries only old unbound rows and delegates V2 to durable cleanup",async()=>{
    mocks.janitorFind.mockResolvedValueOnce([{id:"photo-1",ownerId:"owner-1",
      createdAt:new Date("2026-01-01")}]);
    mocks.find.mockResolvedValue({id:"photo-1",ownerId:"owner-1",
      storagePath:"questions-v2:key",url:""});
    await cleanupUnusedQuestionPhotos();
    expect(mocks.schedule).toHaveBeenCalledOnce();
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});

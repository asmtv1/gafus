import { beforeEach,describe,expect,it,vi } from "vitest";

const mocks=vi.hoisted(()=>({
  find:vi.fn(),remove:vi.fn(),deleteRow:vi.fn(),
  lock:vi.fn(),schedule:vi.fn(),janitorFind:vi.fn(),
  enqueue:vi.fn(),
}));
vi.mock("@gafus/cdn-upload",()=>({
  deleteFileFromCDN:mocks.remove,
  parsePrivateMediaLocation:(location:string)=>location.startsWith("cloudru:")
    ?{key:location}:null,
}));
vi.mock("@gafus/media-server/question-v2-cleanup", () => ({
  scheduleQuestionsV2Cleanup: mocks.schedule,
}));
vi.mock("./service.js",async importOriginal=>({
  ...(await importOriginal<object>()),
  questionActor:vi.fn().mockResolvedValue({id:"owner-1"}),
}));
vi.mock("@gafus/prisma",()=>({
  prisma:{
    $transaction:async (callback:(tx:unknown)=>Promise<unknown>)=>callback({
      $queryRaw:mocks.lock,
      questionPhoto:{findFirst:mocks.find,delete:mocks.deleteRow},
      questionLegacyPhotoDeletion:{create:mocks.enqueue},
    }),
    questionPhoto:{findMany:mocks.janitorFind},
  },
}));
import { deleteUnusedQuestionPhoto,cleanupUnusedQuestionPhotos } from "./photos.js";
beforeEach(()=>{
  vi.resetAllMocks();
  mocks.lock.mockResolvedValue([{id:"owner-1"}]);
  mocks.schedule.mockResolvedValue(undefined);
  mocks.remove.mockResolvedValue(undefined);
  mocks.enqueue.mockResolvedValue({id:"old-photo"});
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
  it("atomically enqueues legacy delete before removing DB photo, without remote IO",async()=>{
    mocks.find.mockResolvedValue({id:"old-photo",ownerId:"owner-1",
      storagePath:"questions/owner-1/old.jpg",url:"https://legacy.invalid/old.jpg"});
    await deleteUnusedQuestionPhoto("owner-1","old-photo");
    expect(mocks.schedule).not.toHaveBeenCalled();
    expect(mocks.enqueue).toHaveBeenCalledWith({data:{
      id:"old-photo",ownerId:"owner-1",locator:"questions/owner-1/old.jpg",
    }});
    expect(mocks.deleteRow).toHaveBeenCalledOnce();
    expect(mocks.enqueue.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.deleteRow.mock.invocationCallOrder[0]!);
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("refuses attached/foreign photos without S3 or DB deletion",async()=>{
    mocks.find.mockResolvedValue(null);
    await expect(deleteUnusedQuestionPhoto("owner-1","attached"))
      .rejects.toMatchObject({code:"PHOTO_FORBIDDEN",status:403});
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.schedule).not.toHaveBeenCalled();
    expect(mocks.deleteRow).not.toHaveBeenCalled();
  });
  it("cannot delete row if durable legacy enqueue fails",async()=>{
    mocks.find.mockResolvedValue({id:"old-photo",ownerId:"owner-1",
      storagePath:"questions/owner-1/old.jpg",url:""});
    mocks.enqueue.mockRejectedValueOnce(new Error("POSTGRES_OUTBOX_DOWN"));
    await expect(deleteUnusedQuestionPhoto("owner-1","old-photo"))
      .rejects.toThrow("POSTGRES_OUTBOX_DOWN");
    expect(mocks.deleteRow).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("never enqueues or removes a forged owner prefix or foreign CDN path",async()=>{
    for(const storagePath of ["questions/another-owner/old.jpg",
      "otherbucket/owner-1/old.jpg","questions/owner-1/../../other.jpg",
      "https://untrusted.invalid/owner-1/old.jpg"]){
      mocks.find.mockResolvedValueOnce({id:"old-photo",ownerId:"owner-1",
        storagePath,url:""});
      await expect(deleteUnusedQuestionPhoto("owner-1","old-photo"))
        .rejects.toThrow();
    }
    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(mocks.deleteRow).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
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

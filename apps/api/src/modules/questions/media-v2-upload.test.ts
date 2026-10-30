import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks=vi.hoisted(()=>({
  actor:vi.fn(),
  head:vi.fn(),
  enqueue:vi.fn(),
  photo:vi.fn(),
  find:vi.fn(),
  update:vi.fn(),
}));
vi.mock("@gafus/prisma",()=>({prisma:{
  questionPhoto:{findFirst:mocks.photo},
  questionV2MediaTask:{findUnique:mocks.find,updateMany:mocks.update},
}}));
vi.mock("@gafus/core/services/questions",()=>({
  questionActor:mocks.actor,
  QuestionError:class extends Error{constructor(public code:string,message:string,
    public status:number){super(message);}},
  scheduleQuestionsV2Cleanup:vi.fn(),
}));
vi.mock("@gafus/cdn-upload",()=>({
  questionsV2Head:mocks.head,questionsV2SignedRead:vi.fn(),
  questionsV2PresignedPost:vi.fn(),questionsV2Marker:vi.fn(),
}));
vi.mock("@gafus/queues",()=>({enqueueQuestionsPhoto:mocks.enqueue}));
import { confirmQuestionsPhoto } from "./media-v2-upload";

const photoId="image-1",mediaId="550e8400-e29b-41d4-a716-446655440000";
const userId="actor-1";
const task={mediaId,ownerId:userId,photoId,sourceKey:"questions/v2/actor-1/source",
  sourceMime:"image/png",sourceBytes:1600,status:"AWAITING_UPLOAD"};
let saved:string|undefined;
beforeEach(()=>{
  vi.clearAllMocks();saved=process.env.QUESTIONS_V2_MEDIA_ENABLED;
  process.env.QUESTIONS_V2_MEDIA_ENABLED="true";
  mocks.actor.mockResolvedValue(undefined);
  mocks.photo.mockResolvedValue({id:photoId,ownerId:userId});
  mocks.find.mockResolvedValue({...task});
  mocks.head.mockResolvedValue({bytes:1600,mime:"image/png"});
  mocks.update.mockResolvedValue({count:1});
  mocks.enqueue.mockResolvedValue(undefined);
});
afterEach(()=>{
  if(saved===undefined)delete process.env.QUESTIONS_V2_MEDIA_ENABLED;
  else process.env.QUESTIONS_V2_MEDIA_ENABLED=saved;
});
describe("Questions Photo V2 confirm S3 size+state boundary",()=>{
  it("rejects a shorter source POST even if signed multipart policy accepted it",async()=>{
    mocks.head.mockResolvedValueOnce({bytes:12,mime:"image/png"});
    await expect(confirmQuestionsPhoto(userId,photoId))
      .rejects.toMatchObject({code:"PHOTO_NOT_UPLOADED",status:409});
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });
  it("rejects swapped MIME and HEAD failures without queuing",async()=>{
    mocks.head.mockResolvedValueOnce({bytes:1600,mime:"image/jpeg"});
    await expect(confirmQuestionsPhoto(userId,photoId))
      .rejects.toMatchObject({code:"PHOTO_NOT_UPLOADED"});
    mocks.head.mockRejectedValueOnce(Error("S3_TIMED_OUT"));
    await expect(confirmQuestionsPhoto(userId,photoId))
      .rejects.toMatchObject({code:"PHOTO_NOT_UPLOADED"});
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("persists QUEUED before triggering Redis, and does not roll back on Redis loss",async()=>{
    mocks.enqueue.mockRejectedValueOnce(Error("REDIS_DOWN"));
    await expect(confirmQuestionsPhoto(userId,photoId))
      .resolves.toEqual({id:photoId,status:"QUEUED"});
    expect(mocks.update).toHaveBeenCalledWith({
      where:{mediaId,ownerId:userId,status:"AWAITING_UPLOAD"},
      data:{status:"QUEUED",nextAttemptAt:expect.any(Date)},
    });
    expect(mocks.enqueue).toHaveBeenCalledWith(mediaId);
  });
  it("duplicate confirmation does not repeat S3 HEAD on already QUEUED task",async()=>{
    mocks.find.mockResolvedValueOnce({...task,status:"QUEUED"});
    await expect(confirmQuestionsPhoto(userId,photoId))
      .resolves.toEqual({id:photoId,status:"QUEUED"});
    expect(mocks.head).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.enqueue).toHaveBeenCalledWith(mediaId);
  });
  it("CAS loser rechecks exactly once, never recurses after a concurrent discard",async()=>{
    mocks.update.mockResolvedValueOnce({count:0});
    mocks.find.mockResolvedValueOnce({...task}).mockResolvedValueOnce(null);
    await expect(confirmQuestionsPhoto(userId,photoId))
      .rejects.toMatchObject({code:"PHOTO_CONFIRM_CONFLICT",status:409});
    expect(mocks.photo).toHaveBeenCalledTimes(1);
    expect(mocks.find).toHaveBeenCalledTimes(2);
    expect(mocks.head).toHaveBeenCalledOnce();
    expect(mocks.update).toHaveBeenCalledOnce();
  });
  it("CAS loser sees the winner's QUEUED status and returns idempotently",async()=>{
    mocks.update.mockResolvedValueOnce({count:0});
    mocks.find.mockResolvedValueOnce({...task}).mockResolvedValueOnce({...task,status:"QUEUED"});
    await expect(confirmQuestionsPhoto(userId,photoId))
      .resolves.toEqual({id:photoId,status:"QUEUED"});
    expect(mocks.enqueue).toHaveBeenCalledWith(mediaId);
    expect(mocks.update).toHaveBeenCalledOnce();
  });
});

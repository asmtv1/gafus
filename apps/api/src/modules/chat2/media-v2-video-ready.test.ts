import {beforeEach,afterEach,describe,expect,it,vi} from "vitest";

const mocks=vi.hoisted(()=>({
  findFirst:vi.fn(),updateMany:vi.fn(),create:vi.fn(),check:vi.fn(),copy:vi.fn(),
  signedPost:vi.fn(),posterPost:vi.fn(),writeGate:vi.fn(),readGate:vi.fn(),
}));
vi.mock("@gafus/prisma",()=>({prisma:{chat2V2MediaTask:{
  findFirst:mocks.findFirst,updateMany:mocks.updateMany,create:mocks.create,
}}}));
vi.mock("@gafus/cdn-upload",async importOriginal=>({
  ...(await importOriginal<object>()),
  chat2V2CheckOriginal:mocks.check,
  chat2V2FinishClientMp4:mocks.copy,
  chat2V2DirectUploadForm:mocks.signedPost,
  chat2V2ClientVideoPosterPost:mocks.posterPost,
}));
vi.mock("./service.js",()=>({
  writeGate:mocks.writeGate,readGate:mocks.readGate,
  Chat2Error:class Chat2Error extends Error {
    constructor(public code:string,public status:number,message:string){super(message);}
  },
}));

import {confirmChat2V2Upload,reserveChat2V2Upload} from "./media-v2-upload";
import {chat2V2FinalKeys,chat2V2SourceKey} from "@gafus/feed-cloud";
const mediaId="5aee281b-54d1-46f4-bf2a-6fcc3ed08df5";
const room="room-1",owner="user-1";
const sourceKey=chat2V2SourceKey(room,owner,mediaId,"video/mp4");
const keys=chat2V2FinalKeys(room,owner,mediaId);
const draft=()=>({mediaId,conversationId:room,ownerId:owner,name:"clip.mp4",
  sourceKey,sourceMime:"video/mp4",sourceBytes:75000,
  status:"AWAITING_UPLOAD" as string,manifest:null as object|null});

beforeEach(()=>{
  vi.stubEnv("CHAT2_V2_MEDIA_ENABLED","true");
  vi.stubEnv("CHAT2_V2_CORE_ENABLED","true");
  vi.stubEnv("CHAT2_PROCESSOR_READY","false");
  Object.values(mocks).forEach(mock=>mock.mockReset());
  mocks.findFirst.mockImplementation(async()=>draft());
  mocks.updateMany.mockResolvedValue({count:1});
  mocks.create.mockResolvedValue(draft());
  mocks.check.mockResolvedValue({bytes:75000,mime:"video/mp4",etag:'"original"'});
  mocks.copy.mockResolvedValue({width:1280,height:720,durationSeconds:25,bytes:75000,posterKey:keys.video.poster});
  mocks.signedPost.mockResolvedValue({url:"https://s3.cloud.ru/chat2-bucket",fields:{key:sourceKey}});
  mocks.posterPost.mockResolvedValue({url:"https://s3.cloud.ru/chat2-bucket",
    fields:{key:sourceKey.replace(/source\.mp4$/,"poster.webp")}});
});
afterEach(()=>vi.unstubAllEnvs());

describe("Chat2 client-ready 720p, optional Cloud.ru 360p",()=>{
  it("reserves MP4 even with Cloud.ru processing paused, without submitting a Job",async()=>{
    const response=await reserveChat2V2Upload(owner,room,{name:"clip.mp4",mime:"video/mp4",bytes:75000});
    expect(response).toMatchObject({status:"AWAITING_UPLOAD",kind:"video",
      posterUpload:{method:"POST"}});
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({
      status:"AWAITING_UPLOAD",sourceMime:"video/mp4",
    })}));
    expect(mocks.writeGate).toHaveBeenCalledWith(owner,room);
  });
  it("verifies S3 copy and publishes READY manifest with only 720p, before Cloud.ru runs",async()=>{
    const response=await confirmChat2V2Upload(owner,room,mediaId);
    expect(response).toEqual({mediaId,status:"READY"});
    expect(mocks.check).toHaveBeenCalledWith(sourceKey,"video/mp4",75000);
    expect(mocks.copy).toHaveBeenCalledWith(sourceKey,keys.video.variants[720],75000);
    const [claim,commit]=mocks.updateMany.mock.calls.map(call=>call[0]);
    expect(claim.where).toMatchObject({status:"AWAITING_UPLOAD",mediaId});
    expect(claim.data.status).toBe("CLIENT_PROCESSING");
    expect(commit.where).toMatchObject({status:"CLIENT_PROCESSING",mediaId});
    expect(commit.data).toMatchObject({status:"READY",attemptToken:null,
      cleanupKind:"SOURCE",nextAttemptAt:new Date("9999-01-01T00:00:00Z"),
      manifest:{kind:"video",width:1280,height:720,durationSeconds:25,
        renditions:[{quality:720,key:keys.video.variants[720],width:1280,height:720,bytes:75000}]}});
    expect(commit.data.manifest.posterKey).toBe(keys.video.poster);
    expect(mocks.updateMany).toHaveBeenCalledTimes(2);
  });
  it("repeated confirmation of a READY MP4 does not create a second final or Job",async()=>{
    mocks.findFirst.mockResolvedValue({...draft(),status:"READY",manifest:{kind:"video",
      renditions:[{quality:720,key:keys.video.variants[720]}]}});
    expect(await confirmChat2V2Upload(owner,room,mediaId)).toEqual({mediaId,status:"READY"});
    expect(mocks.copy).not.toHaveBeenCalled();
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
  it("recovers an expired processing lease and safely retries the original verified final",async()=>{
    mocks.findFirst.mockResolvedValueOnce({...draft(),status:"CLIENT_PROCESSING",
      attemptToken:"lost-ack",leaseUntil:new Date(Date.now()-180000)})
      .mockResolvedValueOnce(draft());
    const result=await confirmChat2V2Upload(owner,room,mediaId);
    expect(result).toEqual({mediaId,status:"READY"});
    expect(mocks.updateMany.mock.calls[0]?.[0]).toMatchObject({
      where:{status:"CLIENT_PROCESSING",attemptToken:"lost-ack"},
      data:{status:"AWAITING_UPLOAD",attemptToken:null,leaseUntil:null},
    });
    expect(mocks.copy).toHaveBeenCalledOnce();
  });
  it("refuses a concurrent active lease without issuing a second S3 copy",async()=>{
    mocks.findFirst.mockResolvedValueOnce({...draft(),status:"CLIENT_PROCESSING",
      attemptToken:"other-confirm",leaseUntil:new Date(Date.now()+120000)});
    await expect(confirmChat2V2Upload(owner,room,mediaId))
      .rejects.toMatchObject({code:"MEDIA_V2_INVALID_STATUS"});
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.copy).not.toHaveBeenCalled();
  });
  it("failure to validate S3 MP4 resets CLIENT_PROCESSING without claiming READY",async()=>{
    mocks.copy.mockRejectedValueOnce(Error("CLIENT_VIDEO_MP4_UNSUPPORTED"));
    await expect(confirmChat2V2Upload(owner,room,mediaId))
      .rejects.toMatchObject({code:"MEDIA_V2_CLIENT_VIDEO_UNVERIFIED"});
    expect(mocks.updateMany).toHaveBeenCalledTimes(2);
    const reset=mocks.updateMany.mock.calls[1]?.[0];
    expect(reset).toMatchObject({where:{status:"CLIENT_PROCESSING"},
      data:{status:"AWAITING_UPLOAD",attemptToken:null,leaseUntil:null}});
  });
});

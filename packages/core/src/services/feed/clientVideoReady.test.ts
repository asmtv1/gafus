import {describe,expect,it,vi} from "vitest";
import {createFeedService} from "./service";

function harness(options:{mime?:string; failCopy?:boolean}={}){
  const source="posts/user1/post1/incoming/upload1/source.mp4";
  const final="media/v2/media1/v1/video/720.mp4";
  const poster=final.replace(/video\/720\.mp4$/,"poster.webp");
  const etag='"s3-original"';
  const row={id:"upload1",postId:"post1",ownerId:"user1",mediaId:"media1",
    sourceKey:source,status:"reserved",purpose:"post",declaredMime:options.mime??"video/mp4",
    declaredBytes:90_000,postExpiresAt:new Date(Date.now()+120_000),
    reservationExpiresAt:new Date(Date.now()+120_000),sourceETag:null,
    attemptToken:null as string|null,leaseUntil:null as Date|null,errorCode:null};
  const media={id:"media1",status:"reserved",mp4Keys:[] as string[],posterKey:null as string|null,
    width:null as number|null,height:null as number|null,durationSeconds:null as number|null};
  let copied=false;
  const jobs:Record<string,{kind:string;sourceKeys:string[];targetKeys?:string[];status:string}>={};
  const upsert=vi.fn(async({where,create}:{where:{dedupeKey:string};create:{kind:string;sourceKeys:string[];
    targetKeys?:string[]}})=>{
    jobs[where.dedupeKey]??={...create,status:"pending"};
    return jobs[where.dedupeKey];
  });
  const tx={
    $queryRaw:vi.fn(async()=>[{id:"post1"}]),
    feedPost:{findFirst:vi.fn(async()=>({id:"post1",authorId:"user1",deletedAt:null,
      moderationState:"visible",status:"draft"}))},
    feedUpload:{
      findUnique:vi.fn(async()=>({...row})),
      update:vi.fn(async({data}:{data:Record<string,unknown>})=>{Object.assign(row,data);return {...row};}),
      updateMany:vi.fn(async({where,data}:{where:{status?:string;attemptToken?:string};data:Record<string,unknown>})=>{
        if(where.status&&where.status!==row.status)return {count:0};
        if(where.attemptToken&&where.attemptToken!==row.attemptToken)return {count:0};
        Object.assign(row,data);return {count:1};
      }),
    },
    feedMediaAsset:{
      update:vi.fn(async({data}:{data:Record<string,unknown>})=>{Object.assign(media,data);return {...media};}),
      updateMany:vi.fn(async({where,data}:{where:{status?:string};data:Record<string,unknown>})=>{
        if(where.status&&where.status!==media.status)return {count:0};
        Object.assign(media,data);return {count:1};
      }),
    },
    feedStorageJob:{
      upsert,
      updateMany:vi.fn(async({where,data}:{where:{dedupeKey:string;status:string};data:{status:string}})=>{
        const job=jobs[where.dedupeKey];
        if(!job||job.status!==where.status)return {count:0};
        job.status=data.status;return {count:1};
      }),
    },
  };
  const db={user:{findUnique:vi.fn(async()=>({id:"user1"}))},
    feedUpload:{findFirst:vi.fn(async()=>({...row}))},
    $transaction:vi.fn(async(fn:(tx:unknown)=>Promise<unknown>)=>fn(tx)),
  };
  const storage={enabled:true,signClientVideoPoster:vi.fn(async()=>({
    url:"https://s3.cloud.ru/private",fields:{key:"poster.webp"}})),
    head:vi.fn(async(key:string)=>key===source||key===final&&copied
      ? {contentType:row.declaredMime,bytes:row.declaredBytes,etag}:
        key===poster&&copied?{contentType:"image/webp",bytes:1024,etag}:null),
    publishClientVideo:vi.fn(async()=>{
      if(options.failCopy)throw Error("S3_COPY_FAILED");
      copied=true;return {width:1280,height:720,durationSeconds:25};
    }),
  };
  return {service:createFeedService({db:db as never,storage:storage as never,enabled:()=>true}),
    storage,tx,row,media,upsert,jobs,source,final,poster};
}

describe("Moments API-first ready H.264 720p, background 360 Cloud.ru",()=>{
  it("commits immutable 720p READY and enqueues ONLY optional 360p, idempotently",async()=>{
    const h=harness();
    const answer=await h.service.completeUpload("user1","upload1");
    expect(answer).toMatchObject({status:"ready",kind:"video",mediaId:"media1"});
    expect(h.storage.publishClientVideo).toHaveBeenCalledWith({
      sourceKey:h.source,finalKey:h.final,posterKey:h.poster,bytes:90_000});
    expect(h.media).toMatchObject({status:"ready",width:1280,height:720,
      durationSeconds:25,mp4Keys:[h.final],posterKey:h.poster});
    expect(h.jobs["feed-video-360:media1"]).toMatchObject({
      kind:"publish_video",sourceKeys:[h.final],
      targetKeys:["media/v2/media1/v1/video/360.mp4"],status:"pending"});
    expect(h.jobs["feed-client-video-final-guard:upload1"]?.status).toBe("completed");
    expect(h.jobs["feed-client-video-source-cleanup:upload1"]?.status).toBe("pending");
    expect(Object.values(h.jobs).filter(job=>job.kind==="publish_video")).toHaveLength(1);
    expect(await h.service.completeUpload("user1","upload1")).toMatchObject({status:"ready"});
    expect(h.storage.publishClientVideo).toHaveBeenCalledTimes(1);
    expect(h.upsert).toHaveBeenCalledTimes(3);
  });
  it("does not report READY if the client's poster is absent or unverified in S3",async()=>{
    const h=harness();
    h.storage.head.mockImplementation(async key=>key===h.source||key===h.final
      ? {contentType:"video/mp4",bytes:90_000,etag:'"original"'}:null);
    await expect(h.service.completeUpload("user1","upload1"))
      .rejects.toMatchObject({status:422});
    expect(h.row.status).toBe("reserved");
    expect(h.media.status).toBe("reserved");
    expect(h.jobs["feed-video-360:media1"]).toBeUndefined();
  });
  it("signs only an owner-derived private WebP cover key, never a public final URL",async()=>{
    const h=harness();
    const signer=vi.fn(async()=>({url:"https://s3.cloud.ru/private",
      fields:{key:h.source.replace(/source\.mp4$/,"poster.webp")}}));
    h.storage.signClientVideoPoster=signer;
    const form=await h.service.reserveClientVideoPoster("user1","upload1");
    expect(form).toMatchObject({method:"POST",fields:{key:
      "posts/user1/post1/incoming/upload1/poster.webp"}});
    expect(signer).toHaveBeenCalledWith({sourceKey:h.source,
      expiresAt:expect.any(Date)});
    expect(h.jobs["feed-client-video-staging:upload1"]?.sourceKeys).toEqual([
      "posts/user1/post1/incoming/upload1/poster.webp"]);
  });
  it("fails closed on non-MP4 while leaving unrelated uploads alone",async()=>{
    const h=harness({mime:"video/quicktime"});
    await expect(h.service.completeUpload("user1","upload1"))
      .rejects.toMatchObject({status:410});
    expect(h.storage.publishClientVideo).not.toHaveBeenCalled();
    expect(h.upsert).not.toHaveBeenCalled();
    expect(h.media.status).toBe("reserved");
  });
  it("resets an unsuccessful server-side S3 copy to retryable RESERVED, never READY",async()=>{
    const h=harness({failCopy:true});
    await expect(h.service.completeUpload("user1","upload1"))
      .rejects.toThrow("S3_COPY_FAILED");
    expect(h.row.status).toBe("reserved");
    expect(h.media.status).toBe("reserved");
    expect(h.jobs["feed-video-360:media1"]).toBeUndefined();
    expect(h.jobs["feed-client-video-final-guard:upload1"]?.status).toBe("pending");
  });
});

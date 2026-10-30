import { beforeEach,afterEach,describe,expect,it } from "vitest";
import { randomUUID } from "node:crypto";
import { questionsV2PresignedPost,questionsV2Marker,
  questionsV2SignedRead,questionsV2PublicDelivery,questionsV2Storage } from "./questionsV2Media";

const old:Record<string,string|undefined>={};
const changed={
  GAFUS_LOCAL_ISOLATED_API:"1",
  QUESTIONS_V2_MEDIA_ENABLED:"true",
  QUESTIONS_V2_PUBLIC_BUCKET_VERIFIED:"true",
  QUESTIONS_V2_S3_ENDPOINT:"http://127.0.0.1:9000",
  QUESTIONS_V2_S3_BUCKET:"gafus-refactor-questions-test",
  QUESTIONS_V2_S3_ACCESS_KEY_ID:"synthetic-local-only",
  QUESTIONS_V2_S3_SECRET_ACCESS_KEY:"synthetic-local-only-password",
};
beforeEach(()=>{
  for(const [k,v] of Object.entries(changed)){
    old[k]=process.env[k];process.env[k]=v;
  }
});
afterEach(()=>{
  for(const k of Object.keys(changed)){
    if(old[k]===undefined)delete process.env[k];
    else process.env[k]=old[k];
  }
});
describe("Questions V2 signed S3 forms, no network",()=>{
  const sourceKey=()=> "questions/v2/owner1/"+randomUUID()+"/incoming/source.jpg";
  it("signs only a bounded POST with multipart envelope overhead and exact object MIME",async()=>{
    const key=sourceKey();
    const receipt=await questionsV2PresignedPost(key,"image/jpeg",1024);
    expect(receipt.url).toContain("gafus-refactor-questions-test");
    const policy=JSON.parse(Buffer.from(receipt.fields.Policy!,"base64").toString("utf8")) as {
      conditions:unknown[];
    };
    expect(policy.conditions).toContainEqual(["content-length-range",1024,1024+24*1024]);
    expect(policy.conditions).toContainEqual(["eq","$Content-Type","image/jpeg"]);
    expect(policy.conditions).toContainEqual(["eq","$key",key]);
    expect(receipt.fields.success_action_status).toBe("204");
  });
  it("reuses exactly the current Cloud.ru public Questions bucket and its policy-covered path",async()=>{
    const saved={endpoint:process.env.QUESTIONS_V2_S3_ENDPOINT,
      bucket:process.env.QUESTIONS_V2_S3_BUCKET};
    try{
      process.env.QUESTIONS_V2_S3_ENDPOINT="https://s3.cloud.ru";
      process.env.QUESTIONS_V2_S3_BUCKET="gafus-questions-public";
      const cloudForm=await questionsV2PresignedPost(sourceKey(),"image/jpeg",512);
      expect(cloudForm.url).toBe("https://gafus-questions-public.s3.cloud.ru/");
      const medium="questions/uploads/questions/v2/owner1/"+randomUUID()+"/v1/image/m.webp";
      expect(await questionsV2SignedRead(questionsV2Marker(medium)))
        .toBe("https://gafus-questions-public.s3.cloud.ru/"+medium);
      const source=sourceKey();
      expect(()=>questionsV2Marker(source)).toThrow();
      await expect(questionsV2SignedRead("questions-v2:"+source)).rejects.toThrow();
      for(const bucket of ["gafus-questions-v2-private","gafus-feed-private","gafus-questions-other"]){
        process.env.QUESTIONS_V2_S3_BUCKET=bucket;
        expect(()=>questionsV2Storage()).toThrow("PUBLIC_STORAGE_NOT_CONFIGURED");
      }
    }finally{
      if(saved.endpoint===undefined)delete process.env.QUESTIONS_V2_S3_ENDPOINT;
      else process.env.QUESTIONS_V2_S3_ENDPOINT=saved.endpoint;
      if(saved.bucket===undefined)delete process.env.QUESTIONS_V2_S3_BUCKET;
      else process.env.QUESTIONS_V2_S3_BUCKET=saved.bucket;
    }
  });
  it("does not expose arbitrary legacy Questions keys as V2 public variants",async()=>{
    for(const location of ["questions-v2:questions/uploads/questions/photo.jpg",
      "questions-v2:questions/uploads/questions/v2/owner1/fake/v1/image/m.webp",
      "questions-v2:questions/uploads/questions/v2/owner1/"+randomUUID()+"/incoming/source.jpg"]){
      await expect(questionsV2SignedRead(location)).rejects.toThrow();
    }
  });
  it("delivers CDN first with the exact public S3 key as fallback",()=>{
    const saved=process.env.QUESTIONS_V2_CDN_BASE_URL;
    const savedEndpoint=process.env.QUESTIONS_V2_S3_ENDPOINT;
    const savedBucket=process.env.QUESTIONS_V2_S3_BUCKET;
    const key="questions/uploads/questions/v2/owner1/"+randomUUID()+"/v1/image/m.webp";
    try {
      process.env.QUESTIONS_V2_CDN_BASE_URL="https://questions-example.begetcdn.cloud";
      const delivery=questionsV2PublicDelivery(questionsV2Marker(key));
      expect(delivery.url).toBe("https://questions-example.begetcdn.cloud/"+key);
      expect(delivery.fallbackUrl).toBe("https://gafus-questions-public.s3.cloud.ru/"+key);
      process.env.QUESTIONS_V2_CDN_BASE_URL="https://example.org";
      expect(()=>questionsV2PublicDelivery(questionsV2Marker(key))).toThrow("INVALID_CDN_ORIGIN");
      delete process.env.QUESTIONS_V2_CDN_BASE_URL;
      // The isolated MinIO test retains its original non-CDN behavior.
      expect(questionsV2PublicDelivery(questionsV2Marker(key))).toEqual({
        url:"https://gafus-questions-public.s3.cloud.ru/"+key,
      });
      // Production Cloud.ru uses the already-provisioned CDN even when an API
      // launch script did not explicitly load an .env.local file.
      process.env.QUESTIONS_V2_S3_ENDPOINT="https://s3.cloud.ru";
      process.env.QUESTIONS_V2_S3_BUCKET="gafus-questions-public";
      const primary=questionsV2PublicDelivery(questionsV2Marker(key));
      expect(primary.url).toBe("https://ebiteskukingusk.begetcdn.cloud/"+key);
      expect(primary.fallbackUrl).toBe("https://gafus-questions-public.s3.cloud.ru/"+key);
      // Deliberately turning off the CDN is still possible for rollback.
      process.env.QUESTIONS_V2_CDN_BASE_URL="";
      expect(questionsV2PublicDelivery(questionsV2Marker(key)).url)
        .toBe("https://gafus-questions-public.s3.cloud.ru/"+key);
    } finally {
      if(saved===undefined)delete process.env.QUESTIONS_V2_CDN_BASE_URL;
      else process.env.QUESTIONS_V2_CDN_BASE_URL=saved;
      if(savedEndpoint===undefined)delete process.env.QUESTIONS_V2_S3_ENDPOINT;
      else process.env.QUESTIONS_V2_S3_ENDPOINT=savedEndpoint;
      if(savedBucket===undefined)delete process.env.QUESTIONS_V2_S3_BUCKET;
      else process.env.QUESTIONS_V2_S3_BUCKET=savedBucket;
    }
  });
  it("denies chat/feed or arbitrary incoming formats and never signs source GET",async()=>{
    await expect(questionsV2PresignedPost("chat2/foreign","image/jpeg",300)).rejects.toThrow();
    await expect(questionsV2PresignedPost(sourceKey(),"video/mp4",300)).rejects.toThrow();
    expect(()=>questionsV2Marker(sourceKey())).toThrow();
    await expect(questionsV2SignedRead("questions-v2:"+sourceKey())).rejects.toThrow();
  });
});

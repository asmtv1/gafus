import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  questionsV2SourceKey, questionsV2FinalKeys, questionsV2ValidateJob,
  questionsV2ValidateManifest, questionsV2CheckSource,
} from "./questions-v2.js";

describe("Questions image-only V2 contract", () => {
  const ownerId="owner_1",mediaId=randomUUID(),sourceMime="image/jpeg" as const;
  const sourceKey=questionsV2SourceKey(ownerId,mediaId,sourceMime);
  const job={ownerId,mediaId,sourceMime,sourceBytes:1024,sourceKey};
  const keys=questionsV2FinalKeys(ownerId,mediaId);
  const small={key:keys.small,width:360,height:576,bytes:200};
  const medium={key:keys.medium,width:720,height:1152,bytes:550};
  it("uses owner/media scoped incoming and immutable V1 image-only variants",()=>{
    expect(sourceKey).toBe("questions/v2/"+ownerId+"/"+mediaId+"/incoming/source.jpg");
    expect(Object.values(keys)).toHaveLength(2);
    expect(keys.small).toBe("questions/uploads/questions/v2/"+ownerId+"/"+mediaId+"/v1/image/s.webp");
    expect(keys.medium).toBe("questions/uploads/questions/v2/"+ownerId+"/"+mediaId+"/v1/image/m.webp");
    expect(sourceKey).not.toContain("questions/uploads/questions/");
    expect(()=>questionsV2ValidateJob(job)).not.toThrow();
    expect(()=>questionsV2ValidateJob({...job,sourceKey:"chat2/other"})).toThrow();
    expect(()=>questionsV2CheckSource("video/mp4",500)).toThrow();
    expect(()=>questionsV2CheckSource("image/png",10*1024*1024+1)).toThrow();
  });
  it("preserves real portrait width and height, never allows a width over 720",()=>{
    expect(()=>questionsV2ValidateManifest(job,{kind:"image",variants:{small,medium}})).not.toThrow();
    expect(()=>questionsV2ValidateManifest(job,{kind:"image",variants:{
      small,medium:{...medium,width:721}}})).toThrow();
  });
  it("uses the small rendition for tiny photos but denies forged key aliases",()=>{
    const tiny={key:keys.small,width:180,height:280,bytes:130};
    expect(()=>questionsV2ValidateManifest(job,{kind:"image",variants:{
      small:tiny,medium:{...tiny}}})).not.toThrow();
    expect(()=>questionsV2ValidateManifest(job,{kind:"image",variants:{
      small:tiny,medium:{...tiny,height:281}}})).toThrow();
    expect(()=>questionsV2ValidateManifest(job,{kind:"image",variants:{
      small:{...tiny,key:"questions/v2/another"},medium:{...tiny}}})).toThrow();
  });
});

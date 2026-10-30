import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { questionsV2SourceKey, type QuestionsV2Job } from "@gafus/feed-cloud";
import { processQuestionsV2Photo } from "./questions-v2-processor";

function job(bytes: Uint8Array, sourceMime:"image/png"|"image/jpeg"|"image/webp"="image/png"): QuestionsV2Job {
  const mediaId = randomUUID(), ownerId = "owner_1";
  return {mediaId,ownerId,sourceMime,sourceBytes:bytes.length,
    sourceKey:questionsV2SourceKey(ownerId,mediaId,sourceMime)};
}
describe("Questions photo-only Sharp job", () => {
  it("makes width-only vertical WebP variants, one GET and two PUTs", async () => {
    const source = await sharp({create:{width:800,height:1280,channels:3,background:"#ffaa00"}}).png().toBuffer();
    const input=job(source);
    const created=new Map<string,Uint8Array>();
    const downloadSource=vi.fn(async()=>source);
    const createWebp=vi.fn(async(key:string,bytes:Uint8Array)=>{created.set(key,bytes);});
    const result=await processQuestionsV2Photo(input,{downloadSource,createWebp},new AbortController().signal);
    expect(downloadSource).toHaveBeenCalledTimes(1);
    expect(createWebp).toHaveBeenCalledTimes(2);
    expect(result.variants.small.width).toBe(360);
    expect(result.variants.medium.width).toBe(720);
    expect(result.variants.small.height).toBe(576);
    expect(result.variants.medium.height).toBe(1152);
    for(const bytes of created.values()){
      const m=await sharp(bytes).metadata();
      expect(m.format).toBe("webp");
      expect(m.exif).toBeUndefined();
    }
  });
  it("auto-orients JPEG EXIF, strips metadata and GPS from both WebPs",async()=>{
    const image=sharp({create:{width:800,height:1280,channels:3,background:"#bbaa11"}});
    const source=await image.jpeg().withMetadata({orientation:6}).withExif({
      GPS:{GPSLatitudeRef:"N",GPSLatitude:"55/1,45/1,0/1",
        GPSLongitudeRef:"E",GPSLongitude:"37/1,37/1,0/1"},
    }).toBuffer();
    expect((await sharp(source).metadata()).orientation).toBe(6);
    const results=new Map<string,Uint8Array>();
    const input=job(source,"image/jpeg");
    const manifest=await processQuestionsV2Photo(input,{
      downloadSource:async()=>source,
      createWebp:async(key,bytes)=>{results.set(key,bytes);},
    },new AbortController().signal);
    expect(manifest.variants.small.width).toBe(360);
    expect(manifest.variants.small.height).toBe(225);
    expect(manifest.variants.medium.width).toBe(720);
    expect(manifest.variants.medium.height).toBe(450);
    for(const result of results.values()){
      const m=await sharp(result).metadata();
      expect(m.format).toBe("webp");
      expect(m.exif).toBeUndefined();
      expect(m.orientation).toBeUndefined();
    }
  });
  it("rejects corrupted image contents even if filename/Content-Type claim looks supported",async()=>{
    const source=new Uint8Array(512);
    await expect(processQuestionsV2Photo(job(source,"image/jpeg"),{
      downloadSource:async()=>source,createWebp:async()=>{},
    },new AbortController().signal)).rejects.toThrow();
  });
  it("does not upscale or upload duplicate WebP for a tiny image", async () => {
    const source=await sharp({create:{width:150,height:200,channels:3,background:"#000fff"}}).png().toBuffer();
    const createWebp=vi.fn(async()=>{});
    const result=await processQuestionsV2Photo(job(source),
      {downloadSource:async()=>source,createWebp},new AbortController().signal);
    expect(createWebp).toHaveBeenCalledTimes(1);
    expect(result.variants.small.key).toBe(result.variants.medium.key);
    expect(result.variants.small.width).toBe(150);
  });
  it("rejects a file forged with a PNG MIME and JPEG contents", async () => {
    const source=await sharp({create:{width:100,height:100,channels:3,background:"#000"}}).jpeg().toBuffer();
    await expect(processQuestionsV2Photo(job(source),
      {downloadSource:async()=>source,createWebp:async()=>{}},new AbortController().signal))
      .rejects.toThrow("QUESTIONS_V2_SOURCE_CONTENT_REJECTED");
  });
});

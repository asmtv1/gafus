import { describe, expect, it } from "vitest";
import type { QuestionPhotoDto } from "@gafus/types";
import { questionPhotoPreviewSource } from "./photoPreviewSource";

const photo: QuestionPhotoDto = {
  id:"photo-id", url:"https://cdn.example/v1/image/m.webp",
  smallUrl:"https://cdn.example/v1/image/s.webp",
  fallbackUrl:"https://s3.example/v1/image/m.webp",
  fallbackSmallUrl:"https://s3.example/v1/image/s.webp",
  width:720, height:1280, smallWidth:270, smallHeight:480, status:"READY",
};
describe("Questions and answers image preview resolution",()=>{
  it("always uses the main rendition for a single photo, even when a small is present",()=>{
    expect(questionPhotoPreviewSource(photo,320,3,true)).toEqual({
      url:photo.url,fallbackUrl:photo.fallbackUrl,variant:"medium",
    });
  });
  it("only uses a small rendition if it has enough pixels for the exact cell size and DPR",()=>{
    expect(questionPhotoPreviewSource(photo,90,3,false).variant).toBe("small");
    expect(questionPhotoPreviewSource(photo,91,3,false).variant).toBe("medium");
    expect(questionPhotoPreviewSource(photo,130,2,false).variant).toBe("small");
    expect(questionPhotoPreviewSource(photo,130,3,false).variant).toBe("medium");
  });
  it("does not upscale old thumbnails with unknown dimensions",()=>{
    expect(questionPhotoPreviewSource({...photo,smallWidth:undefined},90,3,false).variant).toBe("medium");
    expect(questionPhotoPreviewSource({...photo,smallUrl:undefined},90,3,false).variant).toBe("medium");
  });
  it("pairs the correct CDN variant with its matching S3 fallback",()=>{
    const small=questionPhotoPreviewSource(photo,70,3,false);
    expect(small.url).toBe(photo.smallUrl);
    expect(small.fallbackUrl).toBe(photo.fallbackSmallUrl);
    const medium=questionPhotoPreviewSource(photo,230,3,false);
    expect(medium.url).toBe(photo.url);
    expect(medium.fallbackUrl).toBe(photo.fallbackUrl);
  });
  it("handles invalid pixel density without selecting a blurry thumbnail",()=>{
    expect(questionPhotoPreviewSource(photo,160,NaN,false).variant).toBe("medium");
    expect(questionPhotoPreviewSource(photo,160,0,false).variant).toBe("medium");
  });
});

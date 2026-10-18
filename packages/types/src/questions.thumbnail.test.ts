import {describe, it, expect} from "vitest";
import {questionThumbnailUrl} from "./questions";
const path="/questions/uploads/questions/owner-1/photo-2/full.webp";
describe("Questions trusted thumbnail resolver",()=>{
  it("resolves only the new CDN and Cloud.ru S3 trusted final path",()=>{
    expect(questionThumbnailUrl("https://ebiteskukingusk.begetcdn.cloud"+path))
      .toBe("https://ebiteskukingusk.begetcdn.cloud"+path.replace("full.webp","thumb.webp"));
    expect(questionThumbnailUrl("https://gafus-questions-public.s3.cloud.ru"+path))
      .toBe("https://gafus-questions-public.s3.cloud.ru"+path.replace("full.webp","thumb.webp"));
  });
  it("does not mutate foreign or legacy media",()=>{
    for(const url of ["https://evil.test"+path,"https://storage.yandexcloud.net/gafus-media/uploads/questions/o/a.jpg",
      "https://ebiteskukingusk.begetcdn.cloud"+path+"?token=x",
      "https://ebiteskukingusk.begetcdn.cloud/questions/uploads/questions/owner-1/../../secret/full.webp"])
      expect(questionThumbnailUrl(url)).toBe(url);
  });
});

import { describe,expect,it } from "vitest";
import { classifyQuestionNativePhoto } from "./photoSource";

describe("Questions native image-only source classification",()=>{
  it("preserves original supported JPG/PNG/WebP without extra JPEG compression",()=>{
    expect(classifyQuestionNativePhoto({mimeType:"image/jpeg",fileName:"photo.jpg"}))
      .toBe("image/jpeg");
    expect(classifyQuestionNativePhoto({mimeType:"image/png",fileName:"photo.png"}))
      .toBe("image/png");
    expect(classifyQuestionNativePhoto({mimeType:"image/webp",fileName:"photo.webp"}))
      .toBe("image/webp");
    expect(classifyQuestionNativePhoto({mimeType:"",fileName:"IMG_123.jpeg"}))
      .toBe("image/jpeg");
  });
  it("converts only HEIC/HEIF to a supported JPEG source",()=>{
    expect(classifyQuestionNativePhoto({mimeType:"image/heic"})).toBe("convert-heic");
    expect(classifyQuestionNativePhoto({fileName:"IMG.HEIF"})).toBe("convert-heic");
  });
  it("rejects GIF, video and unknown formats before contacting S3",()=>{
    expect(()=>classifyQuestionNativePhoto({mimeType:"image/gif",fileName:"photo.gif"})).toThrow();
    expect(()=>classifyQuestionNativePhoto({mimeType:"video/mp4"})).toThrow();
    expect(()=>classifyQuestionNativePhoto({})).toThrow();
  });
});

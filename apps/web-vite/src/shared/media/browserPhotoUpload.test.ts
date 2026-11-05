// @vitest-environment jsdom
import{afterEach,describe,expect,it,vi}from"vitest";
import{browserPhotoPostUrl}from"./browserPhotoUpload";
afterEach(()=>vi.unstubAllGlobals());
function post(bucket:string){return{method:"POST"as const,url:`https://s3.cloud.ru/${bucket}`,
  fields:{key:"synthetic/one.webp",policy:"signed"}};}
describe("photo S3 signed uploads never permit bucket swaps",()=>{
  it("accepts the four exact GAFUS photo buckets",()=>{
    expect(browserPhotoPostUrl(post("gafus-feed-private"),"feed")).toContain("s3.cloud.ru");
    expect(browserPhotoPostUrl(post("gafus-gallery-private"),"gallery"))
      .toBe("/__cloudru-upload/gallery");
    expect(browserPhotoPostUrl(post("gafus-questions-public"),"questions"))
      .toBe("https://s3.cloud.ru/gafus-questions-public");
    expect(browserPhotoPostUrl(post("gafus-chat2-media-2026"),"chat2"))
      .toBe("https://s3.cloud.ru/gafus-chat2-media-2026");
  });
  it("rejects user credentials, foreign buckets, query strings and unsafe origins",()=>{
    expect(()=>browserPhotoPostUrl(post("gafus-gallery-private"),"questions"))
      .toThrow("другой S3-бакет");
    expect(()=>browserPhotoPostUrl({...post("gafus-chat2-media-2026"),
      url:"https://s3.cloud.ru/gafus-chat2-media-2026?debug=1"},"chat2"))
      .toThrow("другой S3-бакет");
    expect(()=>browserPhotoPostUrl({...post("gafus-feed-private"),
      url:"https://user:secret@s3.cloud.ru/gafus-feed-private"},"feed"))
      .toThrow("Небезопасный");
    expect(()=>browserPhotoPostUrl({...post("gafus-feed-private"),
      url:"https://evil.test/"},"feed"))
      .toThrow("Небезопасный");
  });
});

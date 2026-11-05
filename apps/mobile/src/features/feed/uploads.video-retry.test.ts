// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks=vi.hoisted(()=>({
  prepare:vi.fn(),poster:vi.fn(),reserve:vi.fn(),complete:vi.fn(),
  photo:vi.fn(),variants:vi.fn(),signed:vi.fn(),post:vi.fn(),
  cover:vi.fn(),sent:vi.fn(),dispose:vi.fn(),coverDispose:vi.fn(),
}));
vi.mock("@/shared/lib/tracer",()=>({reportClientError:vi.fn()}));
vi.mock("expo-crypto",()=>({randomUUID:()=>"video-uuid"}));
vi.mock("expo-image-picker",()=>({}));
vi.mock("expo-camera",()=>({Camera:{}}));
vi.mock("expo-file-system",()=>({File:class {
  uri:string;exists=true;size:number;
  constructor(uri:string){this.uri=uri;this.size=uri.includes("compressed")?1300:2200;}
  delete() {mocks.dispose();}
}}));
vi.mock("./videoPoster",()=>({makeFeedVideoPoster:mocks.poster}));
vi.mock("@/shared/lib/media/prepareUploadVideo720",()=>({prepareUploadVideo720:mocks.prepare}));
vi.mock("@/shared/lib/media/prepareUploadPhoto",()=>({prepareUploadPhoto:mocks.photo}));
vi.mock("@/shared/lib/media/prepareUploadWebp",()=>({prepareUploadWebpVariants:mocks.variants}));
vi.mock("@/shared/lib/media/directPhotoUpload",()=>({postClientWebp:mocks.post}));
vi.mock("@/shared/lib/media/prepareVideoPosterWebp",()=>({prepareVideoPosterWebp:mocks.cover}));
vi.mock("@/shared/lib/api/feed",()=>({feedApi:{reserveUpload:mocks.reserve,completeUpload:mocks.complete},
  feedTransport:mocks.signed}));

import { prepareFeedPickedMedia, ensureFeedVideoPrepared, uploadPickedFeedMedia, releaseFeedPickedMedia } from "./uploads";

beforeEach(()=>{
  Object.values(mocks).forEach(value=>value.mockReset());
  mocks.poster.mockResolvedValue("file:///poster.jpg");
  mocks.reserve.mockResolvedValue({uploadId:"up-1",mediaId:"media-1",status:"reserved",
    postUrl:"https://s3.cloud.ru/presigned-post",postFields:{key:"source"}});
  mocks.complete.mockResolvedValue({mediaId:"media-1",status:"ready"});
  mocks.cover.mockResolvedValue({uri:"file:///poster.webp",width:480,height:270,
    mime:"image/webp",bytes:800,dispose:mocks.coverDispose});
  mocks.signed.mockResolvedValue({method:"POST",url:"https://s3.cloud.ru/gafus-feed-private",
    fields:{key:"posts/user/post/incoming/upload/poster.webp"}});
  vi.stubGlobal("FormData",class {append(){return undefined;}});
  vi.stubGlobal("XMLHttpRequest",class {
    status=204;upload={onprogress:null};onload?:()=>void;onerror?:()=>void;
    timeout=0;
    open(method:string,url:string){mocks.sent(method,url);}
    send(){this.onload?.();}
  });
});

describe("Mobile Moments original video retry without Cloud Job",()=>{
  it("prepares the selected video immediately without reserving S3 and retries only a failed encode", async () => {
    const original={type:"video",uri:"file:///original.mov",mimeType:"video/quicktime",
      fileName:"original.mov",width:1920,height:1080};
    mocks.prepare.mockResolvedValueOnce(null);
    const picked=await prepareFeedPickedMedia(original as never);
    expect(picked).toMatchObject({kind:"video",uri:"file:///original.mov",
      previewUri:"file:///poster.jpg",sourceVideo:original});
    expect(mocks.prepare).toHaveBeenCalledOnce();
    await expect(picked.videoPreparation).rejects.toThrow("MP4 H.264");
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.post).not.toHaveBeenCalled();

    mocks.prepare.mockResolvedValueOnce({uri:"file:///compressed.mp4",bytes:1300,
      mime:"video/mp4",dispose:mocks.dispose});
    await expect(uploadPickedFeedMedia("post-1",picked)).resolves.toBe("media-1");
    expect(mocks.prepare).toHaveBeenCalledTimes(2);
    expect(mocks.prepare.mock.calls[1]?.[0]).toBe(original);
    expect(mocks.reserve).toHaveBeenCalledOnce();
    expect(mocks.reserve.mock.calls[0]?.[1]).toMatchObject({declaredMime:"video/mp4",
      declaredBytes:1300,kind:"video"});
    expect(mocks.sent).toHaveBeenCalledWith("POST","https://s3.cloud.ru/presigned-post");
    expect(mocks.cover).toHaveBeenCalledWith("file:///compressed.mp4","file:///poster.jpg");
    expect(mocks.post).toHaveBeenCalledOnce();
    releaseFeedPickedMedia(picked);
    expect(mocks.dispose).toHaveBeenCalledOnce();
    expect(mocks.coverDispose).toHaveBeenCalledOnce();
  });
  it("reuses the locally encoded video and poster when publish happens after preparation",async()=>{
    const prepared={uri:"file:///compressed.mp4",bytes:1300,
      mime:"video/mp4",dispose:mocks.dispose};
    mocks.prepare.mockResolvedValue(prepared);
    const picked=await prepareFeedPickedMedia({type:"video",uri:"file:///original.mov",
      fileName:"original.mov",mimeType:"video/quicktime",width:1280,height:720} as never);
    await ensureFeedVideoPrepared(picked);
    expect(mocks.prepare).toHaveBeenCalledOnce();
    expect(mocks.cover).toHaveBeenCalledOnce();
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.sent).not.toHaveBeenCalled();
    await uploadPickedFeedMedia("post-1",picked);
    expect(mocks.prepare).toHaveBeenCalledOnce();
    expect(mocks.cover).toHaveBeenCalledOnce();
    expect(mocks.reserve).toHaveBeenCalledOnce();
    releaseFeedPickedMedia(picked);
  });
});

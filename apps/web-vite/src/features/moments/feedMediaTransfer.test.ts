// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../../shared/media/browserPhotoWebp",()=>({
  prepareBrowserPhotoWebp:vi.fn(async()=>({
    small:{file:new File([new Uint8Array(120)],"small.webp",{type:"image/webp"}),width:360,height:270},
    medium:{file:new File([new Uint8Array(240)],"medium.webp",{type:"image/webp"}),width:720,height:540},
    large:{file:new File([new Uint8Array(480)],"large.webp",{type:"image/webp"}),width:1440,height:1080},
  })),
}));
vi.mock("../../shared/media/browserVideoPoster",()=>({
  prepareBrowserVideoPoster:vi.fn(async()=>new File([new Uint8Array(512)],
    "poster.webp",{type:"image/webp"})),
}));
vi.mock("../../shared/media/browserPhotoUpload",()=>({
  uploadBrowserPhotoWebp:vi.fn(async()=>undefined),
}));
import {
  prepareMomentPhotoBeforePublish, uploadMomentPhoto, uploadMomentVideo, validateMomentPhoto,
  validateMomentVideo,
} from "./feedMediaTransfer";
import { uploadBrowserPhotoWebp } from "../../shared/media/browserPhotoUpload";
import { prepareBrowserPhotoWebp } from "../../shared/media/browserPhotoWebp";
import { prepareBrowserVideoPoster } from "../../shared/media/browserVideoPoster";

const UUID = "550e8400-e29b-41d4-a716-446655440000";
const file = new File(["image-bytes"], "friend.webp", { type: "image/webp" });
const ticket = {
  uploadId: "upload-1", postId: "post-1", mediaId: "media-1",
  kind: "photo", status: "reserved",
  postUrl: "https://example-storage.invalid/bucket",
  postFields: { key: "only-this-key", "Content-Type": "image/webp" },
  urlExpiresAt: "2099-12-30T00:00:00.000Z",
};
const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ success: status === 200, data }), { status });

function xhr(success = true) {
  const requests: {
    method: string; url: string; withCredentials: boolean; data?: FormData;
  }[] = [];
  class FakeXHR {
    upload = { onprogress: null as ((event: ProgressEvent) => void) | null };
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    ontimeout: (() => void) | null = null;
    timeout = 0;
    withCredentials = false;
    status = success ? 204 : 503;
    index = -1;
    open(method: string, url: string) {
      requests.push({ method, url, withCredentials: false });
      this.index = requests.length - 1;
    }
    send(data: FormData) {
      requests[this.index] = {
        ...requests[this.index]!, data,
        withCredentials: this.withCredentials,
      };
      this.upload.onprogress?.({
        lengthComputable: true, loaded: 50, total: 100,
      } as ProgressEvent);
      this.onload?.();
    }
  }
  vi.stubGlobal("XMLHttpRequest", FakeXHR);
  return requests;
}
function stubVerifiedMp4() {
  // Upload contract tests use a synthetic, not actually encoded MP4.
  vi.stubGlobal("VideoDecoder",class {});
  vi.stubGlobal("VideoEncoder",class {});
  vi.stubGlobal("Worker",class {
    onmessage:((event:MessageEvent)=>void)|null=null;
    terminate() {}
    postMessage() {queueMicrotask(()=>this.onmessage?.({data:{kind:"reusable"}} as MessageEvent));}
  });
}
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("Moments photo preparation is local-only before the publish tap", () => {
  it("encodes once on selection without any S3/Core request and reuses WebP later", async () => {
    const local = new File(["my photo"], "new-post.jpg", {type: "image/jpeg"});
    const requests = vi.fn();
    vi.stubGlobal("fetch", requests);
    const first = await prepareMomentPhotoBeforePublish(local);
    const again = await prepareMomentPhotoBeforePublish(local);
    expect(again).toBe(first);
    expect(vi.mocked(prepareBrowserPhotoWebp)).toHaveBeenCalledExactlyOnceWith(local,
      {small: 360, medium: 720, large: 1440});
    expect(requests).not.toHaveBeenCalled();
    expect(uploadBrowserPhotoWebp).not.toHaveBeenCalled();
  });
});

describe("Moments browser WebP ready before publish",()=>{
  it("validates MP4/MOV/WebM video size and max attachment count", () => {
    for (const mime of ["video/mp4", "video/quicktime", "video/webm"]) {
      validateMomentVideo(new File(["video"], "clip", { type: mime }), 9);
    }
    expect(() => validateMomentVideo(
      new File(["video"], "video.avi", { type: "video/x-msvideo" }), 0,
    )).toThrow("MP4");
    expect(() => validateMomentVideo(
      new File([], "empty.mp4", { type: "video/mp4" }), 0,
    )).toThrow("200");
    expect(() => validateMomentVideo(
      new File(["data"], "video.mp4", { type: "video/mp4" }), 10,
    )).toThrow("максимальное");
  });

  it("sends video reservation kind and acknowledges media from Core without preview links", async () => {
    stubVerifiedMp4();
    const calls = xhr();
    const clip = new File([new Uint8Array(2048)], "walk.mp4", { type: "video/mp4" });
    const videoTicket = {
      ...ticket, kind: "video",
      postFields: { "Content-Type": "video/mp4", key: "video-key" },
    };
    const fake = vi.fn((path: string, _options?: RequestInit) => Promise.resolve(response(
      path.endsWith("/complete")
        ? { ...videoTicket, postUrl: null, postFields: null, status: "ready" }
        : path.endsWith("/client-video-poster")
          ? {method:"POST",url:"https://s3.cloud.ru/gafus-feed-private",fields:{key:"poster.webp"}}
          : videoTicket,
    )));
    vi.stubGlobal("fetch", fake);
    expect(await uploadMomentVideo({
      postId: "post-1", file: clip, clientRequestId: UUID,
      existingCount: 1,
    })).toBe("media-1");
    expect(JSON.parse(String(fake.mock.calls[0]?.[1]?.body))).toMatchObject({
      kind: "video", declaredMime: "video/mp4",
      declaredBytes: clip.size, filename: "walk.mp4",
    });
    expect(calls[0]?.withCredentials).toBe(false);
    expect(calls[0]?.data?.get("file")).toBeInstanceOf(File);
    expect(fake.mock.calls.map(call => call[0])).toEqual([
      "/api/v1/feed/posts/post-1/uploads",
      "/api/v1/feed/uploads/upload-1/client-video-poster",
      "/api/v1/feed/uploads/upload-1/complete",
    ]);
  });

  it("never reserves or uploads video when WebP cover creation fails locally",async()=>{
    stubVerifiedMp4();
    vi.mocked(prepareBrowserVideoPoster).mockRejectedValueOnce(Error("VIDEO_POSTER_DECODE_FAILED"));
    const fetchMock=vi.fn();
    vi.stubGlobal("fetch",fetchMock);
    await expect(uploadMomentVideo({postId:"post-1",
      file:new File([new Uint8Array(2048)],"bad.mp4",{type:"video/mp4"}),
      clientRequestId:UUID,existingCount:0})).rejects.toThrow("VIDEO_POSTER_DECODE_FAILED");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("rejects server ticket for photo when a video was reserved", async () => {
    stubVerifiedMp4();
    const calls = xhr();
    const fake = vi.fn().mockResolvedValue(response(ticket));
    vi.stubGlobal("fetch", fake);
    await expect(uploadMomentVideo({
      postId: "post-1",
      file: new File([new Uint8Array(2048)], "walk.mp4", { type: "video/mp4" }),
      clientRequestId: UUID, existingCount: 0,
    })).rejects.toThrow("некорректную");
    expect(calls).toHaveLength(0);
  });

  it("does not reserve S3 storage when browser video encoding cannot run", async () => {
    const requests=vi.fn();
    vi.stubGlobal("fetch",requests);
    const video=new File([new Uint8Array(2048)],"unprepared.mov",{type:"video/quicktime"});
    await expect(uploadMomentVideo({postId:"post-1",file:video,
      clientRequestId:UUID,existingCount:0}))
      .rejects.toThrow("LOCAL_VIDEO_BROWSER_UNSUPPORTED");
    expect(requests).not.toHaveBeenCalled();
  });
  it("validates input without creating server objects", () => {
    validateMomentPhoto(file, 9);
    expect(() => validateMomentPhoto(file, 10)).toThrow("максимальное");
    expect(() => validateMomentPhoto(new File(["x"], "bad.exe",
      { type: "application/x-msdownload" }), 0)).toThrow("JPG");
    expect(() => validateMomentPhoto(new File([], "empty.png",
      { type: "image/png" }), 0)).toThrow("10 МиБ");
  });


  const small={method:"POST" as const,url:"https://s3.cloud.ru/gafus-feed-public",
    fields:{key:"posts/owner/post/incoming/upload/s.webp"}};
  const medium={...small,fields:{key:"posts/owner/post/incoming/upload/m.webp"}};
  function mockCore(options?:{complete?:Record<string,unknown>;reserve?:Record<string,unknown>}){
    const calls:string[]=[];
    const mocked=vi.fn((path:string,_opts?:RequestInit)=>{
      calls.push(path);
      const data=path.endsWith("/client-renditions")?{small,medium}:
        path.endsWith("/client-complete")
          ? options?.complete??{...ticket,status:"ready"}:
        options?.reserve??ticket;
      return Promise.resolve(response(data));
    });
    vi.stubGlobal("fetch",mocked);
    return {calls,mocked};
  }
  it("validates JPG/PNG/WebP limits before creating server uploads",()=>{
    validateMomentPhoto(file,9);
    expect(()=>validateMomentPhoto(file,10)).toThrow("максимальное");
    expect(()=>validateMomentPhoto(new File(["x"],"bad.exe",{type:"application/x-msdownload"}),0))
      .toThrow("JPG");
    expect(()=>validateMomentPhoto(new File([],"empty.png",{type:"image/png"}),0))
      .toThrow("10 МиБ");
  });
  it("posts three browser-produced WebP versions to S3, confirms READY without Job",async()=>{
    const {calls,mocked}=mockCore();
    const id=await uploadMomentPhoto({postId:"post-1",file,clientRequestId:UUID,
      existingCount:0});
    expect(id).toBe("media-1");
    expect(calls).toEqual([
      "/api/v1/feed/posts/post-1/uploads",
      "/api/v1/feed/uploads/upload-1/client-renditions",
      "/api/v1/feed/uploads/upload-1/client-complete",
    ]);
    expect(JSON.parse(String(mocked.mock.calls[0]?.[1]?.body))).toMatchObject({
      kind:"photo",declaredMime:"image/webp",declaredBytes:480,filename:"large.webp",
    });
    expect(vi.mocked(uploadBrowserPhotoWebp)).toHaveBeenCalledTimes(3);
    expect(vi.mocked(uploadBrowserPhotoWebp).mock.calls.map(args=>args[1].size))
      .toEqual([120,240,480]);
    expect(vi.mocked(uploadBrowserPhotoWebp).mock.calls.every(args=>args[2]==="feed"))
      .toBe(true);
  });
  it("prepares a Moments comment photo using same browser-only upload",async()=>{
    const {calls,mocked}=mockCore();
    await uploadMomentPhoto({postId:"post-1",file,clientRequestId:UUID,
      existingCount:0,purpose:"comment"});
    expect(JSON.parse(String(mocked.mock.calls[0]?.[1]?.body))).toMatchObject({
      kind:"photo",purpose:"comment",declaredMime:"image/webp",declaredBytes:480,
    });
    expect(calls.at(-1)).toContain("/client-complete");
  });
  it("resumes an already READY idempotent reservation without another upload",async()=>{
    const {calls}=mockCore({reserve:{...ticket,status:"ready",postUrl:null,postFields:null}});
    await expect(uploadMomentPhoto({postId:"post-1",file,clientRequestId:UUID,
      existingCount:0})).resolves.toBe("media-1");
    expect(calls).toHaveLength(1);
    expect(vi.mocked(uploadBrowserPhotoWebp)).not.toHaveBeenCalled();
  });
  it("rejects foreign reservation and never posts S3 variants",async()=>{
    mockCore({reserve:{...ticket,postId:"foreign"}});
    await expect(uploadMomentPhoto({postId:"post-1",file,clientRequestId:UUID,
      existingCount:0})).rejects.toThrow("некорректную");
    expect(vi.mocked(uploadBrowserPhotoWebp)).not.toHaveBeenCalled();
  });
  it("does not commit READY after S3 upload fails",async()=>{
    const {calls}=mockCore();
    vi.mocked(uploadBrowserPhotoWebp).mockRejectedValueOnce(Error("S3 недоступен"));
    await expect(uploadMomentPhoto({postId:"post-1",file,clientRequestId:UUID,
      existingCount:0})).rejects.toThrow("S3 недоступен");
    expect(calls).not.toContain("/api/v1/feed/uploads/upload-1/client-complete");
  });
  it("never accepts a fake READY for a different upload ID",async()=>{
    mockCore({complete:{...ticket,uploadId:"foreign",status:"ready"}});
    await expect(uploadMomentPhoto({postId:"post-1",file,clientRequestId:UUID,
      existingCount:0})).rejects.toThrow("не подтвердил");
  });
});

describe("Moments browser-prepared MP4 reservation", () => {
  it("reserves and sends the smaller 720p MP4 instead of the original upload", async () => {
    vi.stubGlobal("VideoDecoder", class {});
    vi.stubGlobal("VideoEncoder", class {});
    const prepared = new File([new Uint8Array(2048)], "browser-720.mp4", { type: "video/mp4" });
    class FakeWorker {
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: (() => void) | null = null;
      terminate() { /* no workers remain after the result */ }
      postMessage() { queueMicrotask(() => this.onmessage?.({ data: { kind: "result", file: prepared } } as MessageEvent)); }
    }
    vi.stubGlobal("Worker", FakeWorker);
    const requests = xhr();
    const uploaded = { ...ticket, kind: "video",
      postFields: { "Content-Type": "video/mp4", key: "video-720-key" } };
    const fetchMock = vi.fn((uri: string, _init?: RequestInit) => Promise.resolve(response(
      uri.endsWith("/complete") ? { ...uploaded, status: "ready" } :
        uri.endsWith("/client-video-poster") ? {method:"POST",
          url:"https://s3.cloud.ru/gafus-feed-private",fields:{key:"poster.webp"}} : uploaded,
    )));
    vi.stubGlobal("fetch", fetchMock);
    const original = new File([new Uint8Array(6000)], "original.mov", { type: "video/quicktime" });
    expect(await uploadMomentVideo({ postId: "post-1", file: original,
      clientRequestId: UUID, existingCount: 0 })).toBe("media-1");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      kind: "video", declaredMime: "video/mp4", declaredBytes: 2048,
      filename: "browser-720.mp4",
    });
    expect(requests[0]?.data?.get("file")).toMatchObject({name: prepared.name, size: prepared.size, type: prepared.type});
  });
});

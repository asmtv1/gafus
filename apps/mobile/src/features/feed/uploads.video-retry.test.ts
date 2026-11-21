// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks=vi.hoisted(()=>({
  prepare:vi.fn(),poster:vi.fn(),reserve:vi.fn(),complete:vi.fn(),
  photo:vi.fn(),variants:vi.fn(),sanitizeWebp:vi.fn(),signed:vi.fn(),post:vi.fn(),
  cover:vi.fn(),sanitize:vi.fn(),sent:vi.fn(),dispose:vi.fn(),coverDispose:vi.fn(),
  picker:vi.fn(),mediaPermission:vi.fn(),camera:vi.fn(),cameraPermission:vi.fn(),microphone:vi.fn(),
}));
vi.mock("@/shared/lib/error-reporting",()=>({reportClientError:vi.fn()}));
vi.mock("expo-crypto",()=>({randomUUID:()=>"video-uuid"}));
vi.mock("react-native",()=>({Platform:{OS:"android"}}));
vi.mock("expo-image-picker",()=>({
  launchImageLibraryAsync:mocks.picker,requestMediaLibraryPermissionsAsync:mocks.mediaPermission,
  launchCameraAsync:mocks.camera,requestCameraPermissionsAsync:mocks.cameraPermission,
}));
vi.mock("expo-camera",()=>({Camera:{requestMicrophonePermissionsAsync:mocks.microphone}}));
vi.mock("expo-file-system",()=>({File:class {
  uri:string;exists=true;size:number;
  constructor(uri:string){this.uri=uri;this.size=uri.includes("compressed")?1300:2200;}
  delete() {mocks.dispose();}
}}));
vi.mock("./videoPoster",()=>({makeFeedVideoPoster:mocks.poster}));
vi.mock("@/shared/lib/media/prepareUploadVideo720",()=>({prepareUploadVideo720:mocks.prepare}));
vi.mock("@/shared/lib/media/prepareUploadPhoto",()=>({prepareUploadPhoto:mocks.photo}));
vi.mock("@/shared/lib/media/prepareUploadWebp",()=>({
  prepareUploadWebpVariants:mocks.variants, sanitizePreparedWebpVariant:mocks.sanitizeWebp,
}));
vi.mock("@/shared/lib/media/directPhotoUpload",()=>({postClientWebp:mocks.post}));
vi.mock("@/shared/lib/media/prepareVideoPosterWebp",()=>({
  prepareVideoPosterWebp:mocks.cover,sanitizeVideoPosterWebp:mocks.sanitize,
}));
vi.mock("@/shared/lib/api/feed",()=>({feedApi:{reserveUpload:mocks.reserve,completeUpload:mocks.complete},
  feedTransport:mocks.signed}));

import { prepareFeedPickedMedia, ensureFeedVideoPrepared, uploadPickedFeedMedia, releaseFeedPickedMedia, feedAssetForPublication } from "./uploads";
import { pickFeedMedia, pickFeedPollOptionPhoto } from "./uploads";

beforeEach(()=>{
  Object.values(mocks).forEach(value=>value.mockReset());
  mocks.poster.mockResolvedValue("file:///poster.jpg");
  mocks.sanitizeWebp.mockResolvedValue(false);
  mocks.reserve.mockResolvedValue({uploadId:"up-1",mediaId:"media-1",status:"reserved",
    postUrl:"https://s3.cloud.ru/presigned-post",postFields:{key:"source"}});
  mocks.complete.mockResolvedValue({mediaId:"media-1",status:"ready"});
  mocks.cover.mockResolvedValue({uri:"file:///poster.webp",width:480,height:270,
    mime:"image/webp",bytes:800,dispose:mocks.coverDispose});
  mocks.sanitize.mockResolvedValue(752);
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

describe("Android Feed photo ICC metadata cleanup and retry safety", () => {
  function photoResult() {
    const source = { uri: "file:///photo-source.jpg", type: "image",
      fileName: "image.jpg", mimeType: "image/jpeg", width: 1080, height: 2400 };
    mocks.photo.mockResolvedValue({
      uri: "file:///prepared.jpeg", width: 864, height: 1920, bytes: 200_000,
      mime: "image/jpeg", dispose: mocks.dispose,
    });
    mocks.variants.mockResolvedValue({
      small: { uri: "file:///small.webp", width: 162, height: 360, bytes: 6464,
        mime: "image/webp", dispose: mocks.dispose },
      medium: { uri: "file:///medium.webp", width: 324, height: 720, bytes: 15476,
        mime: "image/webp", dispose: mocks.dispose },
      large: { uri: "file:///large.webp", width: 648, height: 1440, bytes: 35230,
        mime: "image/webp", dispose: mocks.dispose },
    });
    const signed = { method: "POST", url: "https://s3.cloud.ru/gafus-feed-private",
      fields: { key: "some-key" } };
    mocks.signed.mockResolvedValueOnce({ small: signed, medium: signed })
      .mockResolvedValueOnce({ status: "ready", mediaId: "media-1" });
    return source;
  }
  it("takes mixed Android selections through existing photo and video preparation", async () => {
    const photo = photoResult();
    mocks.picker.mockResolvedValue({ canceled: false, assets: [photo, {
      uri: "file:///video.mp4", type: "video", mimeType: "video/mp4", width: 1280, height: 720,
    }] });
    mocks.prepare.mockResolvedValue({
      uri: "file:///compressed.mp4", bytes: 1300, mime: "video/mp4", dispose: mocks.dispose,
    });
    const picked = await pickFeedMedia("library");
    expect(mocks.mediaPermission).not.toHaveBeenCalled();
    expect(mocks.picker).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      mediaTypes: ["images", "videos"], allowsMultipleSelection: true, selectionLimit: 10,
    }));
    expect(picked.map(item => item.kind)).toEqual(["photo", "video"]);
    await ensureFeedVideoPrepared(picked[1]);
    expect(picked[0].mime).toBe("image/webp");
    expect(picked[1].uri).toBe("file:///compressed.mp4");
    expect(mocks.reserve).not.toHaveBeenCalled();
    picked.forEach(releaseFeedPickedMedia);
  });
  it("handles poll selection cancellation and keeps the camera permission path separate", async () => {
    const canceled = { canceled: true, assets: null };
    mocks.picker.mockResolvedValue(canceled);
    await expect(pickFeedPollOptionPhoto()).resolves.toBeNull();
    expect(mocks.picker).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      mediaTypes: ["images"], allowsMultipleSelection: false,
    }));
    mocks.cameraPermission.mockResolvedValue({ granted: true });
    mocks.microphone.mockResolvedValue({ granted: true });
    mocks.camera.mockResolvedValue(canceled);
    await expect(pickFeedMedia("camera-video")).resolves.toEqual([]);
    expect(mocks.mediaPermission).not.toHaveBeenCalled();
    expect(mocks.cameraPermission).toHaveBeenCalledOnce();
    expect(mocks.microphone).toHaveBeenCalledOnce();
    expect(mocks.camera).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ mediaTypes: ["videos"] }));
  });
  it("uses the original requestId for clean newly prepared WebP photos", async () => {
    const picked = await prepareFeedPickedMedia(photoResult() as never);
    picked.requestId = "existing-photo-request-id";
    await expect(uploadPickedFeedMedia("post-1", picked)).resolves.toBe("media-1");
    expect(mocks.reserve).toHaveBeenCalledWith("post-1",
      expect.objectContaining({
        declaredBytes: 35230, clientRequestId: "existing-photo-request-id",
      }));
    expect(mocks.sanitizeWebp).toHaveBeenCalledTimes(3);
    expect(mocks.post).toHaveBeenCalledTimes(3);
    releaseFeedPickedMedia(picked);
  });
  it("rotates only the S3 idempotency key after cleaning cached ICC WebPs", async () => {
    const picked = await prepareFeedPickedMedia(photoResult() as never);
    picked.requestId = "stable-queue-photo-id";
    mocks.sanitizeWebp.mockImplementation(async (variant: {uri: string; bytes: number}) => {
      if (variant.uri === "file:///small.webp") { variant.bytes = 6000; return true; }
      if (variant.uri === "file:///medium.webp") { variant.bytes = 15000; return true; }
      if (variant.uri === "file:///large.webp") { variant.bytes = 34800; return true; }
      return false;
    });
    await expect(uploadPickedFeedMedia("post-1", picked)).resolves.toBe("media-1");
    expect(picked.requestId).toBe("stable-queue-photo-id");
    expect(picked.photoReservationRequestId).toBe("video-uuid");
    expect(picked.bytes).toBe(34800);
    expect(mocks.reserve).toHaveBeenCalledWith("post-1",
      expect.objectContaining({declaredBytes: 34800, clientRequestId: "video-uuid"}));
    const uploads = mocks.post.mock.calls.map((call: unknown[]) => call[1]);
    expect(uploads).toEqual(expect.arrayContaining([
      expect.objectContaining({uri:"file:///small.webp",bytes:6000}),
      expect.objectContaining({uri:"file:///medium.webp",bytes:15000}),
      expect.objectContaining({uri:"file:///large.webp",bytes:34800}),
    ]));
    releaseFeedPickedMedia(picked);
  });
  it("reports server WebP verification failures as CONFIRM, not as low phone storage",async()=>{
    const picked=await prepareFeedPickedMedia(photoResult() as never);
    mocks.signed.mockReset();
    mocks.signed.mockResolvedValueOnce({
      small:{method:"POST",url:"https://s3.cloud.ru/test",fields:{}},
      medium:{method:"POST",url:"https://s3.cloud.ru/test",fields:{}},
    }).mockRejectedValueOnce(Object.assign(new Error("server rejected"), {code:"INTERNAL_ERROR"}));
    const {photoRetryMessage}=await import("@/shared/lib/media/photoRetryMessage");
    await expect(uploadPickedFeedMedia("post-1",picked)).rejects.toMatchObject({
      message:"PHOTO_CONFIRM_FAILED",
    });
    expect(photoRetryMessage("PHOTO_CONFIRM_FAILED")).toContain("Сервер");
    releaseFeedPickedMedia(picked);
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
    await expect(picked.videoPreparation).rejects.toThrow("VIDEO720_NATIVE_ERROR");
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
  it("confirms a previously UPLOADED video without resending it to S3", async () => {
    mocks.prepare.mockResolvedValue({uri:"file:///compressed.mp4",bytes:1300,
      mime:"video/mp4",dispose:mocks.dispose});
    mocks.reserve.mockResolvedValue({uploadId:"up-1",mediaId:"media-1",status:"uploaded",
      postUrl:null,postFields:null});
    const picked=await prepareFeedPickedMedia({type:"video",uri:"file:///original.mov",
      fileName:"original.mov",mimeType:"video/quicktime",width:1280,height:720} as never);
    await expect(uploadPickedFeedMedia("post-1",picked)).resolves.toBe("media-1");
    expect(mocks.complete).toHaveBeenCalledExactlyOnceWith("up-1");
    expect(mocks.sent).not.toHaveBeenCalled();
    expect(mocks.post).not.toHaveBeenCalled();
    releaseFeedPickedMedia(picked);
  });
  it("rotates only an authoritative expired upload ticket before the next retry",async()=>{
    mocks.prepare.mockResolvedValue({uri:"file:///compressed.mp4",bytes:1300,
      mime:"video/mp4",dispose:mocks.dispose});
    mocks.reserve.mockResolvedValueOnce({uploadId:"up-1",mediaId:"media-1",status:"uploaded"});
    mocks.complete.mockRejectedValueOnce(Object.assign(new Error("old ticket"),{code:"UPLOAD_EXPIRED"}));
    const picked=await prepareFeedPickedMedia({type:"video",uri:"file:///original.mov",
      fileName:"original.mov",mimeType:"video/quicktime",width:1280,height:720} as never);
    picked.videoReservationRequestId="stale-id";
    await expect(uploadPickedFeedMedia("post-1",picked)).rejects.toThrow(
      "FEED_VIDEO_COMPLETE_FAILED__UPLOAD_EXPIRED");
    expect(picked.videoReservationRequestId).toBe("video-uuid");
    expect(mocks.sent).not.toHaveBeenCalled();
    releaseFeedPickedMedia(picked);
  });
  it("does not treat PROCESSING or unconfirmed UPLOADED video as READY", async () => {
    mocks.prepare.mockResolvedValue({uri:"file:///compressed.mp4",bytes:1300,
      mime:"video/mp4",dispose:mocks.dispose});
    const picked=await prepareFeedPickedMedia({type:"video",uri:"file:///original.mov",
      fileName:"original.mov",mimeType:"video/quicktime",width:1280,height:720} as never);
    mocks.reserve.mockResolvedValueOnce({uploadId:"up-1",mediaId:"media-1",status:"processing"});
    await expect(uploadPickedFeedMedia("post-1",picked)).rejects.toThrow("FEED_VIDEO_COMPLETE_FAILED");
    expect(mocks.complete).not.toHaveBeenCalled();
    mocks.reserve.mockResolvedValueOnce({uploadId:"up-1",mediaId:"media-1",status:"uploaded"});
    mocks.complete.mockResolvedValueOnce({uploadId:"up-1",mediaId:"media-1",status:"uploaded"});
    await expect(uploadPickedFeedMedia("post-1",picked)).rejects.toThrow("FEED_VIDEO_COMPLETE_FAILED");
    expect(mocks.sent).not.toHaveBeenCalled();
    releaseFeedPickedMedia(picked);
  });
  it("distinguishes server reservation failures from video conversion failures",async()=>{
    mocks.prepare.mockResolvedValue({uri:"file:///compressed.mp4",bytes:1300,
      mime:"video/mp4",dispose:mocks.dispose});
    mocks.reserve.mockRejectedValueOnce(Error("Sensitive upstream details"));
    const picked=await prepareFeedPickedMedia({type:"video",uri:"file:///original.mov",
      fileName:"original.mov",mimeType:"video/quicktime",width:1280,height:720} as never);
    await expect(uploadPickedFeedMedia("post-1",picked))
      .rejects.toThrow("FEED_VIDEO_RESERVE_FAILED");
    expect(mocks.post).not.toHaveBeenCalled();
    releaseFeedPickedMedia(picked);
  });
  it("preserves only safe API error codes after video reservation failure",async()=>{
    mocks.prepare.mockResolvedValue({uri:"file:///compressed.mp4",bytes:1300,
      mime:"video/mp4",dispose:mocks.dispose});
    mocks.reserve.mockRejectedValueOnce(Object.assign(new Error("private response body"),
      {code:"FEED_DISABLED"}));
    const picked=await prepareFeedPickedMedia({type:"video",uri:"file:///original.mov",
      fileName:"original.mov",mimeType:"video/quicktime",width:1280,height:720} as never);
    await expect(uploadPickedFeedMedia("post-1",picked))
      .rejects.toThrow("FEED_VIDEO_RESERVE_FAILED__FEED_DISABLED");
    releaseFeedPickedMedia(picked);
  });
  it("keeps the in-flight HEVC media object alive in the publication queue",async()=>{
    let resolveEncode!: (value: {uri:string;bytes:number;mime:"video/mp4";dispose:()=>void})=>void;
    mocks.prepare.mockReturnValueOnce(new Promise(resolve=>{resolveEncode=resolve;}));
    const picked=await prepareFeedPickedMedia({type:"video",uri:"file:///original.mov",
      fileName:"original.mov",mimeType:"video/mp4",width:1170,height:2532} as never);
    const queued=feedAssetForPublication(picked);
    expect(queued).toBe(picked);
    const publishing=uploadPickedFeedMedia("post-1",queued);
    resolveEncode({uri:"file:///compressed.mp4",bytes:1300,
      mime:"video/mp4",dispose:mocks.dispose});
    await expect(publishing).resolves.toBe("media-1");
    expect(mocks.reserve.mock.calls[0]?.[1]).toMatchObject({
      declaredMime:"video/mp4",declaredBytes:1300,
    });
    expect(queued.uri).toBe("file:///compressed.mp4");
    expect(mocks.reserve.mock.calls[0]?.[1].clientRequestId)
      .toBe(queued.videoReservationRequestId);
    releaseFeedPickedMedia(picked);
  });
  it("fails closed when an old queue copied media before HEVC preparation",async()=>{
    let resolveEncode!: (value: {uri:string;bytes:number;mime:"video/mp4";dispose:()=>void})=>void;
    mocks.prepare.mockReturnValueOnce(new Promise(resolve=>{resolveEncode=resolve;}));
    const picked=await prepareFeedPickedMedia({type:"video",uri:"file:///original.mov",
      fileName:"original.mov",mimeType:"video/mp4",width:1170,height:2532} as never);
    const stale={...picked};
    const sending=uploadPickedFeedMedia("post-1",stale);
    resolveEncode({uri:"file:///compressed.mp4",bytes:1300,
      mime:"video/mp4",dispose:mocks.dispose});
    await expect(sending).rejects.toThrow("FEED_VIDEO_STALE_PREPARATION");
    expect(mocks.reserve).not.toHaveBeenCalled();
    releaseFeedPickedMedia(picked);
  });
  it("preserves the native failure reason for retry guidance", async () => {
    const original={type:"video",uri:"file:///original.mov",mimeType:"video/quicktime",
      fileName:"original.mov",width:1920,height:1080};
    mocks.prepare.mockImplementation(async (_asset, _compress, _probe, onFailure) => {
      onFailure("VIDEO720_INVALID_MP4");
      return null;
    });
    const picked=await prepareFeedPickedMedia(original as never);
    await expect(picked.videoPreparation).rejects.toThrow("VIDEO720_INVALID_MP4");
    expect(mocks.reserve).not.toHaveBeenCalled();
  });
  it("retries a failed WebP poster without re-encoding a valid H.264 video",async()=>{
    const prepared={uri:"file:///compressed.mp4",bytes:1300,
      mime:"video/mp4",dispose:mocks.dispose};
    mocks.prepare.mockResolvedValue(prepared);
    mocks.cover.mockRejectedValueOnce(Error("NativeSharedObjectNotFoundException"));
    const picked=await prepareFeedPickedMedia({type:"video",uri:"file:///original.mov",
      fileName:"original.mov",mimeType:"video/quicktime",width:1170,height:2532} as never);
    await expect(picked.videoPreparation).rejects.toThrow("VIDEO_POSTER_WEBP_FAILED");
    expect(picked.preparedVideo).toBe(prepared);
    expect(mocks.prepare).toHaveBeenCalledOnce();
    expect(mocks.reserve).not.toHaveBeenCalled();
    mocks.cover.mockResolvedValue({uri:"file:///poster.webp",width:222,height:480,
      mime:"image/webp",bytes:800,dispose:mocks.coverDispose});
    await expect(uploadPickedFeedMedia("post-1",picked)).resolves.toBe("media-1");
    expect(mocks.prepare).toHaveBeenCalledOnce();
    expect(mocks.cover).toHaveBeenCalledTimes(2);
    releaseFeedPickedMedia(picked);
  });
  it("normalizes a cached Android poster again before retrying S3", async () => {
    mocks.prepare.mockResolvedValue({uri:"file:///compressed.mp4",bytes:1300,
      mime:"video/mp4",dispose:mocks.dispose});
    const picked=await prepareFeedPickedMedia({type:"video",uri:"file:///original.mov",
      fileName:"original.mov",mimeType:"video/quicktime",width:720,height:1280} as never);
    await uploadPickedFeedMedia("post-1",picked);
    expect(mocks.sanitize).toHaveBeenCalledWith("file:///poster.webp");
    expect(mocks.post).toHaveBeenCalledWith(expect.any(Object),
      expect.objectContaining({uri:"file:///poster.webp",bytes:752}),expect.any(Array));
    releaseFeedPickedMedia(picked);
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
  it("confirms a previously UPLOADED video without resending it to S3", async () => {
    mocks.prepare.mockResolvedValue({uri:"file:///compressed.mp4",bytes:1300,
      mime:"video/mp4",dispose:mocks.dispose});
    mocks.reserve.mockResolvedValue({uploadId:"up-1",mediaId:"media-1",status:"uploaded",
      postUrl:null,postFields:null});
    const picked=await prepareFeedPickedMedia({type:"video",uri:"file:///original.mov",
      fileName:"original.mov",mimeType:"video/quicktime",width:1280,height:720} as never);
    await expect(uploadPickedFeedMedia("post-1",picked)).resolves.toBe("media-1");
    expect(mocks.complete).toHaveBeenCalledExactlyOnceWith("up-1");
    expect(mocks.sent).not.toHaveBeenCalled();
    expect(mocks.post).not.toHaveBeenCalled();
    releaseFeedPickedMedia(picked);
  });
  it("rotates only an authoritative expired upload ticket before the next retry",async()=>{
    mocks.prepare.mockResolvedValue({uri:"file:///compressed.mp4",bytes:1300,
      mime:"video/mp4",dispose:mocks.dispose});
    mocks.reserve.mockResolvedValueOnce({uploadId:"up-1",mediaId:"media-1",status:"uploaded"});
    mocks.complete.mockRejectedValueOnce(Object.assign(new Error("old ticket"),{code:"UPLOAD_EXPIRED"}));
    const picked=await prepareFeedPickedMedia({type:"video",uri:"file:///original.mov",
      fileName:"original.mov",mimeType:"video/quicktime",width:1280,height:720} as never);
    picked.videoReservationRequestId="stale-id";
    await expect(uploadPickedFeedMedia("post-1",picked)).rejects.toThrow(
      "FEED_VIDEO_COMPLETE_FAILED__UPLOAD_EXPIRED");
    expect(picked.videoReservationRequestId).toBe("video-uuid");
    expect(mocks.sent).not.toHaveBeenCalled();
    releaseFeedPickedMedia(picked);
  });
  it("does not treat PROCESSING or unconfirmed UPLOADED video as READY", async () => {
    mocks.prepare.mockResolvedValue({uri:"file:///compressed.mp4",bytes:1300,
      mime:"video/mp4",dispose:mocks.dispose});
    const picked=await prepareFeedPickedMedia({type:"video",uri:"file:///original.mov",
      fileName:"original.mov",mimeType:"video/quicktime",width:1280,height:720} as never);
    mocks.reserve.mockResolvedValueOnce({uploadId:"up-1",mediaId:"media-1",status:"processing"});
    await expect(uploadPickedFeedMedia("post-1",picked)).rejects.toThrow("FEED_VIDEO_COMPLETE_FAILED");
    expect(mocks.complete).not.toHaveBeenCalled();
    mocks.reserve.mockResolvedValueOnce({uploadId:"up-1",mediaId:"media-1",status:"uploaded"});
    mocks.complete.mockResolvedValueOnce({uploadId:"up-1",mediaId:"media-1",status:"uploaded"});
    await expect(uploadPickedFeedMedia("post-1",picked)).rejects.toThrow("FEED_VIDEO_COMPLETE_FAILED");
    expect(mocks.sent).not.toHaveBeenCalled();
    releaseFeedPickedMedia(picked);
  });
  it("confirms an already-uploaded video after its signed S3 POST expires", async () => {
    mocks.prepare.mockResolvedValue({uri:"file:///compressed.mp4",bytes:1300,
      mime:"video/mp4",dispose:mocks.dispose});
    mocks.reserve.mockResolvedValue({uploadId:"up-1",mediaId:"media-1",status:"reserved",
      postUrl:null,postFields:null});
    const picked=await prepareFeedPickedMedia({type:"video",uri:"file:///original.mov",
      fileName:"original.mov",mimeType:"video/quicktime",width:1280,height:720} as never);
    await expect(uploadPickedFeedMedia("post-1",picked)).resolves.toBe("media-1");
    expect(mocks.complete).toHaveBeenCalledExactlyOnceWith("up-1");
    expect(mocks.sent).not.toHaveBeenCalled();
    expect(mocks.post).not.toHaveBeenCalled();
    releaseFeedPickedMedia(picked);
  });
});

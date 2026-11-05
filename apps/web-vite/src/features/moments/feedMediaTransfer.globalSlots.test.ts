// @vitest-environment jsdom
// This suite measures the shared S3 slot budget, not video codec behavior.
// Its synthetic six-byte MP4 is only a transport placeholder.
vi.mock("../../shared/media/browserVideoPoster",()=>({
  prepareBrowserVideoPoster:vi.fn(async()=>new File([new Uint8Array(500)],
    "poster.webp",{type:"image/webp"})),
}));
vi.mock("../../shared/media/browserVideo720",()=>({
  prepareBrowserVideo720:vi.fn(async (file:File)=>file),
}));
vi.mock("../../shared/media/browserPhotoWebp",()=>({
  prepareBrowserPhotoWebp:vi.fn(async(_original:File,edges:Record<string,number>)=>
    Object.fromEntries(Object.entries(edges).map(([name,edge])=>[
      name,{file:new File([new Uint8Array(128)],name+".webp",{type:"image/webp"}),
        width:edge,height:Math.round(edge*.75)},
    ]))),
}));
import { afterEach, describe, expect, it, vi } from "vitest";
import { uploadMomentPhoto, uploadMomentVideo } from "./feedMediaTransfer";

const postId = "post-1";
const expires = "2099-12-31T00:00:00.000Z";
const response = (data: unknown) => new Response(JSON.stringify({ success: true, data }));

function prepare() {
  const sent: ((status?: number) => void)[] = [];
  const destinations:string[]=[];
  let active = 0, peak = 0;
  class FakeXHR {
    upload = { onprogress: null as ((event: ProgressEvent) => void) | null };
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    ontimeout: (() => void) | null = null;
    status = 0;
    timeout = 0;
    withCredentials = false;
    open = vi.fn();
    send(body:FormData) {
      destinations.push(String(body.get("key") ?? body.get("Content-Type") ?? "unknown"));
      active++;
      peak = Math.max(peak, active);
      sent.push((status = 204) => {
        active--;
        this.status = status;
        this.onload?.();
      });
    }
  }
  vi.stubGlobal("XMLHttpRequest", FakeXHR);
  const reserved = new Map<string, { kind: "photo" | "video"; mediaId: string }>();
  const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
    if (path.endsWith("/client-renditions")) {
      const base="https://s3.cloud.ru/gafus-feed-private";
      return response({
        small:{method:"POST",url:base,fields:{key:"posts/owner/post/incoming/s.webp"}},
        medium:{method:"POST",url:base,fields:{key:"posts/owner/post/incoming/m.webp"}},
      });
    }
    if (path.endsWith("/client-complete")) {
      const uploadId = path.split("/").at(-2)!;
      const entry = reserved.get(uploadId)!;
      return response({uploadId,postId,mediaId:entry.mediaId,
        kind:"photo",status:"ready",postUrl:null,postFields:null,urlExpiresAt:null});
    }
    if (path.endsWith("/client-video-poster")) {
      return response({method:"POST",url:"https://s3.cloud.ru/gafus-feed-private",
        fields:{key:"posts/owner/post/incoming/upload/poster.webp"}});
    }
    if (path.endsWith("/complete")) {
      const uploadId = path.split("/").at(-2)!;
      const entry = reserved.get(uploadId)!;
      return response({ uploadId, postId, mediaId: entry.mediaId,
        kind: entry.kind, status: "ready", postUrl: null, postFields: null, urlExpiresAt: null });
    }
    const request = JSON.parse(String(init?.body)) as { kind: "photo" | "video"; clientRequestId: string };
    const kind = request.kind;
    const serial = request.clientRequestId.split("-").at(-1)!;
    const uploadId = `upload-${serial}`, mediaId = `media-${serial}`;
    reserved.set(uploadId, { kind, mediaId });
    return response({ uploadId, postId, mediaId, kind,
      status: "reserved", postUrl: kind==="photo"?"https://s3.cloud.ru/gafus-feed-private":"https://example-storage.invalid/bucket",
      postFields: { "Content-Type": kind === "photo" ? "image/webp" : "video/mp4" },
      urlExpiresAt: expires });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { sent, destinations, fetchMock, get active() { return active; }, get peak() { return peak; } };
}

const photo = new File(["photo"], "photo.webp", { type: "image/webp" });
const video = new File(["video"], "video.mp4", { type: "video/mp4" });
function start(index: number) {
  // Distinct editors and post surfaces share one module-level upload budget.
  const opts = { postId, file: index % 3 === 0 ? video : photo,
    clientRequestId: `550e8400-e29b-41d4-a716-${String(index).padStart(12, "0")}`,
    existingCount: 0 };
  return index % 3 === 0 ? uploadMomentVideo(opts) : uploadMomentPhoto(opts);
}

afterEach(() => vi.unstubAllGlobals());

describe("Moments five-slot browser budget across distinct editors", () => {
  const reserves=(state:ReturnType<typeof prepare>)=>state.fetchMock.mock.calls
    .filter(([path])=>String(path).endsWith("/uploads")).length;
  async function sendAll(state:ReturnType<typeof prepare>,count:number,firstIndex=0){
    for(let i=firstIndex;i<count;i++){
      await vi.waitFor(()=>expect(state.sent.length).toBeGreaterThan(i));
      state.sent[i]!();
    }
  }
  it("limits initial reservations to five editors even though each photo sends three WebPs",async()=>{
    const state=prepare();
    const jobs=Array.from({length:9},(_,index)=>start(index));
    // At most five owner-scoped upload reservations are active; the three
    // internal WebP S3 multipart forms do not consume extra upload slots.
    await vi.waitFor(()=>expect(state.sent).toHaveLength(11));
    expect(reserves(state)).toBe(5);
    // The posters may be signed after photo variants, so never assume index 0.
    const posterIndex=state.destinations.findIndex(key=>key.endsWith("poster.webp"));
    expect(posterIndex).toBeGreaterThanOrEqual(0);
    state.sent[posterIndex]!();
    await vi.waitFor(()=>expect(state.destinations).toContain("video/mp4"));
    const videoIndex=state.destinations.findIndex(key=>key==="video/mp4");
    expect(videoIndex).toBeGreaterThanOrEqual(0);
    state.sent[videoIndex]!();
    await vi.waitFor(()=>expect(reserves(state)).toBe(6));
    // Six photo sets (3 each) + three videos (one poster + one MP4).
    const acknowledged=new Set([posterIndex,videoIndex]);
    for(let i=0;i<24;i++){
      if(acknowledged.has(i))continue;
      await vi.waitFor(()=>expect(state.sent.length).toBeGreaterThan(i));
      state.sent[i]!();
    }
    expect(await Promise.all(jobs)).toHaveLength(9);
    expect(reserves(state)).toBe(9);
    expect(state.active).toBe(0);
    expect(state.peak).toBeLessThanOrEqual(15);
  });

  it("releases an editor slot after failed S3 transfer and lets queued photos proceed",async()=>{
    const state=prepare();
    const jobs=Array.from({length:6},(_,index)=>
      start(index).then(value=>({ok:true,value}),error=>({ok:false,error})));
    await vi.waitFor(()=>expect(state.sent).toHaveLength(11));
    expect(reserves(state)).toBe(5);
    const posterIndex=state.destinations.findIndex(key=>key.endsWith("poster.webp"));
    expect(posterIndex).toBeGreaterThanOrEqual(0);
    state.sent[posterIndex]!(503); // broken client cover prevents an MP4 upload
    await vi.waitFor(()=>expect(reserves(state)).toBe(6));
    for(let i=0;i<15;i++){
      if(i===posterIndex)continue;
      await vi.waitFor(()=>expect(state.sent.length).toBeGreaterThan(i));
      state.sent[i]!();
    }
    const result=await Promise.all(jobs);
    expect(result.filter(r=>!r.ok)).toHaveLength(1);
    expect(result.filter(r=>r.ok)).toHaveLength(5);
    expect(state.active).toBe(0);
    expect(state.peak).toBeLessThanOrEqual(15);
  });
});

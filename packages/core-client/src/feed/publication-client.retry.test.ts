import { describe, expect, it, vi } from "vitest";
import { createFeedPublicationManager } from "./publication-client";
import type { FeedPostEditorDto } from "@gafus/types";

/** One video fails while the neighboring photo completed: retry must not
 * encode/upload that already-accepted photo again. */
describe("Moments local per-file retry", () => {
  it("one failed PHOTO arrow retries only that photo when another photo also failed",async()=>{
    const editor=(status:string,version=0)=>({id:"post-photos",version,status,
      pendingRevision:null,text:""} as unknown as FeedPostEditorDto);
    let published=false;
    const counts=new Map<string,number>();
    const api={
      createPost:vi.fn(async()=>editor("draft")),
      getEditor:vi.fn(async()=>editor(published?"published":"draft")),
      saveRevision:vi.fn(async()=>editor("draft",1)),
      publishPost:vi.fn(async()=>{published=true;return editor("pending",1);}),
      copyAlbumPhoto:vi.fn(),
    };
    const upload=vi.fn(async(_post:string,file:{requestId:string})=>{
      const count=(counts.get(file.requestId)??0)+1;
      counts.set(file.requestId,count);
      if(count===1)throw Error("LOCAL_PHOTO_WEBP_FAILED");
      return file.requestId+"-media-id";
    });
    const manager=createFeedPublicationManager({api,upload,makeId:(()=>{
      let number=0;return()=>`photo-local-${++number}`;
    })(),pollIntervalMs:1});
    const id=manager.enqueue({ownerId:"user",text:"Собаки",files:[
      {requestId:"photo-a",filename:"a.webp",kind:"photo" as const,bytes:30},
      {requestId:"photo-b",filename:"b.webp",kind:"photo" as const,bytes:30},
    ],albumPhotoIds:[]});
    await vi.waitFor(()=>expect(manager.getSnapshot().find(item=>item.id===id)?.phase)
      .toBe("failed"));
    const initial=manager.getSnapshot().find(item=>item.id===id)!;
    expect(initial.files?.map(file=>file.phase)).toEqual(["failed","failed"]);
    manager.retryFile(id,"photo-a");
    await vi.waitFor(()=>expect(counts.get("photo-a")).toBe(2));
    await vi.waitFor(()=>expect(manager.getSnapshot().find(item=>item.id===id)?.phase)
      .toBe("failed"));
    expect(counts.get("photo-b")).toBe(1); // NO neighbor retry.
    expect(manager.getSnapshot().find(item=>item.id===id)?.files?.map(file=>file.phase))
      .toEqual(["ready","failed"]);
    manager.retryFile(id,"photo-b");
    await vi.waitFor(()=>expect(manager.getSnapshot().find(item=>item.id===id)?.phase)
      .toBe("published"));
    expect(counts.get("photo-a")).toBe(2);
    expect(counts.get("photo-b")).toBe(2);
    expect(api.createPost).toHaveBeenCalledTimes(1);
  });
  it("restarts just the failed video's upload, retaining the post and all successful IDs", async () => {
    const editor = (status: string, version = 0) => ({
      id: "post-one", version, status, pendingRevision: null, text: "",
    } as unknown as FeedPostEditorDto);
    let published = false;
    const api = {
      createPost: vi.fn(async () => editor("draft")),
      getEditor: vi.fn(async () => editor(published ? "published" : "draft")),
      saveRevision: vi.fn(async () => editor("draft", 1)),
      publishPost: vi.fn(async () => { published = true; return editor("pending", 1); }),
      copyAlbumPhoto: vi.fn(),
    };
    const photoCalls: string[] = [], videoCalls: string[] = [];
    const upload = vi.fn(async (_post: string, file: { requestId: string },
      _progress: (loaded: number, total: number) => void) => {
      if (file.requestId === "photo-one") {
        photoCalls.push(file.requestId);
        return "photo-id";
      }
      videoCalls.push(file.requestId);
      if (videoCalls.length === 1) throw Error("LOCAL_VIDEO_TIMEOUT");
      return "video-id";
    });
    const manager = createFeedPublicationManager({
      api, upload, makeId: (() => { let n = 0; return () => `local-${++n}`; })(),
      pollIntervalMs: 1,
    });
    const id = manager.enqueue({ ownerId: "user", text: "Клип", files: [
      { requestId: "photo-one", filename: "photo.webp", kind: "photo" as const, bytes: 12 },
      { requestId: "video-two", filename: "video.mp4", kind: "video" as const, bytes: 24 },
    ], albumPhotoIds: [] });
    await vi.waitFor(() => expect(manager.getSnapshot().find(item => item.id === id)?.phase)
      .toBe("failed"));
    const failed = manager.getSnapshot().find(item => item.id === id)!;
    expect(failed.files?.map(file => file.phase)).toEqual(["ready", "failed"]);
    expect(failed.files?.[1]?.requestId).toBe("video-two");
    manager.retryFile(id, "photo-one"); // successful item cannot be restarted
    manager.retryFile(id, "other-video"); // another user's id cannot be restarted
    expect(photoCalls).toHaveLength(1);
    expect(videoCalls).toHaveLength(1);
    manager.retryFile(id, "video-two");
    await vi.waitFor(() => expect(manager.getSnapshot().find(item => item.id === id)?.phase)
      .toBe("published"));
    expect(photoCalls).toHaveLength(1);
    expect(videoCalls).toHaveLength(2);
    expect(api.createPost).toHaveBeenCalledTimes(1);
    expect(api.saveRevision).toHaveBeenCalledWith("post-one", expect.objectContaining({
      attachmentIds: ["photo-id", "video-id"],
    }));
  });
});

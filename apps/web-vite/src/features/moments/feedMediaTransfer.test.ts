// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  uploadMomentPhoto, uploadMomentVideo, validateMomentPhoto,
  validateMomentVideo,
} from "./feedMediaTransfer";

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
afterEach(() => vi.unstubAllGlobals());

describe("Feed photo upload with ephemeral POST URLs", () => {
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
    const calls = xhr();
    const clip = new File(["short-clip"], "walk.mp4", { type: "video/mp4" });
    const videoTicket = {
      ...ticket, kind: "video",
      postFields: { "Content-Type": "video/mp4", key: "video-key" },
    };
    const fake = vi.fn((path: string, _options?: RequestInit) => Promise.resolve(response(
      path.endsWith("/complete")
        ? { ...videoTicket, postUrl: null, postFields: null, status: "processing" }
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
      "/api/v1/feed/uploads/upload-1/complete",
    ]);
  });

  it("routes a comment attachment through the same reserve, signed POST and complete pipeline", async () => {
    const requests = xhr();
    const fake = vi.fn((path: string, _options?: RequestInit) => Promise.resolve(response(
      path.endsWith("/complete")
        ? { ...ticket, status: "uploaded", postUrl: null, postFields: null }
        : ticket,
    )));
    vi.stubGlobal("fetch", fake);
    const id = await uploadMomentPhoto({
      postId: "post-1", file, clientRequestId: UUID, existingCount: 0,
      purpose: "comment",
    });
    expect(id).toBe("media-1");
    expect(JSON.parse(String(fake.mock.calls[0]?.[1]?.body))).toMatchObject({
      purpose: "comment", kind: "photo",
      declaredMime: "image/webp", declaredBytes: file.size,
    });
    expect(fake.mock.calls.map(call => call[0])).toEqual([
      "/api/v1/feed/posts/post-1/uploads",
      "/api/v1/feed/uploads/upload-1/complete",
    ]);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.data?.get("file")).toBeInstanceOf(File);
  });

  it("rejects server ticket for photo when a video was reserved", async () => {
    const calls = xhr();
    const fake = vi.fn().mockResolvedValue(response(ticket));
    vi.stubGlobal("fetch", fake);
    await expect(uploadMomentVideo({
      postId: "post-1",
      file: new File(["video"], "walk.mp4", { type: "video/mp4" }),
      clientRequestId: UUID, existingCount: 0,
    })).rejects.toThrow("некорректную");
    expect(calls).toHaveLength(0);
  });

  it("validates input without creating server objects", () => {
    validateMomentPhoto(file, 9);
    expect(() => validateMomentPhoto(file, 10)).toThrow("максимальное");
    expect(() => validateMomentPhoto(new File(["x"], "bad.exe",
      { type: "application/x-msdownload" }), 0)).toThrow("JPG");
    expect(() => validateMomentPhoto(new File([], "empty.png",
      { type: "image/png" }), 0)).toThrow("10 МиБ");
  });

  it("reserves photo, sends unsigned multipart to storage, then verifies Core completion", async () => {
    const requests = xhr();
    const fake = vi.fn((path: string) => Promise.resolve(response(
      path.endsWith("/complete")
        ? { ...ticket, status: "uploaded", postUrl: null, postFields: null }
        : ticket,
    )));
    vi.stubGlobal("fetch", fake);
    const progresses: number[] = [];
    const id = await uploadMomentPhoto({
      postId: "post-1", file, clientRequestId: UUID, existingCount: 0,
      onProgress: value => progresses.push(value),
    });
    expect(id).toBe("media-1");
    expect(fake.mock.calls.map(call => call[0])).toEqual([
      "/api/v1/feed/posts/post-1/uploads",
      "/api/v1/feed/uploads/upload-1/complete",
    ]);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe("https://example-storage.invalid/bucket");
    expect(requests[0]?.method).toBe("POST");
    expect(requests[0]?.withCredentials).toBe(false);
    expect(requests[0]?.data?.get("key")).toBe("only-this-key");
    expect(requests[0]?.data?.get("Content-Type")).toBe("image/webp");
    expect(requests[0]?.data?.get("file")).toBeInstanceOf(File);
    expect(progresses).toEqual([50, 100]);
  });

  it("returns existing media after Core idempotent reservation without second upload", async () => {
    const requests = xhr();
    const fake = vi.fn().mockResolvedValue(response({
      ...ticket, status: "processing", postUrl: null, postFields: null,
    }));
    vi.stubGlobal("fetch", fake);
    expect(await uploadMomentPhoto({
      postId: "post-1", file, clientRequestId: UUID, existingCount: 1,
    })).toBe("media-1");
    expect(requests).toHaveLength(0);
    expect(fake).toHaveBeenCalledTimes(1);
  });

  it("rejects foreign ID, invalid POST URLs and content-type mismatch before XHR", async () => {
    const requests = xhr();
    const fake = vi.fn()
      .mockResolvedValueOnce(response({ ...ticket, postId: "foreign" }))
      .mockResolvedValueOnce(response({ ...ticket, postUrl: "http://evil.invalid" }))
      .mockResolvedValueOnce(response({ ...ticket, postFields: {
        "Content-Type": "video/mp4",
      } }));
    vi.stubGlobal("fetch", fake);
    const args = {
      postId: "post-1", file, clientRequestId: UUID, existingCount: 0,
    };
    await expect(uploadMomentPhoto(args)).rejects.toThrow("некорректную");
    await expect(uploadMomentPhoto(args)).rejects.toThrow("Небезопасный");
    await expect(uploadMomentPhoto(args)).rejects.toThrow("Формат");
    expect(requests).toHaveLength(0);
  });

  it("does not confirm completion after failed storage HTTP", async () => {
    const requests = xhr(false);
    const fake = vi.fn().mockResolvedValue(response(ticket));
    vi.stubGlobal("fetch", fake);
    await expect(uploadMomentPhoto({
      postId: "post-1", file, clientRequestId: UUID, existingCount: 0,
    })).rejects.toThrow("Хранилище не подтвердило");
    expect(requests).toHaveLength(1);
    expect(fake).toHaveBeenCalledTimes(1);
  });

  it("refuses to consider malformed or mismatched completion as success", async () => {
    const requests = xhr();
    const fake = vi.fn((path: string) => Promise.resolve(response(
      path.endsWith("/complete")
        ? { ...ticket, uploadId: "other-upload", status: "uploaded" }
        : ticket,
    )));
    vi.stubGlobal("fetch", fake);
    await expect(uploadMomentPhoto({
      postId: "post-1", file, clientRequestId: UUID, existingCount: 0,
    })).rejects.toThrow("не подтвердил");
    expect(requests).toHaveLength(1);
  });
});

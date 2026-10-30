// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { uploadMomentPhoto, uploadMomentVideo } from "./feedMediaTransfer";

const postId = "post-1";
const expires = "2099-12-31T00:00:00.000Z";
const response = (data: unknown) => new Response(JSON.stringify({ success: true, data }));

function prepare() {
  const sent: ((status?: number) => void)[] = [];
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
    send() {
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
    if (path.endsWith("/complete")) {
      const uploadId = path.split("/").at(-2)!;
      const entry = reserved.get(uploadId)!;
      return response({ uploadId, postId, mediaId: entry.mediaId,
        kind: entry.kind, status: "uploaded", postUrl: null, postFields: null, urlExpiresAt: null });
    }
    const request = JSON.parse(String(init?.body)) as { kind: "photo" | "video"; clientRequestId: string };
    const kind = request.kind;
    const serial = request.clientRequestId.split("-").at(-1)!;
    const uploadId = `upload-${serial}`, mediaId = `media-${serial}`;
    reserved.set(uploadId, { kind, mediaId });
    return response({ uploadId, postId, mediaId, kind,
      status: "reserved", postUrl: "https://example-storage.invalid/bucket",
      postFields: { "Content-Type": kind === "photo" ? "image/webp" : "video/mp4" },
      urlExpiresAt: expires });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { sent, fetchMock, get active() { return active; }, get peak() { return peak; } };
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
  it("holds the sixth reservation until one of five active S3 transfers is fully acknowledged", async () => {
    const state = prepare();
    const jobs = Array.from({ length: 9 }, (_, index) => start(index));
    await vi.waitFor(() => expect(state.sent).toHaveLength(5));
    expect(state.peak).toBe(5);
    expect(state.fetchMock.mock.calls.filter(([path]) => !String(path).endsWith("/complete"))).toHaveLength(5);
    state.sent[2]!();
    await vi.waitFor(() => expect(state.sent).toHaveLength(6));
    expect(state.peak).toBe(5);
    for (const index of [1, 0, 4]) state.sent[index]!();
    await vi.waitFor(() => expect(state.sent).toHaveLength(9));
    for (const index of [3, 5, 6, 7, 8]) state.sent[index]!();
    expect(await Promise.all(jobs)).toHaveLength(9);
    expect(state.active).toBe(0);
    expect(state.peak).toBe(5);
  });

  it("releases a slot after an S3 failure and allows queued uploads to continue", async () => {
    const state = prepare();
    // Attach rejection handlers immediately; failure is expected here.
    const jobs = Array.from({ length: 6 }, (_, index) =>
      start(index).then(value => ({ ok: true, value }), error => ({ ok: false, error })));
    await vi.waitFor(() => expect(state.sent).toHaveLength(5));
    state.sent[0]!(503);
    await vi.waitFor(() => expect(state.sent).toHaveLength(6));
    for (const index of [1, 2, 3, 4, 5]) state.sent[index]!();
    const results = await Promise.all(jobs);
    expect(results.filter(x => !x.ok)).toHaveLength(1);
    expect(results.filter(x => x.ok)).toHaveLength(5);
    expect(state.active).toBe(0);
    expect(state.peak).toBe(5);
  });
});

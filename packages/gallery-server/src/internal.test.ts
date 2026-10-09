import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GalleryService } from "@gafus/core/services/gallery";
import { signGalleryRequest, INTERNAL_GALLERY_PATHS } from "@gafus/gallery-storage/hmac";

const { redis } = vi.hoisted(() => ({ redis: { status: "ready", set: vi.fn() } }));
vi.mock("@gafus/queues", () => ({ connection: redis }));
import { dispatchGalleryInternalRequest, galleryHttpError } from "./index.js";

const secret = "local-test-key-".repeat(3);
const token = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const inputs = [
  { uploadId: "upload-1" },
  { uploadId: "upload-1", attemptToken: token, sourceETag: '"etag"', width: 480, height: 320 },
  { uploadId: "upload-1", attemptToken: token, errorCode: "PROCESSING_ERROR", retryable: true },
  { limit: 1 },
  { jobId: "job-1", attemptToken: token },
  { jobId: "job-1", attemptToken: token, errorCode: "STORAGE_ERROR", retryable: false },
  { limit: 10 },
];
const methods = ["claimUpload", "completeUpload", "failUpload", "claimStorageJobs", "completeStorageJob", "failStorageJob", "maintenance"];
function request(index = 0, body = JSON.stringify(inputs[index]), extra: RequestInit = {}) {
  const path = INTERNAL_GALLERY_PATHS[index]!;
  return new Request(`https://local.test${path}`, {
    method: "POST", body,
    headers: { "Content-Type": "application/json", ...signGalleryRequest({ method: "POST", path, body, secret }) },
    ...extra,
  });
}
function fixture() {
  const calls = vi.fn(async (_input: unknown) => null);
  return { calls, gallery: new Proxy({}, { get: () => calls }) as GalleryService };
}
async function invoke(req: Request, gallery: GalleryService, path = new URL(req.url).pathname) {
  try { return { status: 200, body: await dispatchGalleryInternalRequest(req, path, gallery) }; }
  catch (error) { return galleryHttpError(error); }
}
beforeEach(() => {
  vi.stubEnv("GALLERY_INTERNAL_HMAC_SECRET", secret);
  redis.status = "ready";
  redis.set.mockReset().mockResolvedValue("OK");
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("internal gallery signed transport to existing core", () => {
  it.each(INTERNAL_GALLERY_PATHS.map((path, i) => [path, i] as const))("dispatches %s without an envelope", async (path, i) => {
    const call = vi.fn(async () => i === 0 ? null : i === 3 ? [] : { accepted: true });
    const gallery = { [methods[i]!]: call } as unknown as GalleryService;
    const req = request(i);
    expect(await invoke(req, gallery, path)).toEqual({ status: 200, body: await call.mock.results[0]?.value });
    expect(call).toHaveBeenCalledExactlyOnceWith(inputs[i]);
    expect(redis.set).toHaveBeenCalledWith(
      `gafus-gallery-nonce:gallery-v1:${req.headers.get("x-gallery-nonce")}`, "1", "PXAT",
      (Number(req.headers.get("x-gallery-timestamp")) + 61) * 1000, "NX",
    );
  });

  it("permits only one concurrent request across replicas sharing Redis", async () => {
    const seen = new Set<string>();
    redis.set.mockImplementation(async (key: string) => { if (seen.has(key)) return null; seen.add(key); return "OK"; });
    const { calls, gallery } = fixture();
    const req = request();
    const results = await Promise.all([invoke(req.clone(), gallery), invoke(req.clone(), gallery)]);
    expect(results.map(r => r.status).sort()).toEqual([200, 401]);
    expect(calls).toHaveBeenCalledTimes(1);
  });

  it("rejects tampered and stale signatures before consuming a nonce", async () => {
    const { calls, gallery } = fixture();
    const req = request();
    expect((await invoke(new Request(req.url, { method: "POST", headers: req.headers, body: '{"uploadId":"other"}' }), gallery)).status).toBe(401);
    const body = JSON.stringify(inputs[0]);
    const headers = signGalleryRequest({ method: "POST", path: INTERNAL_GALLERY_PATHS[0], body, secret, timestamp: Math.floor(Date.now() / 1000) - 61 });
    expect((await invoke(request(0, body, { headers }), gallery)).status).toBe(401);
    expect(redis.set).not.toHaveBeenCalled();
    expect(calls).not.toHaveBeenCalled();
  });

  it.each(["missing", "short", "offline", "error"])("fails closed when dependency is %s", async condition => {
    const { calls, gallery } = fixture();
    if (condition === "missing") vi.stubEnv("GALLERY_INTERNAL_HMAC_SECRET", "");
    if (condition === "short") vi.stubEnv("GALLERY_INTERNAL_HMAC_SECRET", "short");
    if (condition === "offline") redis.status = "reconnecting";
    if (condition === "error") redis.set.mockRejectedValue(new Error("private dependency detail"));
    const result = await invoke(request(), gallery);
    expect(result.status).toBe(503);
    expect(JSON.stringify(result)).not.toContain("private dependency detail");
    expect(calls).not.toHaveBeenCalled();
  });

  it("bounds a stalled nonce command and never dispatches core", async () => {
    vi.useFakeTimers();
    redis.set.mockImplementation(() => new Promise(() => {}));
    const { calls, gallery } = fixture();
    const pending = invoke(request(), gallery);
    await vi.advanceTimersByTimeAsync(1001);
    expect((await pending).status).toBe(503);
    expect(calls).not.toHaveBeenCalled();
  });

  it("retains a late consumed nonce without authorizing the timed-out request or caching failure", async () => {
    vi.useFakeTimers();
    const seen = new Set<string>();
    let finish!: () => void;
    redis.set.mockImplementationOnce((key: string) => new Promise(resolve => {
      finish = () => { seen.add(key); resolve("OK"); };
    })).mockImplementation(async (key: string) => {
      if (seen.has(key)) return null;
      seen.add(key);
      return "OK";
    });
    const { calls, gallery } = fixture();
    const req = request();
    const pending = invoke(req.clone(), gallery);
    await vi.advanceTimersByTimeAsync(1001);
    expect((await pending).status).toBe(503);
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).not.toHaveBeenCalled();
    expect((await invoke(req.clone(), gallery)).status).toBe(401);
    expect((await invoke(request(), gallery)).status).toBe(200);
    expect(calls).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps absolute expiry through the entire future timestamp validity window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-09T00:00:00.000Z"));
    const timestamp = Math.floor(Date.now() / 1000) + 60;
    const body = JSON.stringify(inputs[0]);
    const headers = signGalleryRequest({ method: "POST", path: INTERNAL_GALLERY_PATHS[0], body, secret, timestamp });
    const { gallery } = fixture();
    expect((await invoke(request(0, body, { headers: { ...headers, "content-type": "application/json" } }), gallery)).status).toBe(200);
    expect(redis.set).toHaveBeenCalledWith(
      `gafus-gallery-nonce:gallery-v1:${headers["x-gallery-nonce"]}`, "1", "PXAT", (timestamp + 61) * 1000, "NX",
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    ["malformed JSON", "{", 400],
    ["unknown field", '{"uploadId":"upload-1","extra":true}', 400],
    ["oversized raw bytes", "x".repeat(16_385), 413],
    ["oversized UTF-8 bytes", "я".repeat(8193), 413],
  ])("rejects %s", async (_name, body, status) => {
    const { calls, gallery } = fixture();
    expect((await invoke(request(0, body as string), gallery)).status).toBe(status);
    expect(calls).not.toHaveBeenCalled();
  });

  it("rejects unsupported content types, methods, paths and query aliases", async () => {
    const { calls, gallery } = fixture();
    const req = request();
    const headers = new Headers(req.headers); headers.set("content-type", "text/plain");
    expect((await invoke(request(0, JSON.stringify(inputs[0]), { headers }), gallery)).status).toBe(415);
    expect((await invoke(new Request(req.url), gallery)).status).toBe(405);
    expect((await invoke(request(), gallery, "/internal/gallery/unknown")).status).toBe(404);
    expect((await invoke(new Request(`${req.url}?alias=1`, { method: "POST", headers: req.headers, body: JSON.stringify(inputs[0]) }), gallery)).status).toBe(404);
    expect(calls).not.toHaveBeenCalled();
  });

  it("preserves core errors and sanitizes unexpected failures", async () => {
    const { GalleryError } = await import("@gafus/core/services/gallery");
    const { calls, gallery } = fixture();
    calls.mockRejectedValueOnce(new GalleryError("NOT_FOUND", "Не найдено", 404));
    expect((await invoke(request(), gallery)).status).toBe(404);
    calls.mockRejectedValueOnce(new Error("private database detail"));
    const result = await invoke(request(), gallery);
    expect(result.status).toBe(500);
    expect(JSON.stringify(result)).not.toContain("private database detail");
  });
});

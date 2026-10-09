import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { signGalleryRequest, INTERNAL_GALLERY_PATHS } from "@gafus/gallery-storage/hmac";

const { redis, core } = vi.hoisted(() => ({
  redis: { status: "ready", set: vi.fn() },
  core: {
    claimUpload: vi.fn(), completeUpload: vi.fn(), failUpload: vi.fn(),
    claimStorageJobs: vi.fn(), completeStorageJob: vi.fn(), failStorageJob: vi.fn(), maintenance: vi.fn(),
  },
}));
vi.mock("@gafus/queues", () => ({ connection: redis }));
vi.mock("@gafus/prisma", () => ({ prisma: {} }));
vi.mock("@gafus/core/services/gallery", async importOriginal => ({
  ...await importOriginal<object>(), createGalleryService: () => core,
}));
// Exercise current source, rather than an older workspace dist build.
vi.mock("@gafus/gallery-server", async () => import("../../../../../packages/gallery-server/src/index.js"));
import { internalGalleryRoutes } from "./gallery.js";

const app = new Hono().route("/internal/gallery", internalGalleryRoutes);
const secret = "route-test-secret-".repeat(3);
const attemptToken = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const cases = [
  ["claimUpload", { uploadId: "upload-1" }, null],
  ["completeUpload", { uploadId: "upload-1", attemptToken, sourceETag: '"etag"', width: 480, height: 320 }, { accepted: true, status: "publishing" }],
  ["failUpload", { uploadId: "upload-1", attemptToken, errorCode: "PROCESSING_ERROR", retryable: true }, { accepted: true, status: "failed" }],
  ["claimStorageJobs", { limit: 1 }, []],
  ["completeStorageJob", { jobId: "job-1", attemptToken }, { accepted: true }],
  ["failStorageJob", { jobId: "job-1", attemptToken, errorCode: "STORAGE_ERROR", retryable: false }, { accepted: true }],
  ["maintenance", { limit: 10 }, { expiredUploads: 0, reconciledJobs: 0, recoveredCleanupJobs: 0, processUploadIds: ["upload-1"] }],
] as const;
function signed(body: string, path: (typeof INTERNAL_GALLERY_PATHS)[number] = INTERNAL_GALLERY_PATHS[0]) {
  return { method: "POST", body, headers: { "content-type": "application/json", ...signGalleryRequest({ method: "POST", path, body, secret }) } };
}
beforeEach(() => {
  vi.stubEnv("GALLERY_INTERNAL_HMAC_SECRET", secret);
  vi.clearAllMocks();
  redis.status = "ready";
  const seen = new Set<string>();
  redis.set.mockImplementation(async (key: string) => {
    if (seen.has(key)) return null;
    seen.add(key); return "OK";
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("existing API mounted internal gallery route with real signed dispatcher", () => {
  it.each(cases.map((entry, i) => [i, ...entry] as const))("dispatches DTO %s", async (i, method, input, dto) => {
    core[method].mockResolvedValueOnce(dto);
    const path = INTERNAL_GALLERY_PATHS[i]!;
    const response = await app.request(path, signed(JSON.stringify(input), path));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual(dto);
    expect(core[method]).toHaveBeenCalledExactlyOnceWith(input);
  });

  it("rejects concurrent replay before core", async () => {
    core.claimUpload.mockResolvedValue(null);
    const init = signed('{"uploadId":"upload-1"}');
    const responses = await Promise.all([app.request(INTERNAL_GALLERY_PATHS[0], init), app.request(INTERNAL_GALLERY_PATHS[0], init)]);
    expect(responses.map(r => r.status).sort()).toEqual([200, 401]);
    expect(core.claimUpload).toHaveBeenCalledTimes(1);
  });

  it("fails closed on Redis errors and rejects tampering without Redis access", async () => {
    const init = signed('{"uploadId":"upload-1"}');
    const tampered = await app.request(INTERNAL_GALLERY_PATHS[0], { ...init, body: '{"uploadId":"other"}' });
    expect(tampered.status).toBe(401);
    expect(redis.set).not.toHaveBeenCalled();
    redis.set.mockRejectedValueOnce(new Error("private Redis detail"));
    const unavailable = await app.request(INTERNAL_GALLERY_PATHS[0], init);
    expect(unavailable.status).toBe(503);
    expect(unavailable.headers.get("cache-control")).toBe("no-store");
    expect(await unavailable.text()).not.toContain("private Redis detail");
    expect(core.claimUpload).not.toHaveBeenCalled();
  });
});

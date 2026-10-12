import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  beginCloudruCdnPurge,
  cloudruCdnPurgeDone,
} from "../../../../cdn-upload/src/cloudruCdnPurge";
const env = { ...process.env };
beforeEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
  process.env = { ...env };
});
function enable() {
  process.env.CLOUDRU_CDN_PURGE_API_VERIFIED = "true";
  process.env.CLOUDRU_CDN_CACHE_KEY_VERIFIED = "true";
  process.env.CLOUDRU_CDN_ACCOUNT_NAME = "gafus-account";
  process.env.CLOUDRU_CDN_API_TOKEN = "fake-api-token-at-least-24-chars";
  process.env.GALLERY_CLOUDRU_CDN_DOMAINS = "gafus-cdn.example.com,gafus-media.example.com";
}
describe("Cloud.ru CDN purge adapter", () => {
  it("fails closed before the external provider API is verified", async () => {
    process.env.CLOUDRU_CDN_PURGE_API_VERIFIED = "false";
    await expect(beginCloudruCdnPurge("gallery", ["/albums/u/a.webp"], [])).rejects.toThrow(
      "CLOUDRU_CDN_PURGE_NOT_VERIFIED",
    );
  });
  it("checks scope, idempotency, per-domain tasks, checkpoint and completion", async () => {
    enable();
    const request = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ task_id: "job1" }))
      .mockResolvedValueOnce(Response.json({ task_id: "job2" }))
      .mockResolvedValueOnce(Response.json({ status: "ok" }))
      .mockResolvedValueOnce(Response.json({ status: "processing" }));
    vi.stubGlobal("fetch", request);
    const checkpoint = vi.fn();
    const ops = await beginCloudruCdnPurge("gallery", ["/albums/u/a.webp"], [], checkpoint);
    expect(ops).toHaveLength(2);
    expect(ops[0]).toMatch(/^cloudru:[a-f0-9]{64}:job1$/);
    expect(checkpoint).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[0][0]).toBe(
      "https://api.cdnvideo.ru/app/cache/v3/gafus-account/tasks",
    );
    expect(request.mock.calls[0][1].headers["cdn-auth-token"]).toBe(
      "fake-api-token-at-least-24-chars",
    );
    expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({
      domain: "gafus-cdn.example.com",
      action: "delete",
      action_type: "single",
      paths: ["/albums/u/a.webp"],
    });
    expect(request.mock.calls[0][1].headers["Idempotency-Key"]).toBeUndefined();
    expect(await cloudruCdnPurgeDone(ops[0]!)).toBe(true);
    expect(await cloudruCdnPurgeDone(ops[1]!)).toBe(false);
    expect(await beginCloudruCdnPurge("gallery", ["/albums/u/a.webp"], ops)).toEqual(ops);
    expect(request).toHaveBeenCalledTimes(4);
  });
  it("checkpoints and resumes large exact-file purges without exceeding the API call budget", async () => {
    enable();
    process.env.GALLERY_CLOUDRU_CDN_DOMAINS = "gafus-cdn.example.com";
    let sequence = 0;
    const calls = vi
      .fn()
      .mockImplementation(async () => Response.json({ task_id: `task-${++sequence}` }));
    vi.stubGlobal("fetch", calls);
    const paths = Array.from({ length: 75 }, (_, i) => `/albums/u/a/photos/p-${i}/thumb.webp`);
    let saved: string[] = [];
    await expect(
      beginCloudruCdnPurge("gallery", paths, [], async (operations) => {
        saved = [...operations];
      }),
    ).rejects.toThrow("CLEANUP_CDN_RATE_LIMIT");
    expect(calls).toHaveBeenCalledTimes(6);
    expect(saved).toHaveLength(6);
    const complete = await beginCloudruCdnPurge("gallery", paths, saved);
    expect(complete).toHaveLength(8);
    expect(calls).toHaveBeenCalledTimes(8);
  });
  it.each([
    { status: "failed" },
    { status: "ok", rate: [100, 98] },
    { status: "ok", cnc_rate: [99] },
  ])("does not confirm failed or partially purged cache entries: %j", async (result) => {
    enable();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(result)));
    await expect(cloudruCdnPurgeDone(`cloudru:${"a".repeat(64)}:task-1`)).rejects.toThrow(
      "CLEANUP_CDN_OPERATION_FAILED",
    );
  });
  it("treats vanished remote purge operations as retryable new submissions", async () => {
    enable();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
    await expect(cloudruCdnPurgeDone(`cloudru:${"a".repeat(64)}:task-1`)).rejects.toThrow(
      "CLEANUP_CDN_OPERATION_FAILED",
    );
  });
  it("rejects whole-cache purges and malformed task responses", async () => {
    enable();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ result: "unknown" })));
    await expect(beginCloudruCdnPurge("gallery", ["/albums/u/*"], [])).rejects.toThrow(
      "CLOUDRU_CDN_UNSAFE_PATH",
    );
    await expect(beginCloudruCdnPurge("gallery", ["/*"], [])).rejects.toThrow(
      "CLOUDRU_CDN_UNSAFE_PATH",
    );
    await expect(beginCloudruCdnPurge("gallery", ["/albums/u/a.webp"], [])).rejects.toThrow(
      "CLOUDRU_CDN_UNKNOWN_RESPONSE",
    );
  });
});

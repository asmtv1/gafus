import { describe, expect, it, vi } from "vitest";
import { createFeedCloudInternalClient, FeedInternalHttpError } from "./internal-client.js";
import { createFeedRequestVerifier } from "./hmac.js";

const key = new Uint8Array(32).fill(7);
const origin = "https://feed-api.example.test/";
const ok = (value: unknown) => new Response(JSON.stringify(value),
  { status: 200, headers: { "content-type": "application/json" } });
const client = (fetcher: typeof fetch) =>
  createFeedCloudInternalClient({ baseUrl: origin, key, fetcher });

describe("feed cloud signed internal HTTP client", () => {
  it("signs each call and sends only to the configured HTTPS origin", async () => {
    const verifier = createFeedRequestVerifier({
      key,
      nonces: { consume: vi.fn(async () => true) },
    });
    const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe("https://feed-api.example.test/internal/feed/jobs/claim");
      expect(init?.method).toBe("POST");
      expect(init?.redirect).toBe("error");
      const headers = init?.headers as Record<string, string>;
      const signed = await verifier({
        method: "POST", path: new URL(String(url)).pathname,
        body: String(init?.body), headers,
      });
      expect(signed).toBe(true);
      return ok([]);
    }) as unknown as typeof fetch;
    expect(await client(fetcher).claimJobs(5)).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("rejects insecure/credential-bearing base URLs and invalid batch sizes", async () => {
    for (const baseUrl of [
      "http://feed-api.example.test/", "https://u:p@feed-api.example.test/",
      "https://feed-api.example.test/anything", "https://feed-api.example.test/?x=1",
      "https://feed-api.example.test:8443/",
    ]) {
      expect(() => createFeedCloudInternalClient({ baseUrl, key, fetcher: vi.fn() })).toThrow("INVALID_FEED_INTERNAL_CONFIG");
    }
    const fetcher = vi.fn() as unknown as typeof fetch;
    await expect(client(fetcher).claimJobs(21)).rejects.toThrow("FEED_BATCH_SIZE");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("does not retry invalid requests and fails closed on unexpected response DTOs", async () => {
    const bad = vi.fn(async () => new Response("", { status: 403 })) as unknown as typeof fetch;
    await expect(client(bad).claimJobs(1)).rejects.toBeInstanceOf(FeedInternalHttpError);
    expect(bad).toHaveBeenCalledTimes(1);
    const invalid = vi.fn(async () => ok({ unexpected: true })) as unknown as typeof fetch;
    await expect(client(invalid).claimJobs(1)).rejects.toThrow("FEED_INTERNAL_RESPONSE_INVALID");
  });
  it("retries transient server errors with a newly signed request", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(ok({ accepted: true })) as unknown as typeof fetch;
    expect(await client(fetcher).completeJob("job_1", "attempt_1")).toEqual({ accepted: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
    const headers = vi.mocked(fetcher).mock.calls.map(call => (call[1]?.headers as Record<string,string>)["x-feed-nonce"]);
    expect(headers[0]).not.toBe(headers[1]);
  });
  it("caps response bytes during streaming and fails closed", async () => {
    const fetcher = vi.fn(async () => ok("a".repeat(65_537))) as unknown as typeof fetch;
    await expect(client(fetcher).maintenance(1)).rejects.toThrow("FEED_INTERNAL_RESPONSE_TOO_LARGE");
  });
  it("safely retries one legacy HTTP 400 with a newly signed trace-free claim", async () => {
    const trace = { invocationId: "5a246b04-64c4-4a0e-a3cc-e3f38f4f2fb0",
      jobName: "gafus-feed-video-2" };
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response("", { status: 400 }))
      .mockResolvedValueOnce(ok([])) as unknown as typeof fetch;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const traced = createFeedCloudInternalClient({ baseUrl: origin, key, trace, fetcher });
      expect(await traced.claimJobs(1, "video")).toEqual([]);
      expect(fetcher).toHaveBeenCalledTimes(2);
      const bodies = vi.mocked(fetcher).mock.calls.map(call =>
        JSON.parse(String(call[1]?.body)) as Record<string, unknown>);
      expect(bodies[0]).toHaveProperty("trace");
      expect(bodies[1]).not.toHaveProperty("trace");
      const nonces = vi.mocked(fetcher).mock.calls.map(call =>
        (call[1]?.headers as Record<string, string>)["x-feed-nonce"]);
      expect(nonces[0]).not.toEqual(nonces[1]);
      expect(String(warn.mock.calls[0]?.[0])).toContain("trace_compatibility_retry");
    } finally { warn.mockRestore(); }
  });
  it("sends the same signed trace with claim and fail callbacks", async () => {
    const trace = {
      invocationId: "5a246b04-64c4-4a0e-a3cc-e3f38f4f2fb0",
      jobName: "gafus-feed-video-2",
      executionId: "0006_qu2dx",
    };
    const fetcher = vi.fn()
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(ok({ accepted: true })) as unknown as typeof fetch;
    const traced = createFeedCloudInternalClient({ baseUrl: origin, key, trace, fetcher });
    expect(await traced.claimJobs(1, "video")).toEqual([]);
    expect(await traced.failJob("job", "attempt", "VIDEO_DOWNLOAD_S3_ACCESS_DENIED"))
      .toEqual({ accepted: true });
    const payloads = vi.mocked(fetcher).mock.calls.map(call =>
      JSON.parse(String(call[1]?.body)) as Record<string, unknown>);
    expect(payloads[0]).toMatchObject({ workerType: "video", trace });
    expect(payloads[1]).toMatchObject({ code: "VIDEO_DOWNLOAD_S3_ACCESS_DENIED", trace });
  });
  it("sends failure and maintenance commands with bounded JSON", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(ok({ accepted: false }))
      .mockResolvedValueOnce(ok({ cleaned: 2 })) as unknown as typeof fetch;
    expect(await client(fetcher).failJob("job_1", "attempt_1", "MEDIA_PROCESSING_FAILED"))
      .toEqual({ accepted: false });
    expect(await client(fetcher).maintenance(5)).toEqual({ cleaned: 2 });
    expect(JSON.parse(String(vi.mocked(fetcher).mock.calls[0]?.[1]?.body)))
      .toEqual({ jobId: "job_1", attemptToken: "attempt_1", code: "MEDIA_PROCESSING_FAILED" });
  });
});

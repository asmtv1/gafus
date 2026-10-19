import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@gafus/prisma", () => ({ prisma: {} }));
vi.mock("@gafus/queues", () => ({ connection: {} }));
import { signFeedRequest } from "@gafus/feed-cloud";
import { createFeedInternalDispatcher } from "./internal.js";
const key = new Uint8Array(32).fill(7);
const path = "/internal/feed/jobs/claim";
const token = "12345678-1234-4234-8234-123456789012";
function setup() {
  const seen = new Set<string>();
  const deps = { key, nonces: { consume: vi.fn(async (id: string) => {
    if (seen.has(id)) return false; seen.add(id); return true;
  }) }, jobs: { renew: vi.fn(async () => ({ accepted: true })), claim: vi.fn(async () => []), complete: vi.fn(async () => ({ accepted: true })),
    fail: vi.fn(async () => ({ accepted: true })) }, maintenance: { run: vi.fn(async () => ({ expired: 1, deleted: 0 })) } };
  return { deps, dispatch: createFeedInternalDispatcher(deps) };
}
function request(route = path, body = '{"batchSize":2}', extra: Record<string, string> = {}) {
  return new Request(`https://api.test${route}`, { method: "POST", body, headers: {
    "content-type": "application/json", ...signFeedRequest({ path: route as typeof path, body, key }), ...extra,
  } });
}
beforeEach(() => vi.unstubAllEnvs());
describe("feed internal dispatch", () => {
  it("dispatches leased jobs without a public envelope", async () => {
    const { deps, dispatch } = setup();
    expect(await dispatch(request(), path)).toEqual([]);
    expect(deps.jobs.claim).toHaveBeenCalledWith(2);
  });
  it("accepts only one of concurrent identical signed requests", async () => {
    const { deps, dispatch } = setup(); const req = request();
    const results = await Promise.allSettled([dispatch(req.clone(), path), dispatch(req.clone(), path)]);
    expect(results.filter(x => x.status === "fulfilled")).toHaveLength(1);
    expect(deps.jobs.claim).toHaveBeenCalledTimes(1);
  });
  it("rejects tampering before nonce consumption", async () => {
    const { deps, dispatch } = setup();
    const req = request();
    const altered = new Request(req.url, { method: "POST", headers: req.headers, body: '{"batchSize":3}' });
    await expect(dispatch(altered, path)).rejects.toMatchObject({ status: 401 });
    expect(deps.nonces.consume).not.toHaveBeenCalled();
    expect(deps.jobs.claim).not.toHaveBeenCalled();
  });
  it("fails closed on shared nonce store outage", async () => {
    const { deps, dispatch } = setup(); deps.nonces.consume.mockRejectedValue(new Error("redis unavailable"));
    await expect(dispatch(request(), path)).rejects.toMatchObject({ status: 503 });
    expect(deps.jobs.claim).not.toHaveBeenCalled();
  });
  it.each(['{"batchSize":21}', '{"batchSize":1,"extra":true}', '{"batchSize":"1"}', 'null', '{'])
  ("rejects malformed signed commands %s", async body => {
    const { deps, dispatch } = setup();
    await expect(dispatch(request(path, body), path)).rejects.toMatchObject({ status: 400 });
    expect(deps.jobs.claim).not.toHaveBeenCalled();
  });
  it("bounds an undeclared streamed body", async () => {
    const { deps, dispatch } = setup();
    await expect(dispatch(request(path, "x".repeat(16_385)), path)).rejects.toMatchObject({ status: 413 });
    expect(deps.nonces.consume).not.toHaveBeenCalled();
  });
  it("rejects route and query mismatches", async () => {
    const { dispatch } = setup();
    await expect(dispatch(request(), "/internal/feed/jobs/fail")).rejects.toMatchObject({ status: 404 });
    const req = request();
    await expect(dispatch(new Request(req.url + "?x=1", req), path)).rejects.toMatchObject({ status: 404 });
  });
  it("passes completion token and bounded output to core", async () => {
    const { deps, dispatch } = setup(); const route = "/internal/feed/jobs/complete";
    const output = { width: 10, height: 20, thumbKey: "thumb", fullKey: "full" };
    expect(await dispatch(request(route, JSON.stringify({ jobId: "job", attemptToken: token, output })), route)).toEqual({ accepted: true });
    expect(deps.jobs.complete).toHaveBeenCalledWith("job", token, output);
  });
  it.each([57, 61, 120])("accepts a %is Feed video completion", async durationSeconds => {
    const { deps, dispatch } = setup();
    const route = "/internal/feed/jobs/complete";
    const output = {
      width: 720, height: 1280, durationSeconds,
      posterKey: "poster.webp", playlistKey: "playlist.m3u8",
      videoSegmentKeys: Array.from({ length: durationSeconds }, (_, index) =>
        `segment-${String(index).padStart(3, "0")}.ts`),
    };
    const body = JSON.stringify({ jobId: "job", attemptToken: token, output });
    expect(body.length).toBeLessThanOrEqual(16_384);
    expect(await dispatch(request(route, body), route)).toEqual({ accepted: true });
    expect(deps.jobs.complete).toHaveBeenCalledWith("job", token, output);
  });
  it.each([
    { durationSeconds: 120.1, segments: 1 },
    { durationSeconds: 120, segments: 121 },
  ])("rejects an over-limit Feed video result %j", async ({ durationSeconds, segments }) => {
    const { deps, dispatch } = setup();
    const route = "/internal/feed/jobs/complete";
    const output = {
      width: 720, height: 1280, durationSeconds,
      posterKey: "poster.webp", playlistKey: "playlist.m3u8",
      videoSegmentKeys: Array.from({ length: segments }, (_, index) =>
        `segment-${String(index).padStart(3, "0")}.ts`),
    };
    const body = JSON.stringify({ jobId: "job", attemptToken: token, output });
    expect(body.length).toBeLessThanOrEqual(16_384);
    await expect(dispatch(request(route, body), route)).rejects.toMatchObject({ status: 400 });
    expect(deps.jobs.complete).not.toHaveBeenCalled();
  });
  it("correlates signed claims and failures by invocation without logging tokens", async () => {
    const { deps, dispatch } = setup();
    const trace = {
      invocationId: "5a246b04-64c4-4a0e-a3cc-e3f38f4f2fb0",
      jobName: "gafus-feed-video-2",
      hostId: "feed-pod-123",
    };
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const claimBody = JSON.stringify({ batchSize: 1, workerType: "video", trace });
      await dispatch(request(path, claimBody), path);
      const failRoute = "/internal/feed/jobs/fail";
      const code = "VIDEO_DOWNLOAD_S3_ACCESS_DENIED";
      await dispatch(request(failRoute, JSON.stringify({
        jobId: "job_1", attemptToken: token, code, trace,
      })), failRoute);
      expect(deps.jobs.claim).toHaveBeenCalledWith(1, "video");
      expect(deps.jobs.fail).toHaveBeenCalledWith("job_1", token, code);
      const events = log.mock.calls.map(call => JSON.parse(String(call[0])) as {
        event: string; code?: string; trace?: typeof trace;
      });
      expect(events.some(event => event.event === "feed_internal_claim" &&
        event.trace?.invocationId === trace.invocationId)).toBe(true);
      expect(events.some(event => event.event === "feed_internal_fail" &&
        event.trace?.invocationId === trace.invocationId &&
        event.code === code)).toBe(true);
      expect(JSON.stringify(events)).not.toContain(token);
    } finally { log.mockRestore(); }
  });
  it("rejects an invalid execution trace before issuing claims or failures", async () => {
    const { deps, dispatch } = setup();
    const untrusted = { invocationId: "not-a-uuid", jobName: "gafus-gallery-process" };
    await expect(dispatch(request(path, JSON.stringify({
      batchSize: 1, trace: untrusted,
    })), path)).rejects.toMatchObject({ status: 400 });
    expect(deps.jobs.claim).not.toHaveBeenCalled();
    const route = "/internal/feed/jobs/fail";
    await expect(dispatch(request(route, JSON.stringify({
      jobId: "job", attemptToken: token, code: "VIDEO_DOWNLOAD_HTTP_403",
      trace: { invocationId: "12345678-1234-4234-8234-123456789012",
        executionId: "Secret:unsafe/string" },
    })), route)).rejects.toMatchObject({ status: 400 });
    expect(deps.jobs.fail).not.toHaveBeenCalled();
  });
  it("passes failure and rejects unbounded error details", async () => {
    const { deps, dispatch } = setup(); const route = "/internal/feed/jobs/fail";
    await dispatch(request(route, JSON.stringify({ jobId: "job", attemptToken: token, code: "MEDIA_PROCESSING_FAILED" })), route);
    expect(deps.jobs.fail).toHaveBeenCalledWith("job", token, "MEDIA_PROCESSING_FAILED");
    await expect(dispatch(request(route, JSON.stringify({ jobId: "job", attemptToken: token, code: "secret details" })), route)).rejects.toMatchObject({ status: 400 });
  });
  it("allows maintenance with feature flags disabled", async () => {
    vi.stubEnv("FEED_ENABLED", "false"); vi.stubEnv("FEED_PROCESSOR_READY", "false");
    const { deps, dispatch } = setup(); const route = "/internal/feed/maintenance";
    expect(await dispatch(request(route), route)).toEqual({ expired: 1, deleted: 0 });
    expect(deps.maintenance.run).toHaveBeenCalledWith(2);
  });
});

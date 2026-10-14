import { describe, it, expect, vi } from "vitest";
import { createCloudruFeedPoolDispatcher, createCloudruMediaDispatcher } from "./cloudru-media-dispatcher";
const env = {
  CLOUDRU_MEDIA_JOBS_ENABLED: "true",
  CLOUDRU_PROJECT_ID: "12345678-1234-1234-1234-123456789012",
  CLOUDRU_KEY_ID: "stage-key",
  CLOUDRU_KEY_SECRET: "stage-secret",
  FEED_PROCESSOR_READY: "true",
  GALLERY_PROCESSOR_READY: "true",
};
describe("Cloud.ru durable media job trigger", () => {
  it("is disabled by default and makes no requests", async () => {
    const req = vi.fn();
    expect(await createCloudruMediaDispatcher({}, req as never)()).toEqual({
      disabled: true,
      dispatched: 0,
    });
    expect(req).not.toHaveBeenCalled();
  });
  it("fails closed on unsafe processor flags", () => {
    expect(() =>
      createCloudruMediaDispatcher({ ...env, GALLERY_PROCESSOR_READY: "false" }),
    ).toThrow("CLOUDRU_MEDIA_DISPATCHER_UNSAFE_CONFIGURATION");
  });
  it("triggers exactly three bounded allowlisted jobs and reuses short IAM token", async () => {
    const req = vi.fn(async (url: string) => {
      if (url.includes("auth/token"))
        return { ok: true, json: async () => ({ access_token: "test-token" }) };
      return { ok: true, status: 200 };
    });
    const dispatch = createCloudruMediaDispatcher(env, req as never);
    expect(await dispatch()).toEqual({ dispatched: 3 });
    expect(await dispatch()).toEqual({ dispatched: 3 });
    expect(req).toHaveBeenCalledTimes(7);
    for (const name of ["gafus-gallery-process", "gafus-feed-photo", "gafus-feed-video"])
      expect(req.mock.calls.some((call) => String(call[0]).endsWith("/" + name + ":execute"))).toBe(
        true,
      );
  });
  it("wakes only Gallery on immediate upload and does not require Feed readiness", async () => {
    const req = vi.fn(async (url: string) =>
      url.includes("auth/token")
        ? { ok: true, json: async () => ({ access_token: "test-token" }) }
        : { ok: true, status: 200 },
    );
    const dispatch = createCloudruMediaDispatcher(
      { ...env, FEED_PROCESSOR_READY: "false" },
      req as never,
      ["gafus-gallery-process"],
    );
    expect(await dispatch()).toEqual({ dispatched: 1 });
    expect(req).toHaveBeenCalledTimes(2);
    expect(req.mock.calls[1]?.[0]).toContain("/gafus-gallery-process:execute");
    expect(req.mock.calls.some(([url]) => String(url).includes("gafus-feed"))).toBe(false);
  });
  it("rejects an empty dispatch allowlist", () => {
    expect(() => createCloudruMediaDispatcher(env, fetch, [])).toThrow(
      "CLOUDRU_MEDIA_DISPATCHER_UNSAFE_CONFIGURATION",
    );
  });
  it.each(["photo", "video"] as const)("splits ten %s uploads equally with one launch per upload", async (kind) => {
    const launched: string[] = [];
    const req = vi.fn(async (url: string) => {
      if (url.includes("auth/token")) return { ok: true, json: async () => ({ access_token: "test-token" }) };
      launched.push(url);
      return { ok: true, status: 200 };
    });
    const dispatch = createCloudruFeedPoolDispatcher(kind, env, req as never);
    for (let n = 0; n < 10; n++) expect(await dispatch()).toEqual({ dispatched: 1 });
    expect(launched.filter(url => url.endsWith(`/gafus-feed-${kind}:execute`))).toHaveLength(5);
    expect(launched.filter(url => url.endsWith(`/gafus-feed-${kind}-2:execute`))).toHaveLength(5);
    expect(launched).toHaveLength(10);
    expect(launched.every(url => url.includes(`/gafus-feed-${kind}`))).toBe(true);
  });
  it("keeps both pool replicas disabled or fails closed on missing readiness", async () => {
    const req = vi.fn();
    const dispatch = createCloudruFeedPoolDispatcher("photo", {}, req as never);
    expect(await dispatch()).toEqual({ disabled: true, dispatched: 0 });
    expect(await dispatch()).toEqual({ disabled: true, dispatched: 0 });
    expect(req).not.toHaveBeenCalled();
    expect(() => createCloudruFeedPoolDispatcher("video", { ...env, FEED_PROCESSOR_READY: "false" }, req as never))
      .toThrow("CLOUDRU_MEDIA_DISPATCHER_UNSAFE_CONFIGURATION");
  });
  it("tries the other video Job on retry after a provider rejection", async () => {
    const launched: string[] = [];
    const req = vi.fn(async (url: string) => {
      if (url.includes("auth/token")) return { ok: true, json: async () => ({ access_token: "test-token" }) };
      launched.push(url);
      return { ok: launched.length > 1, status: launched.length > 1 ? 200 : 429 };
    });
    const dispatch = createCloudruFeedPoolDispatcher("video", env, req as never);
    await expect(dispatch()).rejects.toThrow("CLOUDRU_JOB_EXECUTION_FAILED_gafus-feed-video_429");
    expect(await dispatch()).toEqual({ dispatched: 1 });
    expect(launched[1]).toContain("/gafus-feed-video-2:execute");
  });
  it("does not report completed release if any job trigger fails", async () => {
    const req = vi.fn(async (url: string) => {
      if (url.includes("auth/token"))
        return { ok: true, json: async () => ({ access_token: "test-token" }) };
      return { ok: !url.includes("feed-photo"), status: 503 };
    });
    const dispatch = createCloudruMediaDispatcher(env, req as never);
    await expect(dispatch()).rejects.toThrow("CLOUDRU_JOB_EXECUTION_FAILED_gafus-feed-photo_503");
  });
});

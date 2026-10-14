import { describe, it, expect, vi } from "vitest";
import { CLOUDRU_MEDIA_JOB_NAMES, createCloudruMediaDispatcher } from "./cloudru-media-dispatcher";
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
    for (const name of CLOUDRU_MEDIA_JOB_NAMES)
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

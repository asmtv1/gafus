import { describe, it, expect, vi } from "vitest";
import { createCloudruFeedPoolDispatcher, createCloudruMediaDispatcher,
  inspectGalleryExecutionCapacity } from "./cloudru-media-dispatcher";
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
  it("detects stale Gallery executions beyond timeout without inventing capacity", () => {
    const now = Date.parse("2026-10-19T20:45:00Z");
    const records = Array.from({length:5}, (_, i) => ({
      executionName: "run" + i, executionStatus: i % 2 ? "creating" : "running",
      createdAt: "2026-10-19T13:18:01Z",
    }));
    expect(inspectGalleryExecutionCapacity({data: records}, now)).toMatchObject({
      active:5, stale:5, atCapacity:true,
    });
    expect(inspectGalleryExecutionCapacity({data:[
      records[0], {executionStatus:"succeeded",createdAt:records[0]!.createdAt},
      {executionStatus:"failed",createdAt:records[0]!.createdAt},
    ]}, now)).toMatchObject({active:1,stale:1,atCapacity:false});
    expect(() => inspectGalleryExecutionCapacity({error:"provider failed"}, now))
      .toThrow("CLOUDRU_GALLERY_EXECUTIONS_INVALID");
  });
  it("does not submit Gallery execute when provider reports five active executions", async () => {
    const now = Date.now();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const req = vi.fn(async (url: string) => {
      if (url.includes("auth/token")) return {ok:true,status:200,
        json:async()=>({access_token:"test-token"})};
      if (url.includes("/executions?")) return {ok:true,status:200,
        json:async()=>({data:Array.from({length:5},()=>({
          executionStatus:"running",createdAt:new Date(now - 500_000).toISOString(),
        }))})};
      throw Error("Gallery execute must never be called at capacity");
    });
    try {
      const dispatch = createCloudruMediaDispatcher(env, req as never,
        ["gafus-gallery-process"], {galleryAdmission:true});
      expect(await dispatch()).toEqual({dispatched:0,blocked:true});
      expect(req.mock.calls.some(([url])=>String(url).endsWith(":execute"))).toBe(false);
      expect(String(warn.mock.calls[0]?.[0])).toContain("cloudru_gallery_capacity_blocked");
      expect(String(warn.mock.calls[0]?.[0])).toContain('"stale":5');
    } finally { warn.mockRestore(); }
  });
  it("starts Gallery with available capacity and does not count completed executions", async () => {
    const req=vi.fn(async(url:string)=>{
      if(url.includes("auth/token")) return {ok:true,status:200,
        json:async()=>({access_token:"test-token"})};
      if(url.includes("/executions?")) return {ok:true,status:200,
        json:async()=>({data:[{executionStatus:"running",createdAt:new Date().toISOString()},
          {executionStatus:"succeeded",createdAt:new Date().toISOString()}]})};
      return {ok:true,status:200};
    });
    expect(await createCloudruMediaDispatcher(env,req as never,
      ["gafus-gallery-process"],{galleryAdmission:true})()).toEqual({dispatched:1});
    expect(req.mock.calls.filter(([url])=>String(url).endsWith(":execute"))).toHaveLength(1);
  });
  it("does not make Gallery unavailable when provider capacity inspection is down", async () => {
    const warn=vi.spyOn(console,"warn").mockImplementation(()=>{});
    const req=vi.fn(async(url:string)=>{
      if(url.includes("auth/token")) return {ok:true,status:200,
        json:async()=>({access_token:"test-token"})};
      if(url.includes("/executions?")) throw Error("provider secret must not enter logs");
      return {ok:true,status:200};
    });
    try {
      expect(await createCloudruMediaDispatcher(env,req as never,
        ["gafus-gallery-process"],{galleryAdmission:true})()).toEqual({dispatched:1});
      expect(String(warn.mock.calls[0]?.[0])).toContain("inspection_failed");
      expect(JSON.stringify(warn.mock.calls)).not.toContain("provider secret");
    } finally {warn.mockRestore();}
  });
  it("logs only approved Cloud.ru 499 metadata, not response bodies or arbitrary headers", async () => {
    const err=vi.spyOn(console,"error").mockImplementation(()=>{});
    const req=vi.fn(async(url:string)=>{
      if(url.includes("auth/token")) return {ok:true,status:200,
        json:async()=>({access_token:"test-token"})};
      return new Response("SECRET_KEY_DO_NOT_LOG",{
        status:499,headers:{"x-request-id":"request-1234",
          "x-error-code":"QUOTA_EXCEEDED",
          "x-auth-token":"VERY_PRIVATE"},
      });
    });
    try {
      await expect(createCloudruMediaDispatcher(env,req as never,
        ["gafus-gallery-process"])()).rejects.toThrow("CLOUDRU_JOB_EXECUTION_FAILED_gafus-gallery-process_499");
      expect(JSON.stringify(err.mock.calls)).toContain("request-1234");
      expect(JSON.parse(String(err.mock.calls[0]?.[0]))).toMatchObject({
        event: "cloudru_media_execute_rejected",
        job: "gafus-gallery-process", httpStatus: 499, requestId: "request-1234",
        providerCode: "QUOTA_EXCEEDED",
      });
      expect(JSON.stringify(err.mock.calls)).not.toContain("SECRET_KEY");
      expect(JSON.stringify(err.mock.calls)).not.toContain("VERY_PRIVATE");
    } finally {err.mockRestore();}
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
  it("keeps Feed video recovery running when Gallery responds 499", async () => {
    const launched: string[] = [];
    const req = vi.fn(async (url: string) => {
      if (url.includes("auth/token"))
        return { ok: true, status: 200, json: async () => ({ access_token: "test-token" }) };
      launched.push(url);
      return { ok: !url.includes("gallery-process"), status: url.includes("gallery-process") ? 499 : 200 };
    });
    const dispatch = createCloudruMediaDispatcher(env, req as never);
    await expect(dispatch()).rejects.toThrow("CLOUDRU_JOB_EXECUTION_FAILED_gafus-gallery-process_499");
    expect(launched.map(url => url.split("/").pop())).toEqual([
      "gafus-gallery-process:execute",
      "gafus-feed-photo:execute",
      "gafus-feed-video:execute",
    ]);
  });
  it("keeps Feed video recovery running when Gallery network request rejects", async () => {
    const launched: string[] = [];
    const req = vi.fn(async (url: string) => {
      if (url.includes("auth/token"))
        return { ok: true, status: 200, json: async () => ({ access_token: "test-token" }) };
      launched.push(url);
      if (url.includes("gallery-process")) throw new Error("provider timeout");
      return { ok: true, status: 200 };
    });
    await expect(createCloudruMediaDispatcher(env, req as never)())
      .rejects.toThrow("provider timeout");
    expect(launched).toHaveLength(3);
    expect(launched[2]).toContain("gafus-feed-video:execute");
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

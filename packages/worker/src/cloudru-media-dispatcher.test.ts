import { describe, it, expect, vi } from "vitest";
import { createCloudruFeedPoolDispatcher, createCloudruMediaDispatcher,
  createCloudruChatPoolDispatcher, safeCloudruDispatchError,
  CLOUDRU_CHAT_JOB_POOLS } from "./cloudru-media-dispatcher";
const env = {
  CLOUDRU_MEDIA_JOBS_ENABLED: "true",
  CLOUDRU_PROJECT_ID: "12345678-1234-1234-1234-123456789012",
  CLOUDRU_KEY_ID: "stage-key",
  CLOUDRU_KEY_SECRET: "stage-secret",
  FEED_PROCESSOR_READY: "true",
  FEED_CLOUDRU_REFRACTOR_VERIFIED: "true",
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
  it("blocks unverified same-named Cloud Feed jobs before any network request", () => {
    const req = vi.fn();
    expect(() => createCloudruFeedPoolDispatcher("video",
      { ...env, FEED_CLOUDRU_REFRACTOR_VERIFIED: "false" }, req as never))
      .toThrow("CLOUDRU_MEDIA_DISPATCHER_UNSAFE_CONFIGURATION");
    expect(req).not.toHaveBeenCalled();
  });
  it("fails closed on unsafe VIDEO processor flags", () => {
    expect(() =>
      createCloudruMediaDispatcher({ ...env, FEED_PROCESSOR_READY: "false" }),
    ).toThrow("CLOUDRU_MEDIA_DISPATCHER_UNSAFE_CONFIGURATION");
  });
  it("triggers only feed video jobs with cached IAM token", async () => {
    const req = vi.fn(async (url: string) => {
      if (url.includes("auth/token"))
        return { ok: true, json: async () => ({ access_token: "test-token" }) };
      return { ok: true, status: 200 };
    });
    const dispatch = createCloudruMediaDispatcher(env, req as never);
    expect(await dispatch()).toEqual({ dispatched: 1 });
    expect(await dispatch()).toEqual({ dispatched: 1 });
    expect(req).toHaveBeenCalledTimes(3);
    expect(req.mock.calls[0]?.[0]).toBe("https://iam.api.cloud.ru/api/v1/auth/token");
    for (const name of ["gafus-feed-video"])
      expect(req.mock.calls.some((call) => String(call[0]).endsWith("/" + name + ":execute"))).toBe(
        true,
      );
  });
  it("refuses retired Gallery Cloud calls before IAM/execute",()=>{
    const req=vi.fn();
    for(const name of ["gafus-gallery-process","gafus-gallery-process-2"])
      expect(()=>createCloudruMediaDispatcher(env,req as never,[name] as never))
        .toThrow("CLOUDRU_MEDIA_DISPATCHER_UNSAFE_CONFIGURATION");
    expect(req).not.toHaveBeenCalled();
  });
  it("rejects an empty dispatch allowlist", () => {
    expect(() => createCloudruMediaDispatcher(env, fetch, [])).toThrow(
      "CLOUDRU_MEDIA_DISPATCHER_UNSAFE_CONFIGURATION",
    );
  });
  it.each(["video"] as const)("splits ten %s uploads equally with one launch per upload", async (kind) => {
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
    const dispatch = createCloudruFeedPoolDispatcher("video", {}, req as never);
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
      return { ok: !url.includes("feed-video"), status: 503 };
    });
    const dispatch = createCloudruMediaDispatcher(env, req as never);
    await expect(dispatch()).rejects.toThrow("CLOUDRU_JOB_EXECUTION_FAILED_gafus-feed-video_503");
  });
});


describe("Chat2 video-only Cloud Job pool",()=>{
 const chatEnv={...env,CHAT2_PROCESSOR_READY:"true",CHAT2_V2_CORE_ENABLED:"true",
  CHAT2_V2_MEDIA_ENABLED:"true",CHAT2_CLOUDRU_PROJECT_VERIFIED:"true",
  CHAT2_CLOUDRU_PROJECT_ID:"6777bd18-4ee9-4d15-bb1b-134f7a18ed3a",
  CHAT2_CLOUDRU_KEY_ID:"isolated-chat2-account-test-key",
  CHAT2_CLOUDRU_KEY_SECRET:"isolated-chat2-test-secret"};
 it("declares the exact two/size job names without altering Feed",()=>{
  expect(CLOUDRU_CHAT_JOB_POOLS).toEqual({
   video:["gafus-chat-video","gafus-chat-video-2"],
  });
 });
 it.each(["video"] as const)("alternates %s Jobs 1:1 on ten uploads",async kind=>{
  const launches:string[]=[];
  const http=vi.fn(async (url:string)=>{
   if(url.includes("auth/token"))return {ok:true,json:async()=>({access_token:"test-token"})};
   launches.push(url);return {ok:true,status:200};
  });
  const dispatch=createCloudruChatPoolDispatcher(kind,chatEnv,http as never);
  for(let i=0;i<10;i++)expect(await dispatch()).toEqual({dispatched:1});
  expect(launches).toHaveLength(10);
  expect(launches.filter(url=>url.endsWith(`/gafus-chat-${kind}:execute`))).toHaveLength(5);
  expect(launches.filter(url=>url.endsWith(`/gafus-chat-${kind}-2:execute`))).toHaveLength(5);
  expect(launches.every(url=>url.includes(`/gafus-chat-${kind}`))).toBe(true);
 });
 it("refuses old-organization credentials and pins every Chat2 launch to the new project",async()=>{
  const requests: {url:string; init?:RequestInit}[]=[];
  const http=vi.fn(async (url:string,init?:RequestInit)=>{
    requests.push({url,init});
    return url.includes("auth/token")
      ? {ok:true,json:async()=>({access_token:"test-token"})}
      : {ok:true,status:200};
  });
  for(const changed of [
    {...chatEnv,CHAT2_CLOUDRU_PROJECT_ID:env.CLOUDRU_PROJECT_ID},
    {...chatEnv,CHAT2_CLOUDRU_PROJECT_VERIFIED:"false"},
    {...chatEnv,CHAT2_CLOUDRU_KEY_ID:""},
  ])
    expect(()=>createCloudruChatPoolDispatcher("video",changed,http as never))
      .toThrow("CHAT2_CLOUDRU_NEW_ORGANIZATION_UNVERIFIED");
  expect(requests).toHaveLength(0);
  const launch=createCloudruChatPoolDispatcher("video",chatEnv,http as never);
  expect(await launch()).toEqual({dispatched:1});
  expect(requests).toHaveLength(2);
  const login=JSON.parse(String(requests[0]!.init?.body)) as Record<string,string>;
  expect(requests[0]!.url).toBe("https://iam.api.cloud.ru/api/v2/auth/token");
  expect(login.keyId).toBe(chatEnv.CHAT2_CLOUDRU_KEY_ID);
  expect(login.keyId).not.toBe(env.CLOUDRU_KEY_ID);
  const action=JSON.parse(String(requests[1]!.init?.body)) as Record<string,string>;
  expect(action.projectId).toBe(chatEnv.CHAT2_CLOUDRU_PROJECT_ID);
  expect(action.projectId).not.toBe(env.CLOUDRU_PROJECT_ID);
 });
 it("does not dispatch without chat flags even if Feed is ready",async()=>{
  const http=vi.fn();
  expect(await createCloudruChatPoolDispatcher("video",{},http as never)())
   .toEqual({disabled:true,dispatched:0});
  expect(http).not.toHaveBeenCalled();
  expect(()=>createCloudruChatPoolDispatcher("video",env,http as never))
   .toThrow("CHAT2_CLOUDRU_NEW_ORGANIZATION_UNVERIFIED");
 });
 it("does not launch a second media processor in the same failed attempt; next tries other replica",async()=>{
  const launches:string[]=[];
  const http=vi.fn(async (url:string)=>{
   if(url.includes("auth/token"))return {ok:true,json:async()=>({access_token:"test-token"})};
   launches.push(url);return {ok:launches.length>1,status:launches.length>1?200:429};
  });
  const dispatch=createCloudruChatPoolDispatcher("video",chatEnv,http as never);
  await expect(dispatch()).rejects.toThrow("CLOUDRU_JOB_EXECUTION_FAILED_gafus-chat-video_429");
  expect(await dispatch()).toEqual({dispatched:1});
  expect(launches).toHaveLength(2);
  expect(launches[1]).toContain("/gafus-chat-video-2:execute");
 });
});

describe("photo Cloud Job retirement",()=>{
  it("rejects old photo job names before making any Cloud requests",()=>{
    const request=vi.fn();
    for(const name of ["gafus-feed-photo","gafus-feed-photo-2",
      "gafus-chat-photo","gafus-chat-photo-2","gafus-questions-photo",
      "gafus-gallery-process","gafus-gallery-process-2"]){
      expect(()=>createCloudruMediaDispatcher(env,request as never,
        [name] as never)).toThrow("CLOUDRU_MEDIA_DISPATCHER_UNSAFE_CONFIGURATION");
    }
    expect(request).not.toHaveBeenCalled();
  });
});

describe("Cloud dispatch diagnostics without leaking provider credentials", () => {
  it("surfaces HTTP IAM status and redacts raw response", async () => {
    const req = vi.fn(async () => new Response("private provider response", { status: 403 }));
    const dispatch = createCloudruFeedPoolDispatcher("video",env, req as never);
    await expect(dispatch()).rejects.toThrow("CLOUDRU_JOB_IAM_UNAVAILABLE_403");
    expect(safeCloudruDispatchError(new Error("CLOUDRU_JOB_IAM_UNAVAILABLE_403")).message)
      .toBe("CLOUDRU_JOB_IAM_UNAVAILABLE_403");
  });
  it("keeps DNS and timeout reasons while never logging untrusted errors", async () => {
    const err = new TypeError("fetch failed", { cause: Object.assign(new Error("dns"), { code: "EAI_AGAIN" }) });
    const req = vi.fn(async () => { throw err; });
    await expect(createCloudruFeedPoolDispatcher("video",env, req as never)())
      .rejects.toThrow("CLOUDRU_JOB_IAM_NETWORK_EAI_AGAIN");
    expect(safeCloudruDispatchError(new Error("CLOUDRU_JOB_IAM_NETWORK_EAI_AGAIN")).message)
      .toBe("CLOUDRU_JOB_IAM_NETWORK_EAI_AGAIN");
    expect(safeCloudruDispatchError(new Error("CLOUDRU_KEY_SECRET=unsafe-secret")).message)
      .toBe("CLOUDRU_JOB_UNKNOWN_FAILURE");
  });
  it("does not replay a Cloud POST after an unknown acknowledgement", async () => {
    const req = vi.fn(async (url: string) => {
      if (url.includes("auth/token")) return new Response(JSON.stringify({ access_token: "synthetic" }), { status: 200 });
      throw new DOMException("Timed out", "TimeoutError");
    });
    await expect(createCloudruFeedPoolDispatcher("video",env, req as never)())
      .rejects.toThrow("CLOUDRU_JOB_EXECUTION_NETWORK_TIMEOUT");
    expect(req).toHaveBeenCalledTimes(2);
  });
});


describe("bounded IAM recovery", () => {
  it("recovers one temporary DNS failure before launching Feed video", async () => {
    let attempts = 0;
    const req = vi.fn(async (url: string) => {
      if (url.includes("auth/token")) {
        if (++attempts === 1) throw Object.assign(new Error("temporary DNS"), {
          cause: { code: "EAI_AGAIN" },
        });
        return new Response(JSON.stringify({ access_token: "synthetic" }), { status: 200 });
      }
      return new Response(null, { status: 202 });
    });
    await expect(createCloudruFeedPoolDispatcher("video",env, req as never)())
      .resolves.toEqual({ dispatched: 1 });
    expect(attempts).toBe(2);
    expect(req).toHaveBeenCalledTimes(3);
  });
  it("retries IAM HTTP 503 once, never retries execution POST", async () => {
    const req = vi.fn(async (url: string) => {
      if (url.includes("auth/token")) return new Response("unavailable", { status: 503 });
      throw new Error("should not execute without credentials");
    });
    await expect(createCloudruFeedPoolDispatcher("video",env, req as never)())
      .rejects.toThrow("CLOUDRU_JOB_IAM_UNAVAILABLE_503");
    expect(req).toHaveBeenCalledTimes(2);
  });
});

import { describe, it, expect, vi } from "vitest";
import { createCloudruFeedPoolDispatcher, createCloudruMediaDispatcher,
  createCloudruGalleryPoolDispatcher, createCloudruChatPoolDispatcher,
  createCloudruQuestionsPhotoPoolDispatcher, CLOUDRU_QUESTIONS_PHOTO_POOL,
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
    expect(() => createCloudruFeedPoolDispatcher("photo",
      { ...env, FEED_CLOUDRU_REFRACTOR_VERIFIED: "false" }, req as never))
      .toThrow("CLOUDRU_MEDIA_DISPATCHER_UNSAFE_CONFIGURATION");
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
    expect(req.mock.calls[0]?.[0]).toBe("https://iam.api.cloud.ru/api/v1/auth/token");
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
    expect(req.mock.calls[0]?.[0]).toBe("https://iam.api.cloud.ru/api/v1/auth/token");
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
  it("gallery defaults to the existing job without requiring second readiness",async()=>{
    const launched:string[]=[];
    const req=vi.fn(async(url:string)=>{
      if(url.includes("auth/token"))return {ok:true,json:async()=>({access_token:"test-token"})};
      launched.push(url);return {ok:true,status:200};
    });
    const dispatch=createCloudruGalleryPoolDispatcher(env,req as never);
    for(let i=0;i<4;i++)expect(await dispatch()).toEqual({dispatched:1});
    expect(launched).toHaveLength(4);
    expect(launched.every(url=>url.endsWith("/gafus-gallery-process:execute"))).toBe(true);
  });
  it("requires explicit second-gallery readiness for direct provider dispatch",()=>{
    expect(()=>createCloudruMediaDispatcher(env,fetch,["gafus-gallery-process-2"]))
      .toThrow("CLOUDRU_MEDIA_DISPATCHER_UNSAFE_CONFIGURATION");
    expect(()=>createCloudruMediaDispatcher({...env,GALLERY_PROCESSOR_READY:"false",
      GALLERY_PROCESSOR_SECOND_READY:"true"},fetch,["gafus-gallery-process-2"]))
      .toThrow("CLOUDRU_MEDIA_DISPATCHER_UNSAFE_CONFIGURATION");
  });
  it("gallery two-job pool balances wake-ups and retries on next replica",async()=>{
    const launched:string[]=[];
    const req=vi.fn(async(url:string)=>{
      if(url.includes("auth/token"))return {ok:true,json:async()=>({access_token:"test-token"})};
      launched.push(url);return {ok:launched.length!==1,status:launched.length===1?503:200};
    });
    const dispatch=createCloudruGalleryPoolDispatcher({
      ...env,GALLERY_PROCESSOR_SECOND_READY:"true",
    },req as never);
    await expect(dispatch()).rejects.toThrow("CLOUDRU_JOB_EXECUTION_FAILED_gafus-gallery-process_503");
    for(let n=0;n<5;n++)expect(await dispatch()).toEqual({dispatched:1});
    expect(launched.filter(url=>url.endsWith("/gafus-gallery-process:execute"))).toHaveLength(3);
    expect(launched.filter(url=>url.endsWith("/gafus-gallery-process-2:execute"))).toHaveLength(3);
    expect(launched[1]).toContain("/gafus-gallery-process-2:execute");
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


describe("Chat2 four Cloud Job pools: two identical resources per kind",()=>{
 const chatEnv={...env,CHAT2_PROCESSOR_READY:"true",CHAT2_V2_CORE_ENABLED:"true",
  CHAT2_V2_MEDIA_ENABLED:"true",CHAT2_CLOUDRU_PROJECT_VERIFIED:"true",
  CHAT2_CLOUDRU_PROJECT_ID:"6777bd18-4ee9-4d15-bb1b-134f7a18ed3a",
  CHAT2_CLOUDRU_KEY_ID:"isolated-chat2-account-test-key",
  CHAT2_CLOUDRU_KEY_SECRET:"isolated-chat2-test-secret"};
 it("declares the exact two/size job names without altering Feed",()=>{
  expect(CLOUDRU_CHAT_JOB_POOLS).toEqual({
   photo:["gafus-chat-photo","gafus-chat-photo-2"],
   video:["gafus-chat-video","gafus-chat-video-2"],
  });
 });
 it.each(["photo","video"] as const)("alternates %s Jobs 1:1 on ten uploads",async kind=>{
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
    expect(()=>createCloudruChatPoolDispatcher("photo",changed,http as never))
      .toThrow("CHAT2_CLOUDRU_NEW_ORGANIZATION_UNVERIFIED");
  expect(requests).toHaveLength(0);
  const launch=createCloudruChatPoolDispatcher("photo",chatEnv,http as never);
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
  expect(await createCloudruChatPoolDispatcher("photo",{},http as never)())
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

describe("Questions V2: replace existing single Job within ten-Job quota",()=>{
  const live={...env,CLOUDRU_MEDIA_JOBS_ENABLED:"true",
    QUESTIONS_V2_MEDIA_ENABLED:"true",QUESTIONS_V2_PROCESSOR_READY:"true",
    QUESTIONS_V2_PUBLIC_BUCKET_VERIFIED:"true",
    QUESTIONS_V2_CLOUD_REFRACTOR_VERIFIED:"true"};
  it("targets the only existing Questions Job and does not require phantom -2",()=>{
    expect(CLOUDRU_QUESTIONS_PHOTO_POOL).toEqual(["gafus-questions-photo"]);
  });
  it("dispatches repeated photo wakeups to one existing Job using confirmed v2 IAM",async()=>{
    const urls:string[]=[];
    const request=vi.fn(async(url:string)=>{
      urls.push(url);
      if(url.includes("/auth/token"))return {ok:true,json:async()=>({access_token:"isolated-token"})};
      return {ok:true,status:200};
    });
    const dispatch=createCloudruQuestionsPhotoPoolDispatcher(live,request as never);
    await expect(dispatch()).resolves.toEqual({dispatched:1});
    await expect(dispatch()).resolves.toEqual({dispatched:1});
    expect(urls.filter(url=>url.endsWith('/gafus-questions-photo:execute'))).toHaveLength(2);
    expect(urls.some(url=>url.includes('gafus-questions-photo-2'))).toBe(false);
    expect(urls.some(url=>url.includes('/api/v2/auth/token'))).toBe(true);
  });
  it("requires explicit Questions-only verification before enabling",()=>{
    expect(()=>createCloudruQuestionsPhotoPoolDispatcher({
      ...live,QUESTIONS_V2_CLOUD_REFRACTOR_VERIFIED:"false",
    })).toThrow("CLOUDRU_MEDIA_DISPATCHER_UNSAFE_CONFIGURATION");
  });
});

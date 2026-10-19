import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@gafus/core/services/systemHealth",()=>({
  inspectCoreDueMediaWork:vi.fn(),
}));
vi.mock("@gafus/queues",()=>({connection:{}}));
import { createFeedPhotoDemandDispatcher } from "./feed-photo-demand";
import {
  createCloudruMediaDispatcher, inspectFeedPhotoCapacity,
} from "./cloudru-media-dispatcher";

const env = {
  CLOUDRU_MEDIA_JOBS_ENABLED: "true",
  FEED_PROCESSOR_READY: "true",
  CLOUDRU_PROJECT_ID: "12345678-1234-1234-1234-123456789012",
  CLOUDRU_KEY_ID: "test-key",
  CLOUDRU_KEY_SECRET: "test-secret",
};
function fixture() {
  let held = false;
  let quiet = false;
  const followUp = vi.fn(async (_ms?:number)=>{return;});
  const locks = {
    acquire: vi.fn(async () => {
      if (held) return false;
      held = true;
      return true;
    }),
    quiet: vi.fn(async () => quiet),
    markQuiet: vi.fn(async () => {quiet = true;}),
    release: vi.fn(async () => {held = false;}),
  };
  return {locks,followUp, clearQuiet:()=>{quiet=false;}};
}
const ids = (n:number) => Array.from({length:n},(_,i)=>"photo-"+i);
afterEach(()=>vi.restoreAllMocks());

describe("demand driven Feed Photo pool: 100 simultaneous uploads",()=>{
  it("empty Core queue never makes paid Cloud.ru execute calls",async()=>{
    const {locks,followUp}=fixture();
    const first=vi.fn(),second=vi.fn();
    const run=createFeedPhotoDemandDispatcher({env,locks,followUp,
      inspect:async()=>({dueIds:[],active:0}),
      providers:{"gafus-feed-photo":first,"gafus-feed-photo-2":second}});
    expect(await run()).toEqual({dispatched:0,idle:true});
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
    expect(locks.release).toHaveBeenCalledOnce();
  });
  it("100 uploads require at most 10 launches in a pass, five per provider",async()=>{
    const {locks,followUp}=fixture();
    const first=vi.fn(async()=>({dispatched:1}));
    const second=vi.fn(async()=>({dispatched:1}));
    const run=createFeedPhotoDemandDispatcher({env,locks,followUp,
      inspect:async()=>({dueIds:ids(100),active:0}),
      providers:{"gafus-feed-photo":first,"gafus-feed-photo-2":second}});
    expect(await run()).toEqual({dispatched:10});
    expect(first).toHaveBeenCalledTimes(5);
    expect(second).toHaveBeenCalledTimes(5);
    expect(followUp).toHaveBeenCalledWith(5000);
    expect(await run()).toEqual({dispatched:0,coalesced:true});
    expect(first).toHaveBeenCalledTimes(5);
  });
  it("adapts to one photo and three already leased DB jobs",async()=>{
    const {locks,followUp}=fixture();
    const a=vi.fn(async()=>({dispatched:1}));
    const b=vi.fn(async()=>({dispatched:1}));
    const run=createFeedPhotoDemandDispatcher({env,locks,followUp,
      inspect:async()=>({dueIds:ids(1),active:3}),
      providers:{"gafus-feed-photo":a,"gafus-feed-photo-2":b}});
    expect(await run()).toEqual({dispatched:1});
    expect(a).toHaveBeenCalledOnce();
    expect(b).not.toHaveBeenCalled();
    expect(followUp).toHaveBeenCalledWith(5000);
  });
  it("one unhealthy provider cannot block healthy second provider",async()=>{
    const {locks,followUp}=fixture();
    const a=vi.fn(async()=>({dispatched:0,blocked:true}));
    let successes=0;
    const b=vi.fn(async()=>{
      if (successes>=5) return {dispatched:0,blocked:true};
      successes++;return {dispatched:1};
    });
    const run=createFeedPhotoDemandDispatcher({env,locks,followUp,
      inspect:async()=>({dueIds:ids(30),active:0}),
      providers:{"gafus-feed-photo":a,"gafus-feed-photo-2":b}});
    expect(await run()).toEqual({dispatched:5});
    expect(b).toHaveBeenCalledTimes(6);
    expect(a).toHaveBeenCalledTimes(6);
  });
  it("concurrent calls from different Workers share distributed leader",async()=>{
    const {locks,followUp}=fixture();
    let release!:()=>void;
    const wait=new Promise<void>(r=>release=r);
    const a=vi.fn(async()=>{await wait;return {dispatched:1};});
    const run=createFeedPhotoDemandDispatcher({env,locks,followUp,
      inspect:async()=>({dueIds:ids(1),active:0}),
      providers:{"gafus-feed-photo":a,"gafus-feed-photo-2":vi.fn()}});
    const first=run();
    // Ensure first acquired leader before attempting concurrent wake.
    await vi.waitFor(()=>expect(a).toHaveBeenCalledOnce());
    expect(await run()).toEqual({dispatched:0,coalesced:true});
    release();
    expect(await first).toEqual({dispatched:1});
    expect(locks.release).toHaveBeenCalledOnce();
  });
  it("confirmed launch succeeds even if Redis quiet/release fails afterward",async()=>{
    const {locks,followUp}=fixture();
    locks.markQuiet.mockRejectedValueOnce(Error("redis unavailable"));
    locks.release.mockRejectedValueOnce(Error("redis unavailable"));
    const a=vi.fn(async()=>({dispatched:1}));
    const run=createFeedPhotoDemandDispatcher({env,locks,followUp,
      inspect:async()=>({dueIds:ids(1),active:0}),
      providers:{"gafus-feed-photo":a,"gafus-feed-photo-2":vi.fn()}});
    expect(await run()).toEqual({dispatched:1});
    expect(a).toHaveBeenCalledOnce();
    expect(locks.release).toHaveBeenCalledOnce();
  });
  it("Cloud.ru failed both Jobs retries through BullMQ; releases lock",async()=>{
    const {locks,followUp}=fixture();
    const reject=vi.fn(async()=>{throw Error("provider");});
    const run=createFeedPhotoDemandDispatcher({env,locks,followUp,
      inspect:async()=>({dueIds:ids(20),active:0}),
      providers:{"gafus-feed-photo":reject,"gafus-feed-photo-2":reject}});
    await expect(run()).rejects.toThrow("FEED_PHOTO_CLOUDRU_UNAVAILABLE");
    expect(locks.release).toHaveBeenCalledOnce();
    expect(locks.markQuiet).not.toHaveBeenCalled();
  });
  it("Core read failure cannot be interpreted as empty queue",async()=>{
    const {locks,followUp}=fixture();
    const run=createFeedPhotoDemandDispatcher({env,locks,followUp,
      inspect:async()=>{throw Error("db unavailable");},
      providers:{"gafus-feed-photo":vi.fn(),"gafus-feed-photo-2":vi.fn()}});
    await expect(run()).rejects.toThrow("db unavailable");
    expect(locks.release).toHaveBeenCalledOnce();
  });
});

describe("Cloud.ru Feed Photo per-Job real execution admission",()=>{
  it("does not count 8-hour stuck statuses as live, but logs stale age",()=>{
    const now=Date.parse("2026-10-20T01:00:00Z");
    const old=Array.from({length:11},()=>({
      executionStatus:"creating",createdAt:new Date(now-8*3600000).toISOString(),
    }));
    expect(inspectFeedPhotoCapacity({data:[...old,{
      executionStatus:"running",createdAt:new Date(now-1000).toISOString(),
    }]},now)).toEqual({active:1,stale:11,oldestStaleSeconds:28800,atCapacity:false});
  });
  it("blocks :execute at five fresh executions, including accepted reservations",async()=>{
    const request=vi.fn(async (url:string)=>{
      if(url.includes("/auth/token")) return {
        ok:true,status:200,json:async()=>({access_token:"token"}),
      };
      if(url.includes("/executions?")) return {ok:true,status:200,json:async()=>({
        data:Array.from({length:5},()=>({
          executionStatus:"running",createdAt:new Date().toISOString(),
        })),
      })};
      throw Error("NEVER_EXECUTE_AT_CAPACITY");
    });
    const fn=createCloudruMediaDispatcher(env,request as never,["gafus-feed-photo"],{
      feedPhotoAdmission:true,
    });
    expect(await fn()).toEqual({dispatched:0,blocked:true});
    expect(request.mock.calls.filter(([url])=>String(url).includes(":execute"))).toHaveLength(0);
  });
  it("fails closed on Cloud.ru capacity API unavailability",async()=>{
    const request=vi.fn(async(url:string)=>{
      if(url.includes("/auth/token")) return {ok:true,status:200,
        json:async()=>({access_token:"token"})};
      if(url.includes("/executions?")) return {ok:false,status:503};
      throw Error("EXECUTION_SHOULD_BE_BLOCKED");
    });
    await expect(createCloudruMediaDispatcher(env,request as never,
      ["gafus-feed-photo"],{feedPhotoAdmission:true})())
      .rejects.toThrow("CLOUDRU_FEED_PHOTO_CAPACITY_UNAVAILABLE_503");
    expect(request.mock.calls.filter(([url])=>String(url).includes(":execute"))).toHaveLength(0);
  });
  it("admits available provider capacity and tracks accepted launches",async()=>{
    const tracked=vi.fn();
    const request=vi.fn(async(url:string)=>{
      if(url.includes("/auth/token")) return {ok:true,status:200,
        json:async()=>({access_token:"token"})};
      if(url.includes("/executions?")) return {ok:true,status:200,
        json:async()=>({data:[]})};
      if(url.endsWith(":execute")) return {ok:true,status:200};
      throw Error("UNEXPECTED");
    });
    const fn=createCloudruMediaDispatcher(env,request as never,
      ["gafus-feed-photo-2"],{feedPhotoAdmission:true,
        reservedCount:()=>4,onAccepted:tracked});
    expect(await fn()).toEqual({dispatched:1});
    expect(tracked).toHaveBeenCalledWith("gafus-feed-photo-2");
    expect(request.mock.calls.filter(([url])=>String(url).endsWith(":execute"))).toHaveLength(1);
  });
});

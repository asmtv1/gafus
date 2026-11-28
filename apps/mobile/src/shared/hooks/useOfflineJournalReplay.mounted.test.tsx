// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { createNewOnlyV2Queues, type NewOnlyV2Queues } from "@/shared/lib/offline/newOnlyV2Queues";

const m = vi.hoisted(() => ({
  offline: false, owner: "owner-a", epoch: "", generation: 1,
  api: vi.fn(), invalidate: vi.fn(), report: vi.fn(), queue: null as unknown as NewOnlyV2Queues,
  appState: { currentState: "active", addEventListener: vi.fn(() => ({remove: vi.fn()})) },
}));
vi.mock("react-native",()=>({AppState:m.appState}));
vi.mock("@tanstack/react-query",()=>{const client={invalidateQueries:m.invalidate};return {useQueryClient:()=>client};});
vi.mock("./useNetworkStatus",()=>({useIsOffline:()=>m.offline}));
vi.mock("@/shared/stores/networkStatusStore",()=>({useNetworkStatusStore:{getState:()=>({isOffline:m.offline})}}));
vi.mock("@/shared/stores/authStore",()=>{
  const state=()=>({isAuthenticated:!!m.owner,isLoading:false,user:{id:m.owner},verifiedSessionEpoch:m.epoch});
  return {getSettledAuthSessionGeneration:()=>m.generation,
    useAuthStore:Object.assign((selector:(s:ReturnType<typeof state>)=>unknown)=>selector(state()),{getState:state})};
});
vi.mock("@/shared/lib/api/client",()=>({apiClient:m.api}));
vi.mock("@/shared/lib/error-reporting",()=>({reportClientError:m.report}));
vi.mock("@/shared/lib/offline/newOnlyV2Native",()=>({get newOnlyV2NativeQueues(){return m.queue;}}));
import { useOfflineJournalReplay } from "./useOfflineJournalReplay";

const payload={courseId:"clwcourse00000000000000001",dayOnCourseId:"clwdayoc0000000000000001",
  stepIndex:0,expectedStepOnDayId:"clwlink00000000000000001",expectedStepId:"clwstep00000000000000001"};
function Harness(){useOfflineJournalReplay();return null;}
describe("mounted owner-scoped journal lifecycle",()=>{
  let root:Root,node:HTMLDivElement;
  let disk:Map<string,string>,secure:Map<string,string>,reads:string[];
  const legacy={"progress-sync-storage":'{"state":{"queue":["ownerless"]}}',"prevention-sync-storage":"opaque"};
  async function render(){await act(async()=>root.render(createElement(Harness)));}
  async function advance(ms:number){await act(async()=>{await vi.advanceTimersByTimeAsync(ms);});}
  beforeEach(async()=>{
    vi.useFakeTimers();vi.clearAllMocks();
    (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
    m.offline=false;m.owner="owner-a";m.generation=1;m.appState.currentState="active";
    disk=new Map(Object.entries(legacy));secure=new Map();reads=[];
    m.queue=createNewOnlyV2Queues({
      storage:{getAllKeys:async()=>[...disk.keys()],getItem:async k=>{reads.push(k);return disk.get(k)??null;},
        setItem:async(k,v)=>{disk.set(k,v);},removeItem:async k=>{disk.delete(k);}},
      secure:{getItemAsync:async k=>secure.get(k)??null,setItemAsync:async(k,v)=>{secure.set(k,v);},deleteItemAsync:async k=>{secure.delete(k);}},
      makeId:randomUUID,now:Date.now,
    });
    m.epoch=(await m.queue.beginVerifiedLogin(m.owner)).authEpoch;
    node=document.createElement("div");document.body.appendChild(node);root=createRoot(node);
    m.api.mockImplementation(async (_path,options)=>{
      const b=options.body;
      expect(options.requestGuard()).toBe(true);
      return {success:true,ack:{protocol:2,eventId:b.eventId,operation:b.operation,state:"COMMITTED",
        replayed:false,serverRevision:"1",result:{courseId:b.courseId,allCompleted:false,stepJustCompleted:true}}};
    });
  });
  afterEach(async()=>{await act(async()=>root.unmount());node.remove();vi.useRealTimers();});
  it("wakes on a durable write after an empty initial drain and retries the exact request",async()=>{
    await render();await advance(1000);expect(m.api).not.toHaveBeenCalled();
    m.api.mockResolvedValueOnce({success:false,code:"NETWORK_ERROR"});
    const saved=await m.queue.enqueue("progress","completePracticeStep",payload);
    await advance(1000);
    expect(m.api).toHaveBeenCalledTimes(1);
    expect(await m.queue.getPending("progress")).toHaveLength(1);
    await advance(1000);
    expect(m.api).toHaveBeenCalledTimes(2);
    const a=m.api.mock.calls[0][1],b=m.api.mock.calls[1][1];
    expect(a.body).toEqual(b.body);expect(a.headers["Idempotency-Key"]).toBe(saved.eventId);
    expect(await m.queue.getPending("progress")).toEqual([]);
    expect(m.invalidate).toHaveBeenCalled();
    for(const [key,value] of Object.entries(legacy)){expect(disk.get(key)).toBe(value);expect(reads).not.toContain(key);}
  });
  it("never acknowledges an old owner after a credential change during request",async()=>{
    let finish!:(value:unknown)=>void;
    m.api.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
    await m.queue.enqueue("progress","completePracticeStep",payload);
    const oldEpoch=m.epoch;
    await render();await advance(1000);expect(m.api).toHaveBeenCalledTimes(1);
    const old=m.api.mock.calls[0][1];
    m.owner="owner-b";m.generation++;
    m.epoch=(await m.queue.beginVerifiedLogin(m.owner)).authEpoch;
    await render();expect(old.requestGuard()).toBe(false);
    finish({success:true,ack:{protocol:2,eventId:old.body.eventId,operation:old.body.operation,state:"COMMITTED",
      replayed:false,serverRevision:"1",result:{courseId:old.body.courseId,allCompleted:false,stepJustCompleted:true}}});
    await advance(2000);
    expect(m.invalidate).not.toHaveBeenCalled();
    expect(disk.get("gafus-progress-v2:owner-a:"+oldEpoch)).toContain(old.body.eventId);
    expect(await m.queue.getPending("progress")).toEqual([]);
    for(const [key,value] of Object.entries(legacy)){expect(disk.get(key)).toBe(value);expect(reads).not.toContain(key);}
  });
});

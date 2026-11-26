// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocked=vi.hoisted(()=>({api:vi.fn()}));
vi.mock("../../shared/api/client",()=>({apiRequest:mocked.api}));
import {WalksConnectedPage, fetchOwnWalkPoints} from "./WalksConnectedPage";

let host:HTMLDivElement;
let root:ReturnType<typeof createRoot>;
let cache:QueryClient;
beforeEach(()=>{
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 host=document.createElement("div");document.body.append(host);
 root=createRoot(host);
 cache=new QueryClient({defaultOptions:{queries:{retry:false}}});
 mocked.api.mockReset();
});
afterEach(async()=>{await act(async()=>root.unmount());cache.clear();host.remove();});
async function render(){
 await act(async()=>{root.render(<QueryClientProvider client={cache}><WalksConnectedPage ownerId="owner"/></QueryClientProvider>);});
 for(let i=0;i<35 && host.textContent?.includes("Загружаем прогулки");i++) {
  await act(async()=>{await new Promise(r=>setTimeout(r,10));});
 }
}
describe("owner web walk history",()=>{
 it("reads only the signed-in owner endpoint and shows GPS distance without step double counting",async()=>{
  mocked.api.mockResolvedValueOnce([{clientId:"20ae839f-0604-4d60-8d14-120324347293",startedAt:"2026-11-05T09:00:00Z",
   finishedAt:"2026-11-05T10:00:00Z",durationSeconds:3600,steps:4000,estimatedMeters:3200,
   gpsMeters:2800,gpsEnabled:true,incompleteSteps:false}]);
  await render();
  expect(mocked.api).toHaveBeenCalledWith("/api/v1/walks",expect.objectContaining({method:"GET",browserAuth:true}));
  expect(host.textContent).toContain("2.80 км");
  expect(host.textContent).not.toContain("≈2.80 км");
  expect(host.textContent).toContain("4 000");
  expect(host.textContent).toContain("Маршрут GPS");
 });
 it("renders a clear empty state instead of inventing a map",async()=>{
  mocked.api.mockResolvedValueOnce([]);
  await render();
  expect(host.textContent).toContain("Пока нет завершённых прогулок");
  expect(host.querySelector('[aria-label="Карта записанного маршрута прогулки"]')).toBeNull();
 });
});


describe("walk route pagination",()=>{
  const point=(seq:number)=>({seq,segment:1,latitude:0,longitude:seq/1000000,timestamp:"2026-11-05T09:00:00Z",accuracy:5,speed:1,accepted:true,reason:"ok",deltaMeters:1});
  it("fetches the last point after 10,000 rows",async()=>{
    mocked.api.mockImplementation(async (url:string)=>{
      const cursor=Number(new URL(url,"https://test.invalid").searchParams.get("afterSeq"));
      return Array.from({length:Math.min(200,10001-cursor)},(_,i)=>point(cursor+i+1));
    });
    const result=await fetchOwnWalkPoints("walk",new AbortController().signal);
    expect(result.partial).toBe(false);
    expect(result.points).toHaveLength(10001);
    expect(result.points.at(-1)?.seq).toBe(10001);
    expect(mocked.api).toHaveBeenCalledTimes(51);
  });
  it("reports partial history when a page repeats its cursor",async()=>{
    mocked.api.mockResolvedValueOnce(Array.from({length:200},(_,i)=>point(i+1))).mockResolvedValueOnce([point(200)]);
    const result=await fetchOwnWalkPoints("walk",new AbortController().signal);
    expect(result.partial).toBe(true);
    expect(result.points).toHaveLength(200);
    expect(mocked.api).toHaveBeenCalledTimes(2);
  });
  it("discards a cancelled request rather than displaying another selection",async()=>{
    const controller=new AbortController();
    mocked.api.mockImplementationOnce(async()=>{controller.abort();return [point(1)];});
    await expect(fetchOwnWalkPoints("walk",controller.signal)).rejects.toThrow();
  });
});

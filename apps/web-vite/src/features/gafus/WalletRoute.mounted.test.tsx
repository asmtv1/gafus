// @vitest-environment jsdom
/** WEB-URL-027: mounted App wallet deep link uses synthetic owner GET only. */
import {act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {afterEach,beforeAll,beforeEach,describe,expect,it,vi} from "vitest";
import {App} from "../../App";
import {navigate,routeForPath} from "../../shared/router/location";
import {CURRENT_USER_QUERY_KEY} from "../../shared/auth/useAuth";
import type {WalletSourceMock} from "./walletReadApi";
const actor=(id:string)=>({id,username:"user_"+id,role:"USER"});
const status=(more:Record<string,unknown>={})=>({
 serverNow:"2026-10-22T12:00:00Z",wallet:{balance:8},
 activity:{earned:2,limit:3,remaining:1,windowSeconds:86400,nextCapacityAt:null},
 rules:{postReward:1,questionReward:1,answerReward:1,reactionThreshold:10,
 reactionReward:1,bestAnswerReward:1,courseStepCost:1,miniGuideCost:1,
 accessDurationSeconds:604800},enabled:{economy:true,earning:true,spending:true},
 settingsRevision:7,userId:"PRIVATE_USER",token:"SECRET_TOKEN",...more,
});
const entry=(id="tx1")=>({id,kind:"EARN",delta:1,balanceAfter:8,
 createdAt:"2026-10-22T10:00:00Z",rewardKind:"POST_PUBLISHED",
 sourceEntityId:"PRIVATE_ENTITY",targetKey:"SECRET_TARGET"});
const page=(items:unknown[]=[],nextCursor:string|null=null)=>({items,nextCursor,
 extra:"PRIVATE_LEDGER_KEY"});
const deferred=<T,>()=>{let resolve!:(value:T)=>void;
 const promise=new Promise<T>(yes=>resolve=yes);return {promise,resolve};};
let host:HTMLDivElement,root:Root,cache:QueryClient,wire:WalletSourceMock;
let walletStatus:ReturnType<typeof vi.fn<WalletSourceMock["status"]>>;
let walletHistory:ReturnType<typeof vi.fn<WalletSourceMock["history"]>>;
let network:ReturnType<typeof vi.fn>;
// Lazy chunks and their owner-scoped loads commit across React acts.
beforeAll(async()=>{ await import("./WalletOptIn"); });
const tick=async()=>{for(let i=0;i<5;i++){
 await act(async()=>{await new Promise(r=>setTimeout(r,100));});
}};
async function mount(path="/gafus",enabled=true,withWire=true){
 window.history.replaceState(null,"",path);
 await act(async()=>root.render(<QueryClientProvider client={cache}>
  <App showWalletRouteOptIn={enabled} walletRouteWire={withWire?wire:undefined}/>
 </QueryClientProvider>));await tick();
}
async function click(label:string){
 const b=[...host.querySelectorAll<HTMLButtonElement>("button")]
  .find(el=>el.textContent?.trim()===label);
 expect(b,label).toBeDefined();await act(async()=>b?.click());await tick();
}
async function principal(id:string|null){
 await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,id?actor(id):null));
 await tick();
}
beforeEach(()=>{
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 cache=new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false}}});
 cache.setQueryData(CURRENT_USER_QUERY_KEY,actor("A"));
 walletStatus=vi.fn(async()=>status());walletHistory=vi.fn(async()=>page([entry()]));
 wire={fixtureKind:"AG2_WALLET_SYNTHETIC_SELF_GET_ONLY",
  status:walletStatus,history:walletHistory};
 network=vi.fn(async(url:string,init?:RequestInit)=>{
  if(init?.method && init.method!=="GET")throw Error("UNEXPECTED_WRITE");
  if(url==="/api/v1/user/profile")return new Response(JSON.stringify({success:true,
   data:{id:"A",username:"user_A",profile:{fullName:"Owner",city:"",about:""}}}),
   {status:200});
  throw Error("UNEXPECTED_NETWORK_"+url);
 });
 vi.stubGlobal("fetch",network);
 host=document.createElement("div");document.body.append(host);root=createRoot(host);
 window.history.replaceState(null,"","/");
});
afterEach(async()=>{await act(async()=>root.unmount());cache.clear();host.remove();
 vi.unstubAllGlobals();window.history.replaceState(null,"","/");});
describe("WEB-URL-027 App direct wallet read-only opt-in",()=>{
 it("W01 direct /gafus recognized, malformed or extra path rejected",()=>{
  expect(routeForPath("/gafus")).toBe("/gafus");
  for(const path of ["/gafus/admin","/gafus%2Fadmin","//gafus"])
   expect(routeForPath(path)).not.toBe("/gafus");
 });
 it("W02 default-off and missing branded fixture: 404 and no private reads",async()=>{
  await mount("/gafus",false);expect(host.textContent).toContain("Страница не найдена");
  await mount("/gafus",true,false);expect(host.textContent).toContain("Страница не найдена");
  expect(walletStatus).not.toHaveBeenCalled();
  expect(walletHistory).not.toHaveBeenCalled();
 });
 it("W03 guest login guard: zero wallet status/history reads",async()=>{
  cache.setQueryData(CURRENT_USER_QUERY_KEY,null);await mount();
  expect(host.textContent).toContain("Сессия изменилась");
  expect(walletStatus).not.toHaveBeenCalled();
  expect(walletHistory).not.toHaveBeenCalled();
 });
 it("W04 direct link opens existing balance/history and redacts private metadata",async()=>{
  await mount();
  expect(walletStatus).toHaveBeenCalledTimes(1);
  expect(walletHistory).toHaveBeenCalledExactlyOnceWith(null);
  expect(host.textContent).toContain("8 🐾");
  expect(host.textContent).toContain("1 из 3");
  expect(host.textContent).toContain("Публикация");
  expect(host.innerHTML).not.toMatch(/PRIVATE_|SECRET_|sourceEntityId|targetKey/);
  // The App shell independently checks onboarding state with a read-only GET.
  // These owner dashboards must never make any other network request or write.
  expect(network.mock.calls.map(([path,opts])=>[path,opts?.method])).toEqual([
    ["/api/v1/user/onboarding-tour","GET"],
  ]);
 });
 it("W05 status loading blocks history and exposes progress text",async()=>{
  const d=deferred<unknown>();walletStatus.mockReturnValueOnce(d.promise);
  await mount();expect(host.textContent).toContain("Загружаем баланс гафусов");
  expect(walletHistory).not.toHaveBeenCalled();
  await act(async()=>d.resolve(status()));await tick();
  expect(walletHistory).toHaveBeenCalledOnce();
 });
 it("W06 empty history displays safe empty state",async()=>{
  walletHistory.mockResolvedValueOnce(page());await mount();
  expect(host.textContent).toContain("Пока нет операций");
 });
 it("W07 malformed status fails closed, manual retry before history",async()=>{
  walletStatus.mockResolvedValueOnce(status({wallet:{balance:-1}}));
  await mount();expect(host.textContent).toContain("Не удалось получить баланс");
  expect(walletHistory).not.toHaveBeenCalled();
  await click("Повторить баланс");expect(walletHistory).toHaveBeenCalledOnce();
  expect(host.textContent).toContain("8 🐾");
 });
 it("W08 unauthorized history response does not leak and retries manually",async()=>{
  walletHistory.mockRejectedValueOnce({status:403,message:"PRIVATE_ACTOR"});
  await mount();expect(host.textContent).toContain("Не удалось загрузить историю");
  expect(host.innerHTML).not.toContain("PRIVATE_ACTOR");
  await click("Повторить историю");
  expect(walletHistory).toHaveBeenCalledTimes(2);
  expect(walletStatus).toHaveBeenCalledTimes(1);
 });
 it("W09 malformed history DTO fails closed; no private ledger",async()=>{
  walletHistory.mockResolvedValueOnce(page([entry("tx1"),entry("tx1")]));
  await mount();expect(host.textContent).toContain("Не удалось загрузить историю");
  expect(host.innerHTML).not.toMatch(/PRIVATE_|SECRET_/);
 });
 it("W10 failed cursor page keeps first verified items and retry works",async()=>{
  let attempts=0;
  walletHistory.mockImplementation(async cursor=>cursor===null?page([entry()],"next_1"):
   ++attempts===1?Promise.reject(Error("PRIVATE_FAILED_PAGE")):
    page([entry("tx2")],null));
  await mount();await click("Показать ещё операции");
  expect(host.querySelectorAll(".wallet-history li")).toHaveLength(1);
  expect(host.textContent).toContain("Не удалось загрузить следующую страницу");
  await click("Повторить страницу операций");
  expect(host.querySelectorAll(".wallet-history li")).toHaveLength(2);
  expect(walletHistory.mock.calls.map(([cursor])=>cursor)).toEqual([null,"next_1","next_1"]);
 });
 it("W11 A->B->A late status never enables history",async()=>{
  const d=deferred<unknown>();walletStatus.mockReturnValueOnce(d.promise);
  await mount();await principal("B");await principal("A");
  await act(async()=>d.resolve(status()));await tick();
  expect(walletHistory).not.toHaveBeenCalled();
  expect(host.textContent).not.toContain("8 🐾");
  expect(host.textContent).toContain("Личные данные скрыты");
 });
 it("W12 A->B->A late history never appears",async()=>{
  const d=deferred<unknown>();walletHistory.mockReturnValueOnce(d.promise);
  await mount();await principal("B");await principal("A");
  await act(async()=>d.resolve(page([entry()])));await tick();
  expect(host.textContent).not.toContain("Публикация");
  expect(host.textContent).toContain("Личные данные скрыты");
 });
 it("W13 leave route before history response then no late display",async()=>{
  const d=deferred<unknown>();walletHistory.mockReturnValueOnce(d.promise);
  await mount();await act(async()=>navigate("/courses"));await tick();
  await act(async()=>d.resolve(page([entry()])));await tick();
  expect(host.querySelectorAll(".wallet-history li")).toHaveLength(0);
 });
 it("W14 profile link, direct route, back, simulated popstate reload",async()=>{
  await mount("/profile");
  const link=host.querySelector<HTMLAnchorElement>('a[href="/gafus"]');
  expect(link).not.toBeNull();
  await act(async()=>link?.dispatchEvent(new MouseEvent("click",{
   bubbles:true,cancelable:true,button:0})));await tick();
  expect(location.pathname).toBe("/gafus");
  expect(host.textContent).toContain("История операций");
  await click("Мой профиль");expect(location.pathname).toBe("/profile");
  await act(async()=>{window.history.replaceState(null,"","/gafus");
   window.dispatchEvent(new PopStateEvent("popstate"));});await tick();
  expect(host.textContent).toContain("История операций");
 });
});

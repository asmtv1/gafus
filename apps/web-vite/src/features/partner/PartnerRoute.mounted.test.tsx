// @vitest-environment jsdom
/** WEB-URL-028: exact App partner legacy direct URL, synthetic injected read only. */
import {act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {beforeAll,beforeEach,afterEach,describe,it,expect,vi} from "vitest";
import {App} from "../../App";
import {navigate,routeForPath} from "../../shared/router/location";
import {CURRENT_USER_QUERY_KEY} from "../../shared/auth/useAuth";
import type {PartnerSourceWire} from "./partnerReadApi";
const actor=(id:string,role="PARTNER")=>({id,username:"partner_"+id,role});
const dto=(extra:Record<string,unknown>={})=>({
 referralCode:"PROMO_OWNER_A",referrals:3,earnedKopecks:10000,
 reservedKopecks:500,availableKopecks:9500,active:true,
 bankAccount:"PRIVATE_BANK",payoutToken:"SECRET_TOKEN",...extra,
});
const pending=<T,>()=>{let resolve!:(t:T)=>void;
 const promise=new Promise<T>(r=>resolve=r);return {promise,resolve};};
let host:HTMLDivElement,root:Root,cache:QueryClient,wire:PartnerSourceWire;
let read:ReturnType<typeof vi.fn<PartnerSourceWire["get"]>>;
let network:ReturnType<typeof vi.fn>;
// Warm only modules exercised by this synthetic App test; production stays lazy.
beforeAll(async()=>{await Promise.all([
 import("./PartnerOptIn"),
 import("../profile/ProfileOverview"),
]);});
const tick=async()=>{for(let i=0;i<5;i++){
 await act(async()=>{await new Promise(done=>setTimeout(done,100));});
}};
async function mount(path="/partner",enabled=true,withWire=true){
 window.history.replaceState(null,"",path);
 await act(async()=>root.render(<QueryClientProvider client={cache}>
  <App showPartnerRouteOptIn={enabled} partnerRouteWire={withWire?wire:undefined}/>
 </QueryClientProvider>));await tick();
}
async function click(label:string){
 const b=[...host.querySelectorAll<HTMLButtonElement>("button")]
  .find(el=>el.textContent?.trim()===label);
 expect(b,label).toBeDefined();await act(async()=>b?.click());await tick();
}
async function principal(id:string|null,role="PARTNER"){
 await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,id?actor(id,role):null));
 await tick();
}
beforeEach(()=>{
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 cache=new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false}}});
 cache.setQueryData(CURRENT_USER_QUERY_KEY,actor("A"));
 read=vi.fn(async()=>dto());
 wire={fixtureKind:"AG2_PARTNER_READONLY_SYNTHETIC",get:read};
 network=vi.fn(async(url:string,init?:RequestInit)=>{
  if(init?.method && init.method!=="GET")throw Error("WRITE_FORBIDDEN");
  if(url==="/api/v1/user/profile")return new Response(JSON.stringify({success:true,
   data:{id:"A",username:"partner_A",profile:{fullName:"Owner",city:"",about:""}}}),{status:200});
  throw Error("UNEXPECTED_API_"+url);
 });
 vi.stubGlobal("fetch",network);
 host=document.createElement("div");document.body.append(host);root=createRoot(host);
 window.history.replaceState(null,"","/");
});
afterEach(async()=>{await act(async()=>root.unmount());cache.clear();host.remove();
 vi.unstubAllGlobals();window.history.replaceState(null,"","/");});
describe("WEB-URL-028 opt-in route and private epoch",()=>{
 it("P01 exact route; malformed and extra paths never accepted",()=>{
  expect(routeForPath("/partner")).toBe("/partner");
  for(const path of ["/partner/payouts","/partner%2Fadmin","//partner"])
   expect(routeForPath(path)).not.toBe("/partner");
 });
 it("P02 default off and missing fixture yield 404 and zero partner GETs",async()=>{
  await mount("/partner",false);expect(host.textContent).toContain("Страница не найдена");
  await mount("/partner",true,false);expect(host.textContent).toContain("Страница не найдена");
  expect(read).not.toHaveBeenCalled();
 });
 it("P03 guest cannot issue private GET",async()=>{
  cache.setQueryData(CURRENT_USER_QUERY_KEY,null);await mount();
  expect(host.textContent).toContain("Сессия изменилась");
  expect(read).not.toHaveBeenCalled();
 });
 it("P04 nonpartner role fails closed, no partner GET",async()=>{
  cache.setQueryData(CURRENT_USER_QUERY_KEY,actor("A","USER"));await mount();
  expect(host.textContent).not.toContain("Доступно к выплате");
  expect(read).not.toHaveBeenCalled();
 });
 it("P05 direct link renders existing six-key projection, no PII/mutation",async()=>{
  await mount();expect(read).toHaveBeenCalledOnce();
  expect(host.textContent).toContain("Доступно к выплате");
  expect(host.querySelector<HTMLInputElement>("#partner-readonly-link")?.value)
   .toContain("register?promoCode=PROMO_OWNER_A");
  expect(host.innerHTML).not.toMatch(/PRIVATE_|SECRET_|bankAccount|payoutToken/);
  expect(host.textContent).toContain("Заявка на выплату недоступна");
  // The App shell independently checks onboarding state with a read-only GET.
  // These owner dashboards must never make any other network request or write.
  expect(network.mock.calls.map(([path,opts])=>[path,opts?.method])).toEqual([
    ["/api/v1/user/onboarding-tour","GET"],
  ]);
 });
 it("P06 empty/disabled dashboard remains explicit",async()=>{
  read.mockResolvedValueOnce(dto({referrals:0,earnedKopecks:0,reservedKopecks:0,
   availableKopecks:0,active:false}));
  await mount();expect(host.textContent).toContain("неактивна");
  expect(host.textContent).toContain("Приглашено учеников");
 });
 it("P07 failed/forbidden dashboard shows generic error and manual retry",async()=>{
  read.mockRejectedValueOnce({status:403,error:"SECRET_DB"});await mount();
  expect(host.textContent).toContain("нет партнёрских прав");
  expect(host.innerHTML).not.toContain("SECRET_DB");
  expect(read).toHaveBeenCalledTimes(1);
  await click("Повторить проверку");expect(read).toHaveBeenCalledTimes(2);
 });
 it("P08 malformed financial DTO fails closed, no misleading amount",async()=>{
  read.mockResolvedValueOnce(dto({availableKopecks:999999}));await mount();
  expect(host.textContent).toContain("Кабинет партнёра недоступен");
  expect(host.textContent).not.toContain("Доступно к выплате");
 });
 it("P09 late GET A->B->A remains fenced; no resurrected private data",async()=>{
  const d=pending<unknown>();read.mockReturnValueOnce(d.promise);await mount();
  await principal("B");await principal("A");
  await act(async()=>d.resolve(dto()));await tick();
  expect(host.textContent).not.toContain("Доступно к выплате");
  expect(host.textContent).toContain("Личные данные скрыты");
 });
 it("P10 role PARTNER->USER denies late result",async()=>{
  const d=pending<unknown>();read.mockReturnValueOnce(d.promise);await mount();
  await principal("A","USER");
  await act(async()=>d.resolve(dto()));await tick();
  expect(host.textContent).not.toContain("Доступно к выплате");
 });
 it("P11 leaving route fences late GET; no stale dashboard",async()=>{
  const d=pending<unknown>();read.mockReturnValueOnce(d.promise);await mount();
  await act(async()=>navigate("/courses"));await tick();
  await act(async()=>d.resolve(dto()));await tick();
  expect(host.textContent).not.toContain("Доступно к выплате");
 });
 it("P12 profile link, direct navigation, back and popstate",async()=>{
  await mount("/profile");
  const link=host.querySelector<HTMLAnchorElement>('a[href="/partner"]');
  expect(link).not.toBeNull();
  await act(async()=>link?.dispatchEvent(new MouseEvent("click",{
   bubbles:true,cancelable:true,button:0})));await tick();
  expect(location.pathname).toBe("/partner");
  expect(host.textContent).toContain("Доступно к выплате");
  await click("Мой профиль");expect(location.pathname).toBe("/profile");
  await act(async()=>{window.history.replaceState(null,"","/partner");
   window.dispatchEvent(new PopStateEvent("popstate"));});await tick();
  expect(host.textContent).toContain("Доступно к выплате");
 });
});

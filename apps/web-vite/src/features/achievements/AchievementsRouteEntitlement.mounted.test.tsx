// @vitest-environment jsdom
import {act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {App} from "../../App";
import {CURRENT_USER_QUERY_KEY} from "../../shared/auth/useAuth";
import {achievementsHonoRead,type SyntheticAchievementTransport} from "./achievementsApi";
import {achievementsHonoStatus,type ServerAchievementsEntitlementWire}
 from "./achievementsEntitlement";
const stat={
 totalCourses:2,completedCourses:1,inProgressCourses:1,
 totalCompletedDays:3,totalDays:6,overallProgress:50,
 totalTrainingTime:90,averageCourseProgress:50,
 longestStreak:2,currentStreak:1,
 achievements:[{id:"A_badge",title:"PRIVATE_ACHIEVEMENT_A",
  description:"Тренировка",icon:"🏆",unlocked:true,
  progress:100,category:"courses"}],
 ownerPaymentId:"SECRET_CARD",
};
const dates={dates:["2026-10-16T00:00:00.000Z"],sensitive:"SECRET_DATES"};
const later=<T,>()=>{let resolve!:(value:T)=>void;
 const promise=new Promise<T>(done=>{resolve=done;});return {promise,resolve};};
let node:HTMLDivElement,root:Root,cache:QueryClient;
let wire:SyntheticAchievementTransport;
let entitlement:ServerAchievementsEntitlementWire;
let stats:ReturnType<typeof vi.fn<SyntheticAchievementTransport["stats"]>>;
let datesFn:ReturnType<typeof vi.fn<SyntheticAchievementTransport["dates"]>>;
let access:ReturnType<typeof vi.fn<ServerAchievementsEntitlementWire["load"]>>;
let fetcher:ReturnType<typeof vi.fn>;
const tick=async()=>act(async()=>{await new Promise(done=>setTimeout(done,26));});
async function mount(enabled=true,withEntitlement=true,
 path="/achievements",withWire=true){
 window.history.replaceState(null,"",path);
 await act(async()=>root.render(<QueryClientProvider client={cache}>
  <App showAchievementsOptIn={enabled}
   achievementsSyntheticTransport={withWire?wire:undefined}
   achievementsEntitlement={withEntitlement?entitlement:undefined}/>
 </QueryClientProvider>));await tick();
}
async function click(label:string){
 const found=[...node.querySelectorAll<HTMLButtonElement>("button")]
  .find(b=>b.textContent?.trim()===label);
 expect(found,label).toBeDefined();
 await act(async()=>found?.click());await tick();
}
async function follow(label:string){
 const a=[...node.querySelectorAll<HTMLAnchorElement>("a")]
  .find(x=>x.textContent?.trim()===label);
 expect(a,label).toBeDefined();
 await act(async()=>a?.dispatchEvent(new MouseEvent("click",{
  bubbles:true,cancelable:true,button:0,
 })));await tick();
}
beforeEach(()=>{
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 window.history.replaceState(null,"","/achievements");
 cache=new QueryClient({defaultOptions:{queries:{
  retry:false,refetchOnWindowFocus:false,
 }}});
 cache.setQueryData(CURRENT_USER_QUERY_KEY,{id:"A",username:"ownerA",role:"USER"});
 access=vi.fn(async()=>({hasActiveSubscription:true,status:"ACTIVE",
  paymentMethodLast4:"SECRET_CARD"}));
 stats=vi.fn(async()=>stat);
 datesFn=vi.fn(async()=>dates);
 entitlement={
  fixtureKind:"AG2_ACHIEVEMENTS_SERVER_ENTITLEMENT_SYNTHETIC_GET_ONLY",
  load:access,
 };
 wire={fixtureKind:"AG2_ACHIEVEMENTS_OWNER_SYNTHETIC_ONLY",
  stats,dates:datesFn};
 fetcher=vi.fn(async(url:string,opts:RequestInit)=>{
  if(url==="/api/v1/user/profile"&&opts.method==="GET")
   return new Response(JSON.stringify({success:true,data:{
    id:"A",username:"ownerA",profile:{
     fullName:"Первый владелец",city:"Самара",about:"Собаки",
    },
   }}),{status:200});
  if(url==="/api/v1/auth/me"&&opts.method==="GET")
   return new Response(JSON.stringify({success:true,data:{
    id:"A",username:"ownerA",role:"USER",
   }}),{status:200});
  throw Error("REAL_HTTP_NOT_ALLOWED_"+url);
 });
 vi.stubGlobal("fetch",fetcher);
 node=document.createElement("div");document.body.append(node);root=createRoot(node);
});
afterEach(async()=>{
 await act(async()=>root.unmount());
 cache.clear();node.remove();vi.unstubAllGlobals();
 window.history.replaceState(null,"","/");
});
describe("WEB-URL-005 actual App route -> server-only subscription proof",()=>{
 it("R01 no optin: direct /achievements still ordinary 404",async()=>{
  await mount(false);
  expect(node.textContent).toContain("Страница не найдена");
  expect(access).not.toHaveBeenCalled();
  expect(stats).not.toHaveBeenCalled();
 });
 it("R02 missing explicit entitlement: no direct route, no data",async()=>{
  await mount(true,false);
  expect(node.textContent).toContain("Страница не найдена");
  expect(stats).not.toHaveBeenCalled();
 });
 it("R03 missing synthetic stats wire: no public route",async()=>{
  await mount(true,true,"/achievements",false);
  expect(node.textContent).toContain("Страница не найдена");
 });
 it("R04 direct route: entry -> server proof -> both owner reads",async()=>{
  await mount();
  expect(node.textContent).toContain("Достижения и прогресс (макет)");
  expect(access).not.toHaveBeenCalled();
  await click("Достижения и прогресс (макет)");
  expect(access).toHaveBeenCalledExactlyOnceWith({
   ownerId:"A",method:"GET",path:"/api/v1/app-subscription/status",
  });
  expect(stats).toHaveBeenCalledExactlyOnceWith({
   ownerId:"A",method:"GET",path:"/api/v1/achievements",
  });
  expect(datesFn).toHaveBeenCalledExactlyOnceWith({
   ownerId:"A",method:"GET",path:"/api/v1/achievements/training-dates",
  });
  expect(node.textContent).toContain("Курсов начато");
  expect(node.textContent).toContain("PRIVATE_ACHIEVEMENT_A");
  expect(node.innerHTML).not.toMatch(/SECRET_/);
  expect(fetcher.mock.calls.every(([,x])=>x.method==="GET")).toBe(true);
  expect(fetcher.mock.calls.some(([u])=>u==="/api/v1/achievements")).toBe(false);
  expect(fetcher.mock.calls.some(([u])=>u==="/api/v1/app-subscription/status")).toBe(false);
 });
 it("R05 inactive status is PRESENTATION, protected server GETs grant data when flag off",async()=>{
  access.mockResolvedValueOnce({hasActiveSubscription:false,status:null});
  await mount();await click("Достижения и прогресс (макет)");
  expect(node.textContent).toContain("Активная подписка не найдена");
  expect(node.textContent).toContain("Курсов начато");
  expect(stats).toHaveBeenCalledTimes(1);
  expect(datesFn).toHaveBeenCalledTimes(1);
 });
 it("R06 malformed status is UNKNOWN only; protected data still independently loads",async()=>{
  access.mockResolvedValueOnce({hasActiveSubscription:"yes",status:"ACTIVE"});
  await mount();await click("Достижения и прогресс (макет)");
  expect(node.textContent).toContain("Состояние подписки сейчас недоступно");
  expect(node.textContent).toContain("Курсов начато");
  expect(stats).toHaveBeenCalledTimes(1);
  expect(datesFn).toHaveBeenCalledTimes(1);
 });
 it("R07 status error 403/503 does not become client permission gate",async()=>{
  access.mockRejectedValueOnce({status:403,message:"SECRET_PAYMENT_PROVIDER"});
  await mount();await click("Достижения и прогресс (макет)");
  expect(node.textContent).toContain("Состояние подписки сейчас недоступно");
  expect(node.textContent).toContain("Курсов начато");
  expect(node.innerHTML).not.toContain("SECRET_PAYMENT_PROVIDER");
  expect(stats).toHaveBeenCalledTimes(1);
  expect(datesFn).toHaveBeenCalledTimes(1);
 });
 it("R08 pending status never blocks protected GETs or invents access",async()=>{
  const pending=later<unknown>();access.mockReturnValueOnce(pending.promise);
  await mount();await click("Достижения и прогресс (макет)");
  expect(node.textContent).toContain("Проверяем состояние подписки");
  expect(node.textContent).toContain("Курсов начато");
  expect(stats).toHaveBeenCalledTimes(1);
  expect(datesFn).toHaveBeenCalledTimes(1);
  await act(async()=>pending.resolve({hasActiveSubscription:false,status:null}));
  await tick();
  expect(node.textContent).toContain("Активная подписка не найдена");
  expect(node.textContent).toContain("Курсов начато");
 });
 it("R09 status retry independently refreshes presentation, not protected cached data",async()=>{
  access.mockRejectedValueOnce(Error("SECRET_SERVER"));
  await mount();await click("Достижения и прогресс (макет)");
  expect(access).toHaveBeenCalledTimes(1);
  expect(stats).toHaveBeenCalledTimes(1);
  await click("Повторить проверку состояния подписки");
  expect(access).toHaveBeenCalledTimes(2);
  expect(stats).toHaveBeenCalledTimes(1);
  expect(node.innerHTML).not.toContain("SECRET_SERVER");
 });
 it("R10 A->B->A with pending status cannot resurrect A results",async()=>{
  const pending=later<unknown>();access.mockReturnValueOnce(pending.promise);
  await mount();await click("Достижения и прогресс (макет)");
  await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,{
   id:"B",username:"ownerB",role:"USER",
  }));
  await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,{
   id:"A",username:"ownerA",role:"USER",
  }));
  await act(async()=>pending.resolve({hasActiveSubscription:true,status:"ACTIVE"}));
  await tick();
  expect(node.textContent).not.toContain("PRIVATE_ACHIEVEMENT_A");
  expect(node.textContent).not.toContain("Курсов начато");
  expect(node.textContent).toContain("Достижения и прогресс (макет)");
 });
 it("R11 A->B->A late statistics cannot be resurrected",async()=>{
  const pending=later<unknown>();stats.mockReturnValueOnce(pending.promise);
  await mount();await click("Достижения и прогресс (макет)");
  await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,{
   id:"B",username:"ownerB",role:"USER",
  }));
  await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,{
   id:"A",username:"ownerA",role:"USER",
  }));
  await act(async()=>pending.resolve(stat));await tick();
  expect(node.textContent).not.toContain("PRIVATE_ACHIEVEMENT_A");
  expect(datesFn).not.toHaveBeenCalled();
 });
 it("R12 profile navigation -> actual /achievements route, without default cutover",async()=>{
  await mount(true,true,"/profile");
  await follow("Достижения (макет)");
  expect(window.location.pathname).toBe("/achievements");
  expect(node.textContent).toContain("Достижения и прогресс (макет)");
  await click("Достижения и прогресс (макет)");
  expect(access).toHaveBeenCalledTimes(1);
  expect(stats).toHaveBeenCalledTimes(1);
 });
 it("R13 navigation back from gated result clears UI and private cache",async()=>{
  await mount();await click("Достижения и прогресс (макет)");
  await click("Мой профиль");
  expect(node.textContent).toContain("Достижения и прогресс (макет)");
  expect(node.textContent).not.toContain("PRIVATE_ACHIEVEMENT_A");
  expect(cache.getQueryData(["achievements","owner","A"])).toBeUndefined();
  expect(cache.getQueryData(["achievements","server-entitlement","A"])).toBeUndefined();
 });
 it("R14 profile inactive status does not deny independently permitted achievements",async()=>{
  access.mockResolvedValueOnce({hasActiveSubscription:false,status:"PAST_DUE"});
  await mount(true,true,"/profile");
  await follow("Достижения (макет)");
  await click("Достижения и прогресс (макет)");
  expect(stats).toHaveBeenCalledTimes(1);
  expect(datesFn).toHaveBeenCalledTimes(1);
  expect(node.textContent).toContain("Активная подписка не найдена");
  expect(node.textContent).toContain("Курсов начато");
 });
 it("R15 guest direct link never checks subscription/achievements",async()=>{
  cache.setQueryData(CURRENT_USER_QUERY_KEY,null);
  await mount();
  // The unauthenticated App deliberately redirects to the public landing.
  // The restricted achievements route must never fetch private results.
  expect(node.textContent).toContain("Начать заниматься");
  expect(node.querySelector('a[href="/login"]')).not.toBeNull();
  expect(access).not.toHaveBeenCalled();
  expect(stats).not.toHaveBeenCalled();
 });
 it("R16 disabled /achievements deep link exposes no private markup",async()=>{
  await mount(false);
  expect(node.querySelector('[aria-label="Мои достижения (макет)"]')).toBeNull();
  expect(node.querySelector('[aria-label="Достижения: нужна подписка"]')).toBeNull();
 });
 it("R17 server status ACTIVE but stats403 denies and never fetches dates",async()=>{
  stats.mockRejectedValueOnce({status:403, message:"SECRET_ACCESS"});
  await mount();await click("Достижения и прогресс (макет)");
  expect(node.textContent).toContain("Нет доступа к достижениям");
  expect(node.textContent).not.toContain("Курсов начато");
  expect(node.textContent).not.toContain("Достижений пока нет");
  expect(node.innerHTML).not.toContain("SECRET_ACCESS");
  expect(datesFn).not.toHaveBeenCalled();
 });
 it("R18 revoked BETWEEN protected GETs: dates403 discards successful stats",async()=>{
  datesFn.mockRejectedValueOnce({status:403,message:"SECRET_REVOKED"});
  await mount();await click("Достижения и прогресс (макет)");
  expect(stats).toHaveBeenCalledTimes(1);
  expect(datesFn).toHaveBeenCalledTimes(1);
  expect(node.textContent).toContain("Нет доступа к достижениям");
  expect(node.textContent).not.toContain("Курсов начато");
  expect(node.textContent).not.toContain("Достижений пока нет");
  expect(node.innerHTML).not.toContain("SECRET_REVOKED");
 });
 it("R19 stats503 remains sanitized failure, manual GET retry is required",async()=>{
  stats.mockRejectedValueOnce({status:503,message:"SECRET_DATABASE"});
  await mount();await click("Достижения и прогресс (макет)");
  expect(node.textContent).toContain("Проверка доступа на сервере недоступна");
  expect(node.textContent).not.toContain("Курсов начато");
  expect(stats).toHaveBeenCalledTimes(1);
  await click("Повторить чтение (макет)");
  expect(stats).toHaveBeenCalledTimes(2);
  expect(datesFn).toHaveBeenCalledTimes(1);
  expect(node.textContent).toContain("Курсов начато");
  expect(node.innerHTML).not.toContain("SECRET_DATABASE");
 });
 it("R20 opted-in ACTUAL registered Hono GET transport: inactive status + both 200",async()=>{
  const network: string[]=[];
  fetcher.mockImplementation(async(url:string,opts:RequestInit)=>{
   network.push(url);
   expect(opts.method).toBe("GET");
   expect(opts.credentials).toBe("include");
   const data=url==="/api/v1/app-subscription/status"?
     {hasActiveSubscription:false,status:null,card:"SECRET_PAYMENT"}:
    url==="/api/v1/achievements"?stat:
    url==="/api/v1/achievements/training-dates"?dates:null;
   if(data===null)throw Error("UNEXPECTED_HONO_PATH_"+url);
   return new Response(JSON.stringify({success:true,data}),{status:200});
  });
  wire=achievementsHonoRead;entitlement=achievementsHonoStatus;
  await mount();await click("Достижения и прогресс");
  expect(network).toContain("/api/v1/app-subscription/status");
  expect(network).toContain("/api/v1/achievements");
  expect(network).toContain("/api/v1/achievements/training-dates");
  expect(node.textContent).toContain("Активная подписка не найдена");
  expect(node.textContent).toContain("Курсов начато");
  expect(node.innerHTML).not.toContain("SECRET_PAYMENT");
 });
 it("R21 real Hono GET 403 on dates after 200 stats never renders partial",async()=>{
  const network:string[]=[];
  fetcher.mockImplementation(async(url:string,opts:RequestInit)=>{
   network.push(url);expect(opts.method).toBe("GET");
   if(url==="/api/v1/app-subscription/status")return new Response(
    JSON.stringify({success:true,data:{hasActiveSubscription:true,status:"ACTIVE"}}),
    {status:200});
   if(url==="/api/v1/achievements")return new Response(
    JSON.stringify({success:true,data:stat}),{status:200});
   if(url==="/api/v1/achievements/training-dates")return new Response(
    JSON.stringify({success:false,code:"SUBSCRIPTION_REQUIRED",
      error:"SECRET_PROVIDER_ERROR"}),{status:403});
   throw Error("UNEXPECTED_HONO_PATH_"+url);
  });
  wire=achievementsHonoRead;entitlement=achievementsHonoStatus;
  await mount();await click("Достижения и прогресс");
  expect(network).toContain("/api/v1/achievements/training-dates");
  expect(node.textContent).toContain("Нет доступа к достижениям");
  expect(node.textContent).not.toContain("Курсов начато");
  expect(node.textContent).not.toContain("Достижений пока нет");
  expect(node.innerHTML).not.toContain("SECRET_PROVIDER_ERROR");
 });

 it("R22 real Hono stats503 after ACTIVE status denies without false empty",async()=>{
  const network:string[]=[];
  fetcher.mockImplementation(async(url:string,opts:RequestInit)=>{
   network.push(url);expect(opts.method).toBe("GET");
   if(url==="/api/v1/app-subscription/status")return new Response(
    JSON.stringify({success:true,data:{hasActiveSubscription:true,status:"ACTIVE"}}),
    {status:200});
   if(url==="/api/v1/achievements")return new Response(
    JSON.stringify({success:false,code:"ACHIEVEMENTS_ACCESS_CHECK_FAILED",
     error:"SECRET_SUBSCRIPTION_STORAGE_FAILURE"}),{status:503});
   throw Error("UNEXPECTED_HONO_PATH_"+url);
  });
  wire=achievementsHonoRead;entitlement=achievementsHonoStatus;
  await mount();await click("Достижения и прогресс");
  expect(network).toContain("/api/v1/achievements");
  expect(network).not.toContain("/api/v1/achievements/training-dates");
  expect(node.textContent).toContain("Проверка доступа на сервере недоступна");
  expect(node.textContent).not.toContain("Курсов начато");
  expect(node.textContent).not.toContain("Достижений пока нет");
  expect(node.innerHTML).not.toContain("SECRET_SUBSCRIPTION_STORAGE_FAILURE");
 });
 it("R23 status HTTP500 masks error; both Hono protected 200 still authoritative",async()=>{
  const network:string[]=[];
  fetcher.mockImplementation(async(url:string,opts:RequestInit)=>{
   network.push(url);expect(opts.method).toBe("GET");
   const status=url==="/api/v1/app-subscription/status";
   const data=url==="/api/v1/achievements"?stat:
     url==="/api/v1/achievements/training-dates"?dates:null;
   if(!status&&data===null)throw Error("UNEXPECTED_HONO_PATH_"+url);
   return new Response(JSON.stringify(status?
      {success:false,error:"SECRET_SERVER_LOG_STATUS_FAILURE"}:
      {success:true,data}),{status:status?500:200});
  });
  wire=achievementsHonoRead;entitlement=achievementsHonoStatus;
  await mount();await click("Достижения и прогресс");
  expect(network).toContain("/api/v1/achievements");
  expect(network).toContain("/api/v1/achievements/training-dates");
  expect(node.textContent).toContain("Состояние подписки сейчас недоступно");
  expect(node.textContent).toContain("Курсов начато");
  expect(node.innerHTML).not.toContain("SECRET_SERVER_LOG_STATUS_FAILURE");
 });
 it("R24 real Hono stats 200 then delayed dates, A->B->A hides old owner",async()=>{
  const pending=later<Response>();
  const network:string[]=[];
  fetcher.mockImplementation(async(url:string,opts:RequestInit)=>{
   network.push(url);expect(opts.method).toBe("GET");
   if(url==="/api/v1/app-subscription/status")return new Response(
     JSON.stringify({success:true,data:{hasActiveSubscription:true,status:"ACTIVE"}}),
     {status:200});
   if(url==="/api/v1/achievements")return new Response(
     JSON.stringify({success:true,data:stat}),{status:200});
   if(url==="/api/v1/achievements/training-dates")return pending.promise;
   throw Error("UNEXPECTED_HONO_PATH_"+url);
  });
  wire=achievementsHonoRead;entitlement=achievementsHonoStatus;
  await mount();await click("Достижения и прогресс");
  expect(network).toContain("/api/v1/achievements/training-dates");
  await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,{
    id:"B",username:"ownerB",role:"USER",
  }));
  await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,{
    id:"A",username:"ownerA",role:"USER",
  }));
  await act(async()=>pending.resolve(new Response(
    JSON.stringify({success:true,data:dates}),{status:200})));
  await tick();
  expect(node.textContent).not.toContain("PRIVATE_ACHIEVEMENT_A");
  expect(node.textContent).not.toContain("Курсов начато");
  expect(node.textContent).toContain("Достижения и прогресс");
 });

});

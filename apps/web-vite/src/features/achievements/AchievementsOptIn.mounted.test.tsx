// @vitest-environment jsdom
import {act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {CURRENT_USER_QUERY_KEY} from "../../shared/auth/useAuth";
import {ProfileOverview} from "../profile/ProfileOverview";
import type {SyntheticAchievementTransport} from "./achievementsApi";
import type {ServerAchievementsEntitlementWire} from "./achievementsEntitlement";
const stats={
  totalCourses:2,completedCourses:1,inProgressCourses:1,
  totalCompletedDays:7,totalDays:20,overallProgress:35,
  totalTrainingTime:210,averageCourseProgress:35,longestStreak:5,
  currentStreak:2,
  achievements:[{id:"first",title:"Первая тренировка",description:"Молодец",
    icon:"🏆",unlocked:true,progress:100,category:"courses"}],
  ownerPhone:"SECRET_PHONE",internalToken:"PRIVATE_API",
};
const dates={dates:["2026-10-18T00:00:00.000Z"],
  hiddenLocation:"PRIVATE_LOCATION"};
const wait=<T,>()=>{
  let resolve!:(value:T)=>void;
  const promise=new Promise<T>(ok=>{resolve=ok;});
  return {promise,resolve};
};
let root:Root,host:HTMLElement,cache:QueryClient;
let statsFn:ReturnType<typeof vi.fn<SyntheticAchievementTransport["stats"]>>;
let datesFn:ReturnType<typeof vi.fn<SyntheticAchievementTransport["dates"]>>;
let fetcher:ReturnType<typeof vi.fn>;
let wire:SyntheticAchievementTransport;
let entitlement:ServerAchievementsEntitlementWire;
let entitlementFn:ReturnType<typeof vi.fn<ServerAchievementsEntitlementWire["load"]>>;
const flush=async()=>{await act(async()=>{await new Promise(ok=>setTimeout(ok,15));});};
async function render(show=true,transport:SyntheticAchievementTransport|null=wire){
  await act(async()=>root.render(<QueryClientProvider client={cache}>
    <ProfileOverview userId="A" showAchievementsOptIn={show}
      achievementsSyntheticTransport={transport??undefined}
      achievementsEntitlement={entitlement}/>
  </QueryClientProvider>));await flush();
}
async function click(label:string){
  const button=[...host.querySelectorAll<HTMLButtonElement>("button")]
    .find(x=>x.textContent?.trim()===label);
  expect(button,label).toBeDefined();
  await act(async()=>button?.click());await flush();
}
async function enter(){
  await render();await click("Достижения и прогресс (макет)");
}
beforeEach(()=>{
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  window.history.replaceState(null,"","/profile");
  cache=new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false}}});
  cache.setQueryData(CURRENT_USER_QUERY_KEY,{id:"A",username:"ownerA",role:"USER"});
  statsFn=vi.fn(async()=>stats);
  datesFn=vi.fn(async()=>dates);
  wire={fixtureKind:"AG2_ACHIEVEMENTS_OWNER_SYNTHETIC_ONLY",
    stats:statsFn,dates:datesFn};
  entitlementFn=vi.fn(async()=>({hasActiveSubscription:true,status:"ACTIVE",
    paymentMethodTitle:"SECRET_CARD",providerToken:"PRIVATE_TOKEN"}));
  entitlement={
    fixtureKind:"AG2_ACHIEVEMENTS_SERVER_ENTITLEMENT_SYNTHETIC_GET_ONLY",
    load:entitlementFn,
  };
  fetcher=vi.fn(async(url:string,options?:RequestInit)=>{
    if(url!=="/api/v1/user/profile"||options?.method!=="GET")
      throw Error("UNAUTHORIZED_LIVE_HTTP");
    return new Response(JSON.stringify({success:true,data:{
      id:"A",username:"ownerA",email:"SECRET_EMAIL",profile:{
        fullName:"Владелец",city:"Самара",about:"Люблю собак",
      },
    }}),{status:200});
  });
  vi.stubGlobal("fetch",fetcher);
  host=document.createElement("div");document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{
  await act(async()=>root.unmount());cache.clear();host.remove();
  vi.unstubAllGlobals();window.history.replaceState(null,"","/");
});
describe("AG2 WEB-URL-005 Profile -> achievements synthetic opt-in",()=>{
  it("M01 default opt-in off: no entry nor achievements GET",async()=>{
    await render(false);
    expect(host.textContent).not.toContain("Достижения и прогресс (макет)");
    expect(statsFn).not.toHaveBeenCalled();
  });
  it("M02 missing explicitly marked fixture: cannot render",async()=>{
    await render(true,null);
    expect(host.textContent).not.toContain("Достижения и прогресс (макет)");
    expect(statsFn).not.toHaveBeenCalled();
  });
  it("M03 actual Profile -> entry -> stats -> dates -> back",async()=>{
    await enter();
    expect(entitlementFn).toHaveBeenCalledExactlyOnceWith({
      ownerId:"A",method:"GET",path:"/api/v1/app-subscription/status",
    });
    expect(statsFn).toHaveBeenCalledExactlyOnceWith({
      ownerId:"A",method:"GET",path:"/api/v1/achievements",
    });
    expect(datesFn).toHaveBeenCalledExactlyOnceWith({
      ownerId:"A",method:"GET",path:"/api/v1/achievements/training-dates",
    });
    expect(host.textContent).toContain("Первая тренировка");
    expect(host.textContent).toContain("Курсов начато");
    expect(host.textContent).toContain("35%");
    expect(host.textContent).toContain("Дат тренировок: 1");
    expect(host.innerHTML).not.toMatch(/SECRET_|PRIVATE_|unlockedAt/);
    expect(fetcher.mock.calls.map(([url])=>url)).toEqual([
      "/api/v1/user/profile", "/api/v1/feed/status",
    ]);
    await click("Мой профиль");
    expect(host.textContent).toContain("Достижения и прогресс (макет)");
    expect(host.textContent).not.toContain("Первая тренировка");
    expect(cache.getQueryData(["achievements","owner","A"])).toBeUndefined();
  });
  it("M04 pending stats must not display previous result",async()=>{
    const d=wait<unknown>();statsFn.mockReturnValueOnce(d.promise);
    await render();await click("Достижения и прогресс (макет)");
    expect(host.textContent).toContain("Загружаем достижения");
    expect(host.textContent).not.toContain("Первая тренировка");
    await act(async()=>d.resolve(stats));await flush();
    expect(host.textContent).toContain("Первая тренировка");
  });
  it("M05 empty achievements render empty, not fake award",async()=>{
    statsFn.mockResolvedValueOnce({...stats,achievements:[],
      totalCourses:0,completedCourses:0,inProgressCourses:0,currentStreak:0,
    });
    await enter();
    expect(host.textContent).toContain("Достижений пока нет");
    expect(host.textContent).not.toContain("Первая тренировка");
  });
  it("M06 synthetic stats error sanitized and manual refetch",async()=>{
    statsFn.mockRejectedValueOnce(Error("PRIVATE_DB_STACK")).mockResolvedValueOnce(stats);
    await enter();
    expect(host.textContent).toContain("Не удалось получить достижения");
    expect(host.textContent).not.toContain("PRIVATE_DB_STACK");
    expect(statsFn).toHaveBeenCalledTimes(1);
    await click("Повторить чтение (макет)");
    expect(statsFn).toHaveBeenCalledTimes(2);
    expect(host.textContent).toContain("Первая тренировка");
  });
  it("M07 synthetic dates error cannot masquerade as zero progress",async()=>{
    datesFn.mockRejectedValueOnce(Error("PRIVATE_DATES"));
    await enter();
    expect(host.textContent).toContain("Не удалось получить достижения");
    expect(host.textContent).not.toContain("PRIVATE_DATES");
    expect(host.textContent).not.toContain("Первая тренировка");
  });
  it("M08 invalid DTO blocks rendering, no private cache",async()=>{
    statsFn.mockResolvedValueOnce({...stats,achievements:[{
      ...stats.achievements[0],progress:900,
    }]});
    await enter();
    expect(host.textContent).toContain("Не удалось получить достижения");
    expect(host.textContent).not.toContain("Первая тренировка");
  });
  it("M09 A->B hides data, cannot reopen old result",async()=>{
    await enter();
    await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,{
      id:"B",username:"B",role:"USER",
    }));
    expect(host.textContent).toContain("Сессия изменилась");
    expect(host.textContent).not.toContain("Первая тренировка");
    expect(statsFn).toHaveBeenCalledTimes(1);
  });
  it("M10 A->B->A cannot resurrect an old achievements panel",async()=>{
    await enter();
    await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,{
      id:"B",username:"B",role:"USER",
    }));
    await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,{
      id:"A",username:"ownerA",role:"USER",
    }));
    expect(host.textContent).toContain("Сессия изменилась");
    expect(host.textContent).not.toContain("Первая тренировка");
  });
  it("M11 late stats A->B->A no private dates fetched",async()=>{
    const d=wait<unknown>();statsFn.mockReturnValueOnce(d.promise);
    await render();await click("Достижения и прогресс (макет)");
    await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,{
      id:"B",username:"B",role:"USER",
    }));
    await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,{
      id:"A",username:"ownerA",role:"USER",
    }));
    await act(async()=>d.resolve(stats));await flush();
    expect(host.textContent).toContain("Сессия изменилась");
    expect(host.textContent).not.toContain("Первая тренировка");
    expect(datesFn).not.toHaveBeenCalled();
  });
  it("M12 late dates A->B->A no previous owner data shown",async()=>{
    const d=wait<unknown>();datesFn.mockReturnValueOnce(d.promise);
    await render();await click("Достижения и прогресс (макет)");
    await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,{
      id:"B",username:"B",role:"USER",
    }));
    await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,{
      id:"A",username:"ownerA",role:"USER",
    }));
    await act(async()=>d.resolve(dates));await flush();
    expect(host.textContent).toContain("Сессия изменилась");
    expect(host.textContent).not.toContain("Первая тренировка");
  });
  it("M13 same-owner token refresh allowed, no additional GET",async()=>{
    await enter();
    await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,{
      id:"A",username:"ownerA_changed",role:"USER",
    }));
    expect(host.textContent).toContain("Первая тренировка");
    expect(statsFn).toHaveBeenCalledTimes(1);
  });
  it("M14 no request before entry, no credit or subscription mutator",async()=>{
    await render();
    expect(statsFn).not.toHaveBeenCalled();
    expect(datesFn).not.toHaveBeenCalled();
    expect(entitlementFn).not.toHaveBeenCalled();
    expect(host.textContent).not.toContain("Оплатить");
  });
});

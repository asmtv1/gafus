// @vitest-environment jsdom
import {act} from "react";
import {createRoot} from "react-dom/client";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {NextTourHost,restartProfileTour} from "./NextTourHost";
import {CURRENT_USER_QUERY_KEY} from "../../shared/auth/useAuth";
let host:HTMLDivElement,root:ReturnType<typeof createRoot>,cache:QueryClient;
const tick=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,20));});
const button=(text:string)=>[...host.querySelectorAll<HTMLButtonElement>("button")].find(b=>b.textContent?.includes(text));
beforeEach(()=>{
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 window.history.replaceState(null,"","/profile");
 host=document.createElement("div");document.body.appendChild(host);root=createRoot(host);
 cache=new QueryClient({defaultOptions:{queries:{retry:false}}});
 cache.setQueryData(CURRENT_USER_QUERY_KEY,{id:"A",username:"owner",role:"USER"});
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();cache.clear();vi.unstubAllGlobals();window.history.replaceState(null,"","/");});
async function mount(ownerId:string|null="A"){
 await act(async()=>root.render(<QueryClientProvider client={cache}>
  <NextTourHost ownerId={ownerId}/></QueryClientProvider>));
 await tick();
}
describe("source Next nine-step replay (synthetic browser, no production writes)",()=>{
 it("restarts from owner settings and traverses the original named steps",async()=>{
  const calls:string[]=[];
  vi.stubGlobal("fetch",vi.fn(async(url:string,init:RequestInit)=>{
    calls.push(init.method+" "+url);
    return new Response(JSON.stringify({success:true,data:[]}),{status:200});
  }));
  await mount();expect(host.querySelector("[data-next-onboarding-tour]")).toBeNull();
  await act(async()=>restartProfileTour("A"));await tick();
  expect(host.querySelector('[role="dialog"]')).not.toBeNull();
  expect(host.textContent).toContain("Быстрый тур");
  expect(host.textContent).toContain("1/9");
  expect(host.querySelector("button[data-web1-tour-primary]")).not.toBeNull();
  expect(host.querySelector("button[data-web1-tour-secondary]")).not.toBeNull();
  await act(async()=>button("Далее")?.click());await tick();
  expect(host.textContent).toContain("Кинолог");
  expect(window.location.pathname).toBe("/consultations");
  expect(calls.every(x=>x.startsWith("GET"))).toBe(true);
  await act(async()=>button("Пропустить")?.click());await tick();
  expect(calls).toContain("POST /api/v1/user/onboarding-tour/complete");
  expect(host.querySelector('[role="dialog"]')).toBeNull();
 });
 it("aligns the actual consultations target to source Next top-card position",async()=>{
  const scroller=vi.fn();
  vi.stubGlobal("scrollTo",scroller);
  vi.stubGlobal("scrollY",0);
  const card=document.createElement("div");
  card.className="next-cynologist-catalog";
  const target=document.createElement("div");
  target.className="card";
  target.getBoundingClientRect=()=>({x:18,y:400,top:400,bottom:550,
    left:18,right:340,width:322,height:150,toJSON:()=>({})}) as DOMRect;
  card.appendChild(target);document.body.appendChild(card);
  vi.stubGlobal("fetch",vi.fn(async(url:string)=>new Response(JSON.stringify({
    success:true,data:url==="/api/v1/pets"?[]:{hasSeenV1:true},
  }),{status:200})));
  try {
    await mount();
    await act(async()=>restartProfileTour("A"));
    await tick();
    await act(async()=>button("Далее")?.click());
    await tick();
    expect(host.textContent).toContain("Кинолог");
    expect(host.textContent).toContain("2/9");
    expect(scroller).toHaveBeenCalledWith({top:155,behavior:"auto"});
    const highlight=host.querySelector('[aria-hidden="true"][class*="highlight"]') as HTMLElement;
    expect(highlight).not.toBeNull();
    expect(highlight?.style.top).toBe("392px");
  } finally {card.remove();}
 });
 it("only the rightful owner can open or complete the tour",async()=>{
  const fetcher=vi.fn();vi.stubGlobal("fetch",fetcher);
  await mount();await act(async()=>restartProfileTour("FOREIGN"));
  expect(host.querySelector('[role="dialog"]')).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0]?.[0]).toBe("/api/v1/user/onboarding-tour");
 });
 it("autostarts only after a real owner Hono GET confirms hasSeenV1=false",async()=>{
  const calls:string[]=[];
  vi.stubGlobal("fetch",vi.fn(async(url:string)=>{
    calls.push(url);
    return new Response(JSON.stringify({success:true,data:
      url==="/api/v1/user/onboarding-tour"?{hasSeenV1:false}:[]}),{status:200});
  }));
  await mount();
  expect(host.querySelector('[role="dialog"]')).toBeNull();
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,560));});
  expect(host.querySelector('[role="dialog"]')).not.toBeNull();
  expect(host.textContent).toContain("Быстрый тур");
  expect(calls).toEqual(["/api/v1/user/onboarding-tour"]);
 });
 it("late old-account status cannot open tour for switched owner",async()=>{
  vi.stubGlobal("fetch",vi.fn(async()=>
    new Response(JSON.stringify({success:true,data:{hasSeenV1:false}}),{status:200})));
  await mount();
  await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,{
    id:"FOREIGN",username:"new-actor",role:"USER",
  }));
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,560));});
  expect(host.querySelector('[role="dialog"]')).toBeNull();
 });
 it("after add-pet navigation resumes only when current owner GET finds a saved pet",async()=>{
  let saved=false;
  const calls:string[]=[];
  vi.stubGlobal("fetch",vi.fn(async(url:string,init:RequestInit)=>{
    calls.push(`${init.method} ${url}`);
    return new Response(JSON.stringify({success:true,data:
      url==="/api/v1/pets"?(saved?[{id:"synthetic-owner-pet"}]:[]):{hasSeenV1:true},
    }),{status:200});
  }));
  await mount();await act(async()=>restartProfileTour("A"));await tick();
  for(let i=0;i<3;i++){
    await act(async()=>button("Далее")?.click());await tick();
  }
  expect(host.textContent).toContain("Добавить питомца");
  expect(host.textContent).toContain("4/9");
  await act(async()=>button("Добавить питомца")?.click());await tick();
  expect(window.location.pathname).toBe("/profile/addPet");
  expect(host.querySelector('[role="dialog"]')).toBeNull();
  expect(calls.every(x=>x.startsWith("GET"))).toBe(true);
  saved=true;
  const {navigate}=await import("../../shared/router/location");
  await act(async()=>navigate("/pets"));await tick();
  expect(host.textContent).toContain("Процедуры");
  expect(host.textContent).toContain("5/9");
  expect(calls.filter(x=>x==="GET /api/v1/pets")).toHaveLength(2);
  expect(calls.every(x=>x.startsWith("GET"))).toBe(true);
 });
 it("source final step completion writes only the registered completion endpoint",async()=>{
  const calls:{url:string;init:RequestInit}[]=[];
  vi.stubGlobal("fetch",vi.fn(async(url:string,init:RequestInit)=>{
    calls.push({url,init});
    return new Response(JSON.stringify({success:true,
      data:url==="/api/v1/pets"?[{id:"pet1"}]:{hasSeenV1:true}}),{status:200});
  }));
  await mount();await act(async()=>restartProfileTour("A"));await tick();
  const sourceSteps=["Кинолог","Питомцы","Добавить питомца",
    "Процедуры","Документы","Задание дня","Остальные курсы","Готово"];
  for(let i=0;i<8;i++){
    await act(async()=>{
      const action=button("Далее") ?? button("Добавить питомца");
      expect(action).toBeDefined();
      action?.click();
    });await tick();
    expect(host.querySelector('[role="dialog"]')?.textContent).toContain(sourceSteps[i]);
    expect(host.textContent).toContain(`${i+2}/9`);
  }
  expect(host.textContent).toContain("Готово");
  await act(async()=>button("Готово")?.click());await tick();
  expect(calls.filter(x=>x.init.method==="POST").map(x=>x.url))
    .toEqual(["/api/v1/user/onboarding-tour/complete"]);
  expect(host.querySelector('[role="dialog"]')).toBeNull();
 });
});

// @vitest-environment jsdom
import {act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {beforeEach,afterEach,describe,it,expect,vi} from "vitest";
import {TrainingIndex} from "./TrainingIndex";
import type {TrainingDaysOverview} from "./trainingDaysApi";
import {CURRENT_USER_QUERY_KEY} from "../../shared/auth/useAuth";

const courseId="personalized_course_A";
const data:Record<string,unknown>={
  userDisplayName:"Анна",userGender:"female",petName:"Барсик",petGender:"male",
  petNameGen:"Барсика",petNameDat:null,petNameAcc:null,petNameIns:null,petNamePre:null,
};
const unready:TrainingDaysOverview={
  courseId,courseDescription:null,courseEquipment:null,courseTrainingLevel:"BEGINNER",
  requiresPersonalization:true,days:[],
};
const sent=(value:unknown,status=200)=>new Response(JSON.stringify({
  success:status===200,...(value===undefined?{}:{data:value}),
  ...(status===200?{}:{error:"SECRET_BACKEND"}),
}),{status});
const privateRead=(match:boolean)=>({courseId,courseIsPersonalized:true,
  userCoursePersonalization:match?{...persisted}:{...persisted,petName:"СТАРОЕ"},
});
let root:Root,host:HTMLDivElement,cache:QueryClient;
let load:ReturnType<typeof vi.fn<()=>Promise<TrainingDaysOverview>>>;
let fetcher:ReturnType<typeof vi.fn>;
let committed:boolean,lostAck:boolean,wrongRead:boolean,readError:boolean;
let persisted:Record<string,unknown>;
const sleep=async()=>act(async()=>{await new Promise(ok=>setTimeout(ok,25));});
async function mount(){
  await act(async()=>root.render(<QueryClientProvider client={cache}>
    <TrainingIndex userId="A" courseType="IMPULSE_PERSONAL" courseName="Самоконтроль"
      loadDays={load}/>
  </QueryClientProvider>));
  await sleep();
}
async function set(id:string,value:string){
  const el=host.querySelector<HTMLInputElement|HTMLSelectElement>(`#${id}`)!;
  await act(async()=>{
    const proto=el.tagName==="SELECT"?HTMLSelectElement.prototype:HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto,"value")?.set?.call(el,value);
    el.dispatchEvent(new Event("change",{bubbles:true}));
    el.dispatchEvent(new Event("input",{bubbles:true}));
  });
}
async function fill(){
  await set("training-personal-user","Анна");
  await set("training-personal-gender","female");
  await set("training-personal-pet","Барсик");
  await set("training-personal-pet-gender","male");
  await set("training-personal-petNameGen","Барсика");
}
async function save(){
  const form=host.querySelector<HTMLFormElement>("form[aria-label='Форма персонализации курса']")!;
  await act(async()=>form.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
  await sleep();
}
const posts=()=>fetcher.mock.calls.filter(([,init])=>init?.method==="POST");
const gets=()=>fetcher.mock.calls.filter(([,init])=>init?.method==="GET");
beforeEach(()=>{
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  window.history.replaceState(null,"","/trainings/IMPULSE_PERSONAL");
  host=document.createElement("div");document.body.append(host);root=createRoot(host);
  cache=new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false}}});
  cache.setQueryData(CURRENT_USER_QUERY_KEY,{id:"A",username:"anna",role:"USER",sessionRevision:1});
  committed=false;lostAck=false;wrongRead=false;readError=false;
  persisted={...data};
  load=vi.fn(async()=>committed?{...unready,requiresPersonalization:false}:unready);
  fetcher=vi.fn(async (path:string,init:RequestInit)=>{
    if(path==="/api/v1/courses/personalization"&&init.method==="POST"){
      persisted=JSON.parse(String(init.body));
      committed=true;
      if(lostAck)throw Error("LOST_ACK_AFTER_SERVER_COMMIT");
      return sent(undefined);
    }
    if(path==="/api/v1/training/days?type=IMPULSE_PERSONAL"&&init.method==="GET"){
      if(readError)throw Error("NO_OWNER_READBACK");
      return sent(privateRead(!wrongRead));
    }
    throw Error("UNEXPECTED_API");
  });
  vi.stubGlobal("fetch",fetcher);
});
afterEach(async()=>{
  await act(async()=>root.unmount());cache.clear();host.remove();vi.unstubAllGlobals();
  window.history.replaceState(null,"","/");
});
describe("real Web route training personalization Next parity",()=>{
  it("initial personalized course actually shows a form; no unrelated POST or private cache",async()=>{
    await mount();
    expect(host.querySelector("form[aria-label='Форма персонализации курса']")).not.toBeNull();
    expect(host.textContent).not.toContain("в основном приложении");
    expect(posts()).toHaveLength(0);
    expect(JSON.stringify(cache.getQueryData(["training","days","A","IMPULSE_PERSONAL"])))
      .not.toContain("Анна");
  });
  it("one original cookie POST200 then private exact GET200 unlocks day list",async()=>{
    await mount();await fill();await save();
    expect(posts()).toHaveLength(1);
    expect(posts()[0][0]).toBe("/api/v1/courses/personalization");
    expect(posts()[0][1].headers).toMatchObject({"X-Gafus-Auth-Transport":"cookie"});
    expect(JSON.parse(String(posts()[0][1].body))).toMatchObject({courseId,...data});
    expect(gets()).toHaveLength(1);
    expect(host.textContent).not.toContain("в основном приложении");
    expect(host.querySelector("form[aria-label='Форма персонализации курса']")).toBeNull();
    expect(load.mock.calls.length).toBeGreaterThan(1);
    expect(JSON.stringify(cache.getQueryData(["training","days","A","IMPULSE_PERSONAL"])))
      .not.toContain("Барсик");
  });
  it("existing personalization can be edited with fresh private prefill and verified PUT-like POST",async()=>{
    load.mockImplementation(async()=>({...unready,requiresPersonalization:false,
      isPersonalizedCourse:true}));
    await mount();
    const change=[...host.querySelectorAll("button")]
      .find(b=>b.textContent==="Изменить персонализацию");
    expect(change).toBeDefined();
    await act(async()=>change?.click());await sleep();
    expect(gets()).toHaveLength(1);
    expect(host.querySelector<HTMLInputElement>("#training-personal-user")?.value)
      .toBe("Анна");
    expect(host.querySelector<HTMLInputElement>("#training-personal-pet")?.value)
      .toBe("Барсик");
    await set("training-personal-pet","Шарик");await save();
    expect(posts()).toHaveLength(1);
    expect(JSON.parse(String(posts()[0][1].body)).petName).toBe("Шарик");
    expect(gets()).toHaveLength(2);
    expect(host.querySelector("form[aria-label='Форма персонализации курса']"))
      .toBeNull();
    expect(JSON.stringify(cache.getQueryData(["training","days","A","IMPULSE_PERSONAL"])))
      .not.toContain("Шарик");
  });
  it("lost ACK after committed POST uses GET and never repeats POST",async()=>{
    lostAck=true;await mount();await fill();await save();
    expect(posts()).toHaveLength(1);
    expect(gets()).toHaveLength(1);
    expect(host.querySelector("form[aria-label='Форма персонализации курса']")).toBeNull();
    expect(committed).toBe(true);
  });
  it("successful HTTP200 but mismatched private GET never unlocks or repeats",async()=>{
    wrongRead=true;await mount();await fill();await save();
    expect(posts()).toHaveLength(1);
    expect(host.textContent).toContain("Не отправляйте форму ещё раз");
    const submit=host.querySelector("button[type='submit']");
    expect(submit).toBeNull();
    const verify=[...host.querySelectorAll("button")]
      .find(b=>b.textContent==="Проверить сохранение");
    await act(async()=>verify?.click());await sleep();
    expect(posts()).toHaveLength(1);
    expect(gets().length).toBeGreaterThanOrEqual(2);
  });
  it("no POST for invalid required fields; definitive 400 permits corrected submission",async()=>{
    await mount();await save();expect(posts()).toHaveLength(0);
    await fill();fetcher.mockImplementationOnce(async()=>sent(null,400));await save();
    expect(posts()).toHaveLength(1);
    expect(host.textContent).toContain("отклонил персонализацию");
    expect(host.querySelector("button[type='submit']")).not.toBeNull();
  });
  it("A→B→A while pending retires mount, hides personal draft and suppresses stale ACK",async()=>{
    let settle!:(v:Response)=>void;
    const pending=new Promise<Response>(resolve=>{settle=resolve;});
    fetcher.mockImplementationOnce(()=>pending);
    await mount();await fill();
    const form=host.querySelector<HTMLFormElement>("form")!;
    await act(async()=>{void form.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));});
    expect(posts()).toHaveLength(1);
    await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,
      {id:"B",username:"other",role:"USER",sessionRevision:2}));
    await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,
      {id:"A",username:"anna",role:"USER",sessionRevision:1}));
    await act(async()=>settle(sent(undefined)));await sleep();
    expect(host.textContent).toContain("Сессия изменилась");
    expect(host.textContent).not.toContain("Барсик");
    expect(posts()).toHaveLength(1);
    expect(gets()).toHaveLength(0);
  });
});

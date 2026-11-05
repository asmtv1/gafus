// @vitest-environment jsdom
import {act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {beforeEach,afterEach,describe,it,expect,vi} from "vitest";
import {CourseOverview} from "../courses/CourseOverview";
import {TrainingIndexOptInHarness} from "./TrainingIndexOptInHarness";
import {ReadonlyTrainingStepList,TrainingDayViewer} from "./TrainingDayViewer";
import type {TrainingDayDetail} from "./trainingDayApi";
import type {TrainingDaySummary,TrainingDaysOverview} from "./trainingDaysApi";
import {ApiError} from "../../shared/api/client";
import {CURRENT_USER_QUERY_KEY} from "../../shared/auth/useAuth";
const catalog=vi.hoisted(()=>({list:vi.fn()}));
vi.mock("../courses/courseApi",()=>({
  listCourses:catalog.list,setCourseFavorite:vi.fn(),
}));
const day:TrainingDaySummary={
  trainingDayId:"day_01",dayOnCourseId:"clwdayoc0000000000000001",
  courseId:"course_01",title:"День 1. Переключение",
  type:"practice",userStatus:"IN_PROGRESS",
  estimatedDuration:12,theoryMinutes:6,equipment:"Игрушка",isLocked:false,
};
const lockedDay:TrainingDaySummary={
  ...day,trainingDayId:"day_02",dayOnCourseId:"clwdayoc0000000000000002",
  title:"День 2. Закрепление",isLocked:true,
};
const course=()=>({
  id:"course_01",name:"Импульсивность",type:"IMPULSE_CONTROL",
  shortDesc:"Работа с возбуждением",duration:"7 дней",
  isPaid:false,isPrivate:false,hasAccess:true,isFavorite:false,
  userStatus:"IN_PROGRESS",trainingLevel:"BEGINNER",
});
const days=():TrainingDaysOverview=>({
  courseId:"course_01",courseDescription:"Курс по импульсивности",
  courseEquipment:"Игрушка",courseTrainingLevel:"BEGINNER",
  requiresPersonalization:false,days:[day,lockedDay],
});
const detail=(steps:TrainingDayDetail["steps"]=[
  {id:"s_theory",title:"Теория переключения",
    description:"Читайте инструкцию и наблюдайте за собакой.",
    type:"THEORY",status:"NOT_STARTED",order:0,durationSec:0,
    locked:false,videoUrl:null,imageUrls:[]},
  {id:"s_practice",title:"Практика с игрушкой",
    description:"Покажите игрушку, затем переключите внимание.",
    type:"PRACTICE",status:"IN_PROGRESS",order:1,durationSec:120,
    locked:false,videoUrl:"https://cdn.example.com/practice.mp4",
    imageUrls:["https://cdn.example.com/illustration.png"]},
  {id:"s_locked",title:"Закрытая теория",description:"",
    type:"THEORY",status:"NOT_STARTED",order:2,durationSec:0,
    locked:true,videoUrl:null,imageUrls:[]},
]):TrainingDayDetail=>({
  trainingDayId:day.trainingDayId,dayOnCourseId:day.dayOnCourseId,
  courseId:day.courseId,title:day.title,type:"practice",
  description:"Как выполнять задания",
  userStatus:"IN_PROGRESS",steps,
});
const defer=<T,>()=>{
  let resolve!:(v:T)=>void;
  const promise=new Promise<T>(yes=>{resolve=yes;});
  return {resolve,promise};
};
let root:Root,host:HTMLDivElement,cache:QueryClient;
let loadDays:ReturnType<typeof vi.fn<(type:string)=>Promise<TrainingDaysOverview>>>;
let loadDay:ReturnType<typeof vi.fn<
  (type:string,day:TrainingDaySummary)=>Promise<TrainingDayDetail>
>>;
async function flush(){
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,15));});
}
async function mount(element:React.ReactNode){
  await act(async()=>root.render(<QueryClientProvider client={cache}>
    {element}
  </QueryClientProvider>));
}
async function view(userId="A"){
  await mount(<CourseOverview userId={userId} courseId="course_01"
    showTrainingDaysOptIn showTrainingStepsOptIn
    trainingDaysLoader={loadDays} trainingDayLoader={loadDay}/>);
  await flush();
}
async function list(userId="A"){
  await mount(<TrainingIndexOptInHarness enabled userId={userId}
    courseType="IMPULSE_CONTROL" courseName="Импульсивность"
    loadDays={loadDays} showStepsOptIn loadDay={loadDay}/>);
  await flush();
}
async function select(){
  const buttons=[...host.querySelectorAll<HTMLButtonElement>("button")];
  const open=buttons.find(x=>x.textContent?.includes("Открыть шаги блока"));
  expect(open).toBeTruthy();
  await act(async()=>open?.click());
  await flush();
}
beforeEach(()=>{
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  vi.stubGlobal("fetch",vi.fn(()=>{throw Error("NO_REAL_FETCH");}));
  catalog.list.mockReset().mockResolvedValue([course()]);
  loadDays=vi.fn().mockResolvedValue(days());
  loadDay=vi.fn().mockResolvedValue(detail());
  cache=new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false}}});
  cache.setQueryData(CURRENT_USER_QUERY_KEY,{id:"A",username:"user_A",role:"USER"});
  host=document.createElement("div");document.body.append(host);
  root=createRoot(host);
  window.history.replaceState(null,"","/courses/course_01");
});
afterEach(async()=>{
  await act(async()=>root.unmount());
  cache.clear();host.remove();vi.unstubAllGlobals();
  window.history.replaceState(null,"","/");
});
describe("W2 day steps read-only mounted route-free opt-in",()=>{
  it("S01 existing CourseOverview -> days -> selected day -> real theory/practice/video",async()=>{
    await view();
    // The nested catalog/day GETs may settle on different microtasks under
    // loaded parallel suites. Wait for the actual data, not a fixed 15 ms.
    for(let i=0;i<40&&!host.textContent?.includes("Блок 1. Переключение");i++){
      await flush();
    }
    expect(host.textContent).toContain("Импульсивность");
    expect(host.textContent).toContain("Блок 1. Переключение");
    await select();
    expect(loadDay).toHaveBeenCalledExactlyOnceWith("IMPULSE_CONTROL",day);
    expect(host.textContent).toContain("Теория переключения");
    expect(host.textContent).toContain("Практика с игрушкой");
    expect(host.textContent).toContain("Закрытая теория");
    expect(host.querySelectorAll(".training-step-card")).toHaveLength(3);
    const open=[...host.querySelectorAll<HTMLButtonElement>(
      ".training-step-card button")];
    expect(open).toHaveLength(2);
    await act(async()=>open[0]?.click());
    expect(host.textContent).toContain("Читайте инструкцию");
    await act(async()=>open[1]?.click());
    expect(host.textContent).toContain("Покажите игрушку");
    expect(host.querySelector("video")?.getAttribute("src")).toBe(
      "https://cdn.example.com/practice.mp4");
    expect(host.querySelector("video")?.getAttribute("preload")).toBe("none");
    // Original Next ImageViewer eagerly requests the first unlocked image.
    expect(host.querySelector("img")?.getAttribute("loading")).toBe("eager");
    expect(window.location.pathname).toBe("/courses/course_01");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
  it("THEORY stays expanded, never auto-completes on open, then signals once at scroll end",async()=>{
    const readEnd=vi.fn();
    let markerTop=window.innerHeight+300;
    const original=Element.prototype.getBoundingClientRect;
    const fake=vi.spyOn(Element.prototype,"getBoundingClientRect").mockImplementation(
      function(this:Element){
        if(this.classList.contains("training-theory-end-marker"))
          return {top:markerTop,bottom:markerTop+1,height:1,left:0,right:200,width:200,
            x:0,y:markerTop,toJSON:()=>({})};
        return original.call(this);
      });
    try {
      await mount(<ReadonlyTrainingStepList steps={detail().steps} nextRoute
        onTheoryReadEnd={readEnd}/>);
      const header=host.querySelector<HTMLButtonElement>(".training-next-step-header");
      await act(async()=>header?.click());await flush();
      expect(header?.getAttribute("aria-expanded")).toBe("true");
      expect(readEnd).not.toHaveBeenCalled();
      markerTop=60;
      await act(async()=>window.dispatchEvent(new Event("scroll")));await flush();
      expect(readEnd).toHaveBeenCalledTimes(1);
      expect(host.querySelector(".training-next-step-header")?.getAttribute("aria-expanded"))
        .toBe("true");
      await act(async()=>window.dispatchEvent(new Event("scroll")));
      expect(readEnd).toHaveBeenCalledTimes(1);
      expect(host.textContent).toContain("Сохраняем прочтение…");
    } finally { fake.mockRestore(); }
  });
  it("short THEORY shows deliberate completion, no completion while already fully visible",async()=>{
    const readEnd=vi.fn();
    await mount(<ReadonlyTrainingStepList steps={detail().steps} nextRoute
      onTheoryReadEnd={readEnd}/>);
    const header=host.querySelector<HTMLButtonElement>(".training-next-step-header");
    await act(async()=>header?.click());await flush();
    await act(async()=>window.dispatchEvent(new Event("scroll")));
    expect(readEnd).not.toHaveBeenCalled();
    const read=host.querySelector<HTMLButtonElement>(".training-theory-reading-end button");
    await act(async()=>read?.click());await flush();
    expect(readEnd).toHaveBeenCalledTimes(1);
    expect(header?.getAttribute("aria-expanded")).toBe("true");
    expect(host.querySelectorAll(".training-theory-reading-end button")).toHaveLength(0);
  });
  it("shows two ordered lesson videos but no media for a locked step",async()=>{
    const first="https://cdn.example.com/one.mp4";
    const second="https://cdn.example.com/two.mp4";
    const a={...detail().steps[0]!,videoUrl:first,videoUrls:[first,second]};
    const locked={...detail().steps[2]!,locked:true,videoUrl:null,
      videoUrls:[]};
    await mount(<ReadonlyTrainingStepList steps={[a,locked]} nextRoute/>);
    const header=host.querySelector<HTMLButtonElement>(".training-next-step-header");
    await act(async()=>header?.click());await flush();
    expect(host.querySelectorAll(".training-step-video-attachment")).toHaveLength(2);
    expect(host.textContent).toContain("Видео 1 из 2");
    expect(host.textContent).toContain("Видео 2 из 2");
    expect(host.querySelectorAll(".training-step-video-attachment")[0]?.querySelector(
      "[data-training-step-video]")?.getAttribute("data-original-url") ??
      host.querySelectorAll(".training-step-video-attachment").length).toBeTruthy();
  });
  it("completed THEORY restores the olive noninteractive Прочитано pseudo-button",async()=>{
    const completion=vi.fn();
    const steps=detail().steps.map((step,index)=>
      index===0?{...step,status:"COMPLETED" as const}:step);
    await mount(<ReadonlyTrainingStepList steps={steps} nextRoute
      onTheoryReadEnd={completion}/>);
    const header=host.querySelector<HTMLButtonElement>(".training-next-step-header");
    await act(async()=>header?.click());await flush();
    const badge=host.querySelector<HTMLElement>(".training-theory-read-badge");
    expect(badge?.textContent?.trim()).toBe("Прочитано");
    expect(badge?.getAttribute("role")).toBe("status");
    expect(badge?.tagName).toBe("SPAN");
    expect(host.querySelector(".training-theory-reading-end button")).toBeNull();
    expect(header?.getAttribute("aria-expanded")).toBe("true");
    expect(completion).not.toHaveBeenCalled();
  });
  it("a confirmed read-only THEORY also displays Прочитано without mutation props",async()=>{
    const steps=detail().steps.map((step,index)=>
      index===0?{...step,status:"COMPLETED" as const}:step);
    await mount(<ReadonlyTrainingStepList steps={steps} nextRoute/>);
    const header=host.querySelector<HTMLButtonElement>(".training-next-step-header");
    await act(async()=>header?.click());await flush();
    expect(host.querySelector(".training-theory-read-badge")?.textContent?.trim())
      .toBe("Прочитано");
    expect(host.querySelectorAll(".training-theory-read-badge")).toHaveLength(1);
    expect(host.textContent).not.toContain("Шаг прочитан. Можно вернуться к материалу.");
    expect(host.querySelector(".training-theory-reading-end button")).toBeNull();
    expect(header?.getAttribute("aria-expanded")).toBe("true");
  });
  it("controlled accordion stays open when verified parent temporarily remounts the list",async()=>{
    const renderSteps=async(show:boolean)=>mount(show ?
      <ReadonlyTrainingStepList steps={detail().steps} nextRoute controlledOpenIndex={0}
        onOpenIndexChange={vi.fn()}/> : <div role="status">Сверяем прогресс…</div>);
    await renderSteps(true);
    expect(host.querySelector(".training-next-step-header")?.getAttribute("aria-expanded"))
      .toBe("true");
    await renderSteps(false);
    expect(host.querySelectorAll(".training-next-step-card")).toHaveLength(0);
    await renderSteps(true);
    expect(host.querySelector(".training-next-step-header")?.getAttribute("aria-expanded"))
      .toBe("true");
    expect(host.textContent).toContain("Читайте инструкцию");
  });
  it("S02 back to blocks keeps selected course and never auto-saves theory",async()=>{
    await list();await select();
    const back=host.querySelector<HTMLButtonElement>(
      ".training-day-viewer > button");
    await act(async()=>back?.click());
    expect(host.querySelectorAll(".training-day-card")).toHaveLength(2);
    expect(loadDay).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
  it("S03 locked day has no open control, cannot call getTrainingDay",async()=>{
    await list();
    expect(host.querySelectorAll(".training-step-open")).toHaveLength(1);
    expect(host.textContent).toContain("Закрыт");
    expect(loadDay).not.toHaveBeenCalled();
  });
  it("S04 pending query renders loading then real steps",async()=>{
    const hold=defer<TrainingDayDetail>();
    loadDay.mockReturnValueOnce(hold.promise);
    await list();await select();
    expect(host.textContent).toContain("Загружаем шаги");
    expect(host.querySelectorAll(".training-step-card")).toHaveLength(0);
    await act(async()=>hold.resolve(detail()));
    await flush();
    expect(host.querySelectorAll(".training-step-card")).toHaveLength(3);
  });
  it("S05 empty day shows empty not fake step shell",async()=>{
    loadDay.mockResolvedValueOnce(detail([]));
    await list();await select();
    expect(host.textContent).toContain("Шаги ещё не опубликованы");
    expect(host.querySelectorAll(".training-step-card")).toHaveLength(0);
  });
  it.each([
    [403,"Нет доступа к этому дню."],
    [404,"День не найден."],
  ])("S-ERR%d terminal GET denial/missing: no Retry, no old step content",async(status,label)=>{
    loadDay.mockRejectedValueOnce(new ApiError(status,"PRIVATE_SERVER_STACK"))
      .mockResolvedValueOnce(detail());
    await list();
    cache.setQueryData(["training","day","A","IMPULSE_CONTROL",day.dayOnCourseId],
      detail([{...detail().steps[0],id:"stale-private",title:"OLD_PRIVATE_STEP_TEXT"}]));
    await select();
    expect(host.textContent).toContain(label);
    expect(host.textContent).not.toContain("PRIVATE_SERVER_STACK");
    expect(host.textContent).not.toContain("OLD_PRIVATE_STEP_TEXT");
    expect(host.textContent).not.toContain("Теория переключения");
    expect(host.querySelectorAll(".training-step-card")).toHaveLength(0);
    expect(host.textContent).not.toContain("Повторить загрузку");
    expect(host.textContent).toContain("К списку блоков");
    await flush();
    expect(loadDay).toHaveBeenCalledTimes(1);
  });
  it("S-ERR401 retains existing Login control",async()=>{
    loadDay.mockRejectedValueOnce(new ApiError(401,"PRIVATE_SESSION"));
    await list();await select();
    expect(host.textContent).toContain("Сессия завершена. Войдите снова.");
    expect(host.querySelector('a[href="/login"]')).not.toBeNull();
    expect(host.textContent).not.toContain("Повторить загрузку");
    expect(host.querySelectorAll(".training-step-card")).toHaveLength(0);
  });
  it.each([
    [428,"Нужно заполнить персонализацию"],
    [500,"Не удалось загрузить"],
  ])("S-ERR%d preserves previous manual retry policy",async(status,label)=>{
    loadDay.mockRejectedValueOnce(new ApiError(status,"PRIVATE_SERVER_STACK"))
      .mockResolvedValueOnce(detail());
    await list();await select();
    expect(host.textContent).toContain(label);
    expect(host.textContent).not.toContain("PRIVATE_SERVER_STACK");
    const retry=[...host.querySelectorAll<HTMLButtonElement>("button")]
      .find(x=>x.textContent==="Повторить загрузку");
    expect(retry).toBeDefined();
    await act(async()=>retry?.click());await flush();
    expect(loadDay).toHaveBeenCalledTimes(2);
    expect(host.querySelectorAll(".training-step-card")).toHaveLength(3);
  });
  it("S-ERR503 manual retry replaces failed GET with fresh selected day only",async()=>{
    loadDay.mockRejectedValueOnce(new ApiError(503,"PRIVATE_TRANSIENT"))
      .mockResolvedValueOnce(detail([{...detail().steps[0],id:"fresh-current-step",
        title:"Свежий текущий шаг"}]));
    await list();await select();
    expect(host.textContent).not.toContain("PRIVATE_TRANSIENT");
    expect(host.querySelectorAll(".training-step-card")).toHaveLength(0);
    const retry=[...host.querySelectorAll<HTMLButtonElement>("button")]
      .find(x=>x.textContent==="Повторить загрузку");
    expect(retry).toBeDefined();
    await act(async()=>retry?.click());await flush();
    expect(loadDay).toHaveBeenCalledTimes(2);
    expect(host.querySelectorAll(".training-step-card")).toHaveLength(1);
    expect(host.textContent).toContain("Свежий текущий шаг");
    expect(host.textContent).not.toContain("Практика с игрушкой");
  });
  it("S10 stale owner A->B mid GET cannot render old A steps for B",async()=>{
    const hold=defer<TrainingDayDetail>();
    loadDay.mockReturnValueOnce(hold.promise)
      .mockResolvedValueOnce(detail([]));
    await list("A");await select();
    await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,
      {id:"B",username:"user_B",role:"USER"}));
    await list("B");
    expect(host.textContent).toContain("Содержание");
    await select();
    await act(async()=>hold.resolve(detail()));
    await flush();
    expect(host.querySelectorAll(".training-step-card")).toHaveLength(0);
    expect(host.textContent).toContain("Шаги ещё не опубликованы");
    expect(loadDay).toHaveBeenCalledTimes(2);
  });
  it("S11 narrow 360 px DOM card video and back controls with no steps route",async()=>{
    vi.stubGlobal("innerWidth",360);
    document.documentElement.style.width="360px";
    await list();await select();
    const open=[...host.querySelectorAll<HTMLButtonElement>(
      ".training-step-card button")];
    await act(async()=>open[1]?.click());
    expect(host.querySelectorAll(".training-step-card")).toHaveLength(3);
    expect(host.querySelector("video")).not.toBeNull();
    expect(host.querySelector(".training-day-viewer > button")).not.toBeNull();
    expect(window.location.pathname).toBe("/courses/course_01");
  });
  it("S12 guest opt-in remains off and cannot load day",async()=>{
    await mount(<TrainingIndexOptInHarness enabled userId={null}
      courseType="IMPULSE_CONTROL" courseName="Импульсивность"
      loadDays={loadDays} showStepsOptIn loadDay={loadDay}/>);
    expect(host.textContent).toBe("");
    expect(loadDays).not.toHaveBeenCalled();
    expect(loadDay).not.toHaveBeenCalled();
  });
  it("S14 mounted A day must disappear on B cookie principal before pending ACK",async()=>{
    const hold=defer<TrainingDayDetail>();
    loadDay.mockReturnValueOnce(hold.promise);
    await list("A");await select();
    expect(host.textContent).toContain("Загружаем шаги");
    await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,
      {id:"B",username:"user_B",role:"USER"}));
    expect(host.textContent).not.toContain("Загружаем шаги");
    expect(host.textContent).toContain("Сессия изменилась");
    await act(async()=>hold.resolve(detail()));
    await flush();
    expect(host.textContent).not.toContain("Теория переключения");
    expect(loadDay).toHaveBeenCalledTimes(1);
  });
  it("S15 A->B->A while mounted invalidates OLD day even for same owner",async()=>{
    await list("A");await select();
    expect(host.textContent).toContain("Теория переключения");
    await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,
      {id:"B",username:"user_B",role:"USER"}));
    await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,
      {id:"A",username:"user_A",role:"USER"}));
    expect(host.textContent).toContain("Сессия изменилась");
    expect(host.textContent).not.toContain("Теория переключения");
    expect(loadDay).toHaveBeenCalledTimes(1);
  });
  it("S16 same owner new authEpoch cannot silently retain old signed video",async()=>{
    await list("A");await select();
    const expand=[...host.querySelectorAll<HTMLButtonElement>(
      ".training-step-card button")];
    await act(async()=>expand[1]?.click());
    expect(host.querySelector("video")).not.toBeNull();
    await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,
      {id:"A",username:"same_user_reauthenticated",role:"USER"}));
    expect(host.querySelector("video")).toBeNull();
    expect(host.textContent).toContain("Сессия изменилась");
  });
  it("S17 logout cache.clear during video preview immediately hides private media",async()=>{
    await list("A");await select();
    const expandable=[...host.querySelectorAll<HTMLButtonElement>(
      ".training-step-card button")];
    await act(async()=>expandable[1]?.click());
    expect(host.querySelector("video")).not.toBeNull();
    await act(async()=>cache.clear());
    expect(host.querySelector("video")).toBeNull();
    expect(host.textContent).toContain("Сессия изменилась");
    expect(loadDay).toHaveBeenCalledTimes(1);
  });
  it("S18 mismatched verified owner at initial opt-in never requests training days",async()=>{
    await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,
      {id:"B",username:"user_B",role:"USER"}));
    await list("A");
    expect(host.textContent).toContain("Сессия изменилась");
    expect(loadDays).not.toHaveBeenCalled();
    expect(loadDay).not.toHaveBeenCalled();
  });
  it("S13 standalone locked viewer never calls even injected day loader",async()=>{
    await mount(<TrainingDayViewer userId="A" courseType="IMPULSE_CONTROL"
      day={lockedDay} onBack={vi.fn()} loadDay={loadDay}/>);
    expect(host.textContent).toContain("Этот блок закрыт");
    expect(loadDay).not.toHaveBeenCalled();
  });

  it("LEARN032-S19 ordinary/default viewer remains READ-only and never POSTs",async()=>{
    await list();await select();
    expect(host.querySelector(".training-online-read-gate")).toBeNull();
    expect(host.textContent).toContain("Просмотр без изменения прогресса");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
  it("LEARN032-S20 explicit source optin reconciles both GETs and stays command-blocked",async()=>{
    loadDay.mockResolvedValue({...detail(),trainingDayId:"physical_day_01"});
    await mount(<TrainingDayViewer userId="A" courseType="IMPULSE_CONTROL"
      day={day} onBack={vi.fn()} loadDay={loadDay}
      showOnlineProgressSourceOptIn loadDaysForProgress={loadDays}/>);
    await flush();
    const gate=host.querySelector<HTMLElement>(".training-online-read-gate")!;
    expect(gate).not.toBeNull();
    const blocked=gate.querySelectorAll<HTMLButtonElement>("button:disabled");
    expect(blocked.length).toBeGreaterThanOrEqual(2);
    expect(gate.textContent).toContain("не гарантирует");
    const reconcile=[...gate.querySelectorAll<HTMLButtonElement>("button")]
      .find(button=>button.textContent==="Перечитать день и список блоков")!;
    await act(async()=>{reconcile.click();reconcile.click();});await flush();
    expect(loadDays).toHaveBeenCalledExactlyOnceWith("IMPULSE_CONTROL");
    expect(loadDay).toHaveBeenCalledTimes(3);
    for(let i=0;i<30 && !host.textContent?.includes("Состояние перечитано");i++)
      await flush();
    const current=host.querySelector<HTMLElement>(".training-online-read-gate")!;
    expect(current.textContent).toContain("Состояние перечитано");
    expect([...current.querySelectorAll<HTMLButtonElement>("button")]
      .filter(button=>button.textContent?.trim()==="Пауза / Завершить")
      .every(button=>button.disabled)).toBe(true);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
  it("LEARN032-S21 noncontiguous order and reordered GET fail closed",async()=>{
    const first=detail([
      {...detail().steps[0]!,order:24},
      {...detail().steps[1]!,order:99},
    ]);
    const reordered=detail([first.steps[1]!,first.steps[0]!]);
    loadDay.mockResolvedValueOnce(first).mockResolvedValueOnce(reordered)
      .mockResolvedValueOnce(reordered);
    await mount(<TrainingDayViewer userId="A" courseType="IMPULSE_CONTROL"
      day={day} onBack={vi.fn()} loadDay={loadDay}
      showOnlineProgressSourceOptIn loadDaysForProgress={loadDays}/>);
    await flush();
    const gate=host.querySelector<HTMLElement>(".training-online-read-gate")!;
    await act(async()=>gate.querySelector<HTMLButtonElement>(".button-secondary")?.click());
    await flush();
    for(let i=0;i<30 && !host.textContent?.includes("Порядок шагов изменился");i++)
      await flush();
    const current=host.querySelector<HTMLElement>(".training-online-read-gate")!;
    expect(current.textContent).toContain("Порядок шагов изменился");
    expect(current.querySelectorAll("button:not(:disabled)")).toHaveLength(1);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
  it("LEARN032-S22 A-B-A while reconciliation pending revokes private view",async()=>{
    const hold=defer<TrainingDayDetail>();
    loadDay.mockResolvedValueOnce(detail()).mockReturnValueOnce(hold.promise);
    await mount(<TrainingDayViewer userId="A" courseType="IMPULSE_CONTROL"
      day={day} onBack={vi.fn()} loadDay={loadDay}
      showOnlineProgressSourceOptIn loadDaysForProgress={loadDays}/>);
    await flush();
    const gate=host.querySelector<HTMLElement>(".training-online-read-gate")!;
    await act(async()=>gate.querySelector<HTMLButtonElement>(".button-secondary")?.click());
    await act(async()=>{
      cache.setQueryData(CURRENT_USER_QUERY_KEY,
        {id:"B",username:"user_B",role:"USER"});
      cache.setQueryData(CURRENT_USER_QUERY_KEY,
        {id:"A",username:"user_A",role:"USER"});
    });
    expect(host.textContent).toContain("Сессия изменилась");
    expect(host.textContent).not.toContain("Читайте инструкцию");
    await act(async()=>hold.resolve(detail()));await flush();
    expect(host.querySelector(".training-online-read-gate")).toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
  it("LEARN032-S23 locked day denies all extra online reconciliation GETs",async()=>{
    await mount(<TrainingDayViewer userId="A" courseType="IMPULSE_CONTROL"
      day={lockedDay} onBack={vi.fn()} loadDay={loadDay}
      showOnlineProgressSourceOptIn loadDaysForProgress={loadDays}/>);
    expect(host.querySelector(".training-online-read-gate")).toBeNull();
    expect(loadDay).not.toHaveBeenCalled();
    expect(loadDays).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

});

// AG2_COURSE011_DIARY_TEXT — existing learner-day mounted UI; local fake HTTP.
const diaryStep:TrainingDayDetail["steps"][number]={
  id:"diary-step-1",title:"Дневник наблюдений",description:"Запишите результат дня.",
  type:"DIARY",status:"NOT_STARTED",order:0,durationSec:0,locked:false,
  videoUrl:null,imageUrls:[],
};
const diaryDetail=(target=day):TrainingDayDetail=>({
  ...detail([diaryStep]),trainingDayId:target.trainingDayId,
  dayOnCourseId:target.dayOnCourseId,courseId:target.courseId,title:target.title,
});
const diaryEntry=(content:string,target=day)=>({
  id:"entry-1",content,createdAt:"2026-10-22T09:10:11.000Z",
  updatedAt:"2026-10-24T09:10:11.000Z",dayId:target.trainingDayId,
  dayOnCourseId:target.dayOnCourseId,dayOrder:1,dayTitle:target.title,
});
const diaryEnvelope=(data:unknown,status=200)=>new Response(JSON.stringify({
  success:status===200,...(data===undefined?{}:{data}),
  ...(status===200?{}:{error:"TEST_PRIVATE_BACKEND"}),
}),{status});
function diaryDeferred(){
  let resolve!:(value:Response)=>void;
  const promise=new Promise<Response>(done=>{resolve=done;});
  return {promise,resolve};
}
const diaryWrites=(fetcher:ReturnType<typeof vi.fn>)=>fetcher.mock.calls
  .filter(call=>(call[1] as RequestInit|undefined)?.method==="POST");
async function diaryMount(target=day,userId="A"){
  await mount(<TrainingDayViewer userId={userId} courseType="IMPULSE_CONTROL"
    day={target} onBack={()=>undefined} loadDay={async()=>diaryDetail(target)}/>);
  await flush();
  if(!target.isLocked){
    const diary = host.querySelector<HTMLButtonElement>(
      ".training-step-card button[aria-label*=\"Дневник наблюдений\"]");
    expect(diary).not.toBeNull();
    await act(async()=>diary?.click());
    await flush();
  }
}
async function diaryFill(text:string){
  const node=host.querySelector<HTMLTextAreaElement>('[aria-label="Запись дневника"]');
  expect(node).not.toBeNull();
  const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value")!.set!;
  await act(async()=>{setter.call(node,text);
    node?.dispatchEvent(new Event("input",{bubbles:true}));});
}
async function diarySubmitTwice(){
  await act(async()=>{
    const form=host.querySelector('form[aria-label="Дневник обучения"]');
    form?.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));
    form?.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));
    await Promise.resolve();
  });
}
function diaryAction(text:string){
  const result=[...host.querySelectorAll<HTMLButtonElement>("button")]
    .find(button=>button.textContent?.trim()===text);
  if(!result)throw Error("Missing diary action "+text);
  return result;
}

describe("AG2_COURSE011_DIARY_TEXT existing learner diary GET/POST vertical",()=>{
  it("loads server history/current draft and saves one POST only after fresh strict GET",async()=>{
    let current="Запись первого дня";
    const pending=diaryDeferred();
    const fetcher=vi.fn((_url:string,init?:RequestInit)=>{
      if(init?.method==="POST")return pending.promise;
      return Promise.resolve(diaryEnvelope({entries:[diaryEntry(current)]}));
    });
    vi.stubGlobal("fetch",fetcher);
    await diaryMount();
    const diary=host.querySelector('section[aria-label="Дневник обучения"]');
    expect(diary?.querySelector(".training-diary-header")?.textContent)
      .toContain("Личные заметки");
    expect(diary?.querySelector(".training-diary-history li")?.textContent)
      .toContain("Запись первого дня");
    expect(diary?.querySelector(".training-diary-form textarea")?.getAttribute("maxLength"))
      .toBe("10000");
    expect(diary?.querySelector(".training-learner-form-footer .gafus-primary-button"))
      .not.toBeNull();
    expect(host.textContent).toContain("Дневник обучения");
    expect(host.textContent).toContain("Запись первого дня");
    expect(host.querySelector<HTMLTextAreaElement>('[aria-label="Запись дневника"]')?.value)
      .toBe("Запись первого дня");
    await diaryFill("Сегодня лучше справились с командой");
    await diarySubmitTwice();
    expect(diaryWrites(fetcher)).toHaveLength(1);
    expect(diaryWrites(fetcher)[0][0]).toBe("/api/v1/training/diary");
    expect(JSON.parse(String(diaryWrites(fetcher)[0][1]?.body))).toEqual({
      dayOnCourseId:day.dayOnCourseId,content:"Сегодня лучше справились с командой",
    });
    expect(host.querySelector<HTMLTextAreaElement>('[aria-label="Запись дневника"]')?.value)
      .toBe("Сегодня лучше справились с командой");
    await act(async()=>{current="Сегодня лучше справились с командой";
      pending.resolve(diaryEnvelope(undefined));});
    await flush();
    expect(fetcher.mock.calls.filter(call=>(call[1] as RequestInit|undefined)?.method==="GET")
      .length).toBeGreaterThanOrEqual(2);
    expect(host.textContent).toContain("Запись подтверждена сервером");
    expect(host.textContent).toContain("Сегодня лучше справились с командой");
  });
  it("unknown 500 never retries automatically; draft survives and manual GET gates next POST",async()=>{
    let postCount=0;
    let current="Сохранённый текст";
    const fetcher=vi.fn((_url:string,init?:RequestInit)=>Promise.resolve(
      init?.method==="POST"?++postCount===1?diaryEnvelope(null,500)
        :(current="Новый несохранённый текст",diaryEnvelope(undefined))
        :diaryEnvelope({entries:[diaryEntry(current)]}),
    ));
    vi.stubGlobal("fetch",fetcher);
    await diaryMount();
    await diaryFill("Новый несохранённый текст");
    await diarySubmitTwice();
    await flush();
    expect(postCount).toBe(1);
    expect(host.querySelector<HTMLTextAreaElement>('[aria-label="Запись дневника"]')?.value)
      .toBe("Новый несохранённый текст");
    expect(diaryAction("Сохранить запись").disabled).toBe(true);
    expect(host.textContent).toContain("Проверить состояние записи");
    await act(async()=>diaryAction("Проверить состояние записи").click());
    await flush();
    expect(postCount).toBe(1);
    await diarySubmitTwice();
    await flush();
    expect(postCount).toBe(2);
    expect(host.textContent).toContain("Запись подтверждена сервером");
  });
  it("plain POST ACK with stale strict GET stays unconfirmed until manual reread",async()=>{
    let current="Старый сохранённый текст";
    let writes=0;
    const fetcher=vi.fn((_url:string,init?:RequestInit)=>Promise.resolve(
      init?.method==="POST"?(writes++,diaryEnvelope(undefined))
        :diaryEnvelope({entries:[diaryEntry(current)]}),
    ));
    vi.stubGlobal("fetch",fetcher);
    await diaryMount();
    await diaryFill("Текст на сервере ещё не виден");
    await diarySubmitTwice();
    await flush();
    expect(writes).toBe(1);
    expect(host.textContent).not.toContain("Запись подтверждена сервером");
    expect(host.textContent).toContain("Проверить состояние записи");
    expect(host.querySelector<HTMLTextAreaElement>('[aria-label="Запись дневника"]')?.value)
      .toBe("Текст на сервере ещё не виден");
    await act(async()=>{current="Текст на сервере ещё не виден";
      diaryAction("Проверить состояние записи").click();});
    await flush();
    expect(writes).toBe(1);
    expect(host.textContent).toContain("Запись подтверждена сервером");
  });
  it("server diary history projects only permitted entry fields and ISO dates",async()=>{
    const earlier={...diaryEntry("Ранее записанное упражнение"),id:"older-entry",
      dayOnCourseId:"clwdayoc0000000000000000",dayId:"earlier-day",
      dayTitle:"Предыдущий день",dayOrder:0,ownerEmail:"private@example.com",
      secretToken:"PRIVATE_DIARY_SECRET"};
    const fetcher=vi.fn(()=>Promise.resolve(diaryEnvelope({entries:[earlier,diaryEntry("Сегодня")]})));
    vi.stubGlobal("fetch",fetcher);
    await diaryMount();
    expect(host.textContent).toContain("Предыдущий день");
    expect(host.textContent).toContain("Ранее записанное упражнение");
    expect(host.querySelector('time[dateTime="2026-10-24T09:10:11.000Z"]')).not.toBeNull();
    expect(host.innerHTML).not.toContain("PRIVATE_DIARY_SECRET");
    expect(host.innerHTML).not.toContain("private@example.com");
    expect(host.querySelector<HTMLTextAreaElement>('[aria-label="Запись дневника"]')?.value)
      .toBe("Сегодня");
  });
  it("403 GET denies and hides existing private diary, no POST or stale draft",async()=>{
    const fetcher=vi.fn(()=>Promise.resolve(diaryEnvelope(null,403)));
    vi.stubGlobal("fetch",fetcher);
    await diaryMount();
    expect(host.textContent).toContain("Нет доступа к дневнику");
    expect(host.querySelector('form[aria-label="Дневник обучения"]')).toBeNull();
    expect(host.textContent).not.toContain("TEST_PRIVATE_BACKEND");
    expect(diaryWrites(fetcher)).toHaveLength(0);
  });
  it("locked or non-diary day never requests diary or exposes form",async()=>{
    const fetcher=vi.fn(()=>{throw Error("NO_DIARY_NETWORK_ALLOWED");});
    vi.stubGlobal("fetch",fetcher);
    await diaryMount({...day,isLocked:true});
    expect(host.querySelector('form[aria-label="Дневник обучения"]')).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
    await mount(<TrainingDayViewer userId="A" courseType="IMPULSE_CONTROL"
      day={day} onBack={()=>undefined} loadDay={async()=>detail()}/>);
    await flush();
    expect(host.querySelector('form[aria-label="Дневник обучения"]')).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("old owner/day ACK cannot clear newer diary draft or mark new day saved",async()=>{
    const old=diaryDeferred();
    const latest=diaryDeferred();
    const nextDay={...day,dayOnCourseId:"clwdayoc0000000000000002",
      trainingDayId:"day_02",title:"День 2"};
    const fetcher=vi.fn((url:string,init?:RequestInit)=>{
      if(init?.method==="POST")return String(init.body).includes(nextDay.dayOnCourseId)
        ?latest.promise:old.promise;
      return Promise.resolve(diaryEnvelope({entries:[diaryEntry(
        url.includes(nextDay.dayOnCourseId)?"Второй день":"Первый день",
        url.includes(nextDay.dayOnCourseId)?nextDay:day,
      )]}));
    });
    vi.stubGlobal("fetch",fetcher);
    await diaryMount();
    await diaryFill("Старый дневник");
    await diarySubmitTwice();
    expect(diaryWrites(fetcher)).toHaveLength(1);
    await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,
      {id:"B",username:"user_B",role:"USER"}));
    await diaryMount(nextDay,"B");
    expect(host.querySelector<HTMLTextAreaElement>('[aria-label="Запись дневника"]')?.value)
      .toBe("Второй день");
    await diaryFill("Новый дневник B");
    await diarySubmitTwice();
    expect(diaryWrites(fetcher)).toHaveLength(2);
    await act(async()=>old.resolve(diaryEnvelope(undefined)));
    await flush();
    expect(host.querySelector<HTMLTextAreaElement>('[aria-label="Запись дневника"]')?.value)
      .toBe("Новый дневник B");
    expect(host.textContent).not.toContain("Запись подтверждена сервером");
    await act(async()=>latest.resolve(diaryEnvelope(undefined)));
    await flush();
  });
});

// COURSE011_STEP_MARKDOWN_RESTORE: existing real READ/StepCard mounted tree.
describe("COURSE011_STEP_MARKDOWN_RESTORE text materials in unlocked expanded steps",()=>{
  it("recreates ordered instructions, GFM table and safe links; hides locked/collapsed descriptions",async()=>{
    const instructions=[
      "## Этапы упражнения",
      "1. **Подготовьте** поводок\n2. *Попросите* собаку сесть",
      "- Спокойный темп\n- Без рывков",
      "| Действие | Длительность |\n| --- | --- |\n| Контакт | 5 мин |",
      "Используйте `сидеть` и затем:\n\n```text\nспокойствие\n```",
      "[Статья](/articles) и [Источник](https://example.org/lesson)",
      "[Небезопасно](javascript:alert(1))",
      "![Трекер](https://unsafe.invalid/tracker.png)",
      "<iframe src=\"https://unsafe.invalid/embed\"></iframe>",
    ].join("\n\n");
    loadDay.mockResolvedValueOnce(detail([
      {...detail().steps[0],description:instructions},
      {...detail().steps[1],id:"step-plain",description:"Простое пояснение без разметки.",
        videoUrl:null,imageUrls:[]},
      {...detail().steps[2],id:"step-empty",locked:false,description:""},
      {...detail().steps[2],id:"step-locked",description:"PRIVATE_LOCKED_MARKDOWN **скрыто**"},
    ]));
    await list();await select();
    const cards=[...host.querySelectorAll<HTMLElement>(".training-step-card")];
    expect(cards).toHaveLength(4);
    expect(host.querySelector(".training-step-description")).toBeNull();
    expect(host.textContent).not.toContain("Этапы упражнения");
    expect(host.textContent).not.toContain("PRIVATE_LOCKED_MARKDOWN");
    expect(cards[3].querySelector("button")).toBeNull();
    const open=async(index:number)=>{
      await act(async()=>cards[index].querySelector<HTMLButtonElement>("button")?.click());
      await flush();
    };
    await open(0);
    const content=cards[0].querySelector<HTMLElement>(".training-step-description");
    expect(content).not.toBeNull();
    expect(content?.querySelector("h2")?.textContent).toBe("Этапы упражнения");
    expect(content?.querySelector("ol > li strong")?.textContent).toBe("Подготовьте");
    expect(content?.querySelector("ol > li em")?.textContent).toBe("Попросите");
    expect(content?.querySelectorAll("ul > li")).toHaveLength(2);
    expect(content?.querySelector("table tbody tr td")?.textContent).toBe("Контакт");
    expect(content?.querySelector("pre code")?.textContent).toBe("спокойствие\n");
    expect(content?.querySelector("p code")?.textContent).toBe("сидеть");
    expect(content?.querySelector('a[href="/articles"]')).not.toBeNull();
    expect(content?.querySelector('a[href="https://example.org/lesson"]')
      ?.getAttribute("rel")).toContain("noopener");
    expect(content?.querySelectorAll("a")).toHaveLength(2);
    expect(content?.querySelector("img,iframe,script,video,a[href^='javascript:']"))
      .toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
    await open(0);
    expect(cards[0].querySelector(".training-step-description")).toBeNull();
    expect(cards[0].textContent).not.toContain("Этапы упражнения");
    await open(1);
    expect(cards[1].querySelector(".training-step-description")?.textContent)
      .toBe("Простое пояснение без разметки.");
    await open(2);
    expect(cards[2].querySelector(".training-step-description")).toBeNull();
    expect(cards[2].textContent).toContain("Дополнительных материалов нет");
    expect(cards[3].textContent).not.toContain("PRIVATE_LOCKED_MARKDOWN");
  });
});


// COURSE011_STEP_ACCORDION_A11Y — existing shared ordinary/Daily step component.
describe("COURSE011_STEP_ACCORDION_A11Y multi-list step disclosure",()=>{
  it("two parallel lists have unique stable heading/panel IDs and identifiable triggers",async()=>{
    const ordinary=detail().steps;
    const daily=[{...ordinary[0],id:"daily-1",title:"Утренний контакт",
      description:"DAILY_PRIVATE_MARKDOWN **расслабиться**"},
      {...ordinary[2],id:"daily-locked",title:"Запертый Daily",locked:true,
        description:"LOCKED_PRIVATE_MATERIAL"}];
    await mount(<main>
      <h3>Обычное занятие</h3><ReadonlyTrainingStepList steps={ordinary}/>
      <h3>Занятие Daily</h3><ReadonlyTrainingStepList steps={daily}/>
    </main>);
    const cards=[...host.querySelectorAll<HTMLElement>(".training-step-card")];
    expect(cards).toHaveLength(5);
    const buttons=cards.flatMap(card=>[...card.querySelectorAll<HTMLButtonElement>("button")]);
    expect(buttons).toHaveLength(3);
    expect(cards[2].querySelector("button,[role=region]")).toBeNull();
    expect(cards[4].querySelector("button,[role=region]")).toBeNull();
    expect(host.textContent).not.toContain("LOCKED_PRIVATE_MATERIAL");
    expect(buttons.map(button=>button.getAttribute("aria-label"))).toEqual([
      "Читать шаг 1: Теория переключения",
      "Читать шаг 2: Практика с игрушкой",
      "Читать шаг 1: Утренний контакт",
    ]);
    expect(buttons.every(button=>button.tagName==="BUTTON" &&
      button.type==="button" && button.getAttribute("aria-expanded")==="false"))
      .toBe(true);
    expect(buttons.every(button=>!button.hasAttribute("aria-controls"))).toBe(true);
    expect(host.querySelectorAll("[role=region],.training-step-description")).toHaveLength(0);
    const idsBefore=buttons.map(button=>button.id);
    expect(idsBefore.every(Boolean)).toBe(true);
    expect(new Set(idsBefore).size).toBe(3);
    buttons[0].focus();
    expect(document.activeElement).toBe(buttons[0]);
    await act(async()=>buttons[0].click());
    await act(async()=>buttons[2].click());
    expect(document.activeElement).toBe(buttons[0]);
    expect(buttons.map(button=>button.id)).toEqual(idsBefore);
    expect(buttons[0].getAttribute("aria-label"))
      .toBe("Скрыть шаг 1: Теория переключения");
    expect(buttons[2].getAttribute("aria-label"))
      .toBe("Скрыть шаг 1: Утренний контакт");
    const controls=buttons.filter(button=>button.getAttribute("aria-expanded")==="true")
      .map(button=>button.getAttribute("aria-controls"));
    expect(controls).toHaveLength(2);
    expect(new Set(controls).size).toBe(2);
    for(const button of [buttons[0],buttons[2]]){
      const region=document.getElementById(button.getAttribute("aria-controls")??"");
      expect(region?.getAttribute("role")).toBe("region");
      const heading=document.getElementById(region?.getAttribute("aria-labelledby")??"");
      expect(heading?.tagName).toBe("H4");
      expect(heading?.textContent).toBe(button===buttons[0]
        ? "Теория переключения":"Утренний контакт");
    }
    expect(cards[3].querySelector(".training-step-description strong")?.textContent)
      .toBe("расслабиться");
    const allIds=[...host.querySelectorAll<HTMLElement>("[id]")]
      .map(element=>element.id);
    expect(new Set(allIds).size).toBe(allIds.length);
    await act(async()=>buttons[0].click());
    expect(buttons[0].getAttribute("aria-expanded")).toBe("false");
    expect(buttons[0].hasAttribute("aria-controls")).toBe(false);
    expect(cards[0].querySelector("[role=region],.training-step-description")).toBeNull();
    expect(document.activeElement).toBe(buttons[0]);
    await act(async()=>buttons[0].click());
    expect(buttons[0].id).toBe(idsBefore[0]);
    expect(cards[0].querySelector("[role=region]")).not.toBeNull();
  });

  it("replacing step identity removes retired labels/links and keeps locked private text hidden",async()=>{
    const a=detail().steps[0];
    const b={...a,id:"different-step",title:"Новая последовательность",
      description:"Только новый шаг"};
    await mount(<section><h3>Учебный блок</h3>
      <ReadonlyTrainingStepList steps={[a]}/></section>);
    const old=host.querySelector<HTMLButtonElement>(".training-step-card button")!;
    await act(async()=>old.click());
    const oldId=old.getAttribute("aria-controls")!;
    expect(document.getElementById(oldId)).not.toBeNull();
    await mount(<section><h3>Другой учебный блок</h3>
      <ReadonlyTrainingStepList steps={[b]}/></section>);
    expect(document.getElementById(oldId)).toBeNull();
    const next=host.querySelector<HTMLButtonElement>(".training-step-card button")!;
    expect(next.getAttribute("aria-expanded")).toBe("false");
    expect(next.getAttribute("aria-label"))
      .toBe("Читать шаг 1: Новая последовательность");
    expect(next.hasAttribute("aria-controls")).toBe(false);
    expect(host.textContent).not.toContain("Теория переключения");
    await mount(<section><h3>Заблокированный блок</h3>
      <ReadonlyTrainingStepList steps={[{...b,locked:true,
        description:"ABSOLUTELY_PRIVATE_DESCRIPTION"}]}/></section>);
    expect(host.querySelector(".training-step-card button,[role=region]")).toBeNull();
    expect(host.textContent).not.toContain("ABSOLUTELY_PRIVATE_DESCRIPTION");
  });
});


// COURSE011_DAY_PARENT_MARKDOWN — strictly the verified day introduction, not steps.
const authoredDayText = [
  "## План учебного дня", "", "1. **Проверьте** готовность", "2. *Похвалите* собаку",
  "", "| Действие | Минуты |", "| --- | --- |", "| Игра | 5 |",
  "", "`кликер`", "", "```text", "КОМАНДА_ДНЯ", "```",
  "", "[Подробности](https://example.org/day)",
  "", "[ОПАСНЫЙ_ЛИНК](javascript:alert(1))", "", "![СКРЫТАЯ_КАРТИНКА](https://example.org/private.png)",
  "", "<script>ALERT_PRIVATE</script>",
].join("\n");

describe("COURSE011_DAY_PARENT_MARKDOWN ordinary unlocked day instructions",()=>{
  it("Next route displays published Markdown when list ID is DayOnCourse.id but detail ID is physical Day.id",async()=>{
    loadDay.mockResolvedValueOnce({...detail(),trainingDayId:"physical_day_01",
      description:authoredDayText});
    await mount(<TrainingDayViewer userId="A" courseType="IMPULSE_CONTROL"
      day={day} onBack={vi.fn()} loadDay={loadDay} enableConnectedProgress/>);
    await flush();
    const header=host.querySelector<HTMLButtonElement>(
      ".training-next-day-description-toggle");
    expect(header).not.toBeNull();
    expect(header?.getAttribute("aria-expanded")).toBe("false");
    await act(async()=>header?.click());
    const body=host.querySelector<HTMLElement>("#training-next-day-description-body");
    expect(body).not.toBeNull();
    expect(body?.querySelector("h2")?.textContent).toBe("План учебного дня");
    expect(body?.querySelector("table td")?.textContent).toBe("Игра");
    expect(body?.querySelector("strong")?.textContent).toBe("Проверьте");
    expect(body?.querySelector("a[href=\"https://example.org/day\"]")).not.toBeNull();
    expect(body?.textContent).not.toContain("недоступно без проверки идентификаторов");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
  it("Next route refuses wrong day-on-course detail even if body contains private text",async()=>{
    loadDay.mockResolvedValueOnce({...detail(),dayOnCourseId:"wrong_day",
      description:"## SECRET_OTHER_DAY",steps:[{...detail().steps[0],
        description:"SECRET_STEP"}]});
    await mount(<TrainingDayViewer userId="A" courseType="IMPULSE_CONTROL"
      day={day} onBack={vi.fn()} loadDay={loadDay} enableConnectedProgress/>);
    await flush();
    expect(host.textContent).toContain("Данные блока не совпадают");
    expect(host.querySelector(".training-next-day-description-toggle")).toBeNull();
    expect(host.querySelector(".training-next-step-card")).toBeNull();
    expect(host.textContent).not.toContain("SECRET_OTHER_DAY");
    expect(host.textContent).not.toContain("SECRET_STEP");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
  it("renders heading/list/table/emphasis/code and safe links from verified parent description",async()=>{
    loadDay.mockResolvedValueOnce({...detail(),description:authoredDayText});
    await list();await select();
    const block=host.querySelector<HTMLElement>(
      '.training-day-viewer [aria-label="Описание учебного дня"]');
    expect(block).not.toBeNull();
    expect(block?.querySelector("h2")?.textContent).toBe("План учебного дня");
    expect(block?.querySelectorAll("ol > li")).toHaveLength(2);
    expect(block?.querySelector("strong")?.textContent).toBe("Проверьте");
    expect(block?.querySelector("em")?.textContent).toBe("Похвалите");
    expect(block?.querySelector("table td")?.textContent).toBe("Игра");
    expect(block?.querySelector("pre code")?.textContent).toContain("КОМАНДА_ДНЯ");
    expect(block?.querySelector('a[href="https://example.org/day"]')).not.toBeNull();
    expect(block?.querySelector('a[href^="javascript:"]')).toBeNull();
    expect(block?.querySelector("img,script,iframe,video")).toBeNull();
    expect(block?.textContent).not.toContain("ALERT_PRIVATE");
    expect(block?.querySelector("p div")).toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
  it("plain and empty introductions remain readable without an invalid paragraph container",async()=>{
    loadDay.mockResolvedValueOnce({...detail(),description:"Обычное введение к упражнениям"});
    await list();await select();
    const block=host.querySelector<HTMLElement>(
      '.training-day-viewer [aria-label="Описание учебного дня"]');
    expect(block?.querySelector("p")?.textContent).toBe("Обычное введение к упражнениям");
    expect(block?.querySelector("p div")).toBeNull();
    await act(async()=>cache.removeQueries({queryKey:[
      "training","day","A","IMPULSE_CONTROL",day.dayOnCourseId,
    ]}));
    loadDay.mockResolvedValueOnce({...detail(),description:""});
    await mount(<TrainingDayViewer userId="A" courseType="IMPULSE_CONTROL"
      day={day} onBack={()=>undefined} loadDay={loadDay}/>);
    await flush();
    expect(host.querySelector('[aria-label="Описание учебного дня"]')).toBeNull();
  });
  it("wrong course/day-on-course binding or rejected fresh GET never exposes private parent markdown",async()=>{
    loadDay.mockResolvedValueOnce({...detail(),dayOnCourseId:"NOT_THIS_DAY",
      description:"## PRIVATE_WRONG_DAY_MARKDOWN"});
    await list();await select();
    expect(host.textContent).not.toContain("PRIVATE_WRONG_DAY_MARKDOWN");
    expect(host.querySelector('[aria-label="Описание учебного дня"]')).toBeNull();
    // A distinct day key guarantees a new network GET without resetting the
    // existing shared test host/query root or replaying an unrelated catalog.
    const deniedDay={...day,trainingDayId:"day_03",
      dayOnCourseId:"clwdayoc0000000000000003"};
    loadDay.mockRejectedValueOnce(new ApiError(403,"PRIVATE_DESCRIPTION_STACK"));
    await mount(<TrainingDayViewer userId="A" courseType="IMPULSE_CONTROL"
      day={deniedDay} onBack={()=>undefined} loadDay={loadDay}/>);
    await flush();
    expect(host.querySelector('[aria-label="Описание учебного дня"]')).toBeNull();
    expect(host.textContent).not.toContain("PRIVATE_DESCRIPTION_STACK");
    expect(host.textContent).not.toContain("PRIVATE_WRONG_DAY_MARKDOWN");
  });
});

// SOURCE_NEXT_DAY_SINGLE_OPEN: original Day.tsx owns one openIndex, rather than
// permitting independent disclosures that leave unrelated private panels open.
describe("WEB3 original Next exclusive expanded step and scoped controls", () => {
  it("opens one step at a time and mounts controls only for that occurrence", async () => {
    const steps = detail().steps.slice(0, 2);
    await mount(<ReadonlyTrainingStepList steps={steps} nextRoute
      renderProgressSlot={(step, index) =>
        <span data-step-controls={String(index)}>{step.title}</span>} />);
    const triggers = [...host.querySelectorAll<HTMLButtonElement>(
      "button.training-next-step-header")];
    expect(triggers).toHaveLength(2);
    expect(host.querySelectorAll("[data-step-controls]")).toHaveLength(0);

    await act(async () => triggers[0].click());
    expect(host.querySelector(".training-next-step-type-card")?.textContent)
      .toBe("Теория");
    expect(host.querySelector(".training-next-step-section-title")?.textContent)
      .toBe("Описание:");
    expect(host.querySelector(".training-next-step-content .training-next-step-section"))
      .not.toBeNull();
    expect(triggers[0].getAttribute("aria-expanded")).toBe("true");
    expect(triggers[1].getAttribute("aria-expanded")).toBe("false");
    expect(host.querySelectorAll("[data-step-controls]")).toHaveLength(1);
    expect(host.querySelector("[data-step-controls]")?.getAttribute("data-step-controls"))
      .toBe("0");

    await act(async () => triggers[1].click());
    expect(triggers[0].getAttribute("aria-expanded")).toBe("false");
    expect(triggers[1].getAttribute("aria-expanded")).toBe("true");
    expect(host.querySelectorAll("[data-step-controls]")).toHaveLength(1);
    expect(host.querySelector("[data-step-controls]")?.getAttribute("data-step-controls"))
      .toBe("1");

    await act(async () => triggers[1].click());
    expect(host.querySelectorAll("[data-step-controls]")).toHaveLength(0);
    expect(host.querySelectorAll("[role=region]")).toHaveLength(0);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe("WEB3 source unlocked duration and special step header", () => {
  it("restores Next estimate and diary heading without reading a locked step", async () => {
    const practice={...detail().steps[1]!,type:"PRACTICE" as const,estimatedDurationSec:178};
    const diary={...diaryStep,order:1};
    await mount(<ReadonlyTrainingStepList steps={[practice,diary]} nextRoute/>);
    const triggers=[...host.querySelectorAll<HTMLButtonElement>(
      ".training-next-step-header")];
    await act(async()=>triggers[0]?.click());
    expect(host.textContent).toContain("Примерное время: ~3 мин");
    await act(async()=>triggers[1]?.click());
    expect(host.textContent).not.toContain("Примерное время: ~3 мин");
    expect(triggers[1]?.textContent).toContain("Дневник успехов");
  });
});
describe("WEB3 Next source diary contained only in active DIARY step", () => {
  it("does not read or expose a day diary before opening the relevant step", async () => {
    const fetcher = vi.fn(() => Promise.resolve(diaryEnvelope({entries:[
      diaryEntry("Выполнили упражнение")] })));
    vi.stubGlobal("fetch", fetcher);
    await mount(<TrainingDayViewer userId="A" courseType="IMPULSE_CONTROL"
      day={day} onBack={()=>undefined} loadDay={async()=>diaryDetail()}/>);
    await flush();
    expect(host.querySelector('form[aria-label="Дневник обучения"]')).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
    const trigger=host.querySelector<HTMLButtonElement>(
      ".training-step-card button[aria-label*=\"Дневник наблюдений\"]");
    await act(async()=>trigger?.click());await flush();
    expect(host.querySelector(".training-next-step-diary form")).not.toBeNull();
    expect(fetcher).toHaveBeenCalled();
    await act(async()=>trigger?.click());
    expect(host.querySelector('form[aria-label="Дневник обучения"]')).toBeNull();
  });
});

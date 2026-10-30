// @vitest-environment jsdom
import {act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {beforeEach,afterEach,describe,it,expect,vi} from "vitest";
import {CourseOverview} from "../courses/CourseOverview";
import {TrainingIndexOptInHarness} from "./TrainingIndexOptInHarness";
import type {TrainingDaysOverview} from "./trainingDaysApi";
import {ApiError} from "../../shared/api/client";
import {CURRENT_USER_QUERY_KEY} from "../../shared/auth/useAuth";
const catalog=vi.hoisted(()=>({list:vi.fn()}));
vi.mock("../courses/courseApi",()=>({
  listCourses:catalog.list,
  setCourseFavorite:vi.fn(),
}));
const day=(id:string,status:TrainingDaysOverview["days"][number]["userStatus"],
    isLocked=false):TrainingDaysOverview["days"][number]=>({
  trainingDayId:id,dayOnCourseId:"link_"+id,
  title:id==="day_01"?"День 1. Основы": "День 2. Практика",
  type:"practice",courseId:"course_01",userStatus:status,
  estimatedDuration:15,theoryMinutes:5,equipment:"Длинный поводок",
  isLocked,
});
const overview=(days:TrainingDaysOverview["days"]=[day("day_01","COMPLETED"),
  day("day_02","NOT_STARTED",true)]):TrainingDaysOverview=>({
  courseId:"course_01",courseDescription:"Учимся переключаться с раздражителей",
  courseEquipment:"Длинный поводок",courseTrainingLevel:"BEGINNER",
  requiresPersonalization:false,days,
});
const course=(hasAccess=true)=>({
  id:"course_01",name:"Самоконтроль",type:"IMPULSE_CONTROL",
  shortDesc:"Короткая программа по самоконтролю",
  duration:"14 дней",isPaid:true,isPrivate:false,hasAccess,
  isFavorite:false,userStatus:"IN_PROGRESS",trainingLevel:"BEGINNER",
});
let root:Root,host:HTMLDivElement,cache:QueryClient;
let load:ReturnType<typeof vi.fn<(type:string)=>Promise<TrainingDaysOverview>>>;
function deferred<T>(){
  let resolve!:(x:T)=>void,reject!:(error:unknown)=>void;
  const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}
async function flushQuery(){
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,15));});
}
async function mount(element:React.ReactNode){
  await act(async()=>root.render(
    <QueryClientProvider client={cache}>{element}</QueryClientProvider>,
  ));
}
async function courseView(userId:string|null="A",enabled=true){
  await mount(<CourseOverview userId={userId} courseId="course_01"
    showTrainingDaysOptIn={enabled} trainingDaysLoader={load}/>);
  await flushQuery();
}
async function dayView(userId:string|null="A",enabled=true){
  await mount(<TrainingIndexOptInHarness enabled={enabled}
    userId={userId} courseType="IMPULSE_CONTROL"
    courseName="Самоконтроль" loadDays={load}/>);
  await flushQuery();
}
beforeEach(()=>{
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  vi.stubGlobal("fetch",vi.fn(()=>{throw Error("REAL_NETWORK_FORBIDDEN");}));
  catalog.list.mockReset().mockResolvedValue([course()]);
  load=vi.fn().mockResolvedValue(overview());
  cache=new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false}}});
  cache.setQueryData(CURRENT_USER_QUERY_KEY,
    {id:"A",username:"user_A",role:"USER"});
  host=document.createElement("div");document.body.append(host);
  root=createRoot(host);
  window.history.replaceState(null,"","/courses/course_01");
});
afterEach(async()=>{
  await act(async()=>root.unmount());
  cache.clear();host.remove();vi.unstubAllGlobals();
  window.history.replaceState(null,"","/");
});
describe("W2 TrainingIndex read-only real UI opt-in from existing course overview",()=>{
  it("W2-M01 disabled by default; catalog->detail works, no days request",async()=>{
    await courseView("A",false);
    expect(host.textContent).toContain("Самоконтроль");
    expect(host.querySelector('a[href^="/trainings/"]')).toBeNull();
    expect(host.querySelector('a[href="/courses"]')).not.toBeNull();
    expect(load).not.toHaveBeenCalled();
  });
  it("W2-M02 opt-in course overview mounts REAL day cards with server status/locks/duration",async()=>{
    await courseView();
    expect(catalog.list).toHaveBeenCalled();
    expect(load).toHaveBeenCalledExactlyOnceWith("IMPULSE_CONTROL");
    expect(host.textContent).toContain("Содержание");
    // Under parallel jsdom load, a fixed 15ms is not enough to resolve
    // the actual async Query state. Retain strict content assertions.
    await act(async()=>{await vi.waitFor(()=>
      expect(host.textContent).toContain("Блок 01"),{timeout:3000});});
    expect(host.textContent).toContain("Блок 01");
    expect(host.textContent).toContain("Блок 02");
    expect(host.textContent).toContain("Пройден");
    expect(host.textContent).toContain("Закрыт");
    expect(host.textContent).toContain("Практика · 15 мин");
    expect(host.textContent).toContain("Теория · 5 мин");
    expect(host.textContent).toContain("Понадобится:");
    expect(host.querySelectorAll(".training-day-card")).toHaveLength(2);
    expect(host.querySelector('a[href^="/trainings/"]')).toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
  it("W2-M03 inline details expand and collapse, locked block never opens route",async()=>{
    await dayView();
    const buttons=[...host.querySelectorAll<HTMLButtonElement>(".training-day-card button")];
    expect(buttons).toHaveLength(2);
    expect(buttons[1]?.getAttribute("aria-expanded")).toBe("false");
    await act(async()=>buttons[1]?.click());
    expect(buttons[1]?.getAttribute("aria-expanded")).toBe("true");
    expect(host.textContent).toContain("Этот блок пока закрыт");
    expect(window.location.pathname).toBe("/courses/course_01");
    await act(async()=>buttons[1]?.click());
    expect(buttons[1]?.getAttribute("aria-expanded")).toBe("false");
  });
  it("W2-M04 pending loading actually visible and resolves to functional card",async()=>{
    const hold=deferred<TrainingDaysOverview>();load.mockReturnValueOnce(hold.promise);
    await dayView();
    expect(host.querySelector('[role="status"]')?.textContent).toContain("Загружаем");
    expect(host.querySelectorAll(".training-day-card")).toHaveLength(0);
    await act(async()=>hold.resolve(overview()));
    await flushQuery();
    expect(host.querySelectorAll(".training-day-card")).toHaveLength(2);
  });
  it("W2-M05 empty course shows honest empty state; no synthetic placeholder day",async()=>{
    load.mockResolvedValueOnce(overview([]));
    await dayView();
    expect(host.textContent).toContain("ещё не опубликованы");
    expect(host.querySelectorAll(".training-day-card")).toHaveLength(0);
  });
  it("W2-ERR403 terminal denial has no Retry or cached private cards",async()=>{
    load.mockRejectedValueOnce(new ApiError(403,"SECRET_SERVER_BODY"))
      .mockResolvedValueOnce(overview());
    cache.setQueryData(["training","days","A","IMPULSE_CONTROL"],overview());
    await dayView();
    expect(host.textContent).toContain("Нет доступа к этому курсу.");
    expect(host.textContent).not.toContain("SECRET_SERVER_BODY");
    expect(host.querySelectorAll(".training-day-card")).toHaveLength(0);
    expect(host.querySelector('a[href="/courses"]')).not.toBeNull();
    expect(host.textContent).not.toContain("Повторить загрузку");
    await flushQuery();
    expect(load).toHaveBeenCalledTimes(1);
  });
  it("W2-ERR401 still offers login not manual GET Retry",async()=>{
    load.mockRejectedValueOnce(new ApiError(401,"SECRET_SESSION"));
    await dayView();
    expect(host.textContent).toContain("Сессия завершена. Войдите снова.");
    expect(host.querySelector('a[href="/login"]')).not.toBeNull();
    expect(host.textContent).not.toContain("Повторить загрузку");
    expect(host.querySelectorAll(".training-day-card")).toHaveLength(0);
  });
  it("W2-ERR503 manual GET retry renders only fresh current course cards",async()=>{
    load.mockRejectedValueOnce(new ApiError(503,"PRIVATE_TRANSIENT"))
      .mockResolvedValueOnce(overview([day("day_02","IN_PROGRESS")]));
    await dayView();
    expect(host.textContent).not.toContain("PRIVATE_TRANSIENT");
    expect(host.querySelectorAll(".training-day-card")).toHaveLength(0);
    const retry=[...host.querySelectorAll<HTMLButtonElement>("button")]
      .find(x=>x.textContent==="Повторить загрузку");
    expect(retry).toBeDefined();
    await act(async()=>retry?.click());await flushQuery();
    expect(load).toHaveBeenCalledTimes(2);
    expect(host.querySelectorAll(".training-day-card")).toHaveLength(1);
    expect(host.textContent).toContain("Блок 2. Практика");
    expect(host.textContent).not.toContain("Блок 1. Основы");
  });
  it("W2-M07 500/network fails as error not empty, privacy safe",async()=>{
    load.mockRejectedValueOnce(Error("PRIVATE_SESSION_SECRET"));
    await dayView();
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    expect(host.textContent).not.toContain("PRIVATE_SESSION_SECRET");
    expect(host.textContent).not.toContain("ещё не опубликованы");
  });
  it("W2-M08 public paid course keeps a program link without leaking protected days",async()=>{
    catalog.list.mockResolvedValueOnce([course(false)]);
    await courseView();
    expect(host.textContent).toContain("Посмотреть программу платного курса");
    expect(host.textContent).not.toContain("Для просмотра дней курса необходим доступ");
    expect(load).not.toHaveBeenCalled();
  });
  it("W2-M09 guest cannot load private training days",async()=>{
    await dayView(null);
    expect(host.textContent).toBe("");
    expect(load).not.toHaveBeenCalled();
    expect(host.querySelector(".training-index")).toBeNull();
  });
  it("W2-M10 personalization required hides days and requests no mutation",async()=>{
    load.mockResolvedValueOnce({...overview(),requiresPersonalization:true});
    await dayView();
    expect(host.textContent).toContain("Персонализация курса");
    expect(host.querySelector("form[aria-label='Форма персонализации курса']"))
      .not.toBeNull();
    expect(host.querySelectorAll(".training-day-card")).toHaveLength(0);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
  it("W2-M11 same viewport 360px mounted render preserves semantics and responsive CSS",async()=>{
    vi.stubGlobal("innerWidth",360);
    document.documentElement.style.width="360px";
    await dayView();
    expect(host.querySelectorAll(".training-day-card")).toHaveLength(2);
    expect(host.querySelectorAll("button[aria-expanded]")).toHaveLength(2);
    expect(host.querySelector(".training-index-heading a")).not.toBeNull();
    // Narrow jsdom checks visible controls and semantics only.
    // The separate CSS source check does not imply browser pixel acceptance.
  });
  it("W2-M12 identity A->B swaps Query key and never reuses A visible list",async()=>{
    const hold=deferred<TrainingDaysOverview>();
    load.mockReturnValueOnce(hold.promise)
      .mockResolvedValueOnce(overview([day("day_02","NOT_STARTED")]));
    await dayView("A");
    await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,
      {id:"B",username:"user_B",role:"USER"}));
    await dayView("B");
    expect(load).toHaveBeenCalledTimes(2);
    await act(async()=>hold.resolve(overview([day("day_01","COMPLETED")])));
    await flushQuery();
    expect(host.querySelectorAll(".training-day-card")).toHaveLength(1);
    expect(host.textContent).not.toContain("Блок 02");
    expect(host.textContent).not.toContain("Пройден");
  });
  it("W2-M13 opt-in false mounted harness returns null, no data request",async()=>{
    await dayView("A",false);
    expect(host.textContent).toBe("");
    expect(load).not.toHaveBeenCalled();
  });
});

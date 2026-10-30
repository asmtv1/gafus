// @vitest-environment jsdom
import {act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {CourseCatalog} from "../courses/CourseCatalog";
import {DailyCourseOptInHarness} from "./DailyCourseOptInHarness";
import {CURRENT_USER_QUERY_KEY} from "../../shared/auth/useAuth";
import {ApiError} from "../../shared/api/client";
import type {DailyToday,DailyDay} from "./dailyCourseApi";
const mocks=vi.hoisted(()=>({courses:vi.fn(),favorite:vi.fn()}));
vi.mock("../courses/courseApi",()=>({
  listCourses:mocks.courses,setCourseFavorite:mocks.favorite,
}));
const today:DailyToday={
  mskDate:"2026-10-17",scheduleId:"schedule_A",userStatus:"IN_PROGRESS",
  day:{id:"bundle_1",title:"Работа с возбуждением",
    description:"Короткие упражнения для собаки",type:"training",
    estimatedDuration:12,theoryMinutes:5,stepsCount:2},
  stepsSummary:{total:2,completed:1},
};
const day:DailyDay={
  scheduleId:"schedule_A",mskDate:"2026-10-17",
  trainingDayId:"bundle_1",bundleId:"bundle_1",
  title:"Работа с возбуждением",description:"Теория и практика",
  type:"training",userStatus:"IN_PROGRESS",
  steps:[
    {id:"s1",title:"Теория импульса",description:"Дышим спокойно",
      type:"THEORY",status:"COMPLETED",order:0,durationSec:0,
      locked:false,videoUrl:null,imageUrls:[]},
    {id:"s2",title:"Практика с игрушкой",description:"Переключаем внимание",
      type:"PRACTICE",status:"IN_PROGRESS",order:1,durationSec:90,
      locked:false,videoUrl:"https://cdn.example.com/step.mp4",
      imageUrls:["https://cdn.example.com/a.png"]},
  ],
};
function hold<T>(){
  let resolve!:(v:T)=>void,reject!:(e:unknown)=>void;
  const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}
let host:HTMLDivElement,root:Root,cache:QueryClient;
let loadToday:ReturnType<typeof vi.fn<()=>Promise<DailyToday>>>;
let loadDay:ReturnType<typeof vi.fn<(v:DailyToday)=>Promise<DailyDay>>>;
async function flush(){
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,15));});
}
async function mount(ui:React.ReactNode){
  await act(async()=>root.render(
    <QueryClientProvider client={cache}>{ui}</QueryClientProvider>,
  ));
}
async function catalog(userId:string|null="A",enabled=true,withDay=true){
  await mount(<CourseCatalog userId={userId}
    showDailyCourseOptIn={enabled} dailyTodayLoader={loadToday}
    dailyDayLoader={withDay?loadDay:undefined}/>);
  await flush();
}
async function harness(userId:string|null="A",enabled=true,withDay=true){
  await mount(<DailyCourseOptInHarness userId={userId} enabled={enabled}
    loadToday={loadToday} loadDay={withDay?loadDay:undefined}/>);
  await flush();
}
async function open(){
  const action=[...host.querySelectorAll<HTMLButtonElement>("button")]
    .find(x=>x.textContent==="Посмотреть шаги");
  expect(action).not.toBeUndefined();
  await act(async()=>action?.click());
  await flush();
}
beforeEach(()=>{
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  vi.stubGlobal("fetch",vi.fn(()=>{throw Error("REAL_HTTP_DISALLOWED");}));
  mocks.courses.mockReset().mockResolvedValue([]);
  loadToday=vi.fn().mockResolvedValue(today);
  loadDay=vi.fn().mockResolvedValue(day);
  cache=new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false}}});
  cache.setQueryData(CURRENT_USER_QUERY_KEY,{
    id:"A",username:"user_A",role:"USER",
  });
  host=document.createElement("div");document.body.append(host);
  root=createRoot(host);
  window.history.replaceState(null,"","/courses");
});
afterEach(async()=>{
  await act(async()=>root.unmount());
  cache.clear();host.remove();vi.unstubAllGlobals();
  window.history.replaceState(null,"","/");
});
describe("W2 daily-course opt-in real React mounted catalog and read-only steps",()=>{
  it("DC-M01 default disabled catalog does not fetch or mount daily view",async()=>{
    await catalog("A",false);
    expect(host.textContent).toContain("Курсы");
    expect(loadToday).not.toHaveBeenCalled();
    expect(loadDay).not.toHaveBeenCalled();
  });
  it("DC-M02 catalog -> published Moscow today -> details theory/practice/media/back",async()=>{
    await catalog();
    expect(loadToday).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain("2026-10-17");
    expect(host.textContent).toContain("Работа с возбуждением");
    expect(host.textContent).toContain("Выполнено: 1 из 2");
    expect(host.querySelector('progress[aria-label="Прогресс курса дня"]'))
      .toMatchObject({value:1,max:2});
    await open();
    expect(loadDay).toHaveBeenCalledExactlyOnceWith(today);
    expect(host.textContent).toContain("Теория импульса");
    expect(host.textContent).toContain("Практика с игрушкой");
    const expand=[...host.querySelectorAll<HTMLButtonElement>(
      ".training-step-card button")];
    expect(expand).toHaveLength(2);
    await act(async()=>expand[0]?.click());
    expect(host.textContent).toContain("Дышим спокойно");
    await act(async()=>expand[1]?.click());
    expect(host.querySelector("video")?.getAttribute("src"))
      .toBe("https://cdn.example.com/step.mp4");
    // Source Next StepContent prioritizes its first *separate* step image:
    // loading="eager" (subsequent images are lazy). Do not select a future
    // inline Markdown image by accident.
    expect(host.querySelector(".training-step-image-thumb img")?.getAttribute("loading"))
      .toBe("eager");
    expect(globalThis.fetch).not.toHaveBeenCalled();
    const back=host.querySelector<HTMLButtonElement>(".daily-course-day > button");
    await act(async()=>back?.click());
    expect(host.textContent).toContain("Посмотреть шаги");
    expect(window.location.pathname).toBe("/courses");
  });
  it("DC-M03 guest never loads private today",async()=>{
    await catalog(null);
    expect(host.textContent).toBe("");
    expect(loadToday).not.toHaveBeenCalled();
    expect(loadDay).not.toHaveBeenCalled();
  });
  it("DC-M04 unpublished today means empty, not invented exercise",async()=>{
    loadToday.mockResolvedValueOnce({...today,scheduleId:null,day:null,
      userStatus:"NOT_STARTED",stepsSummary:{total:0,completed:0}});
    await harness();
    expect(host.textContent).toContain("не опубликовано");
    expect(loadDay).not.toHaveBeenCalled();
  });
  it("DC-M05 overview from GET /today only never silently fetches /day",async()=>{
    await harness("A",true,false);
    expect(host.textContent).toContain("ожидает проверку");
    expect(host.textContent).not.toContain("Посмотреть шаги");
    expect(loadDay).not.toHaveBeenCalled();
  });
  it("DC-M06 loading status reflects unresolved /today then card",async()=>{
    const pending=hold<DailyToday>();loadToday.mockReturnValueOnce(pending.promise);
    await harness();
    expect(host.textContent).toContain("Загружаем курс дня");
    await act(async()=>pending.resolve(today));await flush();
    expect(host.textContent).toContain("Работа с возбуждением");
  });
  it("DC-M07 day loading / empty steps use actual states",async()=>{
    const pending=hold<DailyDay>();loadDay.mockReturnValueOnce(pending.promise);
    await harness();await open();
    expect(host.textContent).toContain("Загружаем шаги");
    await act(async()=>pending.resolve({...day,steps:[]}));await flush();
    expect(host.textContent).toContain("Шаги ещё не опубликованы");
    expect(host.querySelectorAll(".training-step-card")).toHaveLength(0);
  });
  it.each([
    [401,"Сессия завершена"],
    [403,"Нет доступа"],
    [404,"больше недоступен"],
    [500,"Не удалось загрузить"],
  ])("DC-M08-10 /today HTTP %d bounded terminal/transient recovery",async(status,copy)=>{
    loadToday.mockRejectedValueOnce(new ApiError(status,"SECRET_STACK"))
      .mockResolvedValueOnce(today);
    await harness();
    expect(host.textContent).toContain(copy);
    expect(host.textContent).not.toContain("SECRET_STACK");
    expect(loadToday).toHaveBeenCalledTimes(1);
    const retry=[...host.querySelectorAll<HTMLButtonElement>("button")]
      .find(x=>x.textContent==="Повторить загрузку");
    expect(host.querySelector('a[href="/login"]') !== null).toBe(status===401);
    if (status===500) {
      expect(retry).toBeDefined();
      await act(async()=>retry?.click());await flush();
      expect(loadToday).toHaveBeenCalledTimes(2);
      expect(host.textContent).toContain("Работа с возбуждением");
    } else {
      expect(retry).toBeUndefined();
      await flush();
      expect(loadToday).toHaveBeenCalledTimes(1);
      expect(host.textContent).not.toContain("Работа с возбуждением");
    }
  });
  it.each([
    [401,"Сессия завершена"],
    [403,"Нет доступа"],
    [404,"больше недоступен"],
    [500,"Не удалось загрузить"],
  ])("DC-M11-13 detail HTTP %d bounded terminal/transient recovery",async(status,copy)=>{
    loadDay.mockRejectedValueOnce(new ApiError(status,"PRIVATE_SQL"))
      .mockResolvedValueOnce(day);
    await harness();await open();
    expect(host.textContent).toContain(copy);
    expect(host.textContent).not.toContain("PRIVATE_SQL");
    expect(loadDay).toHaveBeenCalledTimes(1);
    const retry=[...host.querySelectorAll<HTMLButtonElement>("button")]
      .find(x=>x.textContent==="Повторить загрузку");
    expect(host.querySelector('a[href="/login"]') !== null).toBe(status===401);
    if (status===500) {
      expect(retry).toBeDefined();
      await act(async()=>retry?.click());await flush();
      expect(host.textContent).toContain("Теория импульса");
      expect(loadDay).toHaveBeenCalledTimes(2);
    } else {
      expect(retry).toBeUndefined();
      await flush();
      expect(loadDay).toHaveBeenCalledTimes(1);
      expect(host.textContent).not.toContain("Теория импульса");
    }
  });
  it("DC-M14 stale schedule/day detail rejects different server id/date",async()=>{
    loadDay.mockResolvedValueOnce({...day,scheduleId:"other"});
    await harness();await open();
    expect(host.textContent).toContain("Не удалось загрузить");
    expect(host.textContent).not.toContain("Теория импульса");
  });
  it("DC-M15 A->B during pending day hides media and stale late success",async()=>{
    const pending=hold<DailyDay>();loadDay.mockReturnValueOnce(pending.promise);
    await harness();await open();
    await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,
      {id:"B",username:"user_B",role:"USER"}));
    expect(host.textContent).toContain("Сессия изменилась");
    await act(async()=>pending.resolve(day));await flush();
    expect(host.textContent).not.toContain("Теория импульса");
    expect(host.querySelector("video")).toBeNull();
    expect(loadDay).toHaveBeenCalledTimes(1);
  });
  it("DC-M16 A->B->A cannot reactivate old owner day cache",async()=>{
    await harness();await open();
    expect(host.textContent).toContain("Теория импульса");
    await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,
      {id:"B",username:"user_B",role:"USER"}));
    await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,
      {id:"A",username:"user_A",role:"USER"}));
    expect(host.textContent).toContain("Сессия изменилась");
    expect(host.textContent).not.toContain("Теория импульса");
    expect(loadDay).toHaveBeenCalledTimes(1);
  });
  it("DC-M17 same owner new authEpoch and logout clear private media",async()=>{
    await harness();await open();
    const expand=[...host.querySelectorAll<HTMLButtonElement>(
      ".training-step-card button")];
    await act(async()=>expand[1]?.click());
    expect(host.querySelector("video")).not.toBeNull();
    await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,
      {id:"A",username:"refreshed_owner",role:"USER"}));
    expect(host.querySelector("video")).toBeNull();
    expect(host.textContent).toContain("Сессия изменилась");
  });
  it("DC-M18 initially mismatched principal refuses any private GET",async()=>{
    await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,
      {id:"B",username:"user_B",role:"USER"}));
    await harness("A");
    expect(host.textContent).toContain("Сессия изменилась");
    expect(loadToday).not.toHaveBeenCalled();
    expect(loadDay).not.toHaveBeenCalled();
  });
  it("DC-M20 Moscow rollover closes old opened day; no automatic new day GET",async()=>{
    await harness();await open();
    expect(host.textContent).toContain("Теория импульса");
    loadToday.mockResolvedValueOnce({
      ...today,mskDate:"2026-10-18",scheduleId:"schedule_B",
      day:{...today.day!,id:"bundle_2",title:"Новый день"},
    });
    await act(async()=>cache.invalidateQueries({
      queryKey:["daily-course","today","A"],
    }));
    await flush();
    expect(host.textContent).toContain("Новый день");
    expect(host.textContent).not.toContain("Теория импульса");
    expect(loadDay).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain("Посмотреть шаги");
  });
  it("DC-M21 logout cache.clear closes expanded video without new GET",async()=>{
    await harness();await open();
    const expand=[...host.querySelectorAll<HTMLButtonElement>(
      ".training-step-card button")];
    await act(async()=>expand[1]?.click());
    expect(host.querySelector("video")).not.toBeNull();
    await act(async()=>cache.clear());
    expect(host.querySelector("video")).toBeNull();
    expect(host.textContent).toContain("Сессия изменилась");
    expect(loadDay).toHaveBeenCalledTimes(1);
  });
  it("DC-M22 A->B during pending today cannot show A schedule",async()=>{
    const pending=hold<DailyToday>();
    loadToday.mockReturnValueOnce(pending.promise);
    await harness();
    expect(host.textContent).toContain("Загружаем курс дня");
    await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,
      {id:"B",username:"user_B",role:"USER"}));
    expect(host.textContent).toContain("Сессия изменилась");
    await act(async()=>pending.resolve(today));await flush();
    expect(host.textContent).not.toContain("Работа с возбуждением");
    expect(loadToday).toHaveBeenCalledTimes(1);
  });
  it("DC-M19 narrow 360px interactive controls remain mounted, no gated route",async()=>{
    vi.stubGlobal("innerWidth",360);
    document.documentElement.style.width="360px";
    await catalog();await open();
    expect(host.querySelectorAll(".training-step-card")).toHaveLength(2);
    expect(host.querySelector(".daily-course-day > button")).not.toBeNull();
    expect(window.location.pathname).toBe("/courses");
  });
});


// COURSE011_DAILY_PARENT_MARKDOWN — authored intro for schedule and verified day.
const dailyParentText = [
  "## Инструкции дня", "", "- **Проверьте** настроение", "- *Поощряйте* спокойствие",
  "", "| Шаг | Время |", "| --- | --- |", "| Пауза | 2 мин |",
  "", "```text", "ПРАВИЛО_ДНЯ", "```",
  "", "[Подробнее](https://example.org/guide)",
  "", "[СКРЫТЫЙ_JS](javascript:alert(1))",
  "", "![PRIVATE_REMOTE_IMAGE](https://example.org/img.png)",
  "", "<script>PRIVATE_HTML</script>",
].join("\n");

describe("COURSE011_DAILY_PARENT_MARKDOWN verified summary and full day instructions",()=>{
  it("renders schedule summary and verified detail with semantic GFM without remote HTML/media",async()=>{
    loadToday.mockResolvedValueOnce({...today,day:{...today.day!,description:dailyParentText}});
    loadDay.mockResolvedValueOnce({...day,description:dailyParentText});
    await harness();
    const summary=host.querySelector<HTMLElement>(
      '.daily-course-summary [aria-label="Описание задания дня"]');
    expect(summary?.querySelector("h2")?.textContent).toBe("Инструкции дня");
    expect(summary?.querySelectorAll("ul > li")).toHaveLength(2);
    expect(summary?.querySelector("strong")?.textContent).toBe("Проверьте");
    expect(summary?.querySelector("em")?.textContent).toBe("Поощряйте");
    expect(summary?.querySelector("table td")?.textContent).toBe("Пауза");
    expect(summary?.querySelector("pre code")?.textContent).toContain("ПРАВИЛО_ДНЯ");
    expect(summary?.querySelector('a[href="https://example.org/guide"]')).not.toBeNull();
    expect(summary?.querySelector('a[href^="javascript:"]')).toBeNull();
    expect(summary?.querySelector("img,script,iframe,video")).toBeNull();
    expect(summary?.textContent).not.toContain("PRIVATE_HTML");
    expect(summary?.querySelector("p div")).toBeNull();
    await open();
    // Source Next Day: description starts collapsed and only mounts private
    // Markdown after an explicit expansion, never from schedule summary.
    expect(host.querySelector('.daily-next-description-body')).toBeNull();
    const showDescription=host.querySelector<HTMLButtonElement>(
      '.daily-next-description-header');
    expect(showDescription?.getAttribute("aria-expanded")).toBe("false");
    await act(async()=>showDescription?.click());
    const detailBlock=host.querySelector<HTMLElement>(
      '.daily-next-description-body');
    expect(detailBlock?.querySelector("h2")?.textContent).toBe("Инструкции дня");
    expect(detailBlock?.querySelectorAll("ul > li")).toHaveLength(2);
    expect(detailBlock?.querySelector("table")).not.toBeNull();
    expect(detailBlock?.querySelector("pre code")?.textContent).toContain("ПРАВИЛО_ДНЯ");
    expect(detailBlock?.querySelector("img,script,iframe,video")).toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
  it("plain text and empty descriptions preserve readable state and no empty markdown block",async()=>{
    loadToday.mockResolvedValueOnce({...today,day:{...today.day!,description:"Обычная тренировка"}});
    loadDay.mockResolvedValueOnce({...day,description:""});
    await harness();
    expect(host.querySelector<HTMLElement>(
      '.daily-course-summary [aria-label="Описание задания дня"] p')?.textContent)
      .toBe("Обычная тренировка");
    await open();
    expect(host.querySelector('.daily-next-description-body')).toBeNull();
    expect(host.querySelectorAll(".training-step-card")).toHaveLength(2);
  });
  it("pending/403/mismatch fresh Daily detail and denied schedule do not reveal private Markdown",async()=>{
    const pending=hold<DailyDay>();
    loadDay.mockReturnValueOnce(pending.promise);
    loadToday.mockResolvedValueOnce({...today,day:{...today.day!,description:"Только публичная сводка"}});
    await harness();await open();
    expect(host.querySelector('[aria-label="Описание упражнений курса дня"]')).toBeNull();
    await act(async()=>pending.resolve({...day,description:"## PRIVATE_DAY_UNKNOWN",
      trainingDayId:"OTHER_DAY_ID"}));
    await flush();
    expect(host.textContent).not.toContain("PRIVATE_DAY_UNKNOWN");
    expect(host.querySelector('[aria-label="Описание упражнений курса дня"]')).toBeNull();
    await act(async()=>root.unmount());cache.clear();root=createRoot(host);
    loadToday.mockReset().mockRejectedValueOnce(new ApiError(403,"PRIVATE_SCHEDULE"));
    await harness();
    expect(host.querySelector('[aria-label="Описание задания дня"]')).toBeNull();
    expect(host.textContent).not.toContain("PRIVATE_SCHEDULE");
  });
});

// Live Next visual reference 2026-10-25: owner /courses has the DAILY card
// before the standalone search bar. No placeholder course or signed media.
describe("LIVE-NEXT-CATALOG daily source card (connected route only)",()=>{
  it("shows confirmed Moscow assignment in Next CSS geometry before search",async()=>{
    await mount(<CourseCatalog userId="A" showDailyCourseOptIn
      dailyRouteMode dailyTodayLoader={loadToday} dailyDayLoader={loadDay}/>);
    await flush();
    const card=host.querySelector('[data-next-daily-course-card]');
    const search=host.querySelector('[data-next-course-search]');
    expect(card).not.toBeNull();
    expect(search).not.toBeNull();
    expect((card?.compareDocumentPosition(search!) ?? 0) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy();
    expect(card?.querySelector('a[href="/daily-course/schedule_A"]')).not.toBeNull();
    expect(card?.querySelector('img[alt="Курс дня"]')?.getAttribute('src'))
      .toContain('/uploads/courses/course-day-logo.png');
    expect(card?.textContent).toContain('Задание дня');
    expect(card?.textContent).toContain('1/2 выполнено');
    expect(card?.querySelector('[aria-label="Прогресс курса дня: 50%"]')).not.toBeNull();
    expect(loadToday).toHaveBeenCalledTimes(1);
    expect(loadDay).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
  it("does not invent an assignment when today's verified Hono result is empty",async()=>{
    loadToday.mockResolvedValueOnce({mskDate:"2026-10-25",scheduleId:null,
      userStatus:"NOT_STARTED",day:null,stepsSummary:{total:0,completed:0}});
    await mount(<CourseCatalog userId="A" showDailyCourseOptIn
      dailyRouteMode dailyTodayLoader={loadToday} dailyDayLoader={loadDay}/>);
    await flush();
    expect(host.querySelector('[data-next-daily-course-card]')).toBeNull();
    expect(host.querySelector('[data-next-course-search]')).not.toBeNull();
    expect(loadDay).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
  it("pending/forbidden owner today never leaks card or cached private summary",async()=>{
    const pending=hold<DailyToday>();
    loadToday.mockReturnValueOnce(pending.promise);
    await mount(<CourseCatalog userId="A" showDailyCourseOptIn
      dailyRouteMode dailyTodayLoader={loadToday} dailyDayLoader={loadDay}/>);
    expect(host.querySelector('[data-next-daily-course-card]')).toBeNull();
    await act(async()=>pending.resolve(today));await flush();
    expect(host.querySelector('[data-next-daily-course-card]')).not.toBeNull();
    await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,
      {id:"B",username:"user_B",role:"USER"}));
    expect(host.querySelector('[data-next-daily-course-card]')).toBeNull();
    expect(host.textContent).not.toContain('Работа с возбуждением');
  });
});

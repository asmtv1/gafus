// @vitest-environment jsdom
import {act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {afterEach,beforeAll,beforeEach,describe,expect,it,vi} from "vitest";
import {App} from "../../App";
import {CURRENT_USER_QUERY_KEY} from "../../shared/auth/useAuth";
import {trainingCoursePath,trainingDayPath,trainingRouteFromPath,
 dailyCoursePath,dailyScheduleIdFromPath,routeForPath} from "../../shared/router/location";
import type {TrainingDaysOverview,TrainingDaySummary} from "./trainingDaysApi";
import type {TrainingDayDetail} from "./trainingDayApi";
import type {DailyToday,DailyDay} from "../daily-course/dailyCourseApi";
const course=(hasAccess=true)=>({id:"course_01",name:"Самоконтроль",
 type:"IMPULSE_CONTROL",shortDesc:"Управление возбуждением",duration:"14 дней",
 isPaid:false,isPrivate:false,hasAccess,isFavorite:false,
 userStatus:"IN_PROGRESS",trainingLevel:"BEGINNER"});
const first:TrainingDaySummary={trainingDayId:"day_01",dayOnCourseId:"link_01",
 courseId:"course_01",title:"День 1. Смена внимания",type:"practice",
 userStatus:"IN_PROGRESS",estimatedDuration:15,theoryMinutes:5,equipment:"Поводок",
 isLocked:false};
const locked:TrainingDaySummary={...first,trainingDayId:"day_02",
 dayOnCourseId:"link_02",title:"День 2. Закрепление",isLocked:true};
const overview=():TrainingDaysOverview=>({courseId:"course_01",
 courseDescription:"Контролируем возбуждение",courseEquipment:"Поводок",
 courseTrainingLevel:"BEGINNER",requiresPersonalization:false,
 days:[first,locked]});
const steps=():TrainingDayDetail=>({
 trainingDayId:"day_01",dayOnCourseId:"link_01",courseId:"course_01",
 title:"День 1. Смена внимания",type:"practice",description:"Чередуем действия",
 userStatus:"IN_PROGRESS",steps:[{id:"step_01",title:"Практика на поводке",
 description:"Работаем спокойно",type:"PRACTICE",status:"IN_PROGRESS",
 order:0,durationSec:120,locked:false,videoUrl:null,imageUrls:[]}]});
const today:DailyToday={mskDate:"2026-10-18",scheduleId:"schedule_01",
 userStatus:"IN_PROGRESS",day:{id:"bundle_01",title:"Работа с возбуждением",
 description:"Короткая практика",type:"training",estimatedDuration:10,
 theoryMinutes:5,stepsCount:1},
 stepsSummary:{total:1,completed:0}};
const daily:DailyDay={scheduleId:"schedule_01",mskDate:"2026-10-18",
 trainingDayId:"bundle_01",bundleId:"bundle_01",
 title:"Работа с возбуждением",description:"Короткая практика",
 type:"training",userStatus:"IN_PROGRESS",
 steps:[{id:"daily_01",title:"Упражнение дня",description:"Спокойно переключаемся",
 type:"PRACTICE",status:"IN_PROGRESS",order:0,durationSec:90,locked:false,
 videoUrl:null,imageUrls:[]}]};
const deferred=<T,>()=>{let resolve!:(value:T)=>void;
 const promise=new Promise<T>(yes=>{resolve=yes;});return {resolve,promise};};
beforeAll(async () => {
 await Promise.all([
  import("../courses/CourseCatalog"),
  import("./TrainingIndexOptInHarness"),
  import("../daily-course/DailyCourseOptInHarness"),
  import("../profile/ProfileOverview"),
  import("./CourseReviewsOptIn"),
 ]);
});
let cache:QueryClient,node:HTMLDivElement,root:Root,fetcher:ReturnType<typeof vi.fn>;
let daysFn:ReturnType<typeof vi.fn<(type:string)=>Promise<TrainingDaysOverview>>>;
let dayFn:ReturnType<typeof vi.fn<(type:string,d:TrainingDaySummary)=>Promise<TrainingDayDetail>>>;
let todayFn:ReturnType<typeof vi.fn<()=>Promise<DailyToday>>>;
let dailyFn:ReturnType<typeof vi.fn<(t:DailyToday)=>Promise<DailyDay>>>;
// Route chunks and loader results must commit through separate React acts.
const tick=async()=>{for(let i=0;i<5;i++){
 await act(async()=>{await new Promise(ok=>setTimeout(ok,100));});
}};
async function mount(path="/profile",enabled=true,all=true){
 window.history.replaceState(null,"",path);
 await act(async()=>root.render(<QueryClientProvider client={cache}>
  <App showTrainingFlowOptIn={enabled}
   trainingDaysLoader={daysFn} trainingDayLoader={dayFn}
   dailyTodayLoader={all?todayFn:undefined}
   dailyDayLoader={all?dailyFn:undefined}/>
 </QueryClientProvider>));await tick();
}
async function link(href:string){
 const a=node.querySelector<HTMLAnchorElement>('a[href="'+href+'"]');
 expect(a,href).not.toBeNull();
 await act(async()=>a?.dispatchEvent(new MouseEvent("click",
  {bubbles:true,cancelable:true,button:0})));await tick();
}
async function button(label:string){
 const b=[...node.querySelectorAll<HTMLButtonElement>("button")]
  .find(x=>x.textContent?.trim()===label);
 expect(b,label).toBeDefined();
 await act(async()=>b?.click());await tick();
}
beforeEach(()=>{
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 cache=new QueryClient({defaultOptions:{queries:{retry:false,
   refetchOnWindowFocus:false}}});
 cache.setQueryData(CURRENT_USER_QUERY_KEY,{id:"A",username:"userA",role:"USER"});
 fetcher=vi.fn(async(url:string,opt:RequestInit)=>{
  if(opt?.method!=="GET")throw Error("MUTATING_HTTP_FORBIDDEN");
  if(url==="/api/v1/user/profile")return new Response(JSON.stringify({
   success:true,data:{id:"A",username:"userA",
    profile:{fullName:"Владелец",city:"Самара",about:"Тренировки"},
    email:"SECRET_EMAIL"}}),{status:200});
  if(url==="/api/v1/courses")return new Response(JSON.stringify({
   success:true,data:[course()]}),{status:200});
  throw Error("UNAPPROVED_HTTP_"+url);
 });
 vi.stubGlobal("fetch",fetcher);
 daysFn=vi.fn(async()=>overview());dayFn=vi.fn(async()=>steps());
 todayFn=vi.fn(async()=>today);dailyFn=vi.fn(async()=>daily);
 node=document.createElement("div");document.body.append(node);root=createRoot(node);
});
afterEach(async()=>{
 await act(async()=>root.unmount());cache.clear();node.remove();
 vi.unstubAllGlobals();window.history.replaceState(null,"","/");
});
describe("WEB-URL-048/049/017 actual App source-only deep link flow",()=>{
 it("C01 protected ordinary training and real daily read work without old flags",async()=>{
  await mount("/trainings/IMPULSE_CONTROL",false);
  expect(node.textContent).toContain("Содержание");
  expect(node.textContent).toContain("Блок 01");
  expect(daysFn).toHaveBeenCalled();
  await mount("/trainings/IMPULSE_CONTROL/link_01",false);
  expect(node.textContent).toContain("Практика на поводке");
  await mount("/daily-course/schedule_01",false);
  expect(node.textContent).toContain("Упражнение дня");
  expect(dailyFn).toHaveBeenCalledExactlyOnceWith(today);
 });
 it("C02 missing Daily fixture does not hide independently available training GET",async()=>{
  await mount("/trainings/IMPULSE_CONTROL",true,false);
  expect(node.textContent).toContain("Содержание");
  expect(node.textContent).toContain("Блок 01");
  expect(daysFn).toHaveBeenCalled();
  expect(dailyFn).not.toHaveBeenCalled();
 });
 it("C03 real profile -> courses -> overview -> training days -> steps -> back",async()=>{
  await mount();
  await link("/courses");
  expect(node.textContent).toContain("Управление возбуждением");
  // Source Next CourseCard opens the canonical training route directly;
  // the separate /courses/:id route is retained for old bookmarks only.
  await link("/trainings/IMPULSE_CONTROL");
  expect(window.location.pathname).toBe("/trainings/IMPULSE_CONTROL");
  expect(node.textContent).toContain("Блок 01");
  expect(node.textContent).toContain("Закрыт");
  await link("/trainings/IMPULSE_CONTROL/link_01");
  expect(window.location.pathname).toBe("/trainings/IMPULSE_CONTROL/link_01");
  expect(node.textContent).toContain("Практика на поводке");
  // The original Next day has one back action in the shared header, not
  // a duplicate day-body button. Route stack must still return to the course.
  expect(node.querySelector(".training-next-back")).toBeNull();
  await button("Назад");
  expect(window.location.pathname).toBe("/trainings/IMPULSE_CONTROL");
  expect(node.textContent).toContain("Блок 01");
  expect(dayFn).toHaveBeenCalledExactlyOnceWith("IMPULSE_CONTROL",first);
 });
 it("C04 training direct day link loads ONLY confirmed accessible day",async()=>{
  await mount("/trainings/IMPULSE_CONTROL/link_01");
  expect(node.textContent).toContain("Практика на поводке");
  expect(node.querySelector("button.training-next-day-description-toggle"))
   .not.toBeNull();
  expect(node.querySelector(".training-next-day-description-body")).toBeNull();
  expect(daysFn).toHaveBeenCalledWith("IMPULSE_CONTROL");
  expect(dayFn).toHaveBeenCalledExactlyOnceWith("IMPULSE_CONTROL",first);
  // Legacy DayAccordionItem never rendered standalone progress cards below
  // closed step headers. Lazy mounting also avoids unrequested bound GETs.
  expect(node.querySelector('[aria-label="Управление прогрессом тренировочного дня"]'))
   .toBeNull();
  expect(node.querySelectorAll(".training-next-step-header")).toHaveLength(1);
  const step = node.querySelector<HTMLButtonElement>("button.training-next-step-header");
  await act(async()=>step?.click());
  await tick();
  expect(node.querySelector('[aria-label="Управление текущим шагом"]'))
   .not.toBeNull();
  // Original Next places controls inside the expanded step; no duplicated
  // full-day progress list nested under the first accordion.
  // This legacy GET fixture has no StepOnDay binding, so controls remain closed.
  expect(node.querySelectorAll(".training-progress-inline-step")).toHaveLength(0);
  expect(node.querySelector(".training-progress-connected .training-steps-list")).toBeNull();
  expect(fetcher.mock.calls.some(([,req])=>req?.method==="POST")).toBe(false);
 });
 it("C05 locked/unknown day never calls step GET",async()=>{
  await mount("/trainings/IMPULSE_CONTROL/link_02");
  expect(node.textContent).toContain("День не найден или недоступен");
  expect(dayFn).not.toHaveBeenCalled();
  await mount("/trainings/IMPULSE_CONTROL/link_absent");
  expect(node.textContent).toContain("День не найден или недоступен");
  expect(dayFn).not.toHaveBeenCalled();
 });
 it("C06 course without server hasAccess never calls days/steps GET",async()=>{
  fetcher.mockImplementation(async(url:string,opt:RequestInit)=>{
   if(url==="/api/v1/courses"&&opt.method==="GET")
    return new Response(JSON.stringify({success:true,data:[course(false)]}),{status:200});
   throw Error("UNEXPECTED_ROUTE");
  });
  await mount("/trainings/IMPULSE_CONTROL/link_01");
  expect(node.textContent).toContain("Курс недоступен");
  expect(daysFn).not.toHaveBeenCalled();
  expect(dayFn).not.toHaveBeenCalled();
 });
 it("C07 direct /daily-course/schedule_01 verifies today before detail",async()=>{
  await mount("/daily-course/schedule_01");
  expect(todayFn).toHaveBeenCalledTimes(1);
  expect(dailyFn).toHaveBeenCalledExactlyOnceWith(today);
  expect(node.textContent).toContain("Упражнение дня");
 });
 it("C08 course catalog daily summary -> schedule deep link -> back",async()=>{
  await mount("/courses");
  expect(node.textContent).toContain("Управление возбуждением");
  await link("/daily-course/schedule_01");
  expect(node.textContent).toContain("Упражнение дня");
  // Next-style routed Daily detail has no duplicate local back button;
  // navigation belongs to the shared site header.
  await button("Назад");
  expect(window.location.pathname).toBe("/courses");
  // Next-style course-of-the-day is now a single direct hero link rather
  // than an expanded summary button on the catalog.
  expect(node.querySelector('a[href="/daily-course/schedule_01"]')).not.toBeNull();
  expect(node.textContent).toContain("Задание дня");
 });
 it("C09 mismatch schedule ID denies detail and private content",async()=>{
  await mount("/daily-course/old_schedule");
  expect(node.textContent).toContain("Задание не найдено или недоступно");
  expect(dailyFn).not.toHaveBeenCalled();
  expect(node.textContent).not.toContain("Упражнение дня");
 });
 it("C10 malformed deep links fail route parser before loader",async()=>{
  expect(trainingCoursePath("IMPULSE_CONTROL")).toBe("/trainings/IMPULSE_CONTROL");
  expect(trainingDayPath("IMPULSE_CONTROL","link_01"))
   .toBe("/trainings/IMPULSE_CONTROL/link_01");
  expect(dailyCoursePath("schedule_01")).toBe("/daily-course/schedule_01");
  expect(trainingRouteFromPath("/trainings/IMPULSE_CONTROL/reviews")).toBeNull();
  expect(dailyScheduleIdFromPath("/daily-course/%2F")).toBeNull();
  expect(routeForPath("/trainings/IMPULSE_CONTROL/link_01/nested")).toBeNull();
  expect(routeForPath("/trainings/%2F")).toBeNull();
  expect(()=>trainingCoursePath("../evil")).toThrow();
  expect(()=>dailyCoursePath("../evil")).toThrow();
  await mount("/daily-course/%2F");
  expect(node.textContent).toContain("Страница не найдена");
 });
 it("C11 ignored URL query params cannot set private day/course/owner",async()=>{
  await mount("/trainings/IMPULSE_CONTROL/link_01?userId=B&courseType=OTHER");
  expect(node.textContent).toContain("Практика на поводке");
  expect(daysFn).toHaveBeenCalledWith("IMPULSE_CONTROL");
  expect(dayFn).toHaveBeenCalledExactlyOnceWith("IMPULSE_CONTROL",first);
  expect(node.innerHTML).not.toMatch(/SECRET_EMAIL/);
 });
 it("C12 guest cannot call private training/day/daily GET",async()=>{
  cache.setQueryData(CURRENT_USER_QUERY_KEY,null);
  await mount("/trainings/IMPULSE_CONTROL/link_01");
  expect(node.textContent).toMatch(/Требуется авторизация|Сессия изменилась/);
  expect(daysFn).not.toHaveBeenCalled();
  expect(dayFn).not.toHaveBeenCalled();
  await mount("/daily-course/schedule_01");
  expect(dailyFn).not.toHaveBeenCalled();
 });
 it("C13 late A->B->A training day callback cannot restore private step",async()=>{
  const hold=deferred<TrainingDayDetail>();dayFn.mockReturnValueOnce(hold.promise);
  await mount("/trainings/IMPULSE_CONTROL/link_01");
  expect(node.textContent).toContain("Загружаем шаги");
  await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,
    {id:"B",username:"userB",role:"USER"}));
  await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,
    {id:"A",username:"userA",role:"USER"}));
  await act(async()=>hold.resolve(steps()));await tick();
  expect(node.textContent).toContain("Сессия изменилась");
  expect(node.textContent).not.toContain("Практика на поводке");
 });
 it("C14 late A->B->A daily callback cannot restore private step",async()=>{
  const hold=deferred<DailyDay>();dailyFn.mockReturnValueOnce(hold.promise);
  await mount("/daily-course/schedule_01");
  expect(node.textContent).toContain("Загружаем шаги курса дня");
  await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,
    {id:"B",username:"userB",role:"USER"}));
  await act(async()=>cache.setQueryData(CURRENT_USER_QUERY_KEY,
    {id:"A",username:"userA",role:"USER"}));
  await act(async()=>hold.resolve(daily));await tick();
  expect(node.textContent).toContain("Сессия изменилась");
  expect(node.textContent).not.toContain("Упражнение дня");
 });
 it("C17 canonical owner GET safely renders real Markdown/GFM without media or unsafe links",async()=>{
  const markdown=[
    "# Цель программы",
    "Тренируем **выдержку** и *внимание*, ~~без рывков~~.",
    "- Переключение\n- Самоконтроль",
    "1. Наблюдаем\n2. Поощряем",
    "| Упражнение | Время |\n| --- | --- |\n| Контроль | 5 мин |",
    "[Внутренний материал](/articles) и [Источник](https://example.org/method)",
    "[Опасный адрес](javascript:alert(1))",
    "[Опасный относительный](//unsafe.invalid/track)",
    "![Не загружать](https://unsafe.invalid/tracker.png)",
    "<iframe src=\"https://unsafe.invalid/embed\"></iframe>",
  ].join("\n\n");
  daysFn.mockResolvedValueOnce({...overview(),courseDescription:markdown});
  await mount("/trainings/IMPULSE_CONTROL",false,false);
  // Source Next CourseDescriptionWithVideo starts *collapsed*. The loaded
  // course cannot expose markdown/equipment in its first screenshot.
  const disclosure = node.querySelector<HTMLButtonElement>(
    "button.training-next-course-description-toggle");
  expect(disclosure?.getAttribute("aria-expanded")).toBe("false");
  expect(node.textContent).not.toContain("Цель программы");
  await act(async () => disclosure?.click());
  expect(disclosure?.getAttribute("aria-expanded")).toBe("true");
  // Local React.lazy Markdown/GFM chunk resolves only after Suspense fallback.
  for(let i=0;i<35&&!node.querySelector(
    'section[aria-label="Описание курса"] h1');i++)await tick();
  const view=node.querySelector<HTMLElement>('section[aria-label="Описание курса"]');
  expect(view).not.toBeNull();
  expect(view?.querySelector("h1")?.textContent).toBe("Цель программы");
  expect(view?.querySelector(".training-next-course-description-content strong")?.textContent)
    .toBe("выдержку");
  expect(view?.querySelector("em")?.textContent).toBe("внимание");
  expect(view?.querySelector("del")?.textContent).toBe("без рывков");
  expect(view?.querySelectorAll("ul > li")).toHaveLength(2);
  expect(view?.querySelectorAll("ol > li")).toHaveLength(2);
  expect(view?.querySelector("table tbody tr td")?.textContent).toBe("Контроль");
  expect(view?.querySelector('a[href="/articles"]')).not.toBeNull();
  const external=view?.querySelector<HTMLAnchorElement>(
    'a[href="https://example.org/method"]');
  expect(external?.getAttribute("target")).toBe("_blank");
  expect(external?.getAttribute("rel")).toContain("noopener");
  expect(external?.getAttribute("rel")).toContain("noreferrer");
  expect(view?.querySelectorAll("a")).toHaveLength(2);
  expect(view?.querySelector("img,iframe,script,video,a[href^='javascript:']"))
    .toBeNull();
  expect(view?.querySelector('.training-markdown-table-scroll[role="region"]'))
    .not.toBeNull();
  expect(node.textContent).toContain("Закрыт");
  expect(node.querySelector('a[href="/trainings/IMPULSE_CONTROL/link_02"]'))
    .toBeNull();
  expect(dayFn).not.toHaveBeenCalled();
  expect(fetcher.mock.calls.every(([,options])=>options?.method==="GET")).toBe(true);
 });
 it("C16 canonical training GET shows Next-level/equipment and navigates to read-only reviews",async()=>{
  const reviews={courseName:"Самоконтроль",reviews:[{
    id:"r_1",rating:5,comment:"Подробный отзыв без редактирования",
    createdAt:"2026-10-20T12:00:00Z",user:{id:"B",username:"reviewer"},
    privateAvatar:"SECRET_REVIEW_AVATAR",
  }],userStatus:{hasCompleted:false,userReview:null}};
  fetcher.mockImplementation(async(url:string,opt:RequestInit)=>{
    if(opt?.method!=="GET")throw Error("WRITE_FORBIDDEN");
    if(url==="/api/v1/courses")return new Response(
      JSON.stringify({success:true,data:[course()]}),{status:200});
    if(url==="/api/v1/courses/reviews?courseType=IMPULSE_CONTROL")
      return new Response(JSON.stringify({success:true,data:reviews}),{status:200});
    throw Error("UNAPPROVED_HTTP_"+url);
  });
  // Default canonical App read route, not the older injected opt-in gate.
  await mount("/trainings/IMPULSE_CONTROL",false,false);
  const panel=node.querySelector('section[aria-label="Описание курса"]');
  expect(panel).not.toBeNull();
  expect(panel?.textContent).not.toContain("Контролируем возбуждение");
  await act(async()=>panel?.querySelector<HTMLButtonElement>(
    "button.training-next-course-description-toggle")?.click());
  for(let i=0;i<35&&!panel?.textContent?.includes("Контролируем возбуждение");i++)
    await tick();
  expect(panel?.textContent).toContain("Контролируем возбуждение");
  expect(panel?.textContent).toContain("Уровень сложности:");
  expect(panel?.textContent).toContain("Начальный");
  expect(panel?.textContent).toContain("Необходимое оборудование:");
  expect(panel?.textContent).toContain("Поводок");
  expect(node.textContent).toContain("Блок 01");
  expect(node.textContent).toContain("Закрыт");
  expect(node.querySelector('a[href="/trainings/IMPULSE_CONTROL/link_02"]')).toBeNull();
  // Original Next TrainingPageClient renders only description and day list.
  // Reviews remain owner-scoped, available as an independent deep-link route,
  // but no extra review CTA is injected into the contents page.
  expect(node.querySelector('a[href="/trainings/IMPULSE_CONTROL/reviews"]')).toBeNull();
  // Original Next TrainingDayList renders the entire verified day card as
  // one route link. No extra details button or unverified inline step data.
  expect(node.querySelectorAll(".training-next-day-card-link")).toHaveLength(2);
  expect(node.querySelector('a[href="/trainings/IMPULSE_CONTROL/link_01"]'))
    .not.toBeNull();
  expect(node.querySelector('button[aria-controls^="training-day-info-"]'))
    .toBeNull();
  expect(node.textContent).not.toContain(
    "Шаги этого блока можно открыть для чтения без изменения прогресса.");
  await mount("/trainings/IMPULSE_CONTROL/reviews",false,false);
  expect(window.location.pathname).toBe("/trainings/IMPULSE_CONTROL/reviews");
  expect(node.textContent).toContain("Подробный отзыв без редактирования");
  expect(node.textContent).toContain("Отзывы к курсу");
  expect(node.innerHTML).not.toMatch(/SECRET_REVIEW_AVATAR/);
  expect(fetcher.mock.calls.some(([url])=>
    url==="/api/v1/courses/reviews?courseType=IMPULSE_CONTROL")).toBe(true);
  expect(fetcher.mock.calls.every(([,opt])=>opt?.method==="GET")).toBe(true);
  expect(node.querySelector("form")).toBeNull();
 });
 it("C15 original locked day feedback is accessible, owner gate stays closed",async()=>{
  await mount("/trainings/IMPULSE_CONTROL",false,false);
  const trigger=node.querySelector<HTMLButtonElement>(
    "button.training-next-day-card-locked");
  expect(trigger).not.toBeNull();
  expect(trigger?.getAttribute("aria-haspopup")).toBe("dialog");
  expect(node.querySelector('a[href="/trainings/IMPULSE_CONTROL/link_02"]'))
    .toBeNull();
  expect(node.querySelector(".training-next-day-card-status-locked svg"))
    .not.toBeNull();
  expect(node.querySelector(".training-next-day-list-item--inprogress"))
    .not.toBeNull();
  await act(async()=>trigger?.click());
  const notice=node.querySelector<HTMLElement>('[role="alertdialog"]');
  expect(notice?.textContent).toContain("День заблокирован");
  expect(notice?.textContent).toContain("завершить все остальные дни курса");
  expect(notice?.getAttribute("aria-modal")).toBe("true");
  expect(window.location.pathname).toBe("/trainings/IMPULSE_CONTROL");
  expect(dayFn).not.toHaveBeenCalled();
  const confirm=notice?.querySelector<HTMLButtonElement>("button");
  expect(document.activeElement).toBe(confirm);
  await act(async()=>confirm?.click());
  expect(node.querySelector('[role="alertdialog"]')).toBeNull();
  expect(document.activeElement).toBe(trigger);
  expect(fetcher.mock.calls.every(([,opt])=>opt?.method==="GET")).toBe(true);
 });
 it("C15 catalog results not confused with training day URL",async()=>{
  await mount("/trainings/UNKNOWN");
  expect(node.textContent).toContain("Курс недоступен");
  expect(daysFn).not.toHaveBeenCalled();
 });
});

// COURSE011_DAILY_STEP_MARKDOWN_RESTORE: real Daily READ reuses shared StepCard.
describe("COURSE011_DAILY_STEP_MARKDOWN_RESTORE existing daily read-only step",()=>{
 it("renders safe ordered Markdown instructions only after opening a Daily step",async()=>{
  dailyFn.mockResolvedValueOnce({...daily,steps:[{
   ...daily.steps[0],description:"1. **Дышите** спокойно\n2. Проверьте `контакт`\n\n| Действие | Время |\n| --- | --- |\n| Контакт | 3 мин |",
  }]});
  await mount("/daily-course/schedule_01");
  expect(node.textContent).toContain("Упражнение дня");
  expect(node.querySelector(".training-step-description")).toBeNull();
  const open = node.querySelector<HTMLButtonElement>(
    'button[aria-label="Подробнее: Упражнение дня"]');
  expect(open).not.toBeNull();
  await act(async()=>open?.click()); await tick();
  const material=node.querySelector<HTMLElement>(".training-step-description");
  expect(material?.querySelector("ol > li strong")?.textContent).toBe("Дышите");
  expect(material?.querySelector("ol > li code")?.textContent).toBe("контакт");
  expect(material?.querySelector("table tbody tr td")?.textContent).toBe("Контакт");
  expect(fetcher.mock.calls.every(([,options])=>options?.method==="GET")).toBe(true);
  const hide = node.querySelector<HTMLButtonElement>(
    'button[aria-label="Скрыть: Упражнение дня"]');
  expect(hide).not.toBeNull();
  await act(async()=>hide?.click()); await tick();
  expect(node.querySelector(".training-step-description")).toBeNull();
  expect(dailyFn).toHaveBeenCalledExactlyOnceWith(today);
 });
});


// COURSE011_DAILY_STEP_ACCORDION_A11Y: real existing Daily URL reuses StepCard.
describe("COURSE011_DAILY_STEP_ACCORDION_A11Y Daily read-only disclosure",()=>{
 it("uses named stable native disclosure without mounting hidden Markdown",async()=>{
  await mount("/daily-course/schedule_01");
  const card=node.querySelector<HTMLElement>(".training-step-card");
  expect(card).not.toBeNull();
  const trigger=card!.querySelector<HTMLButtonElement>("button");
  expect(trigger?.tagName).toBe("BUTTON");
  expect(trigger?.type).toBe("button");
  expect(trigger?.getAttribute("aria-expanded")).toBe("false");
  expect(trigger?.getAttribute("aria-label"))
   .toBe("Подробнее: Упражнение дня");
  expect(trigger?.hasAttribute("aria-controls")).toBe(false);
  expect(card?.querySelector(".training-step-description,[role=region]")).toBeNull();
  trigger?.focus();
  expect(document.activeElement).toBe(trigger);
  await act(async()=>trigger?.click()); await tick();
  expect(document.activeElement).toBe(trigger);
  expect(trigger?.getAttribute("aria-label"))
   .toBe("Скрыть: Упражнение дня");
  expect(trigger?.getAttribute("aria-expanded")).toBe("true");
  const id=trigger?.getAttribute("aria-controls")??"";
  const region=document.getElementById(id);
  expect(id).not.toBe("");
  expect(region?.getAttribute("role")).toBe("region");
  const heading=document.getElementById(region?.getAttribute("aria-labelledby")??"");
  // In the original Next accordion the disclosure button itself is the
  // accessible region label; no duplicate H4 is mounted inside the detail.
  expect(heading?.tagName).toBe("BUTTON");
  expect(heading?.getAttribute("aria-label")).toBe("Скрыть: Упражнение дня");
  expect(region?.textContent).toContain("Спокойно переключаемся");
  await act(async()=>trigger?.click()); await tick();
  expect(trigger?.getAttribute("aria-expanded")).toBe("false");
  expect(trigger?.hasAttribute("aria-controls")).toBe(false);
  expect(document.getElementById(id)).toBeNull();
  expect(card?.querySelector(".training-step-description")).toBeNull();
  expect(document.activeElement).toBe(trigger);
  await act(async()=>trigger?.click()); await tick();
  expect(trigger?.getAttribute("aria-controls")).toBe(id);
  expect(fetcher.mock.calls.every(([,opts])=>opts?.method==="GET")).toBe(true);
 });
});

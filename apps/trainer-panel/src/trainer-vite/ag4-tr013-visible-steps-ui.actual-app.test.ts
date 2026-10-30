/**
 * AG4 TR013 exact registered read-only trainer steps: actual Hono app,
 * JWT verifier/auth/rate middleware, mocked Core + Prisma auth-session.
 * No real SQL, HTTP socket, TLS, browser, provider, writes or new client mount.
 */
import { randomBytes } from "node:crypto";
// @ts-expect-error jsdom types are not installed in this project
import { JSDOM } from "jsdom";
import {createElement} from "react";
import {act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {TrainerOptInRoute} from "./optInRoute";
import {TrainerVisibleStepsOptInRoute} from "./TrainerVisibleStepsOptInRoute";
import {TrainerPublicTemplatesOptInRoute} from "./TrainerPublicTemplatesOptInRoute";
import { afterEach,beforeAll,beforeEach,describe,expect,it,vi } from "vitest";
import type * as PrismaModule from "@gafus/prisma";

const m=vi.hoisted(()=>({
  read:vi.fn(),templates:vi.fn(),registration:vi.fn(),session:vi.fn(),write:vi.fn(),
  rateLimited:false,rateKeys:[] as string[],
}));
vi.mock("@hono-rate-limiter/redis",()=>({
  RedisStore:class {
    windowMs=60_000;
    init(x:{windowMs:number}){this.windowMs=x.windowMs;}
    async increment(k:string){
      m.rateKeys.push(k);
      return {totalHits:m.rateLimited?101:1,
        resetTime:new Date(Date.now()+this.windowMs)};
    }
    async decrement(){return undefined;}
    async resetKey(){return undefined;}
  },
}));
vi.mock("@gafus/prisma",async actual=>{
  const a=await actual<typeof PrismaModule>();
  return {...a,prisma:{...a.prisma,
    user:{...a.prisma.user,findUnique:m.session},
    step:{...a.prisma.step,create:m.write,update:m.write,delete:m.write},
    stepTemplate:{...a.prisma.stepTemplate,create:m.write,update:m.write,delete:m.write},
    $transaction:m.write,
  }};
});
vi.mock("@gafus/core/services/auth",async original=>({
  ...await original<object>(),isRegistrationCompleted:m.registration,
}));
vi.mock("@gafus/core/services/trainerStep",async (importOriginal)=>({
  ...await importOriginal<typeof import("@gafus/core/services/trainerStep")>(),
  getVisibleSteps:m.read,getStepTemplates:m.templates,
}));
// Runtime-only source imports: keep API/Auth TypeScript outside Trainer compilation.
const { app } = await vi.importActual<{app:{request:(path:string,init?:RequestInit)=>Promise<Response>}}>("../../../api/src/app");
const { generateAccessToken } = await vi.importActual<{generateAccessToken:(actor:{id:string;username:string;role:string})=>Promise<string>}>("@gafus/auth/jwt");

const PRIVATE="SECRET_USER_EMAIL_STEP_MEDIA_AND_INTERNAL_FEE";
const actors={
  A:{id:"trainer-A",username:"trainer_a",role:"TRAINER"},
  B:{id:"trainer-B",username:"trainer_b",role:"TRAINER"},
  ADMIN:{id:"admin-1",username:"admin",role:"ADMIN"},
  MOD:{id:"mod-1",username:"mod",role:"MODERATOR"},
  USER:{id:"user-1",username:"user",role:"USER"},
  PARTNER:{id:"partner-1",username:"partner",role:"PARTNER"},
} as const;
const jwt:Record<string,string>={};
const date=(iso:string)=>new Date(iso);
const make=(id:string,owner:string,opts:Record<string,unknown>={})=>({
  id,title:"Title "+id,description:"Description "+id,
  durationSec:90,estimatedDurationSec:null,
  type:"TRAINING",videoUrl:null,imageUrls:[],pdfUrls:[],
  checklist:null,surveySlug:null,isDailyCourse:false,
  authorId:owner,
  createdAt:date("2026-10-22T09:00:00.000Z"),
  updatedAt:date("2026-10-22T09:30:00.000Z"),
  author:{username:"user_"+owner,profile:{fullName:"Full "+owner,
    email:PRIVATE,privateNote:PRIVATE},passwordHash:PRIVATE},
  stepLinks:[{id:"steplink-private",stepId:id,order:99,
    accountCredentials:PRIVATE,
    day:{id:"day-private",authorId:PRIVATE,diaryEntries:[{content:PRIVATE}],
      dayLinks:[{id:"daylink-private",order:23,userTrainings:[{secret:PRIVATE}],
        course:{id:"course_public",name:"Course",shortDesc:"Short",
          logoImg:"/course.png",authorId:PRIVATE,access:[{email:PRIVATE}]}}]}}],
  secretPrivateInfo:PRIVATE,ownerEmail:PRIVATE,
  ...opts,
});
const stored=[
  make("B-mid",actors.B.id,{createdAt:date("2026-10-20T08:00:00.000Z")}),
  make("A-late",actors.A.id,{createdAt:date("2026-10-22T08:00:00.000Z")}),
  make("A-daily",actors.A.id,{isDailyCourse:true,
    createdAt:date("2026-10-21T08:00:00.000Z")}),
  make("A-early",actors.A.id,{createdAt:date("2026-10-18T08:00:00.000Z"),
    author:{username:"user_"+actors.A.id,profile:null,secret:PRIVATE}}),
  make("B-daily",actors.B.id,{isDailyCourse:true,
    createdAt:date("2026-10-22T07:00:00.000Z")}),
];
const _request=(who:string,suffix="",method="GET")=>
  app.request("/api/v1/trainer/steps"+suffix,{
    method,headers:who?{authorization:"Bearer "+(jwt[who]??who)}:{},
  });
const headers=(r:Response)=>{
  const cache=(r.headers.get("cache-control")??"")
    .toLowerCase().split(",").map(x=>x.trim());
  expect(cache).toContain("private");expect(cache).toContain("no-store");
  expect(cache).not.toContain("public");
  expect(r.headers.get("referrer-policy")).toBe("no-referrer");
};
const _noWrites=()=>expect(m.write).not.toHaveBeenCalled();
const _noCore=()=>expect(m.read).not.toHaveBeenCalled();
const _safe=(x:unknown)=>expect(JSON.stringify(x)).not.toContain(PRIVATE);
const _sortedIds=(owner:string|undefined,daily:boolean)=>
  stored.filter(s=>s.isDailyCourse===daily&&(!owner||s.authorId===owner))
    .sort((a,b)=>(b.createdAt as Date).getTime()-
      (a.createdAt as Date).getTime())
    .map(s=>s.id);
const _exactFieldKeys=[
  "id","title","description","durationSec","estimatedDurationSec","type",
  "videoUrl","imageUrls","pdfUrls","checklist","surveySlug","isDailyCourse",
  "authorId","createdAt","updatedAt","author","stepLinks",
].sort();
beforeAll(async()=>{
  process.env.JWT_SECRET=randomBytes(48).toString("hex");
  for(const [who,actor] of Object.entries(actors))
    jwt[who]=await generateAccessToken(actor);
});
beforeEach(()=>{
  vi.clearAllMocks();
  m.rateLimited=false;m.rateKeys.length=0;
  m.registration.mockResolvedValue(true);
  m.session.mockImplementation(async ({ where }: { where: { id: string } }) => {
    const actor = Object.values(actors).find((candidate) => candidate.id === where.id);
    return actor ? {sessionsRevokedAt:null,registrationPending:false,role:actor.role} : null;
  });
  m.read.mockImplementation(async (
    actorId:string,allowMixed:boolean,opts:{isDailyCourse?:boolean},
  )=>stored.filter(s=>
    s.isDailyCourse===(opts.isDailyCourse??false) &&
    (allowMixed||s.authorId===actorId))
    .sort((a,b)=>(b.createdAt as Date).getTime()-
      (a.createdAt as Date).getTime()));
});

const syntheticDom=new JSDOM("<!doctype html><html><body></body></html>",{url:"http://localhost"});
Object.assign(globalThis,{
 window:syntheticDom.window,document:syntheticDom.window.document,
 HTMLElement:syntheticDom.window.HTMLElement,Event:syntheticDom.window.Event,
});
const transport=async ({method,path}:{method:"GET";path:string;signal:AbortSignal})=>{
 const r=await app.request(path,{method,headers:{authorization:"Bearer "+jwt.A}});
 return {status:r.status,headers:{"cache-control":r.headers.get("cache-control")??""},body:await r.json()};
};
const flush=async()=>{await act(async()=>{
 await Promise.resolve();await Promise.resolve();
 await new Promise(resolve=>setTimeout(resolve,0));
});};
let host:HTMLDivElement,root:Root;
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
const mount=async (input:Record<string,unknown>={})=>{
 await act(async()=>root.render(createElement(TrainerOptInRoute,{
  pathname:"/main-panel/steps",actor:actors.A,token:jwt.A,authEpoch:"one",fetchImpl:fetch,
  enableVisibleSteps:true,visibleStepsTransport:transport,...input,
 })));await flush();
};
describe("AG4 actual opt-in UI -> ACTUAL registered Hono app.request, mocked Core",()=>{
 it("disabled means no GET, current A own list hides B and private extras",async()=>{
  await mount({enableVisibleSteps:false});expect(m.read).not.toHaveBeenCalled();
  await mount({enableVisibleSteps:true});expect(host.textContent).toContain("Title A-late");
  expect(host.textContent).not.toContain("Title B-mid");expect(host.textContent).not.toContain(PRIVATE);
  expect(m.write).not.toHaveBeenCalled();
 });
 it("changes current daily filter and sends actual signed-JWT GET",async()=>{
  await mount();
  const select=host.querySelector("select")!;
  await act(async()=>{select.value="daily";select.dispatchEvent(new Event("change",{bubbles:true}));});await flush();
  expect(host.textContent).toContain("Title A-daily");expect(host.textContent).not.toContain("Title A-late");
  expect(m.read).toHaveBeenLastCalledWith(actors.A.id,false,{isDailyCourse:true});
 });
 it("shows empty and generic error and manual GET retry without write",async()=>{
  await mount({visibleStepsTransport:async()=>({status:200,headers:{"cache-control":"private, no-store"},body:{success:true,data:[]}})});
  expect(host.textContent).toContain("Шагов пока нет");
  let attempts=0;
  const failing=async()=>{attempts++;if(attempts===1)return {status:500,headers:{"cache-control":"private, no-store"},body:{success:false,code:"INTERNAL_SERVER_ERROR"}};return {status:200,headers:{"cache-control":"private, no-store"},body:{success:true,data:[]}};};
  await mount({visibleStepsTransport:failing});expect(host.textContent).toContain("Не удалось получить шаги");
  const button=host.querySelector("button")!;await act(async()=>button.click());await flush();
  expect(attempts).toBe(2);expect(host.textContent).toContain("Шагов пока нет");expect(m.write).not.toHaveBeenCalled();
 });
 it("actual app guest401 user403 limiter429 internal500 never becomes list",async()=>{
  const send=async(who:string)=>{const r=await app.request("/api/v1/trainer/steps",{headers:who?{authorization:"Bearer "+(jwt[who]??who)}:{}});return {status:r.status,headers:{"cache-control":r.headers.get("cache-control")??""},body:await r.json()};};
  for(const who of ["", "USER"]){
    await mount({visibleStepsTransport:async()=>send(who)});
    expect(host.textContent).toContain("Не удалось получить шаги");
  }
  m.rateLimited=true;
  await mount({visibleStepsTransport:async()=>send("A")});expect(host.textContent).toContain("Не удалось получить шаги");
  m.rateLimited=false;
  m.read.mockRejectedValueOnce(new Error(PRIVATE));
  await mount({visibleStepsTransport:async()=>send("A")});expect(host.textContent).toContain("Не удалось получить шаги");
  expect(host.textContent).not.toContain(PRIVATE);expect(m.write).not.toHaveBeenCalled();
 });
 it("late former actor response cannot paint after actor switch",async()=>{
  let resolveLate:((value:{status:number;headers:Record<string,string>;body:unknown})=>void)
    |undefined;
  const pending=()=>new Promise<{
   status:number;headers:Record<string,string>;body:unknown;
  }>(resolve=>{resolveLate=resolve;});
  const empty=()=>({status:200,headers:{"cache-control":"private, no-store"},body:{success:true,data:[]}});
  await mount({visibleStepsTransport:pending});
  await mount({actor:actors.B,token:jwt.B,visibleStepsTransport:async()=>empty()});
  resolveLate?.(empty());await flush();
  expect(host.textContent).toContain("Шагов пока нет");expect(host.textContent).not.toContain("Title A-late");
 });

 it("ADMIN and MODERATOR mixed-owner list via actual registered app",async()=>{
  for(const who of ["ADMIN","MOD"] as const){
   const mixed=async ({path,method}:{path:string;method:"GET";signal:AbortSignal})=>{
    const response=await app.request(path,{method,headers:{authorization:"Bearer "+jwt[who]}});
    return {status:response.status,headers:{"cache-control":response.headers.get("cache-control")??""},body:await response.json()};
   };
   await mount({actor:actors[who],token:jwt[who],visibleStepsTransport:mixed});
   expect(host.textContent).toContain("Title A-late");expect(host.textContent).toContain("Title B-mid");
   expect(host.textContent).not.toContain(PRIVATE);
  }
  expect(m.write).not.toHaveBeenCalled();
 });

 it("actual registered public templates app.request -> mounted list + category switch",async()=>{
  const template=(id:string,categoryId:string)=>({id,title:"Template "+id,description:"Safe description",durationSec:null,type:"TRAINING",imageUrls:[],pdfUrls:[],videoUrl:null,checklist:[],requiresVideoReport:false,requiresWrittenFeedback:false,hasTestQuestions:false,surveySlug:null,tags:[],isPublic:true,usageCount:4,category:{id:categoryId,name:categoryId,icon:null},author:{id:actors.B.id,username:"author_b"},createdAt:new Date("2026-10-22T09:00:00.000Z"),ownerEmail:PRIVATE});
  m.templates.mockImplementation(async(categoryId?:string)=>[template("one","dogs"),template("two","cats")].filter(x=>!categoryId||x.category.id===categoryId));
  const t=async(path:string)=>{const r=await app.request(path,{headers:{authorization:"Bearer "+jwt.A}});return {status:r.status,headers:{"cache-control":r.headers.get("cache-control")??""},body:await r.json()};};
  await mount({pathname:"/main-panel/templates",enablePublicTemplates:true,publicTemplateTransport:t});
  expect(host.textContent).toContain("Template one");expect(host.textContent).toContain("Template two");expect(host.textContent).not.toContain(PRIVATE);
  const select=host.querySelector("select")!;
  await act(async()=>{select.value="dogs";select.dispatchEvent(new Event("change",{bubbles:true}));});await flush();
  expect(host.textContent).toContain("Template one");expect(host.textContent).not.toContain("Template two");
  expect(m.templates).toHaveBeenLastCalledWith("dogs");expect(m.write).not.toHaveBeenCalled();
 });

});


// Scoped local mounted component tests. Never invoke imported Hono app here.
describe("TR013_VISIBLE_STEP_DETAILS_LOCAL source-mounted", () => {
  const a = { id: "trainer-detail-A", role: "TRAINER" as const };
  const b = { id: "trainer-detail-B", role: "TRAINER" as const };
  const secret = "PRIVATE_STEP_MEDIA_INTERNAL_8675";
  const course = (id: string, name: string) => ({
    id, name, shortDesc: "", logoImg: `https://private.example/${secret}`,
  });
  const dto = (id: string, extra: Record<string, unknown> = {}) => ({
    id, title: `Заголовок ${id}`, description: `Описание ${id}`,
    durationSec: null, estimatedDurationSec: 0, type: "TRAINING",
    videoUrl: `https://private.example/${secret}`,
    imageUrls: [`https://private.example/${secret}`],
    pdfUrls: [`https://private.example/${secret}`],
    checklist: { secret }, surveySlug: secret, isDailyCourse: false,
    authorId: a.id, createdAt: "2026-10-24T08:00:00.000Z",
    updatedAt: "2026-10-24T08:00:00.000Z",
    author: { username: "trainer_a", profile: null }, stepLinks: [], ...extra,
  });
  const ok = (rows: unknown[]) => ({ status: 200,
    headers: { "cache-control": "private, no-store" }, body: { success: true, data: rows },
  });
  const error = () => ({ status: 503,
    headers: { "cache-control": "private, no-store" }, body: { success: false, data: [] },
  });
  const deferred = () => {
    let resolve!: (value: ReturnType<typeof ok>) => void;
    const promise = new Promise<ReturnType<typeof ok>>(done => { resolve = done; });
    return { promise, resolve };
  };
  type LocalTransport = (input: { method: "GET"; path: string; signal: AbortSignal }) =>
    Promise<ReturnType<typeof ok>>;
  async function localMount(transport: LocalTransport, opt: Record<string, unknown> = {}) {
    await act(async () => root.render(createElement(TrainerVisibleStepsOptInRoute, {
      pathname: "/main-panel/steps", actor: a, token: "local-token",
      authEpoch: "epochA", enableVisibleSteps: true, visibleStepsTransport: transport,
      ...opt,
    })));
  }
  const detail = (index: number) => host.querySelectorAll<HTMLDetailsElement>(
    'ul[aria-label="Список шагов"] details',
  )[index];
  it("independent accessible disclosure, plain escaping, null versus zero duration", async () => {
    const calls: string[] = [];
    const transport = vi.fn(async ({ path }: { path: string; method: "GET"; signal: AbortSignal }) => {
      calls.push(path);
      return ok([
        dto("one", { description: "<script>PRIVATE_MARKUP</script> & text",
          type: "PRACTICE", durationSec: 0, estimatedDurationSec: null }),
        dto("two", { description: "Второе описание", durationSec: null,
          estimatedDurationSec: 15 }),
      ]);
    });
    await localMount(transport);
    expect(calls).toEqual(["/api/v1/trainer/steps?isDailyCourse=false"]);
    expect(detail(0)?.open).toBe(false);
    expect(detail(1)?.open).toBe(false);
    const first = detail(0)!;
    expect(first.querySelector("summary")?.textContent).toContain("Заголовок one");
    expect(first.querySelector("summary")?.textContent).toContain("trainer_a");
    await act(async () => first.querySelector("summary")?.click());
    expect(detail(0)?.open).toBe(true);
    expect(detail(1)?.open).toBe(false);
    expect(detail(0)?.textContent).toContain("PRACTICE");
    expect(detail(0)?.textContent).toContain("0 секунд");
    expect(detail(0)?.textContent).toContain("Не указано");
    expect(detail(0)?.textContent).toContain("<script>PRIVATE_MARKUP</script> & text");
    expect(detail(0)?.querySelector("script")).toBeNull();
    expect(detail(0)?.innerHTML).toContain("&lt;script&gt;PRIVATE_MARKUP&lt;/script&gt;");
    await act(async () => detail(1)?.querySelector("summary")?.click());
    expect(detail(0)?.open).toBe(true);
    expect(detail(1)?.open).toBe(true);
    expect(detail(1)?.textContent).toContain("15 секунд");
    expect(detail(1)?.textContent).toContain("Не указано");
    expect(host.innerHTML).not.toContain(secret);
    expect(host.querySelector("video, img, iframe, a, audio, object, embed")).toBeNull();
    expect(m.write).not.toHaveBeenCalled();
  });
  it("deduplicates repeated linked course by ID, displays only distinct names", async () => {
    const first = course("c1", "Курс А");
    const duplicate = course("c1", "Курс А ещё раз");
    const other = course("c2", "Курс Б");
    const links = [
      { day: { dayLinks: [{ course: first }, { course: other }] } },
      { day: { dayLinks: [{ course: duplicate }] } },
    ];
    const transport = vi.fn(async () => ok([dto("with-course", { stepLinks: links }),dto("empty")]));
    await localMount(transport);
    await act(async () => detail(0)?.querySelector("summary")?.click());
    const names = Array.from(detail(0)!.querySelectorAll(
      'ul[aria-label="Связанные курсы"] li',
    )).map(el => el.textContent);
    expect(names).toEqual(["Курс А", "Курс Б"]);
    expect(detail(0)?.textContent).not.toContain("Курс А ещё раз");
    await act(async () => detail(1)?.querySelector("summary")?.click());
    expect(detail(1)?.textContent).toContain("Нет связанных курсов");
    expect(host.innerHTML).not.toContain(secret);
    expect(host.innerHTML).not.toContain("c1");
    expect(host.querySelectorAll("a, img, video")).toHaveLength(0);
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("type filter reload clears old details before new list; pending/error never leak", async () => {
    const pending = deferred(); const calls: string[] = [];
    const transport = vi.fn(async ({path}:{path:string;method:"GET";signal:AbortSignal}) => {
      calls.push(path);
      if (path.endsWith("false")) return ok([dto("regular", {
        description: "PRIVATE_OLD_DESCRIPTION",
      })]);
      return pending.promise;
    });
    await localMount(transport);
    await act(async () => detail(0)?.querySelector("summary")?.click());
    expect(detail(0)?.textContent).toContain("PRIVATE_OLD_DESCRIPTION");
    const select = host.querySelector("select")!;
    await act(async () => {
      select.value = "daily";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(host.textContent).toContain("Загрузка шагов");
    expect(host.textContent).not.toContain("PRIVATE_OLD_DESCRIPTION");
    await act(async () => pending.resolve(error()));
    expect(host.textContent).toContain("Не удалось получить шаги");
    expect(host.textContent).not.toContain("PRIVATE_OLD_DESCRIPTION");
    expect(host.textContent).not.toContain("Шагов пока нет");
    expect(calls).toEqual([
      "/api/v1/trainer/steps?isDailyCourse=false",
      "/api/v1/trainer/steps?isDailyCourse=true",
    ]);
  });
  it("actor epoch retirement never paints a stale late GET or old open details", async () => {
    const pending = deferred(); const calls: string[] = [];
    const first = vi.fn(async ({path}:{path:string;method:"GET";signal:AbortSignal}) => {
      calls.push(path);
      return ok([dto("old", { description: "PRIVATE_OLD_ACTOR_STEP" })]);
    });
    await localMount(first);
    await act(async () => detail(0)?.querySelector("summary")?.click());
    expect(detail(0)?.textContent).toContain("PRIVATE_OLD_ACTOR_STEP");
    const late = vi.fn(async ({path}:{path:string;method:"GET";signal:AbortSignal}) => {
      calls.push(path);
      return pending.promise;
    });
    await localMount(late);
    expect(host.textContent).not.toContain("PRIVATE_OLD_ACTOR_STEP");
    const newTransport = vi.fn(async () => ok([]));
    await localMount(newTransport, { actor: b, token: "B-token", authEpoch: "epochB" });
    expect(host.textContent).toContain("Шагов пока нет");
    await act(async () => pending.resolve(ok([dto("stale", {
      description: "PRIVATE_STALE_ACK",
    })])));
    expect(host.textContent).not.toContain("PRIVATE_STALE_ACK");
    expect(host.textContent).not.toContain("PRIVATE_OLD_ACTOR_STEP");
    expect(host.querySelector("details")).toBeNull();
    expect(calls).toHaveLength(2);
    expect(newTransport).toHaveBeenCalledOnce();
  });

  // Original TR013 READ navigation: client-side title search on confirmed GET only.
  describe("TR013_VISIBLE_STEPS_TITLE_SEARCH_LOCAL source-mounted", () => {
    const regularPath = "/api/v1/trainer/steps?isDailyCourse=false";
    const dailyPath = "/api/v1/trainer/steps?isDailyCourse=true";
    const list = () => host.querySelector<HTMLUListElement>('ul[aria-label="Список шагов"]');
    const summaries = () => [...(list()?.querySelectorAll("details > summary") ?? [])]
      .map(s => s.textContent ?? "");
    const searchInput = () => host.querySelector<HTMLInputElement>('input[aria-label="Поиск шага по названию"]');
    const button = (label: string) => [...host.querySelectorAll<HTMLButtonElement>("button")]
      .find(b => b.textContent === label);
    async function search(value: string) {
      const input = searchInput()!;
      expect(input).not.toBeNull();
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")?.set;
      expect(setter).toBeDefined();
      await act(async () => {
        setter!.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    }
    it("confirmed GET [] is truly empty with truthful counters, not a search miss", async () => {
      const paths: string[] = [];
      const t = vi.fn(async ({ path }: { path: string;method:"GET";signal:AbortSignal }) => {
        paths.push(path); return ok([]);
      });
      await localMount(t);
      expect(host.textContent).toContain("Шагов пока нет");
      expect(host.textContent).not.toContain("По запросу ничего не найдено");
      expect(host.textContent).toContain("Загружено шагов: 0; показано: 0");
      expect(button("Очистить поиск")).toBeUndefined();
      expect(paths).toEqual([regularPath]);
      expect(m.write).not.toHaveBeenCalled();
    });
    it("trimmed case-insensitive title search ignores description and clears without GET", async () => {
      const paths: string[] = [];
      const t = vi.fn(async ({path}:{path:string;method:"GET";signal:AbortSignal}) => {
        paths.push(path);return ok([
          dto("dog", { title:"Команда Собака",description:"Описание команды" }),
          dto("cat", { title:"Кошачий трюк",description:"ONLY_IN_DESCRIPTION_PRIVATE" }),
        ]);
      });
      await localMount(t);
      expect(summaries()).toHaveLength(2);
      await search("  сОбАкА  ");
      expect(summaries()).toEqual(["Команда Собака — trainer_a"]);
      expect(host.textContent).toContain("Загружено шагов: 2; показано: 1");
      expect(host.textContent).not.toContain("ONLY_IN_DESCRIPTION_PRIVATE");
      expect(paths).toEqual([regularPath]);
      await search("ONLY_IN_DESCRIPTION_PRIVATE");
      expect(summaries()).toHaveLength(0);
      expect(host.textContent).toContain("По запросу ничего не найдено");
      expect(host.textContent).not.toContain("Шагов пока нет");
      expect(host.textContent).toContain("Загружено шагов: 2; показано: 0");
      await act(async () => button("Очистить поиск")?.click());
      expect(searchInput()?.value).toBe("");
      expect(summaries()).toHaveLength(2);
      expect(host.textContent).toContain("Загружено шагов: 2; показано: 2");
      expect(button("Очистить поиск")).toBeUndefined();
      expect(paths).toEqual([regularPath]);
      expect(m.write).not.toHaveBeenCalled();
    });
    it("opened detail disappears when filtered out and can be reselected after clear", async () => {
      const t = vi.fn(async () => ok([
        dto("first", {title:"Первый шаг",description:"PRIVATE_FIRST_STEP_DETAILS"}),
        dto("second",{title:"Второй шаг",description:"Другое описание"}),
      ]));
      await localMount(t);
      await act(async () => list()?.querySelector<HTMLElement>("details > summary")?.click());
      expect(detail(0)?.open).toBe(true);
      expect(host.textContent).toContain("PRIVATE_FIRST_STEP_DETAILS");
      await search("второй");
      expect(summaries()).toEqual(["Второй шаг — trainer_a"]);
      expect(host.textContent).not.toContain("PRIVATE_FIRST_STEP_DETAILS");
      expect(detail(0)?.open).toBe(false);
      await search("nowhere");
      expect(detail(0)).toBeUndefined();
      expect(host.textContent).toContain("По запросу ничего не найдено");
      await act(async () => button("Очистить поиск")?.click());
      expect(summaries()).toHaveLength(2);
      expect(detail(0)?.open).toBe(false);
      expect(t).toHaveBeenCalledTimes(1);
    });
    it("daily type switch uses only existing type GET; search and clear never add requests", async () => {
      const paths: string[] = [];
      const t = vi.fn(async ({path}:{path:string;method:"GET";signal:AbortSignal}) => {
        paths.push(path);
        if(path===regularPath)return ok([dto("normal",{title:"Шаг обычный"})]);
        if(path===dailyPath)return ok([
          dto("daily",{title:"Шаг ежедневный",isDailyCourse:true}),
          dto("rest",{title:"Разминка",isDailyCourse:true}),
        ]);
        throw Error("Unexpected path");
      });
      await localMount(t);
      await search("шаг");
      expect(summaries()).toEqual(["Шаг обычный — trainer_a"]);
      const typeSelect=host.querySelector<HTMLSelectElement>('select[aria-label="Тип шагов"]')!;
      await act(async () => {
        typeSelect.value="daily";
        typeSelect.dispatchEvent(new Event("change",{bubbles:true}));
      });
      expect(summaries()).toEqual(["Шаг ежедневный — trainer_a"]);
      expect(host.textContent).toContain("Загружено шагов: 2; показано: 1");
      await search("отсутствует");
      expect(host.textContent).toContain("По запросу ничего не найдено");
      await act(async () => button("Очистить поиск")?.click());
      expect(summaries()).toHaveLength(2);
      expect(paths).toEqual([regularPath,dailyPath]);
    });
    it("actor/epoch retirement clears prior search and private open row; late old GET stays hidden", async()=>{
      const pending=deferred();const calls:string[]=[];
      const first=vi.fn(async ({path}:{path:string;method:"GET";signal:AbortSignal})=>{
        calls.push(path);return ok([dto("old",{title:"PRIVATE_OLD_STEP_TITLE",description:"PRIVATE_OLD_DETAIL"})]);
      });
      await localMount(first);
      await act(async () => detail(0)?.querySelector("summary")?.click());
      await search("PRIVATE_OLD_STEP_TITLE");
      expect(detail(0)?.open).toBe(true);
      const waiting=vi.fn(async ({path}:{path:string;method:"GET";signal:AbortSignal})=>{
        calls.push(path);return pending.promise;
      });
      await localMount(waiting);
      expect(host.textContent).not.toContain("PRIVATE_OLD_DETAIL");
      const newer=vi.fn(async ({path}:{path:string;method:"GET";signal:AbortSignal})=>{
        calls.push(path);
        return ok([dto("new",{title:"Новый шаг",authorId:b.id})]);
      });
      await localMount(newer,{actor:b,token:"B-token",authEpoch:"epochB"});
      expect(searchInput()?.value).toBe("");
      expect(summaries()).toEqual(["Новый шаг — trainer_a"]);
      expect(host.textContent).not.toContain("PRIVATE_OLD_STEP_TITLE");
      expect(host.textContent).not.toContain("PRIVATE_OLD_DETAIL");
      expect(detail(0)?.open).toBe(false);
      await act(async () => pending.resolve(ok([dto("stale",{title:"PRIVATE_LATE_ACK"})])));
      expect(host.textContent).not.toContain("PRIVATE_LATE_ACK");
      expect(searchInput()?.value).toBe("");
      expect(calls).toEqual([regularPath,regularPath,regularPath]);
      const restored = vi.fn(async ({path}:{path:string;method:"GET";signal:AbortSignal})=>{
        calls.push(path);
        return ok([dto("back",{title:"Актуальный шаг A"})]);
      });
      await localMount(restored,{actor:a,token:"local-token",authEpoch:"epochA"});
      expect(searchInput()?.value).toBe("");
      expect(summaries()).toEqual(["Актуальный шаг A — trainer_a"]);
      expect(host.textContent).not.toContain("PRIVATE_OLD_STEP_TITLE");
      expect(restored).toHaveBeenCalledOnce();
      expect(calls).toEqual([regularPath,regularPath,regularPath,regularPath]);
      expect(m.write).not.toHaveBeenCalled();
    });
  });
});

// Original TR013 public template category navigation: local injected GET only.
describe("TR013_TEMPLATE_CATEGORY_NAV_RECOVERY source-mounted", () => {
  const path = "/api/v1/trainer/templates";
  const actorA = { id: "template-owner-A", role: "TRAINER" as const };
  const actorB = { id: "template-owner-B", role: "TRAINER" as const };
  const category = (id: string) => ({ id, name: `Категория ${id}`, icon: null });
  const row = (id: string, key: string) => ({
    id, title: `Шаблон ${id}`, description: `Описание ${id}`,
    durationSec: null, type: "TRAINING", imageUrls: [], pdfUrls: [], videoUrl: null,
    checklist: null, requiresVideoReport: false, requiresWrittenFeedback: false,
    hasTestQuestions: false, surveySlug: null, tags: [], isPublic: true,
    usageCount: 1, category: category(key),
    author: { id: "safe-author", username: "trainer" },
    createdAt: "2026-10-24T08:00:00.000Z",
  });
  const ok = (rows: unknown[]) => ({ status: 200,
    headers: { "cache-control": "private, no-store" }, body: { success: true, data: rows },
  });
  const failed = () => ({ status: 503,
    headers: { "cache-control": "private, no-store" }, body: { success: false, data: [] },
  });
  const deferred = () => {
    let resolve!: (result: ReturnType<typeof ok>) => void;
    const promise = new Promise<ReturnType<typeof ok>>(r => { resolve = r; });
    return { promise, resolve };
  };
  type Transport = (requestPath: string, signal: AbortSignal) =>
    Promise<ReturnType<typeof ok>>;
  async function localMount(t: Transport, extra: Record<string, unknown> = {}) {
    await act(async () => root.render(createElement(TrainerPublicTemplatesOptInRoute, {
      pathname: "/main-panel/templates", actor: actorA, token: "local-token-A",
      authEpoch: "epoch-A", enablePublicTemplates: true,
      publicTemplateTransport: t, ...extra,
    })));
  }
  const current = () => host.querySelector<HTMLSelectElement>('select[aria-label="Категория"]')!;
  const options = () => Array.from(current().options).map(o => [o.value, o.textContent]);
  async function choose(id: string) {
    await act(async () => {
      current().value = id;
      current().dispatchEvent(new Event("change", { bubbles: true }));
    });
  }
  it("confirmed All A/B/C -> A -> direct B (no extra All GET or category loss)", async () => {
    const calls: string[] = [];
    const transport = vi.fn(async (requested: string, _signal: AbortSignal) => {
      calls.push(requested);
      if (requested === path) return ok([row("a", "A"), row("b", "B"), row("c", "C")]);
      if (requested === `${path}?categoryId=A`) return ok([row("a", "A")]);
      if (requested === `${path}?categoryId=B`) return ok([row("b", "B")]);
      throw Error("Unexpected new path");
    });
    await localMount(transport);
    expect(options()).toEqual([
      ["", "Все"], ["A", "Категория A"], ["B", "Категория B"],
      ["C", "Категория C"],
    ]);
    await choose("A");
    expect(current().value).toBe("A");
    expect(options()).toContainEqual(["B", "Категория B"]);
    expect(options()).toContainEqual(["C", "Категория C"]);
    expect(host.textContent).toContain("Шаблон a");
    expect(host.textContent).not.toContain("Шаблон b");
    await choose("B");
    expect(current().value).toBe("B");
    expect(options()).toContainEqual(["A", "Категория A"]);
    expect(host.textContent).toContain("Шаблон b");
    expect(host.textContent).not.toContain("Шаблон a");
    expect(calls).toEqual([path, `${path}?categoryId=A`, `${path}?categoryId=B`]);
    expect(m.write).not.toHaveBeenCalled();
  });
  it("filtered A pending then true empty: keep selected A and confirmed B; no stale detail", async () => {
    const pending = deferred(); const calls: string[] = [];
    const t = vi.fn(async (requested: string, _signal: AbortSignal) => {
      calls.push(requested);
      return requested === path ? ok([row("a", "A"), row("b", "B")]) : pending.promise;
    });
    await localMount(t);
    const open = Array.from(host.querySelectorAll("button")).find(b => b.textContent === "Шаблон a")!;
    await act(async () => open.click());
    expect(host.querySelector('[aria-label="Просмотр шаблона"]')?.textContent)
      .toContain("Описание a");
    await choose("A");
    expect(host.textContent).toContain("Загрузка шаблонов");
    expect(host.textContent).not.toContain("Шаблонов нет");
    expect(host.textContent).not.toContain("Описание a");
    expect(host.querySelector('[aria-label="Просмотр шаблона"]')).toBeNull();
    expect(current().value).toBe("A");
    expect(options()).toContainEqual(["B", "Категория B"]);
    await act(async () => pending.resolve(ok([])));
    expect(host.textContent).toContain("Шаблонов нет");
    expect(current().value).toBe("A");
    expect(options()).toContainEqual(["B", "Категория B"]);
    expect(calls).toEqual([path, `${path}?categoryId=A`]);
  });
  it("filtered A error and retry: keep A/B choices, no false empty, exact A GET count", async () => {
    const calls: string[] = []; let aGets = 0;
    const pending = deferred();
    const t = vi.fn(async (requested: string, _signal: AbortSignal) => {
      calls.push(requested);
      if (requested === path) return ok([row("a", "A"), row("b", "B")]);
      if (requested !== `${path}?categoryId=A`) throw Error("Unexpected path");
      return ++aGets === 1 ? failed() : pending.promise;
    });
    await localMount(t);
    await choose("A");
    expect(host.textContent).toContain("Не удалось получить шаблоны");
    expect(host.textContent).not.toContain("Шаблонов нет");
    expect(current().value).toBe("A");
    expect(options()).toContainEqual(["B", "Категория B"]);
    const retry = Array.from(host.querySelectorAll("button"))
      .find(b => b.textContent === "Повторить GET")!;
    await act(async () => retry.click());
    expect(host.textContent).toContain("Загрузка шаблонов");
    expect(host.textContent).not.toContain("Шаблонов нет");
    expect(current().value).toBe("A");
    expect(options()).toContainEqual(["B", "Категория B"]);
    expect(calls).toEqual([path, `${path}?categoryId=A`, `${path}?categoryId=A`]);
    await act(async () => pending.resolve(ok([row("a", "A")])));
    expect(host.textContent).toContain("Шаблон a");
    expect(options()).toContainEqual(["B", "Категория B"]);
  });
  it("actor/epoch retirement drops old A/B choices and late filtered ACK", async () => {
    const pending = deferred(); const calls: string[] = [];
    const t = vi.fn(async (requested: string, _signal: AbortSignal) => {
      calls.push(requested);
      return requested === path ? ok([row("a", "A"), row("b", "B")]) : pending.promise;
    });
    await localMount(t);
    await choose("A");
    expect(options()).toContainEqual(["B", "Категория B"]);
    const other = vi.fn(async (requested: string, _signal: AbortSignal) => {
      calls.push(requested);
      return ok([]);
    });
    await localMount(other, { actor: actorB, token: "local-token-B", authEpoch: "epoch-B" });
    expect(host.textContent).toContain("Шаблонов нет");
    expect(options()).toEqual([["", "Все"]]);
    expect(current().value).toBe("");
    await act(async () => pending.resolve(ok([row("private-A", "A")])));
    expect(host.textContent).not.toContain("Шаблон private-A");
    expect(options()).toEqual([["", "Все"]]);
    expect(calls).toEqual([path, `${path}?categoryId=A`, path]);
    expect(m.write).not.toHaveBeenCalled();
  });

  // Complete the already mounted list's selected detail; local injected GET only.
  describe("TR013_TEMPLATE_EXISTING_DETAIL_METADATA_READ source-mounted", () => {
    const detail = () => host.querySelector<HTMLElement>('[aria-label="Просмотр шаблона"]');
    const open = async (name: string) => {
      const b = Array.from(host.querySelectorAll<HTMLButtonElement>("button"))
        .find(x => x.textContent === name)!;
      await act(async () => b.click());
    };
    it("renders nullable duration, absent tags/category, zero usage and every false flag", async () => {
      const secret = "PRIVATE_TEMPLATE_MEDIA_7314";
      const item = { ...row("empty-meta", "A"), category: null,
        title: "Шаблон без категории", description: "Описание без HTML", type: "UNKNOWN_TYPE",
        durationSec: null, tags: [], usageCount: 0,
        hasTestQuestions: false, requiresWrittenFeedback: false, requiresVideoReport: false,
        videoUrl: `https://internal.example/${secret}`, imageUrls: [`/${secret}.jpg`],
        pdfUrls: [`/${secret}.pdf`], checklist: { hidden: secret }, surveySlug: secret,
        author: { id: secret, username: "public-author" }, id: "private-internal-id",
      };
      const t = vi.fn(async () => ok([item]));
      await localMount(t);
      await open(item.title);
      const d = detail();
      expect(d).not.toBeNull();
      expect(d?.textContent).toContain("Тип: UNKNOWN_TYPE");
      expect(d?.textContent).toContain("Длительность: Не указано");
      expect(d?.textContent).toContain("Категория: Без категории");
      expect(d?.textContent).toContain("Теги: Нет тегов");
      expect(d?.textContent).toContain("Использований: 0");
      expect(d?.textContent).toContain("Тестовые вопросы: Нет");
      expect(d?.textContent).toContain("Письменный отчёт: Нет");
      expect(d?.textContent).toContain("Видеоотчёт: Нет");
      expect(d?.textContent).toContain("Автор: public-author");
      expect(host.textContent).not.toContain(secret);
      expect(d?.textContent).not.toContain("private-internal-id");
      expect(d?.querySelector("video,img,a,iframe,script")).toBeNull();
      expect(t).toHaveBeenCalledOnce();
      expect(m.write).not.toHaveBeenCalled();
    });
    it("shows zero seconds distinctly, tags/usage and true flags; switches selected detail without media", async () => {
      const secret = "SECRET_CHOICE_MEDIA_9192";
      const itemA = { ...row("a", "A"), title: "Первый", type: "TRAINING", durationSec: 0,
        tags: ["фокус", "практика"], usageCount: 12, hasTestQuestions: true,
        requiresWrittenFeedback: true, requiresVideoReport: true,
        description: "Описание <script>unsafe()</script> текста",
        category: { id: "A", name: "Послушание <b>собак</b>", icon: null },
        videoUrl: `https://internal.example/${secret}`, imageUrls: [`/${secret}`],
        pdfUrls: [`/${secret}`], checklist: [secret], surveySlug: secret,
      };
      const itemB = { ...row("b", "B"), title: "Второй", type: "EXAMINATION",
        durationSec: 65, usageCount: 3, description: "Второе описание" };
      const t = vi.fn(async () => ok([itemA,itemB]));
      await localMount(t);
      await open("Первый");
      expect(detail()?.textContent).toContain("Тип: TRAINING");
      expect(detail()?.textContent).toContain("Длительность: 0 секунд");
      expect(detail()?.textContent).toContain("Категория: Послушание <b>собак</b>");
      expect(detail()?.textContent).toContain("Теги: фокус, практика");
      expect(detail()?.textContent).toContain("Использований: 12");
      expect(detail()?.textContent).toContain("Тестовые вопросы: Да");
      expect(detail()?.textContent).toContain("Письменный отчёт: Да");
      expect(detail()?.textContent).toContain("Видеоотчёт: Да");
      expect(detail()?.textContent).toContain("Описание <script>unsafe()</script> текста");
      expect(detail()?.querySelector("script,b,video,img,a,iframe")).toBeNull();
      expect(host.textContent).not.toContain(secret);
      await open("Второй");
      expect(detail()?.textContent).toContain("Второе описание");
      expect(detail()?.textContent).toContain("Тип: EXAMINATION");
      expect(detail()?.textContent).toContain("Длительность: 65 секунд");
      expect(detail()?.textContent).not.toContain("фокус, практика");
      expect(detail()?.textContent).not.toContain("unsafe()");
      expect(t).toHaveBeenCalledOnce();
    });
    it("category change, pending and failed GET hide previous selected metadata; later recovery has no stale detail", async () => {
      const requests: string[] = [];
      const pending = deferred(); let bReads = 0;
      const t = vi.fn(async (url: string) => {
        requests.push(url);
        if (url === path) return ok([row("a","A"),row("b","B")]);
        if (url === `${path}?categoryId=A`) return ok([row("a","A")]);
        if (url === `${path}?categoryId=B`) return ++bReads === 1 ? pending.promise : ok([row("b","B")]);
        throw Error("Unexpected path");
      });
      await localMount(t);
      await open("Шаблон a");
      expect(detail()?.textContent).toContain("Описание a");
      await choose("A");
      expect(detail()).toBeNull();
      await open("Шаблон a");
      await choose("B");
      expect(detail()).toBeNull();
      expect(host.textContent).toContain("Загрузка шаблонов");
      expect(host.textContent).not.toContain("Описание a");
      await act(async () => pending.resolve(failed()));
      expect(detail()).toBeNull();
      expect(host.textContent).toContain("Не удалось получить шаблоны");
      expect(host.textContent).not.toContain("Шаблонов нет");
      const retry = Array.from(host.querySelectorAll<HTMLButtonElement>("button"))
        .find(x => x.textContent === "Повторить GET")!;
      await act(async () => retry.click());
      expect(host.textContent).toContain("Шаблон b");
      expect(detail()).toBeNull();
      await open("Шаблон b");
      expect(detail()?.textContent).toContain("Описание b");
      expect(detail()?.textContent).not.toContain("Описание a");
      expect(requests).toEqual([path,`${path}?categoryId=A`,`${path}?categoryId=B`,`${path}?categoryId=B`]);
    });
    it("actor and epoch retirement hides selected metadata and ignores stale filtered ACK", async () => {
      const pending = deferred(); const calls: string[] = [];
      const old = vi.fn(async (url: string) => {
        calls.push(url);
        return url === path ? ok([row("a","A"),row("b","B")]) : pending.promise;
      });
      await localMount(old);
      await open("Шаблон a");
      expect(detail()?.textContent).toContain("Описание a");
      await choose("A");
      const latest = vi.fn(async (url: string) => {
        calls.push(url);
        return ok([row("new","B")]);
      });
      await localMount(latest, {actor: actorB,token:"actor-B-token",authEpoch:"actor-B-epoch"});
      expect(detail()).toBeNull();
      expect(host.textContent).not.toContain("Описание a");
      await act(async () => pending.resolve(ok([row("OLD_PRIVATE","A")])));
      expect(host.textContent).not.toContain("OLD_PRIVATE");
      expect(detail()).toBeNull();
      expect(calls).toEqual([path,`${path}?categoryId=A`,path]);
      expect(m.write).not.toHaveBeenCalled();
    });
  });

  // Existing TR013 template library: local navigation over confirmed category GET metadata.
  describe("TR013_PUBLIC_TEMPLATES_TITLE_SEARCH_LOCAL source-mounted", () => {
    const list = () => host.querySelector<HTMLUListElement>('ul[aria-label="Публичные шаблоны"]');
    const titles = () => Array.from(list()?.querySelectorAll<HTMLButtonElement>("li > button") ?? [])
      .map(button => button.textContent ?? "");
    const detail = () => host.querySelector<HTMLElement>('[aria-label="Просмотр шаблона"]');
    const searchInput = () => host.querySelector<HTMLInputElement>('input[aria-label="Поиск шаблона по названию"]');
    const button = (name: string) => Array.from(host.querySelectorAll<HTMLButtonElement>("button"))
      .find(b => b.textContent === name);
    async function search(value: string) {
      const input = searchInput()!;
      expect(input).not.toBeNull();
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")?.set;
      expect(setter).toBeDefined();
      await act(async () => {
        setter!.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    }
    it("genuinely empty confirmed GET shows no templates rather than search miss and zero loaded/shown", async () => {
      const calls: string[] = [];
      const t = vi.fn(async (url: string) => { calls.push(url); return ok([]); });
      await localMount(t);
      expect(searchInput()).not.toBeNull();
      expect(host.textContent).toContain("Шаблонов нет");
      expect(host.textContent).not.toContain("По запросу ничего не найдено");
      expect(host.textContent).toContain("Загружено шаблонов: 0; показано: 0");
      expect(button("Очистить поиск")).toBeUndefined();
      expect(calls).toEqual([path]);
    });
    it("case insensitive trimmed title only, no description search, explicit no-match and local clear zero GET", async () => {
      const calls: string[] = [];
      const t = vi.fn(async (url: string) => {
        calls.push(url);
        return ok([row("dog", "A"),row("cat", "B")].map((item,index) => ({
          ...item,title:index===0?"Обучение СОБАКИ":"Кошачий трюк",
          description:index===1?"DESCRIPTION_ONLY_PRIVATE":"Описание собак",
        })));
      });
      await localMount(t);
      expect(titles()).toEqual(["Обучение СОБАКИ","Кошачий трюк"]);
      await search("  сОбАкИ  ");
      expect(titles()).toEqual(["Обучение СОБАКИ"]);
      expect(host.textContent).toContain("Загружено шаблонов: 2; показано: 1");
      expect(host.textContent).not.toContain("DESCRIPTION_ONLY_PRIVATE");
      await search("DESCRIPTION_ONLY_PRIVATE");
      expect(titles()).toHaveLength(0);
      expect(host.textContent).toContain("По запросу ничего не найдено");
      expect(host.textContent).not.toContain("Шаблонов нет");
      expect(host.textContent).toContain("Загружено шаблонов: 2; показано: 0");
      await act(async () => button("Очистить поиск")?.click());
      expect(searchInput()?.value).toBe("");
      expect(titles()).toEqual(["Обучение СОБАКИ","Кошачий трюк"]);
      expect(host.textContent).toContain("Загружено шаблонов: 2; показано: 2");
      expect(button("Очистить поиск")).toBeUndefined();
      expect(calls).toEqual([path]);
      expect(m.write).not.toHaveBeenCalled();
    });
    it("category server GET is independent: search only current category rows with explanation and snapshot options", async () => {
      const calls: string[] = [];
      const all = [row("dogA","A"), row("otherA","A"), row("dogB","B")].map(item=>({
        ...item,title:item.id==="dogA"?"Собака А":item.id==="dogB"?"Собака Б":"Кот А",
      }));
      const t = vi.fn(async (url: string) => {
        calls.push(url);
        if(url===path)return ok(all);
        if(url===`${path}?categoryId=A`)return ok(all.filter(r=>r.category?.id==="A"));
        if(url===`${path}?categoryId=B`)return ok(all.filter(r=>r.category?.id==="B"));
        throw Error("Unexpected category GET");
      });
      await localMount(t);
      await search(" собака ");
      expect(titles()).toEqual(["Собака А","Собака Б"]);
      expect(options()).toContainEqual(["B","Категория B"]);
      await choose("A");
      expect(titles()).toEqual(["Собака А"]);
      expect(host.textContent).toContain("Загружено шаблонов: 2; показано: 1");
      expect(host.textContent).toContain("Поиск только среди шаблонов выбранной категории");
      expect(options()).toContainEqual(["B","Категория B"]);
      await search("кот");
      expect(titles()).toEqual(["Кот А"]);
      await choose("B");
      expect(titles()).toHaveLength(0);
      expect(host.textContent).toContain("По запросу ничего не найдено");
      expect(host.textContent).toContain("Загружено шаблонов: 1; показано: 0");
      expect(host.textContent).toContain("Поиск только среди шаблонов выбранной категории");
      await act(async () => button("Очистить поиск")?.click());
      expect(titles()).toEqual(["Собака Б"]);
      expect(calls).toEqual([path,`${path}?categoryId=A`,`${path}?categoryId=B`]);
      expect(m.write).not.toHaveBeenCalled();
    });
    it("selected metadata hides when title filtered away; pending/error category GET never resurrects detail", async () => {
      const pending = deferred();const calls:string[]=[];
      const t = vi.fn(async (url:string) => {
        calls.push(url);
        if(url===path)return ok([row("a","A"),row("b","B")]);
        return pending.promise;
      });
      await localMount(t);
      await act(async () => button("Шаблон a")?.click());
      expect(detail()?.textContent).toContain("Описание a");
      expect(detail()?.textContent).toContain("Использований: 1");
      await search("Шаблон b");
      expect(titles()).toEqual(["Шаблон b"]);
      expect(detail()).toBeNull();
      await act(async () => button("Очистить поиск")?.click());
      expect(titles()).toEqual(["Шаблон a","Шаблон b"]);
      await choose("A");
      expect(detail()).toBeNull();
      expect(host.textContent).toContain("Загрузка шаблонов");
      expect(host.textContent).not.toContain("Описание a");
      await act(async () => pending.resolve(failed()));
      expect(detail()).toBeNull();
      expect(host.textContent).toContain("Не удалось получить шаблоны");
      expect(host.textContent).not.toContain("По запросу ничего не найдено");
      expect(calls).toEqual([path,`${path}?categoryId=A`]);
    });
    it("actor A to B to A loses retired search and details; late old filtered ACK cannot repaint", async () => {
      const pending = deferred();const calls:string[]=[];
      const first = vi.fn(async (url:string) => {
        calls.push(url);return url===path?ok([row("old","A"),row("second","B")]):pending.promise;
      });
      await localMount(first);
      await search("Шаблон old");
      await act(async () => button("Шаблон old")?.click());
      expect(detail()?.textContent).toContain("Описание old");
      await choose("A");
      expect(detail()).toBeNull();
      const second = vi.fn(async (url:string) => {
        calls.push(url);return ok([row("new","B")]);
      });
      await localMount(second,{actor:actorB,token:"B-token",authEpoch:"epoch-B"});
      expect(searchInput()?.value).toBe("");
      expect(titles()).toEqual(["Шаблон new"]);
      expect(detail()).toBeNull();
      expect(options()).toEqual([["", "Все"],["B","Категория B"]]);
      await act(async () => pending.resolve(ok([row("PRIVATE_STALE","A")])));
      expect(host.textContent).not.toContain("PRIVATE_STALE");
      const returning = vi.fn(async (url:string) => {
        calls.push(url);return ok([row("returned","A")]);
      });
      await localMount(returning);
      expect(searchInput()?.value).toBe("");
      expect(titles()).toEqual(["Шаблон returned"]);
      expect(detail()).toBeNull();
      expect(host.textContent).not.toContain("Описание old");
      // Existing selectedCategory is scoped by principal and restores A's own category on return.
      expect(calls).toEqual([path,`${path}?categoryId=A`,path,`${path}?categoryId=A`]);
      expect(m.write).not.toHaveBeenCalled();
    });
  });
  // WEB005: real DOM focus lifecycle of the existing manual retry, no browser or new test framework.
  describe("WEB005_TR013_TEMPLATE_RETRY_FOCUS_LIFECYCLE mounted-local", () => {
    const region = () => host.querySelector<HTMLElement>('[aria-label="Результаты библиотеки шаблонов"]');
    const retry = () => [...host.querySelectorAll<HTMLButtonElement>("button")]
      .find(button => button.textContent === "Повторить GET");
    async function clickFocusedRetry() {
      const button=retry()!;
      expect(button).toBeDefined();
      await act(async()=>button.focus());
      expect(document.activeElement).toBe(button);
      await act(async()=>button.click());
      expect(host.textContent).toContain("Загрузка шаблонов");
      expect(host.querySelector('[role="status"]')?.textContent).toContain("Загрузка шаблонов");
      expect(retry()).toBeUndefined();
    }
    it("focus goes to named result region after explicit focused retry fails again",async()=>{
      const pending=deferred();let attempts=0;
      const t=vi.fn(async()=>++attempts===1?failed():pending.promise);
      await localMount(t);
      expect(document.activeElement).toBe(document.body);
      expect(host.textContent).toContain("Не удалось получить шаблоны");
      await clickFocusedRetry();
      await act(async()=>pending.resolve(failed()));
      expect(host.textContent).toContain("Не удалось получить шаблоны");
      expect(document.activeElement).toBe(region());
      expect(region()?.getAttribute("tabindex")).toBe("-1");
      expect(region()?.textContent).toContain("Повторить GET");
      expect(t).toHaveBeenCalledTimes(2);
      expect(m.write).not.toHaveBeenCalled();
    });
    it("focused retry success exposes confirmed existing list and focuses only result region",async()=>{
      const pending=deferred();let calls=0;
      const t=vi.fn(async()=>++calls===1?failed():pending.promise);
      await localMount(t);
      await clickFocusedRetry();
      await act(async()=>pending.resolve(ok([row("successful","A")])));
      expect(host.textContent).toContain("Шаблон successful");
      expect(host.textContent).toContain("Загружено шаблонов: 1; показано: 1");
      expect(document.activeElement).toBe(region());
      expect(region()?.textContent).toContain("Шаблон successful");
      expect(t).toHaveBeenCalledTimes(2);
    });
    it("focused retry confirmed empty has true-empty status and focuses result region, initial empty does not",async()=>{
      const initial=vi.fn(async()=>ok([]));
      await localMount(initial);
      expect(host.textContent).toContain("Шаблонов нет");
      expect(document.activeElement).toBe(document.body);
      const pending=deferred();let calls=0;
      const t=vi.fn(async()=>++calls===1?failed():pending.promise);
      await localMount(t);
      await clickFocusedRetry();
      await act(async()=>pending.resolve(ok([])));
      expect(host.textContent).toContain("Шаблонов нет");
      expect(host.textContent).not.toContain("По запросу ничего не найдено");
      expect(document.activeElement).toBe(region());
      expect(t).toHaveBeenCalledTimes(2);
      expect(initial).toHaveBeenCalledTimes(1);
    });
    it("user moves focus to search/category while retry is pending: completion never steals it",async()=>{
      const pending=deferred();let calls=0;
      const t=vi.fn(async()=>++calls===1?failed():pending.promise);
      await localMount(t);
      await clickFocusedRetry();
      const category=current();
      await act(async()=>category.focus());
      expect(document.activeElement).toBe(category);
      await act(async()=>pending.resolve(ok([row("new","A")])));
      expect(host.textContent).toContain("Шаблон new");
      expect(document.activeElement).toBe(category);
      expect(t).toHaveBeenCalledTimes(2);
      expect(m.write).not.toHaveBeenCalled();
    });
    it("ordinary category, search and selected detail navigation never triggers retry autofocus",async()=>{
      const paths:string[]=[];
      const t=vi.fn(async(url:string)=>{
        paths.push(url);
        return url===path?ok([row("a","A"),row("b","B")]):ok([row("a","A")]);
      });
      await localMount(t);
      expect(document.activeElement).toBe(document.body);
      const select=current();
      await act(async()=>select.focus());
      await choose("A");
      expect(document.activeElement).toBe(select);
      expect(host.textContent).toContain("Шаблон a");
      const item=[...host.querySelectorAll<HTMLButtonElement>("button")]
        .find(button=>button.textContent==="Шаблон a")!;
      await act(async()=>{item.focus();item.click();});
      expect(document.activeElement).toBe(item);
      expect(host.querySelector('[aria-label="Просмотр шаблона"]')?.textContent)
        .toContain("Описание a");
      const search=host.querySelector<HTMLInputElement>('input[aria-label="Поиск шаблона по названию"]')!;
      await act(async()=>{
        const setter=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(search),"value")?.set;
        setter!.call(search,"missing");
        search.dispatchEvent(new Event("input",{bubbles:true}));
      });
      expect(document.activeElement).toBe(document.body);
      expect(host.textContent).toContain("По запросу ничего не найдено");
      expect(paths).toEqual([path,`${path}?categoryId=A`]);
      expect(m.write).not.toHaveBeenCalled();
    });
    it("retired actor/epoch plus late old ACK never focuses new principal result or leaks details",async()=>{
      const pending=deferred();let calls=0;
      const old=vi.fn(async()=>++calls===1?failed():pending.promise);
      await localMount(old);
      await clickFocusedRetry();
      const replacement=vi.fn(async()=>ok([row("new-owner","B")]));
      await localMount(replacement,{actor:actorB,token:"new-token",authEpoch:"new-epoch"});
      expect(host.textContent).toContain("Шаблон new-owner");
      expect(document.activeElement).not.toBe(region());
      await act(async()=>pending.resolve(ok([row("PRIVATE_OLD_ACTOR","A")])));
      expect(host.textContent).not.toContain("PRIVATE_OLD_ACTOR");
      expect(host.textContent).toContain("Шаблон new-owner");
      expect(document.activeElement).not.toBe(region());
      expect(replacement).toHaveBeenCalledTimes(1);
      expect(old).toHaveBeenCalledTimes(2);
      expect(m.write).not.toHaveBeenCalled();
    });
  });
});

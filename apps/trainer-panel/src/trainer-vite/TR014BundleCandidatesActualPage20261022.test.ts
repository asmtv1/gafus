/**
 * AG1 TR014 missing read producer: registered actual Hono -> ACTUAL existing
 * getDailyCourseBundles Core -> synthetic Prisma. Real signed JWT, auth middleware,
 * original limiter wiring; no fake Core, real SQL, Redis, HTTP socket or writes.
 */
import { randomBytes } from "node:crypto";
import {act,createElement} from "react";
import type {Root} from "react-dom/client";
import {TrainerDailyBundlesOptInRoute} from "./TrainerDailyBundlesOptInRoute";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type * as PrismaModule from "@gafus/prisma";

const m = vi.hoisted(() => ({
  find: vi.fn(), stepFind:vi.fn(), session: vi.fn(), registration: vi.fn(), write: vi.fn(),
  unrelated: vi.fn(), rateKeys: [] as string[], limited: false,
}));
vi.mock("@hono-rate-limiter/redis", () => ({
  RedisStore: class {
    windowMs = 60000;
    init(opts: { windowMs: number }) { this.windowMs = opts.windowMs; }
    async increment(key: string) {
      m.rateKeys.push(key);
      return { totalHits: m.limited ? 101 : 1,
        resetTime: new Date(Date.now() + this.windowMs) };
    }
    async decrement() { return undefined; }
    async resetKey() { return undefined; }
  },
}));
vi.mock("@gafus/prisma", async (original) => {
  const actual = await original<typeof PrismaModule>();
  return { ...actual, prisma: {
    ...actual.prisma,
    user: { ...actual.prisma.user, findUnique: m.session },
    dailyCourseBundle: { ...actual.prisma.dailyCourseBundle,
      findMany: m.find, create: m.write, update: m.write,
      delete: m.write, deleteMany: m.write },
    dailyCourseBundleStep: { ...actual.prisma.dailyCourseBundleStep,
      createMany: m.write, deleteMany: m.write },
    step: { ...actual.prisma.step, findMany: m.stepFind },
    dailyCourseSchedule: { ...actual.prisma.dailyCourseSchedule,
      findMany: m.unrelated, create: m.write, update: m.write },
    $transaction: m.write,
  }};
});
vi.mock("@gafus/core/services/auth", async original => ({
  ...await original<object>(), isRegistrationCompleted: m.registration,
}));
// NO vi.mock for @gafus/core/services/dailyCourse.
const {app}=await vi.importActual<{app:{request:(path:string,init?:RequestInit)=>Promise<Response>}}>("../../../api/src/app");
const {generateAccessToken}=await vi.importActual<{generateAccessToken:(actor:{id:string;username:string;role:string})=>Promise<string>}>("@gafus/auth/jwt");

import {
  TR014_PROPOSED_PATH,
} from "./tr014DailyBundlesRead20261022";

const SECRET="AG1_TR014_PRIVATE_EMAIL_STUDENT_PROGRESS_MEDIA_SECRET";
const actors={
 A:{id:"tr014-trainer-A",username:"trainerA",role:"TRAINER"},
 B:{id:"tr014-trainer-B",username:"trainerB",role:"TRAINER"},
 ADMIN:{id:"tr014-admin",username:"admin",role:"ADMIN"},
 MOD:{id:"tr014-mod",username:"moderator",role:"MODERATOR"},
 USER:{id:"tr014-user",username:"user",role:"USER"},
 PARTNER:{id:"tr014-partner",username:"partner",role:"PARTNER"},
} as const;
const tokens:Record<string,string>={};
type Link={id:string;order:number;privateReview:string;
  step:{id:string;title:string;type:string;privateMediaUrl:string}};
type Stored={id:string;title:string;equipment:string;description:string;
  type:string;authorId:string;updatedAt:Date;privateCost:string;
  author:{username:string;email:string};stepLinks:Link[]};
const make=(id:string,owner:string,time:string,orders:number[]):Stored=>({
  id,title:"Bundle "+id,equipment:"leash",description:"For dogs",
  type:"TRAINING",authorId:owner,updatedAt:new Date(time),
  privateCost:SECRET,
  author:{username:"account_"+owner,email:SECRET},
  stepLinks:orders.map(n=>({
    id:id+"-link-"+n,order:n,privateReview:SECRET,
    step:{id:id+"-step-"+n,title:"Step "+n,type:"PRACTICE",privateMediaUrl:SECRET},
  })),
});
const storage:Stored[]=[
  make("A-older",actors.A.id,"2026-10-18T01:00:00.000Z",[1,2]),
  make("B-private",actors.B.id,"2026-10-20T01:00:00.000Z",[1]),
  make("A-newer",actors.A.id,"2026-10-22T01:00:00.000Z",[]),
];
const _request=(who:string,suffix="",opts?:{method:string;body?:string})=>
  app.request(TR014_PROPOSED_PATH+suffix,{
    method:opts?.method??"GET",
    headers:{
      ...(who?{authorization:"Bearer "+(tokens[who]??who)}:{}),
      ...(opts?.body!==undefined?{"content-type":"application/json"}:{}),
    },
    ...(opts?.body!==undefined?{body:opts.body}:{}),
  });
const _privateHeaders=(r:Response)=>{
  const cc=(r.headers.get("cache-control")??"").toLowerCase()
    .split(",").map(x=>x.trim());
  expect(cc).toContain("private");
  expect(cc).toContain("no-store");
  expect(cc).not.toContain("public");
  expect(r.headers.get("referrer-policy")).toBe("no-referrer");
};
const _noWrites=()=>{
  expect(m.write).not.toHaveBeenCalled();
  expect(m.unrelated).not.toHaveBeenCalled();
};
const _assertedQuery=(owner?:string)=>{
  const args=m.find.mock.calls.at(-1)?.[0];
  expect(args).toEqual({
    where:owner?{authorId:owner}:{},
    orderBy:{updatedAt:"desc"},
    select:{
      id:true,title:true,equipment:true,description:true,
      type:true,authorId:true,
      author:{select:{username:true}},
      stepLinks:{
        orderBy:{order:"asc"},
        select:{id:true,order:true,step:{select:{
          id:true,title:true,type:true,
        }}},
      },
    },
  });
};
beforeAll(async()=>{
  process.env.JWT_SECRET=randomBytes(48).toString("hex");
  for(const [name,actor] of Object.entries(actors))
    tokens[name]=await generateAccessToken(actor);
});
beforeEach(()=>{
  vi.clearAllMocks(); m.limited=false; m.rateKeys.length=0;
  m.session.mockImplementation(async ({ where }: { where: { id: string } }) => {
    const actor = Object.values(actors).find((candidate) => candidate.id === where.id);
    return actor ? { sessionsRevokedAt: null, registrationPending: false, role: actor.role } : null;
  });
  m.registration.mockResolvedValue(true);
  m.stepFind.mockImplementation(async()=>[{id:"candidate1",title:"Candidate One",type:"TRAINING",durationSec:90,authorId:actors.A.id,author:{username:"trainerA"}}]);
  m.find.mockImplementation(async ({where}:{
    where:{authorId?:string};
  }) => storage
    .filter(x=>!where.authorId||x.authorId===where.authorId)
    .sort((a,b)=>b.updatedAt.getTime()-a.updatedAt.getTime())
    .map(x=>({...x,stepLinks:[...x.stepLinks].sort((a,b)=>a.order-b.order)}))
  );
});


const {JSDOM}=await vi.importActual<{JSDOM:new (html:string,options:{url:string})=>{window:Window & typeof globalThis}}>("jsdom");
const dom=new JSDOM("<!doctype html><html><body></body></html>",{url:"http://localhost"});
Object.assign(globalThis,{
  window:dom.window,document:dom.window.document,navigator:dom.window.navigator,
  HTMLElement:dom.window.HTMLElement,Event:dom.window.Event,
  MouseEvent:dom.window.MouseEvent,IS_REACT_ACT_ENVIRONMENT:true,
});
const {createRoot}=await import("react-dom/client");
let host:HTMLDivElement,root:Root;
beforeEach(()=>{host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
const _transport=async(path:string,signal:AbortSignal)=>{
 const result=await app.request(path,{method:"GET",signal,headers:{authorization:"Bearer "+tokens.A}});
 return {status:result.status,headers:{"cache-control":result.headers.get("cache-control")??""},body:await result.json()};
};
describe("TR014 actual existing bundles page -> details -> candidates signed Hono + Core",()=>{
 it("click bundle then candidate through registered endpoints with exactly six fields and no write",async()=>{
  const actor=actors.A;
  const transport=async(path:string,signal:AbortSignal)=>{
   const r=await app.request(path,{method:"GET",signal,headers:{authorization:"Bearer "+tokens.A}});
   return {status:r.status,headers:{"cache-control":r.headers.get("cache-control")??""},body:await r.json()};
  };
  await act(async()=>root.render(createElement(TrainerDailyBundlesOptInRoute,{pathname:"/main-panel/daily-course/bundles",actor,token:tokens.A,authEpoch:"epoch",enableDailyBundles:true,dailyBundleTransport:transport,getCurrentSession:()=>({actor,token:tokens.A,authEpoch:"epoch"})})));
  await act(async()=>{await new Promise(r=>setTimeout(r,0));});
  expect(host.textContent).toContain("Bundle A-newer");expect(host.textContent).not.toContain("Bundle B-private");
  await act(async()=>[...host.querySelectorAll("button")].find(x=>x.textContent==="Bundle A-older")!.click());
  expect(host.querySelector('[aria-label="Подробности связки"]')?.textContent).toContain("Step 1");
  expect(host.textContent).toContain("Candidate One");
  await act(async()=>[...host.querySelectorAll("button")].find(x=>x.textContent==="Candidate One")!.click());
  expect(host.querySelector('[aria-label="Подробности шага"]')?.textContent).toContain("90 секунд");
  expect(m.stepFind).toHaveBeenCalled();expect(m.write).not.toHaveBeenCalled();
 });
});


// TR014 only local in-process transport; NO Hono/Core/SQL/JWT calls in these tests.
describe("TR014_BUNDLE_INDEPENDENT_READ_RECOVERY mounted-local", () => {
  const bundlePath = "/api/v1/trainer/daily-course/bundles";
  const candidatePath = "/api/v1/trainer/daily-course/bundle-step-candidates";
  const bundle = {
    id: "bundle-own", title: "Выбранная связка", type: "TRAINING", stepsCount: 1,
    authorId: actors.A.id, authorUsername: "trainerA", equipment: "", description: "Просмотр сохранён",
    steps: [{ id: "step-1", title: "Шаг сохранён", type: "TRAINING", order: 0 }],
  };
  const candidate = {
    id: "candidate-own", title: "Выбранный шаг", type: "TRAINING", durationSec: 90,
    authorId: actors.A.id, authorUsername: "trainerA",
  };
  const reply = (items: unknown[]) => ({ status: 200,
    headers: { "cache-control": "private, no-store" }, body: { success: true, data: items } });
  const unavailable = () => ({ status: 503,
    headers: { "cache-control": "private, no-store" }, body: { success: false, data: [] } });
  const deferred = () => {
    let resolve!: (value: ReturnType<typeof reply>) => void;
    const promise = new Promise<ReturnType<typeof reply>>(res => { resolve = res; });
    return { promise, resolve };
  };
  const actor = actors.A;
  const session = () => ({ actor, token: "test-token", authEpoch: "test-epoch" });
  async function mountLocal(
    t: (path: string, signal: AbortSignal) => Promise<ReturnType<typeof reply>>,
    getCurrentSession: () => ReturnType<typeof session> | null = session) {
    await act(async () => root.render(createElement(TrainerDailyBundlesOptInRoute, {
      pathname: "/main-panel/daily-course/bundles", actor,
      token: "test-token", authEpoch: "test-epoch", enableDailyBundles: true,
      dailyBundleTransport: t, getCurrentSession,
    })));
  }
  const click = async (label: string) => {
    const node = Array.from(host.querySelectorAll("button")).find(x => x.textContent === label);
    expect(node).toBeDefined();
    await act(async () => node?.click());
  };
  it.each(["ready", "true-empty"] as const)(
    "bundle selected / candidate error -> candidates-only retry -> %s", async resolution => {
      const calls: string[] = []; let candidateRequests = 0;
      const pending = deferred();
      const t = vi.fn(async (path: string, _signal: AbortSignal) => {
        calls.push(path);
        if (path === bundlePath) return reply([bundle]);
        if (path !== candidatePath) throw Error("unexpected path");
        return ++candidateRequests === 1 ? unavailable() : pending.promise;
      });
      await mountLocal(t);
      await click("Выбранная связка");
      expect(host.querySelector('[aria-label="Подробности связки"]')?.textContent)
        .toContain("Шаг сохранён");
      expect(host.textContent).toContain("Не удалось загрузить шаги");
      expect(host.textContent).not.toContain("Шагов нет");
      expect(calls).toEqual([bundlePath, candidatePath]);
      await act(async () => {
        const retry = Array.from(host.querySelectorAll("button"))
          .find(x => x.textContent === "Повторить загрузку шагов");
        expect(retry).toBeDefined();
        retry?.click(); retry?.click();
      });
      expect(calls).toEqual([bundlePath, candidatePath, candidatePath]);
      expect(host.querySelector('[aria-label="Подробности связки"]')?.textContent)
        .toContain("Шаг сохранён");
      expect(host.textContent).toContain("Загрузка шагов");
      expect(host.textContent).not.toContain("Шагов нет");
      expect(Array.from(host.querySelectorAll("button"))
        .find(x => x.textContent === "Повторить загрузку шагов")).toBeUndefined();
      await act(async () => pending.resolve(reply(resolution === "ready" ? [candidate] : [])));
      expect(calls).toEqual([bundlePath, candidatePath, candidatePath]);
      if (resolution === "ready") expect(host.textContent).toContain("Выбранный шаг");
      else expect(host.textContent).toContain("Шагов нет");
      expect(host.querySelector('[aria-label="Подробности связки"]')?.textContent)
        .toContain("Шаг сохранён");
      expect(m.write).not.toHaveBeenCalled();
    },
  );
  it("candidate selected / bundle error -> bundle-only retry retains detail", async () => {
    const calls: string[] = []; let bundles = 0; const pending = deferred();
    const t = vi.fn(async (path: string, _signal: AbortSignal) => {
      calls.push(path);
      if (path === candidatePath) return reply([candidate]);
      if (path !== bundlePath) throw Error("unexpected path");
      return ++bundles === 1 ? unavailable() : pending.promise;
    });
    await mountLocal(t);
    await click("Выбранный шаг");
    expect(host.querySelector('[aria-label="Подробности шага"]')?.textContent)
      .toContain("90 секунд");
    expect(host.textContent).toContain("Не удалось загрузить связки");
    expect(host.textContent).not.toContain("Связок нет");
    await click("Повторить загрузку связок");
    expect(calls).toEqual([bundlePath, candidatePath, bundlePath]);
    expect(host.textContent).toContain("Загрузка связок");
    expect(host.querySelector('[aria-label="Подробности шага"]')?.textContent)
      .toContain("90 секунд");
    expect(Array.from(host.querySelectorAll("button"))
      .find(x => x.textContent === "Повторить загрузку связок")).toBeUndefined();
    await act(async () => pending.resolve(reply([bundle])));
    expect(host.textContent).toContain("Выбранная связка");
    expect(host.querySelector('[aria-label="Подробности шага"]')?.textContent)
      .toContain("90 секунд");
    expect(calls).toEqual([bundlePath, candidatePath, bundlePath]);
    expect(m.write).not.toHaveBeenCalled();
  });
  it("fresh own lists remove absent selections, never use cached optimistic detail", async () => {
    const first = vi.fn(async (path: string, _signal: AbortSignal) =>
      reply(path === bundlePath ? [bundle] : [candidate]));
    await mountLocal(first);
    await click("Выбранная связка"); await click("Выбранный шаг");
    expect(host.querySelector('[aria-label="Подробности связки"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Подробности шага"]')).not.toBeNull();
    const second = vi.fn(async (path: string, _signal: AbortSignal) =>
      reply(path === bundlePath ? [] : [candidate]));
    await mountLocal(second);
    expect(host.textContent).toContain("Связок нет");
    expect(host.querySelector('[aria-label="Подробности связки"]')).toBeNull();
    expect(host.querySelector('[aria-label="Подробности шага"]')?.textContent)
      .toContain("90 секунд");
    const third = vi.fn(async (path: string, _signal: AbortSignal) =>
      reply(path === bundlePath ? [bundle] : []));
    await mountLocal(third);
    expect(host.querySelector('[aria-label="Подробности связки"]')).toBeNull();
    expect(host.textContent).toContain("Шагов нет");
    expect(host.querySelector('[aria-label="Подробности шага"]')).toBeNull();
    expect(second).toHaveBeenCalledTimes(2);
    expect(third).toHaveBeenCalledTimes(2);
    expect(m.write).not.toHaveBeenCalled();
  });
  it("identity retirement drops pending retry and clears selections on return", async () => {
    let current = true, candidateCalls = 0;
    const pending = deferred(); const calls: string[] = [];
    const t = vi.fn(async (path: string, _signal: AbortSignal) => {
      calls.push(path);
      if (path === bundlePath) return reply([bundle]);
      if (path !== candidatePath) throw Error("unexpected path");
      return ++candidateCalls === 1 ? unavailable() : pending.promise;
    });
    const currentSession = () => current ? session() : null;
    await mountLocal(t, currentSession);
    await click("Выбранная связка");
    await click("Повторить загрузку шагов");
    current = false;
    await mountLocal(t, currentSession);
    expect(host.textContent).toContain("Связки отключены");
    await act(async () => pending.resolve(reply([candidate])));
    expect(host.textContent).toContain("Связки отключены");
    expect(calls).toEqual([bundlePath, candidatePath, candidatePath]);
    current = true;
    const restored = vi.fn(async (path: string, _signal: AbortSignal) =>
      reply(path === bundlePath ? [bundle] : [candidate]));
    await mountLocal(restored, currentSession);
    expect(host.textContent).toContain("Выбранная связка");
    expect(host.querySelector('[aria-label="Подробности связки"]')).toBeNull();
    expect(host.querySelector('[aria-label="Подробности шага"]')).toBeNull();
    expect(restored).toHaveBeenCalledTimes(2);
    expect(m.write).not.toHaveBeenCalled();
  });


  describe("TR014_BUNDLES_CANDIDATES_INDEPENDENT_TITLE_SEARCH mounted-local", () => {
    const ownBundle = (id: string, title: string) => ({
      ...bundle, id, title, description: `Описание ${title}`,
    });
    const ownStep = (id: string, title: string) => ({
      ...candidate, id, title,
    });
    const bundleList = () => host.querySelector<HTMLUListElement>('ul[aria-label="Связки курса дня"]');
    const stepList = () => host.querySelector<HTMLElement>('[aria-label="Доступные шаги курса дня"] ul');
    const titles = (section: "bundle" | "step") =>
      [...((section === "bundle" ? bundleList() : stepList())?.querySelectorAll("li > button") ?? [])]
        .map(button => button.textContent);
    const bundleDetail = () => host.querySelector('[aria-label="Подробности связки"]');
    const stepDetail = () => host.querySelector('[aria-label="Подробности шага"]');
    const input = (section: "bundle" | "step") => host.querySelector<HTMLInputElement>(
      section === "bundle" ? 'input[aria-label="Поиск связки по названию"]' :
        'input[aria-label="Поиск шага по названию"]',
    );
    const clear = (section: "bundle" | "step") => [...host.querySelectorAll<HTMLButtonElement>("button")]
      .find(button => button.textContent === (section === "bundle" ? "Очистить поиск связок" :
        "Очистить поиск шагов"));
    async function search(section: "bundle" | "step", value: string) {
      const field = input(section)!;
      expect(field).not.toBeNull();
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), "value")?.set;
      expect(setter).toBeDefined();
      await act(async () => {
        setter!.call(field, value);
        field.dispatchEvent(new Event("input", { bubbles: true }));
      });
    }
    async function clickExact(label: string) {
      const item = [...host.querySelectorAll<HTMLButtonElement>("button")]
        .find(button => button.textContent === label);
      expect(item).toBeDefined();
      await act(async () => item!.click());
    }
    it("true empty confirmed GETs show two distinct genuine empty states and truthful counts", async () => {
      const paths: string[] = [];
      const t = vi.fn(async (path: string) => {
        paths.push(path);
        return reply([]);
      });
      await mountLocal(t);
      expect(input("bundle")).not.toBeNull();
      expect(input("step")).not.toBeNull();
      expect(host.textContent).toContain("Связок нет");
      expect(host.textContent).toContain("Шагов нет");
      expect(host.textContent).not.toContain("По запросу ничего не найдено");
      expect(host.textContent).toContain("Загружено связок: 0; показано: 0");
      expect(host.textContent).toContain("Загружено шагов: 0; показано: 0");
      expect(clear("bundle")).toBeUndefined();
      expect(clear("step")).toBeUndefined();
      expect(paths).toEqual([bundlePath, candidatePath]);
      expect(m.write).not.toHaveBeenCalled();
    });
    it("two independent title-only trimmed casefold filters and clears keep both original lists without extra GET", async () => {
      const listA = [ownBundle("b1", "СОБАКА В ПАРКЕ"), ownBundle("b2", "Кошка")];
      const listB = [ownStep("s1", "Шаг РЯДОМ"), ownStep("s2", "Сидеть")];
      const original = JSON.stringify([listA, listB]);
      const paths: string[] = [];
      const t = vi.fn(async (path: string) => {
        paths.push(path);
        return reply(path === bundlePath ? listA : listB);
      });
      await mountLocal(t);
      await search("bundle", "  собака  ");
      expect(titles("bundle")).toEqual(["СОБАКА В ПАРКЕ"]);
      expect(titles("step")).toEqual(["Шаг РЯДОМ", "Сидеть"]);
      await search("step", "  рЯдОм  ");
      expect(titles("step")).toEqual(["Шаг РЯДОМ"]);
      expect(titles("bundle")).toEqual(["СОБАКА В ПАРКЕ"]);
      expect(host.textContent).toContain("Загружено связок: 2; показано: 1");
      expect(host.textContent).toContain("Загружено шагов: 2; показано: 1");
      await search("bundle", "Описание СОБАКА В ПАРКЕ");
      expect(titles("bundle")).toHaveLength(0);
      expect(host.textContent).toContain("По запросу ничего не найдено среди связок");
      expect(titles("step")).toEqual(["Шаг РЯДОМ"]);
      await act(async () => clear("bundle")?.click());
      expect(input("bundle")?.value).toBe("");
      expect(input("step")?.value).toBe("  рЯдОм  ");
      expect(titles("bundle")).toEqual(["СОБАКА В ПАРКЕ", "Кошка"]);
      expect(titles("step")).toEqual(["Шаг РЯДОМ"]);
      await act(async () => clear("step")?.click());
      expect(titles("step")).toEqual(["Шаг РЯДОМ", "Сидеть"]);
      expect(JSON.stringify([listA, listB])).toBe(original);
      expect(paths).toEqual([bundlePath, candidatePath]);
      expect(m.write).not.toHaveBeenCalled();
    });
    it("filtering selected item hides only its details; other section stays selected, clears restore metadata", async () => {
      const t = vi.fn(async (path: string) => reply(path === bundlePath
        ? [ownBundle("b1", "Связка первая"), ownBundle("b2", "Связка вторая")]
        : [ownStep("s1", "Шаг первый"), ownStep("s2", "Шаг второй")]));
      await mountLocal(t);
      await clickExact("Связка первая");
      await clickExact("Шаг первый");
      expect(bundleDetail()?.textContent).toContain("Описание Связка первая");
      expect(stepDetail()?.textContent).toContain("90 секунд");
      await search("bundle", "вторая");
      expect(bundleDetail()).toBeNull();
      expect(stepDetail()?.textContent).toContain("Шаг первый");
      await search("step", "второй");
      expect(stepDetail()).toBeNull();
      await act(async () => clear("bundle")?.click());
      expect(bundleDetail()?.textContent).toContain("Описание Связка первая");
      expect(stepDetail()).toBeNull();
      await act(async () => clear("step")?.click());
      expect(stepDetail()?.textContent).toContain("90 секунд");
      expect(t).toHaveBeenCalledTimes(2);
    });
    it("independent candidate 503/retry never wipes confirmed bundle search/detail or emits false empty", async () => {
      const pending = deferred(); const calls: string[] = [];let candidateReads = 0;
      const t = vi.fn(async (path: string) => {
        calls.push(path);
        if (path === bundlePath) return reply([bundle]);
        return ++candidateReads === 1 ? unavailable() : pending.promise;
      });
      await mountLocal(t);
      await search("bundle", "ВЫБРАННАЯ");
      await clickExact("Выбранная связка");
      expect(bundleDetail()?.textContent).toContain("Просмотр сохранён");
      expect(host.textContent).toContain("Не удалось загрузить шаги");
      expect(host.textContent).not.toContain("По запросу ничего не найдено среди шагов");
      await clickExact("Повторить загрузку шагов");
      expect(host.textContent).toContain("Загрузка шагов");
      expect(bundleDetail()?.textContent).toContain("Просмотр сохранён");
      expect(input("bundle")?.value).toBe("ВЫБРАННАЯ");
      await act(async () => pending.resolve(reply([candidate])));
      await search("step", "не найдено");
      expect(host.textContent).toContain("По запросу ничего не найдено среди шагов");
      expect(bundleDetail()?.textContent).toContain("Просмотр сохранён");
      await act(async () => clear("step")?.click());
      expect(titles("step")).toEqual(["Выбранный шаг"]);
      expect(calls).toEqual([bundlePath,candidatePath,candidatePath]);
      expect(m.write).not.toHaveBeenCalled();
    });
    it("principal epoch retirement and late old read ACK discard both queries and selections on return", async () => {
      const oldPending = deferred(); const calls: string[] = [];
      let isCurrent = true;
      const first = vi.fn(async (path: string) => {
        calls.push(path);
        return path === bundlePath ? reply([bundle]) : oldPending.promise;
      });
      const sessionOrNull = () => isCurrent ? session() : null;
      await mountLocal(first, sessionOrNull);
      await search("bundle", "Выбранная");
      await clickExact("Выбранная связка");
      expect(bundleDetail()?.textContent).toContain("Просмотр сохранён");
      isCurrent = false;
      await mountLocal(first, sessionOrNull);
      expect(host.textContent).toContain("Связки отключены");
      expect(input("bundle")).toBeNull();
      expect(bundleDetail()).toBeNull();
      await act(async () => oldPending.resolve(reply([ownStep("old", "PRIVATE_OLD_STEP")])));
      expect(host.textContent).not.toContain("PRIVATE_OLD_STEP");
      isCurrent = true;
      const fresh = vi.fn(async (path: string) => reply(path === bundlePath
        ? [ownBundle("fresh", "Связка новая")]
        : [ownStep("fresh", "Шаг новый")]));
      await mountLocal(fresh, sessionOrNull);
      expect(input("bundle")?.value).toBe("");
      expect(input("step")?.value).toBe("");
      expect(titles("bundle")).toEqual(["Связка новая"]);
      expect(titles("step")).toEqual(["Шаг новый"]);
      expect(bundleDetail()).toBeNull();
      expect(stepDetail()).toBeNull();
      expect(host.textContent).not.toContain("Просмотр сохранён");
      expect(fresh).toHaveBeenCalledTimes(2);
      expect(calls).toEqual([bundlePath,candidatePath]);
      expect(m.write).not.toHaveBeenCalled();
    });
    it("bundle-only error/retry preserves independently selected candidate and search without extra candidate GET", async () => {
      const pending = deferred();const calls:string[]=[];let bundleReads=0;
      const t = vi.fn(async (path:string) => {
        calls.push(path);
        if(path===candidatePath)return reply([candidate]);
        return ++bundleReads===1?unavailable():pending.promise;
      });
      await mountLocal(t);
      expect(host.textContent).toContain("Не удалось загрузить связки");
      expect(host.textContent).not.toContain("По запросу ничего не найдено среди связок");
      await search("step", "вЫбРаНнЫй");
      await clickExact("Выбранный шаг");
      expect(stepDetail()?.textContent).toContain("90 секунд");
      expect(input("step")?.value).toBe("вЫбРаНнЫй");
      await clickExact("Повторить загрузку связок");
      expect(host.textContent).toContain("Загрузка связок");
      expect(stepDetail()?.textContent).toContain("90 секунд");
      expect(input("step")?.value).toBe("вЫбРаНнЫй");
      await act(async () => pending.resolve(reply([bundle])));
      expect(host.textContent).toContain("Выбранная связка");
      expect(titles("step")).toEqual(["Выбранный шаг"]);
      expect(stepDetail()?.textContent).toContain("90 секунд");
      expect(calls).toEqual([bundlePath,candidatePath,bundlePath]);
      expect(m.write).not.toHaveBeenCalled();
    });
    it("new authEpoch clears both searches and private details; retired epoch pending ACK is ignored", async () => {
      const initial = vi.fn(async (path: string) => reply(path === bundlePath
        ? [bundle] : [candidate]));
      await mountLocal(initial);
      await search("bundle", "Выбранная");
      await search("step", "Выбранный");
      await clickExact("Выбранная связка");
      await clickExact("Выбранный шаг");
      expect(bundleDetail()?.textContent).toContain("Просмотр сохранён");
      expect(stepDetail()?.textContent).toContain("90 секунд");
      const pending = deferred();
      const newEpoch = vi.fn(async (_path: string) => pending.promise);
      await act(async () => root.render(createElement(TrainerDailyBundlesOptInRoute, {
        pathname: "/main-panel/daily-course/bundles", actor,
        token: "test-token", authEpoch: "changed-epoch", enableDailyBundles: true,
        dailyBundleTransport: newEpoch,
        getCurrentSession: () => ({actor, token: "test-token", authEpoch: "changed-epoch"}),
      })));
      expect(host.textContent).toContain("Загрузка связок");
      expect(host.textContent).toContain("Загрузка шагов");
      expect(bundleDetail()).toBeNull();
      expect(stepDetail()).toBeNull();
      expect(host.textContent).not.toContain("Просмотр сохранён");
      const restored = vi.fn(async (path: string) => reply(path === bundlePath
        ? [ownBundle("new-b", "Связка другого контекста")]
        : [ownStep("new-s", "Шаг другого контекста")]));
      await mountLocal(restored);
      expect(input("bundle")?.value).toBe("");
      expect(input("step")?.value).toBe("");
      expect(titles("bundle")).toEqual(["Связка другого контекста"]);
      expect(titles("step")).toEqual(["Шаг другого контекста"]);
      expect(bundleDetail()).toBeNull();
      expect(stepDetail()).toBeNull();
      await act(async () => pending.resolve(reply([ownBundle("stale", "PRIVATE_OLD_EPOCH")])));
      expect(host.textContent).not.toContain("PRIVATE_OLD_EPOCH");
      expect(input("bundle")?.value).toBe("");
      expect(input("step")?.value).toBe("");
      expect(initial).toHaveBeenCalledTimes(2);
      expect(newEpoch).toHaveBeenCalledTimes(2);
      expect(restored).toHaveBeenCalledTimes(2);
      expect(m.write).not.toHaveBeenCalled();
    });
  });
});

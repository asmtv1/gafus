/**
 * AG1 cont131: ACTUAL registered Hono → ACTUAL getDailyCourseScheduleRange
 * → synthetic Prisma. The existing Core service is NEVER mocked.
 * Signed JWT/auth/route/limiter wiring real in-process, Redis store mocked.
 */
import { randomBytes } from "node:crypto";
import {act,createElement} from 'react';
import type {Root} from 'react-dom/client';
import {TrainerDailyCalendarRead20261022} from './TrainerDailyCalendarRead20261022';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type * as PrismaModule from "@gafus/prisma";
import type { DailyCourseScheduleDto } from "@gafus/core/services/dailyCourse";

const m=vi.hoisted(()=>({
  schedules:vi.fn(),session:vi.fn(),registration:vi.fn(),write:vi.fn(),
  unrelated:vi.fn(),rateKeys:[] as string[],limited:false,
}));
vi.mock("@hono-rate-limiter/redis",()=>({
  RedisStore:class {
    windowMs=60000;
    init(x:{windowMs:number}){this.windowMs=x.windowMs;}
    async increment(key:string){
      m.rateKeys.push(key);
      return {totalHits:m.limited?101:1,
        resetTime:new Date(Date.now()+this.windowMs)};
    }
    async decrement(){return undefined;}
    async resetKey(){return undefined;}
  },
}));
vi.mock("@gafus/prisma",async original=>{
  const actual=await original<typeof PrismaModule>();
  return {...actual,prisma:{...actual.prisma,
    user:{...actual.prisma.user,findUnique:m.session},
    dailyCourseSchedule:{...actual.prisma.dailyCourseSchedule,
      findMany:m.schedules,create:m.write,update:m.write,delete:m.write,
      deleteMany:m.write},
    dailyCourseBundle:{...actual.prisma.dailyCourseBundle,
      findMany:m.unrelated,update:m.write},
    $transaction:m.write,
  }};
});
vi.mock("@gafus/core/services/auth",async original=>({
  ...await original<object>(),isRegistrationCompleted:m.registration,
}));
// No vi.mock("@gafus/core/services/dailyCourse").
const {app}=await vi.importActual<{app:{request:(path:string,init?:RequestInit)=>Promise<Response>}}>("../../../api/src/app");
const {generateAccessToken}=await vi.importActual<{generateAccessToken:(actor:{id:string;username:string;role:string})=>Promise<string>}>("@gafus/auth/jwt");


const PATH="/api/v1/trainer/daily-course/schedule-range";
const Q="?from=2026-10-20&to=2026-10-24";
const SECRET="TR014_AG1_PRIVATE_PAYMENTS_PERSONAL_EMAIL_MEDIA_LINK";
const actors={
  A:{id:"schedule-owner-A",username:"trainerA",role:"TRAINER"},
  B:{id:"schedule-owner-B",username:"trainerB",role:"TRAINER"},
  ADMIN:{id:"schedule-admin",username:"admin",role:"ADMIN"},
  MOD:{id:"schedule-mod",username:"mod",role:"MODERATOR"},
  USER:{id:"schedule-user",username:"user",role:"USER"},
  PARTNER:{id:"schedule-partner",username:"partner",role:"PARTNER"},
} as const;
const jwt:Record<string,string>={};
type Stored={
  id:string;date:Date;isPublished:boolean;privateInvoice:string;
  bundle:{id:string;title:string;type:string;authorId:string;
    paymentSecrets:string;stepLinks:{id:string;secret:string}[]};
  createdBy:{id:string;username:string;privateEmail:string};
};
const make=(id:string,day:string,owner:string,stepCount:number):Stored=>({
  id,date:new Date(day+"T00:00:00.000Z"),isPublished:true,
  privateInvoice:SECRET,
  bundle:{id:"bundle-"+id,title:"Bundle "+id,type:"TRAINING",
    authorId:owner,paymentSecrets:SECRET,
    stepLinks:Array.from({length:stepCount},(_,i)=>({
      id:"link-"+id+"-"+i,secret:SECRET,
    }))},
  createdBy:{id:"creator-"+id,username:"created_"+id,privateEmail:SECRET},
});
const store:Stored[]=[
  make("A-last","2026-10-24",actors.A.id,3),
  make("B-first","2026-10-20",actors.B.id,2),
  make("A-middle","2026-10-22",actors.A.id,4),
  make("A-outside","2026-10-30",actors.A.id,5),
];
type Query={
  where:{date:{gte:Date;lte:Date};bundle?:{authorId:string}};
  orderBy:{date:"asc"};select:unknown;
};
const send=(who:string,q=Q,method="GET")=>
  app.request(PATH+q,{method,headers:who?{
    authorization:"Bearer "+(jwt[who]??who),
  }:{}});
const headers=(r:Response)=>{
  const cc=(r.headers.get("cache-control")??"").toLowerCase()
    .split(",").map(x=>x.trim());
  expect(cc).toContain("private");
  expect(cc).toContain("no-store");
  expect(r.headers.get("referrer-policy")).toBe("no-referrer");
};
const noWrites=()=>{
  expect(m.write).not.toHaveBeenCalled();
  expect(m.unrelated).not.toHaveBeenCalled();
};
const exactSelect={
  id:true,date:true,isPublished:true,
  bundle:{select:{
    id:true,title:true,type:true,stepLinks:{select:{id:true}},
  }},
  createdBy:{select:{id:true,username:true}},
};
const exactQuery=(owner?:string)=>{
  expect(m.schedules).toHaveBeenCalledExactlyOnceWith({
    where:{
      date:{gte:new Date("2026-10-20T00:00:00.000Z"),
        lte:new Date("2026-10-24T00:00:00.000Z")},
      ...(owner?{bundle:{authorId:owner}}:{}),
    },
    orderBy:{date:"asc"},
    select:exactSelect,
  });
};
function dto(body:unknown):DailyCourseScheduleDto[]{
  const parsed=body as {success:boolean;data:DailyCourseScheduleDto[]};
  expect(Object.keys(parsed).sort()).toEqual(["data","success"]);
  expect(parsed.success).toBe(true);
  expect(Array.isArray(parsed.data)).toBe(true);
  for(const item of parsed.data){
    expect(Object.keys(item).sort()).toEqual([
      "bundle","createdBy","date","id","isPublished",
    ]);
    expect(Object.keys(item.bundle).sort()).toEqual([
      "id","stepsCount","title","type",
    ]);
    expect(Object.keys(item.createdBy).sort()).toEqual(["id","username"]);
    expect(item.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isSafeInteger(item.bundle.stepsCount)).toBe(true);
  }
  expect(JSON.stringify(body)).not.toContain(SECRET);
  return parsed.data;
}
beforeAll(async()=>{
  process.env.JWT_SECRET=randomBytes(48).toString("hex");
  for(const [key,value] of Object.entries(actors))
    jwt[key]=await generateAccessToken(value);
});
beforeEach(()=>{
  vi.clearAllMocks();m.rateKeys.length=0;m.limited=false;
  m.registration.mockResolvedValue(true);
  m.session.mockImplementation(async ({ where }: { where: { id: string } }) => {
    const actor = Object.values(actors).find((candidate) => candidate.id === where.id);
    return actor ? { sessionsRevokedAt: null, registrationPending: false, role: actor.role } : null;
  });
  m.schedules.mockImplementation(async(query:Query)=>store
    .filter(x=>x.date.getTime()>=query.where.date.gte.getTime() &&
      x.date.getTime()<=query.where.date.lte.getTime() &&
      (!query.where.bundle||x.bundle.authorId===query.where.bundle.authorId))
    .sort((a,b)=>a.date.getTime()-b.date.getTime()));
});

const {JSDOM}=await vi.importActual<{JSDOM:new(html:string,options:{url:string})=>{window:Window & typeof globalThis}}>('jsdom');
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost'});
Object.assign(globalThis,{window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,Event:dom.window.Event,IS_REACT_ACT_ENVIRONMENT:true});
const {createRoot}=await import('react-dom/client');
let host:HTMLDivElement,root:Root;
beforeEach(()=>{host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
async function mount(who:'A'|'ADMIN'='A',isCurrent=()=>true){
 const actor=actors[who];const transport=async(path:string,signal:AbortSignal)=>{
  const r=await app.request(path,{method:'GET',signal,headers:{authorization:'Bearer '+jwt[who]}});
  return {status:r.status,headers:{'cache-control':r.headers.get('cache-control')??''},body:await r.json()};
 };
 await act(async()=>root.render(createElement(TrainerDailyCalendarRead20261022,{pathname:'/main-panel/daily-course',actor,token:jwt[who],authEpoch:'epoch',initialFrom:'2026-10-20',enabled:true,transport,getCurrentSession:()=>isCurrent()?{actor,token:jwt[who],authEpoch:'epoch'}:null})));
 await act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});
}
describe('AG4 mounted existing daily-calendar path -> ACTUAL Hono/Core -> synthetic Prisma',()=>{
 it('TRAINER own dates/publish state, click next range, no writes',async()=>{
  await mount();expect(host.textContent).toContain('Bundle A-middle');expect(host.textContent).not.toContain('Bundle B-first');
  expect(host.textContent).toContain('Опубликовано');
  await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Следующие даты')!.click());
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});
  expect(host.textContent).toContain('2026-11-19');expect(host.textContent).toContain('Расписания нет');
  expect(m.write).not.toHaveBeenCalled();
 });
 it('ADMIN mixed author dates, retired session fail closed',async()=>{
  await mount('ADMIN');expect(host.textContent).toContain('Bundle B-first');
  await mount('A',()=>false);expect(host.textContent).toContain('Календарь недоступен');
  expect(m.write).not.toHaveBeenCalled();
 });
});

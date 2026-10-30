/**
 * AG1 TR014 missing read producer: registered actual Hono -> ACTUAL existing
 * getDailyCourseBundles Core -> synthetic Prisma. Real signed JWT, auth middleware,
 * original limiter wiring; no fake Core, real SQL, Redis, HTTP socket or writes.
 */
import { randomBytes } from "node:crypto";
import {act,createElement} from 'react';
import type {Root} from 'react-dom/client';
import {TrainerDailyBundlesOptInRoute} from './TrainerDailyBundlesOptInRoute';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type * as PrismaModule from "@gafus/prisma";

const m = vi.hoisted(() => ({
  find: vi.fn(), session: vi.fn(), registration: vi.fn(), write: vi.fn(),
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
    step: { ...actual.prisma.step, findMany: m.unrelated },
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
const request=(who:string,suffix="",opts?:{method:string;body?:string})=>
  app.request(TR014_PROPOSED_PATH+suffix,{
    method:opts?.method??"GET",
    headers:{
      ...(who?{authorization:"Bearer "+(tokens[who]??who)}:{}),
      ...(opts?.body!==undefined?{"content-type":"application/json"}:{}),
    },
    ...(opts?.body!==undefined?{body:opts.body}:{}),
  });
const privateHeaders=(r:Response)=>{
  const cc=(r.headers.get("cache-control")??"").toLowerCase()
    .split(",").map(x=>x.trim());
  expect(cc).toContain("private");
  expect(cc).toContain("no-store");
  expect(cc).not.toContain("public");
  expect(r.headers.get("referrer-policy")).toBe("no-referrer");
};
const noWrites=()=>{
  expect(m.write).not.toHaveBeenCalled();
  expect(m.unrelated).not.toHaveBeenCalled();
};
const assertedQuery=(owner?:string)=>{
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
  m.find.mockImplementation(async ({where}:{
    where:{authorId?:string};
  }) => storage
    .filter(x=>!where.authorId||x.authorId===where.authorId)
    .sort((a,b)=>b.updatedAt.getTime()-a.updatedAt.getTime())
    .map(x=>({...x,stepLinks:[...x.stepLinks].sort((a,b)=>a.order-b.order)}))
  );
});


const {JSDOM}=await vi.importActual<{JSDOM:new (html:string,options:{url:string})=>{window:Window & typeof globalThis}}>('jsdom');
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost'});
Object.assign(globalThis,{window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,Event:dom.window.Event,MouseEvent:dom.window.MouseEvent,IS_REACT_ACT_ENVIRONMENT:true});
const {createRoot}=await import('react-dom/client');
let host:HTMLDivElement,root:Root;
beforeEach(()=>{host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
const transport=async(path:string,signal:AbortSignal)=>{
 const result=await app.request(path,{method:'GET',signal,headers:{authorization:'Bearer '+tokens.A}});
 return {status:result.status,headers:{'cache-control':result.headers.get('cache-control')??''},body:await result.json()};
};
describe('AG4 TR014 actual existing mounted read-only UI -> registered Hono -> ACTUAL Core / synthetic Prisma',()=>{
 it('TRAINER A sees own bundles through opt-in UI, never foreign rows or writes',async()=>{
  const actor=actors.A;
  await act(async()=>root.render(createElement(TrainerDailyBundlesOptInRoute,{pathname:'/main-panel/daily-course/bundles',actor,token:tokens.A,authEpoch:'epoch',enableDailyBundles:true,dailyBundleTransport:transport,getCurrentSession:()=>({actor,token:tokens.A,authEpoch:'epoch'})})));
  await act(async()=>{await new Promise(r=>setTimeout(r,0));});
  expect(host.textContent).toContain('Bundle A-newer');expect(host.textContent).toContain('Bundle A-older');
  expect(host.textContent).not.toContain('Bundle B-private');
  expect(m.find).toHaveBeenCalled();expect(m.write).not.toHaveBeenCalled();
 });
});

/**
 * AG1 versioned name-only registered Hono transport contract, signed JWT.
 * Core service itself is proved separately (source/mock and local real SQL).
 * No real Prisma writes, network listener, production DB or external provider.
 */
import {randomBytes} from "node:crypto";
// @ts-expect-error jsdom has no installed declaration
import {JSDOM} from 'jsdom';
import {act,createElement} from 'react';
import type {Root} from 'react-dom/client';
import {TrainerCourseVersionEditor20261022} from './TrainerCourseVersionEditor20261022';
import {createVersionedCourseOperations} from './TR012VersionHttpAdapter20261022';
import {afterEach,beforeAll,beforeEach,describe,expect,it,vi} from "vitest";
import type * as PrismaModule from "@gafus/prisma";
const m=vi.hoisted(()=>({
  read:vi.fn(),cas:vi.fn(),draft:vi.fn(),session:vi.fn(),
  registration:vi.fn(),mutation:vi.fn(),limited:false,keys:[] as string[],
}));
vi.mock("@hono-rate-limiter/redis",()=>({
  RedisStore:class {
    windowMs=60000;
    init(v:{windowMs:number}){this.windowMs=v.windowMs;}
    async increment(key:string){
      m.keys.push(key);
      return {totalHits:m.limited?101:1,
        resetTime:new Date(Date.now()+this.windowMs)};
    }
    async decrement(){return undefined;}
    async resetKey(){return undefined;}
  },
}));
vi.mock("@gafus/prisma",async original=>{
  const a=await original<typeof PrismaModule>();
  return {...a,prisma:{...a.prisma,
    user:{...a.prisma.user,findUnique:m.session},
    course:{...a.prisma.course,update:m.mutation,updateMany:m.mutation},
    $transaction:m.mutation,
  }};
});
vi.mock("@gafus/core/services/auth",async original=>({
  ...await original<object>(),isRegistrationCompleted:m.registration,
}));
vi.mock("@gafus/core/services/trainerCourse",async (importOriginal)=>({
  ...await importOriginal<typeof import("@gafus/core/services/trainerCourse")>(),
  getCourseDraftWithRelations:m.draft,
  readCourseNameVersion:m.read,
  updateCourseNameVersioned:m.cas,
}));
const {app}=await vi.importActual<{app:{request:(path:string,init?:RequestInit)=>Promise<Response>}}>("../../../api/src/app");
const {generateAccessToken}=await vi.importActual<{generateAccessToken:(actor:{id:string;username:string;role:string})=>Promise<string>}>("@gafus/auth/jwt");
const actors={
 A:{id:"version_trainer_A",username:"trainerA",role:"TRAINER"},
 B:{id:"version_trainer_B",username:"trainerB",role:"TRAINER"},
 ADMIN:{id:"version_admin",username:"admin",role:"ADMIN"},
 MOD:{id:"version_mod",username:"mod",role:"MODERATOR"},
 USER:{id:"version_user",username:"user",role:"USER"},
} as const;
const bearer:Record<string,string>={};
const apiRoot="/api/v1/trainer/courses/course1";
const req=(who:string,path:string,body?:unknown)=>
  app.request(apiRoot+path,{method:body===undefined?"GET":"PATCH",
    headers:{
      ...(who?{authorization:"Bearer "+(bearer[who]??who)}:{}),
      ...(body===undefined?{}:{"content-type":"application/json"}),
    },...(body===undefined?{}:{body:JSON.stringify(body)}),
  });
const headers=(r:Response)=>{
  const cc=(r.headers.get("cache-control")??"").toLowerCase();
  expect(cc).toContain("private");
  expect(cc).toContain("no-store");
  expect(r.headers.get("referrer-policy")).toBe("no-referrer");
};
const noWrites=()=>expect(m.mutation).not.toHaveBeenCalled();
beforeAll(async()=>{
  process.env.JWT_SECRET=randomBytes(48).toString("hex");
  for(const [name,actor] of Object.entries(actors))
    bearer[name]=await generateAccessToken(actor);
});
beforeEach(()=>{
  vi.clearAllMocks();m.limited=false;m.keys.length=0;
  m.session.mockImplementation(async ({ where }: { where: { id: string } }) => {
    const actor = Object.values(actors).find((candidate) => candidate.id === where.id);
    return actor ? {sessionsRevokedAt:null,registrationPending:false,role:actor.role} : null;
  });
  m.registration.mockResolvedValue(true);
  m.read.mockResolvedValue({status:"found",data:{id:"course1",name:"Current",version:3}});
  m.cas.mockResolvedValue({status:"updated",data:{id:"course1",name:"Changed",version:4}});
});

const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost'});
Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,navigator:dom.window.navigator,HTMLInputElement:dom.window.HTMLInputElement,Event:dom.window.Event,MouseEvent:dom.window.MouseEvent});
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
const {createRoot}=await import('react-dom/client');
let host:HTMLDivElement,mounted:Root;
beforeEach(()=>{host=document.createElement('div');document.body.append(host);mounted=createRoot(host);});
afterEach(async()=>{await act(async()=>mounted.unmount());host.remove();});
const readFlush=async()=>{await act(async()=>{await Promise.resolve();await new Promise(r=>setTimeout(r,0));});};
const syntheticFetch:typeof fetch=async(url,init)=>app.request(String(url),init);
async function mount(who:'A'|'B'|'ADMIN'|'MOD'|'USER'='A',freshSession?:()=>boolean){
 const actor=actors[who],token=bearer[who];
 const operations=createVersionedCourseOperations({token,fetchImpl:syntheticFetch,isCurrent:()=>freshSession?freshSession():true});
 await act(async()=>mounted.render(createElement(TrainerCourseVersionEditor20261022,{
  pathname:'/main-panel/courses/course1/edit',actor,token,authEpoch:'epoch-1',enabled:true,ops:operations,
  getCurrentSession:()=>freshSession&&!freshSession()?null:{actor,token,authEpoch:'epoch-1'},
 })));await readFlush();
}
async function change(name:string){const element=host.querySelector('input')!;await act(async()=>{const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!;setter.call(element,name);element.dispatchEvent(new Event('input',{bubbles:true}));});}
async function click(name:string){const button=[...host.querySelectorAll('button')].find(b=>b.textContent===name)!;await act(async()=>button.click());await readFlush();}
describe('AG4 mounted TR012 editor -> injected fetch -> ACTUAL registered Hono signed JWT / mocked Core',()=>{
 it('read → save → 409 → manual refresh → deliberate resend, no silent retry',async()=>{
  let db={name:'Current',version:3};
  m.read.mockImplementation(async()=>({status:'found',data:{id:'course1',...db}}));
  m.cas.mockImplementation(async(input:{name:string;expectedVersion:number})=>{
   if(input.expectedVersion!==db.version)return {status:'stale'};
   db={name:input.name,version:db.version+1};return {status:'updated',data:{id:'course1',...db}};
  });
  await mount();expect(host.textContent).toContain('Версия: 3');
  await change('First');await click('Сохранить');expect(host.textContent).toContain('Версия: 4');
  db={name:'Other client',version:5};await change('Preserve mine');await click('Сохранить');
  expect(host.textContent).toContain('Конфликт версии (409)');expect((host.querySelector('input') as HTMLInputElement).value).toBe('Preserve mine');
  expect(m.cas).toHaveBeenCalledTimes(2);expect((host.querySelectorAll('button')[0] as HTMLButtonElement).disabled).toBe(true);
  await click('Обновить данные');expect(host.textContent).toContain('Версия: 5');expect((host.querySelector('input') as HTMLInputElement).value).toBe('Preserve mine');
  expect(m.cas).toHaveBeenCalledTimes(2);await click('Сохранить');expect(host.textContent).toContain('Версия: 6');
  expect(m.cas).toHaveBeenLastCalledWith({courseId:'course1',name:'Preserve mine',expectedVersion:5},{id:actors.A.id,role:'TRAINER'});
  expect(m.mutation).not.toHaveBeenCalled();
 });
 it('server forbids moderator and session retirement hides private version without writes',async()=>{
  const denied=await app.request('/api/v1/trainer/courses/course1/version',{headers:{authorization:'Bearer '+bearer.MOD}});
  expect(denied.status).toBe(403);expect(m.read).not.toHaveBeenCalled();
  let active=true;await mount('A',()=>active);expect(host.textContent).toContain('Версия: 3');
  active=false;
  await act(async()=>mounted.render(createElement(TrainerCourseVersionEditor20261022,{
   pathname:'/main-panel/courses/course1/edit',actor:actors.A,token:bearer.A,authEpoch:'epoch-1',enabled:true,
   ops:createVersionedCourseOperations({token:bearer.A,fetchImpl:syntheticFetch,isCurrent:()=>active}),
   getCurrentSession:()=>active?{actor:actors.A,token:bearer.A,authEpoch:'epoch-1'}:null,
  })));
  expect(host.textContent).toContain('доступ не подтверждён');
  expect(host.textContent).not.toContain('Версия: 3');expect(m.cas).not.toHaveBeenCalled();
 });
 it('foreign404, forbidden403 and unknown500 never trigger replay',async()=>{
  m.read.mockResolvedValueOnce({status:'not_found'});await mount('B');expect(host.textContent).toContain('Не удалось');
  await mount('MOD');expect(host.textContent).toContain('доступ не подтверждён');expect(m.cas).not.toHaveBeenCalled();
  m.cas.mockResolvedValueOnce({status:'unknown'});await mount('A');await change('Unknown result');await click('Сохранить');
  expect(host.textContent).toContain('Не удалось');expect(m.cas).toHaveBeenCalledTimes(1);
  expect(m.mutation).not.toHaveBeenCalled();
 });
});

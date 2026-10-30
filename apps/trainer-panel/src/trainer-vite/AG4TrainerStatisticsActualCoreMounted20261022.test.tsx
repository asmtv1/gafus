import {randomBytes} from 'node:crypto';
import {act,createElement} from 'react';
import type {Root} from 'react-dom/client';
import {beforeAll,beforeEach,afterEach,describe,expect,it,vi} from 'vitest';
import type * as PrismaModule from '@gafus/prisma';
import {TrainerStatisticsOptInRoute} from './TrainerStatisticsOptInRoute';
const m=vi.hoisted(()=>({users:vi.fn(),registered:vi.fn(),course:vi.fn(),training:vi.fn(),userStep:vi.fn(),step:vi.fn(),writes:vi.fn()}));
vi.mock('@hono-rate-limiter/redis',()=>({RedisStore:class{windowMs=60000;init(){};async increment(){return {totalHits:1,resetTime:new Date(Date.now()+60000)};};async decrement(){};async resetKey(){}}}));
vi.mock('@gafus/prisma',async original=>{const real=await original<typeof PrismaModule>();return {...real,prisma:{...real.prisma,user:{...real.prisma.user,findUnique:m.users},course:{...real.prisma.course,findMany:m.course},userTraining:{...real.prisma.userTraining,findMany:m.training},userStep:{...real.prisma.userStep,findMany:m.userStep},step:{...real.prisma.step,findMany:m.step},$transaction:m.writes}};});
vi.mock('@gafus/core/services/auth',async original=>({...await original<object>(),isRegistrationCompleted:m.registered}));
// NO mock of @gafus/core/services/statistics: this test exercises both real engines.
const {app}=await vi.importActual<{app:{request:(path:string,init?:RequestInit)=>Promise<Response>}}>('../../../api/src/app');
const {generateAccessToken}=await vi.importActual<{generateAccessToken:(actor:{id:string;username:string;role:string})=>Promise<string>}>('@gafus/auth/jwt');
const {JSDOM}=await vi.importActual<{JSDOM:new(html:string,opts:{url:string})=>{window:Window & typeof globalThis}}>('jsdom');
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost'});
Object.assign(globalThis,{window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,Event:dom.window.Event,IS_REACT_ACT_ENVIRONMENT:true});
const {createRoot}=await import('react-dom/client');
const actors={A:{id:'stat-a',role:'TRAINER' as const},ADMIN:{id:'stat-admin',role:'ADMIN' as const}};const tokens:Record<string,string>={};
let root:Root,host:HTMLDivElement;
const fetchImpl:typeof fetch=async (input,init)=>{const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,'http://localhost');if(!url.pathname.startsWith('/api/v1/trainer/statistics/'))throw Error('unexpected route');return app.request(url.pathname+url.search,{method:init?.method,headers:init?.headers,signal:init?.signal});};
beforeAll(async()=>{process.env.JWT_SECRET=randomBytes(48).toString('hex');for(const [name,a] of Object.entries(actors))tokens[name]=await generateAccessToken({...a,username:name.toLowerCase()});});
beforeEach(()=>{vi.clearAllMocks();m.registered.mockResolvedValue(true);m.users.mockImplementation(async({where,select}:{where:{id:string};select:{sessionsRevokedAt?:boolean;role?:boolean}})=>select.sessionsRevokedAt?{sessionsRevokedAt:null,registrationPending:false,role:where.id==='stat-a'?'TRAINER':where.id==='stat-admin'?'ADMIN':null}:where.id==='stat-a'?{role:'TRAINER'}:null);
 m.course.mockImplementation(async({where}:{where:{authorId?:string}})=>{const owner=where.authorId??'stat-a';return [{id:'course-'+owner,name:'Course '+owner,logoImg:'',avgRating:4.5,isPrivate:false,isPaid:false,isPersonalized:false,trainingLevel:'BEGINNER',author:{username:'coach',profile:{fullName:null}},dayLinks:[{id:'link1',order:1,day:{stepLinks:[]}}],userCourses:[],reviews:[]}];});m.training.mockResolvedValue([]);m.userStep.mockResolvedValue([]);
 m.step.mockImplementation(async({where}:{where:{authorId?:string}})=>[{id:'step-'+(where.authorId??'all'),title:'Walk safely',durationSec:60,stepLinks:[{dayId:'day-a',day:{dayLinks:[{courseId:'course-stat-a'}]}}]}]);host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
async function render(who:'A'|'ADMIN'='A',live=true){const actor=actors[who];await act(async()=>root.render(createElement(TrainerStatisticsOptInRoute,{actor,token:tokens[who],authEpoch:'epoch',enableProposedStatistics:true,fetchImpl,getCurrentSession:()=>live?{actor,token:tokens[who],authEpoch:'epoch'}:null})));await act(async()=>{await new Promise(r=>setTimeout(r,0));});}
async function click(label:string){await act(async()=>[...host.querySelectorAll('button')].find(x=>x.textContent===label)!.click());await act(async()=>{await new Promise(r=>setTimeout(r,0));});}
describe('Trainer statistics mounted UI → registered Hono → ACTUAL Core → synthetic Prisma',()=>{
 it('TRAINER course presentation, step switch, role owner queries and empty on late scope',async()=>{await render();expect(host.textContent).toContain('Активность: 1 дней/курс');expect(host.textContent).toContain('Завершение: 0%');expect(host.textContent).toContain('рейтинг: 4.5');expect(m.course.mock.calls[0]?.[0].where).toEqual({authorId:'stat-a'});await click('Шаги');expect(host.textContent).toContain('Walk safely');expect(m.step.mock.calls[0]?.[0].where).toEqual({authorId:'stat-a'});expect(m.writes).not.toHaveBeenCalled();});
 it('empty course and step read states and retired actor reject calls',async()=>{
  m.course.mockResolvedValueOnce([]);
  await render();expect(host.textContent).toContain('Курсы не найдены');expect(host.textContent).toContain('Активность: 0 дней/курс');
  m.step.mockResolvedValueOnce([]);await click('Шаги');expect(host.textContent).toContain('Шагов пока нет');
  const prior=m.course.mock.calls.length+m.step.mock.calls.length;
  await act(async()=>root.render(createElement(TrainerStatisticsOptInRoute,{actor:actors.A,token:tokens.A,authEpoch:'epoch',enableProposedStatistics:true,fetchImpl,getCurrentSession:()=>null})));
  expect(host.textContent).toContain('Доступ к статистике не подтверждён');
  expect(m.course.mock.calls.length+m.step.mock.calls.length).toBe(prior);
 });
 it('ADMIN explicit all filter, errors and session retirement',async()=>{await render('ADMIN');expect(host.textContent).toContain('Выберите область');await click('Все тренеры');expect(host.textContent).toContain('Course stat-a');expect(m.course.mock.calls.at(-1)?.[0].where).toEqual({});m.step.mockRejectedValueOnce(Error('private'));await click('Шаги');expect(host.textContent).toContain('Не удалось загрузить статистику');expect(m.writes).not.toHaveBeenCalled();});
});

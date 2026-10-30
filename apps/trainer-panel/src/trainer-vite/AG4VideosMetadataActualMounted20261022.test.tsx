/** AG1 cont146: actual registered Hono source, synthetic Prisma SELECT boundary. */
import {randomBytes} from 'node:crypto';
import {act,createElement} from 'react';
import {TrainerVideosMetadataRead20261022} from './TrainerVideosMetadataRead20261022';
import {afterEach,beforeAll,beforeEach,describe,expect,it,vi} from "vitest";
import type * as PrismaModule from "@gafus/prisma";
const state=vi.hoisted(()=>({find:vi.fn(),user:vi.fn(),registration:vi.fn(),rate:1}));
vi.mock("@hono-rate-limiter/redis",()=>({RedisStore:class{
 windowMs=60000;
 init(c:{windowMs:number}){this.windowMs=c.windowMs;}
 async increment(){return {totalHits:state.rate,resetTime:new Date(Date.now()+this.windowMs)};}
 async decrement(){return undefined;}
 async resetKey(){return undefined;}
}}));
vi.mock("@gafus/prisma",async original=>{
 const actual=await original<typeof PrismaModule>();
 return {...actual,prisma:{...actual.prisma,
  user:{...actual.prisma.user,findUnique:state.user},
  trainerVideo:{...actual.prisma.trainerVideo,findMany:state.find}}};
});
vi.mock("@gafus/auth",()=>({authOptions:{}}));
vi.mock("@gafus/core/services/auth",async original=>({
 ...await original<object>(),isRegistrationCompleted:state.registration,
}));
const {app}=await vi.importActual<{app:{request:(path:string,init?:RequestInit)=>Promise<Response>}}>("../../../api/src/app");
const {generateAccessToken}=await vi.importActual<{generateAccessToken:(a:{id:string;username:string;role:string})=>Promise<string>}>("@gafus/auth/jwt");
const actors={
 A:{id:"vid_meta_trainer_a",username:"vidA",role:"TRAINER"},
 B:{id:"vid_meta_trainer_b",username:"vidB",role:"TRAINER"},
 ADMIN:{id:"vid_meta_admin",username:"vidAdmin",role:"ADMIN"},
 MOD:{id:"vid_meta_mod",username:"vidMod",role:"MODERATOR"},
 USER:{id:"vid_meta_user",username:"vidUser",role:"USER"},
 PARTNER:{id:"vid_meta_partner",username:"vidPartner",role:"PARTNER"},
} as const;
const tokens:Record<string,string>={};
const path="/api/v1/trainer/videos/metadata";
const privateInfo="ABSOLUTELY_PRIVATE_MEDIA_PATH";
const record={id:"v1",displayName:null,transcodingStatus:"PENDING",durationSec:null,
 createdAt:new Date("2026-10-22T10:00:00Z"),relativePath:privateInfo,
 hlsManifestPath:privateInfo,thumbnailPath:privateInfo,transcodingError:privateInfo,
 mimeType:privateInfo,originalName:privateInfo,trainerId:privateInfo};
const send=(who:string,url=path)=>app.request(url,{headers:who?{
 Authorization:"Bearer "+(tokens[who]??who),
}:{}});
const privacy=(r:Response)=>{
 expect(r.headers.get("cache-control")).toContain("no-store");
 expect(r.headers.get("referrer-policy")).toBe("no-referrer");
};
beforeAll(async()=>{
 process.env.JWT_SECRET=randomBytes(48).toString("hex");
 for(const [key,a] of Object.entries(actors))tokens[key]=await generateAccessToken(a);
});
beforeEach(()=>{
 vi.clearAllMocks();state.rate=1;
 state.registration.mockResolvedValue(true);
 state.user.mockImplementation(async ({ where }: { where: { id: string } }) => {
    const actor = Object.values(actors).find((candidate) => candidate.id === where.id);
    return actor ? { sessionsRevokedAt: null, registrationPending: false, role: actor.role } : null;
  });
 state.find.mockResolvedValue([record]);
});

const {JSDOM}=await vi.importActual<{JSDOM:new(h:string,o:{url:string})=>{window:Window & typeof globalThis}}>('jsdom');
const dom=new JSDOM('<html><body></body></html>',{url:'http://localhost'});
Object.assign(globalThis,{window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,Event:dom.window.Event,IS_REACT_ACT_ENVIRONMENT:true});
const {createRoot}=await import('react-dom/client');let root:ReturnType<typeof createRoot>,host:HTMLDivElement;
beforeEach(()=>{host=document.createElement('div');document.body.append(host);root=createRoot(host);});afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
async function mount(who:'A'|'B'|'ADMIN'|'MOD'='A',live=true){const a=actors[who],actor={id:a.id,role:a.role},token=tokens[who];const transport=async(uri:string,signal:AbortSignal)=>{const r=await app.request(uri,{method:'GET',signal,headers:{Authorization:'Bearer '+token}});return {status:r.status,headers:{'cache-control':r.headers.get('cache-control')??''},body:await r.json()};};await act(async()=>root.render(createElement(TrainerVideosMetadataRead20261022,{pathname:'/main-panel/my-videos',actor,token,authEpoch:'e',enabled:true,transport,getCurrentSession:()=>live?{actor,token,authEpoch:'e'}:null})));await act(async()=>{await new Promise(r=>setTimeout(r,0));});}
const video=(id:string,displayName:string|null,date:string)=>({...record,id,displayName,createdAt:new Date(date)});
describe('AG4 existing my-videos UI → actual registered Hono + minimal producer → synthetic Prisma',()=>{
 it('TRAINER list, null name, sort, select, search, A→B reset without paths',async()=>{state.find.mockResolvedValue([video('a-z','Zebra','2026-10-22T10:00:00Z'),video('a-a','Alpha','2026-10-21T10:00:00Z'),video('a-null',null,'2026-10-20T10:00:00Z')]);await mount();expect(host.textContent).toContain('Всего видео: 3');expect(host.textContent).toContain('Без названия');await act(async()=>{[...host.querySelectorAll('button')].find(x=>x.textContent==='Alpha')!.click();});expect(host.querySelector('[aria-label="Метаданные выбранного видео"]')?.textContent).toContain('Alpha');await act(async()=>{const s=host.querySelector('select')!;s.value='name';s.dispatchEvent(new dom.window.Event('change',{bubbles:true}));const input=host.querySelector('input')!;input.value='Zebra';input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});expect(host.textContent).not.toContain(privateInfo);await mount('B');expect(state.find.mock.calls.at(-1)?.[0].where).toEqual({trainerId:actors.B.id});expect(host.querySelector('[aria-label="Метаданные выбранного видео"]')).toBeNull();});
 it('ADMIN all, MOD denied, session retired',async()=>{await mount('ADMIN');expect(state.find.mock.calls.at(-1)?.[0].where).toBeUndefined();await mount('MOD');expect(host.textContent).toContain('недоступны');await mount('A',false);expect(host.textContent).toContain('недоступны');});
 it('empty and masked source failure; no path exposure',async()=>{state.find.mockResolvedValueOnce([]);await mount();expect(host.textContent).toContain('Видео не найдены');await act(async()=>root.unmount());root=createRoot(host);state.find.mockRejectedValueOnce(Error(privateInfo));await mount();expect(host.textContent).toContain('Не удалось загрузить список видео');expect(host.textContent).not.toContain(privateInfo);});
});

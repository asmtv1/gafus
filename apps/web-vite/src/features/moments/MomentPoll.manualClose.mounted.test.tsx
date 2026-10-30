// @vitest-environment jsdom
import {act} from "react";
import {createRoot, type Root} from "react-dom/client";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {MomentPoll} from "./MomentPoll";
const poll={id:'poll1',postId:'post1',question:'Как лучше заниматься?',isQuiz:false,
 allowMultiple:false,isAnonymous:false,closed:false,canClose:true,totalVotes:null,
 explanation:null,myOptionIds:[],options:[
  {id:'a',text:'По чуть-чуть',votes:null},
  {id:'b',text:'Долго',votes:null},
 ]};
let root:Root,host:HTMLDivElement,cache:QueryClient;
let fetcher:ReturnType<typeof vi.fn<(path:string,init?:RequestInit)=>Promise<Response>>>;
const response=(data:unknown,status=200)=>new Response(JSON.stringify({
 success:status===200,data,error:'PRIVATE_PROVIDER'}),{status});
const flush=async()=>act(async()=>{await new Promise(r=>setTimeout(r,40));});
async function mount(){
 await act(async()=>root.render(<QueryClientProvider client={cache}>
  <MomentPoll userId="owner" postId="post1" />
 </QueryClientProvider>)); await flush();
}
async function press(label:string){
 const btn=[...host.querySelectorAll('button')].find(x=>x.textContent?.includes(label));
 expect(btn,label).toBeDefined();
 await act(async()=>btn?.click()); await flush();
}
beforeEach(()=>{
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
 cache=new QueryClient({defaultOptions:{queries:{retry:false}}});
 fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
});
afterEach(async()=>{await act(async()=>root.unmount());cache.clear();host.remove();vi.unstubAllGlobals();});
describe('WEB4 owner manual poll close from UI through Hono contract',()=>{
 it('requires two actions and strict POST ACK + fresh GET, then disables voting',async()=>{
  let closed=false;
  fetcher.mockImplementation(async(path,init)=>{
   expect(path).toBe('/api/v1/feed/posts/post1/poll'+(init?.method==='POST'?'/close':''));
   if(init?.method==='POST'){
    expect(JSON.parse(String(init.body))).toEqual({});closed=true;
   }
   return response(closed?{...poll,closed:true,canClose:false,totalVotes:0}:poll);
  });
  await mount();
  expect(host.textContent).toContain('Завершить опрос');
  expect(fetcher).toHaveBeenCalledTimes(1);
  await press('Завершить опрос');
  expect(host.textContent).toContain('Открыть опрос снова нельзя');
  expect(fetcher).toHaveBeenCalledTimes(1);
  await press('Да, завершить');
  expect(fetcher.mock.calls.map(([url,init])=>[url,init?.method??'GET'])).toEqual([
   ['/api/v1/feed/posts/post1/poll','GET'],
   ['/api/v1/feed/posts/post1/poll/close','POST'],
   ['/api/v1/feed/posts/post1/poll','GET'],
  ]);
  expect(host.textContent).toContain('Опрос завершён');
  expect(host.textContent).not.toContain('Да, завершить');
  expect(host.textContent).not.toContain('Проголосовать');
 });
 it('foreign viewer never receives the close control',async()=>{
  fetcher.mockResolvedValue(response({...poll,canClose:false}));
  await mount();
  expect(host.textContent).not.toContain('Завершить опрос');
  expect(fetcher).toHaveBeenCalledTimes(1);
 });
 it('public voter identities load only after explicit expansion, never from poll GET',async()=>{
  const visible={...poll,myOptionIds:['a'],totalVotes:1,options:[
    {id:'a',text:'По чуть-чуть',votes:1},{id:'b',text:'Долго',votes:0}]};
  fetcher.mockImplementation(async(path)=>
    path.includes('/voters')?response({optionId:'a',items:[
      {id:'voter_1',username:'dog_lover',name:'Любитель собак',avatarUrl:null}],nextCursor:null})
      :response(visible));
  await mount();
  expect(host.textContent).toContain('Участники: По чуть-чуть');
  expect(host.textContent).not.toContain('Любитель собак');
  expect(fetcher).toHaveBeenCalledTimes(1);
  await press('Участники: По чуть-чуть');
  expect(host.textContent).toContain('Любитель собак');
  expect(fetcher.mock.calls[1]?.[0]).toBe(
    '/api/v1/feed/posts/post1/poll/options/a/voters?pageSize=10');
  await press('Скрыть участников');
  expect(host.textContent).not.toContain('Любитель собак');
 });
 it('anonymous poll and hidden results never offer public identities',async()=>{
  const visible={...poll,isAnonymous:true,myOptionIds:['a'],totalVotes:1,options:[
    {id:'a',text:'По чуть-чуть',votes:1},{id:'b',text:'Долго',votes:0}]};
  fetcher.mockResolvedValue(response(visible));
  await mount();
  expect(host.textContent).not.toContain('Участники:');
  expect(fetcher).toHaveBeenCalledTimes(1);
 });
 it('403 on participant read does not show stale voter names',async()=>{
  const visible={...poll,myOptionIds:['a'],totalVotes:1,options:[
    {id:'a',text:'По чуть-чуть',votes:1},{id:'b',text:'Долго',votes:0}]};
  fetcher.mockImplementation(async(path)=>
    path.includes('/voters')?response(null,403):response(visible));
  await mount();
  await press('Участники: По чуть-чуть');
  expect(host.textContent).toContain('Не удалось показать участников');
  expect(host.textContent).not.toContain('Любитель собак');
 });
 it('500 response never reports closed even after confirmation',async()=>{
  fetcher.mockImplementation(async(_path,init)=>
   init?.method==='POST'?response(null,500):response(poll));
  await mount();
  await press('Завершить опрос'); await press('Да, завершить');
  expect(host.textContent).toContain('Не удалось подтвердить завершение');
  expect(host.textContent).not.toContain('Опрос завершён');
 });
});

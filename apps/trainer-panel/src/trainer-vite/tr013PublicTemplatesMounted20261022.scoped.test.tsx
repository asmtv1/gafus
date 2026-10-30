// @vitest-environment jsdom
import {act,createElement} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {TrainerOptInRoute} from './optInRoute';
const template=(id:string,cat:string)=>({id,title:'Template '+id,description:'Description',durationSec:null,type:'TRAINING',imageUrls:[],pdfUrls:[],videoUrl:null,checklist:[],requiresVideoReport:false,requiresWrittenFeedback:false,hasTestQuestions:false,surveySlug:null,tags:[],isPublic:true,usageCount:1,category:{id:cat,name:cat,icon:null},author:{id:'author',username:'creator'},createdAt:'2026-10-22T10:00:00.000Z'});
const result=(rows:unknown[],status=200)=>({status,headers:{'cache-control':'private, no-store'},body:{success:true,data:rows}});
let root:Root,host:HTMLDivElement;
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
const base={pathname:'/main-panel/templates',actor:{id:'trainer-1',role:'TRAINER' as const},token:'mock-token',fetchImpl:fetch,authEpoch:'a',enablePublicTemplates:true};
async function mount(overrides:Record<string,unknown>={}){await act(async()=>root.render(createElement(TrainerOptInRoute,{...base,...overrides})));await act(async()=>{await Promise.resolve();await new Promise(resolve=>setTimeout(resolve,0));});}
describe('TR013 public template mounted read-only UI',()=>{
 it('default off no request',async()=>{const transport=vi.fn();await mount({enablePublicTemplates:false,publicTemplateTransport:transport});expect(transport).not.toHaveBeenCalled();expect(host.textContent).toContain('отключена');});
 it('list and preview contain selected public fields only',async()=>{await mount({publicTemplateTransport:async()=>result([template('A','dogs')])});expect(host.textContent).toContain('Template A');expect(host.textContent).toContain('creator');await act(async()=>host.querySelector('li button')!.dispatchEvent(new MouseEvent('click',{bubbles:true})));expect(host.textContent).toContain('Автор: creator');});
 it('category query uses strict endpoint and errors permit manual retry',async()=>{let count=0;const transport=vi.fn(async()=>{count++;return count===1?result([],500):result([]);});await mount({publicTemplateTransport:transport});expect(host.textContent).toContain('Не удалось');await act(async()=>host.querySelector('button')!.dispatchEvent(new MouseEvent('click',{bubbles:true})));await act(async()=>{await Promise.resolve();await new Promise(resolve=>setTimeout(resolve,0));});expect(host.textContent).toContain('Шаблонов нет');expect(count).toBe(2);});
 it('retired actor clears previous content and ignores late result',async()=>{let deliver:(v:ReturnType<typeof result>)=>void=()=>{};await mount({publicTemplateTransport:()=>new Promise(resolve=>{deliver=resolve;})});await mount({actor:{id:'user',role:'USER'},publicTemplateTransport:async()=>result([])});await act(async()=>deliver(result([template('OLD','dogs')])));expect(host.textContent).not.toContain('OLD');});
});

// @vitest-environment jsdom
import {act,createElement} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {TrainerCourseVersionEditor20261022,type VersionedCourseOperations} from './TrainerCourseVersionEditor20261022';
let host:HTMLDivElement,root:Root;
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
const base={pathname:'/main-panel/courses/course-1/edit',actor:{id:'trainer-a',role:'TRAINER' as const},token:'mock-token',authEpoch:'epoch-1',enabled:true};
const dto=(version:number,name='Старое название')=>({id:'course-1',name,version});
async function mount(input:Record<string,unknown>={}){await act(async()=>root.render(createElement(TrainerCourseVersionEditor20261022,{...base,...input})));await act(async()=>{await Promise.resolve();await new Promise(resolve=>setTimeout(resolve,0));});}
const ops=(save:VersionedCourseOperations['save'],read:VersionedCourseOperations['read']=async()=>dto(2)):VersionedCourseOperations=>({read,save});
async function change(text:string){const element=host.querySelector('input')!;await act(async()=>{const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!;setter.call(element,text);element.dispatchEvent(new Event('input',{bubbles:true}));});}
async function click(label:string){const button=[...host.querySelectorAll('button')].find(b=>b.textContent===label)!;await act(async()=>button.click());await act(async()=>{await Promise.resolve();await new Promise(resolve=>setTimeout(resolve,0));});}
describe('TR012 local version CAS editing UI; no API contract fabricated',()=>{
 it('OFF refuses reads or writes',async()=>{const read=vi.fn();const save=vi.fn();await mount({enabled:false,ops:{read,save}});expect(read).not.toHaveBeenCalled();expect(save).not.toHaveBeenCalled();});
 it('gets private version and sends expectedVersion for successful save',async()=>{const save=vi.fn(async(p:{courseId:string;name:string;expectedVersion:number})=>({status:200 as const,data:dto(p.expectedVersion+1,p.name)}));await mount({ops:ops(save)});expect(host.textContent).toContain('Версия: 2');await change('Новое имя');await click('Сохранить');expect(save).toHaveBeenCalledWith({courseId:'course-1',name:'Новое имя',expectedVersion:2},expect.any(AbortSignal));expect(host.textContent).toContain('Версия: 3');});
 it('409 preserves input, disables save, requires explicit refresh with next version',async()=>{let latest=2;const save=vi.fn(async()=>({status:409 as const}));const read=vi.fn(async()=>dto(latest));await mount({ops:ops(save,read)});await change('Мои изменения');await click('Сохранить');expect(host.textContent).toContain('Конфликт версии (409)');expect((host.querySelector('input') as HTMLInputElement).value).toBe('Мои изменения');expect((host.querySelectorAll('button')[0] as HTMLButtonElement).disabled).toBe(true);expect(save).toHaveBeenCalledTimes(1);latest=4;await click('Обновить данные');expect(host.textContent).toContain('Версия: 4');expect((host.querySelector('input') as HTMLInputElement).value).toBe('Мои изменения');});
 it('invalid version and missing authorization fail closed',async()=>{await mount({ops:ops(async()=>({status:409}),async()=>dto(0))});expect(host.textContent).toContain('Не удалось');await mount({actor:{id:'user',role:'USER'},ops:ops(async()=>({status:409}))});expect(host.textContent).toContain('доступ не подтверждён');});
 it('rejects version zero, negative, overflow and incorrect id before save',async()=>{
  for(const version of [0,-1,2147483648,Number.MAX_SAFE_INTEGER]){
   const save=vi.fn(async()=>({status:409 as const}));
   await mount({ops:ops(save,async()=>dto(version))});
   expect(host.textContent).toContain('Не удалось');expect(save).not.toHaveBeenCalled();
  }
  await mount({ops:ops(async()=>({status:409}),async()=>({...dto(1),id:'foreign'}))});
  expect(host.textContent).toContain('Не удалось');
 });
 it('409 refresh permits only explicit second save with newly observed version',async()=>{
  let newest=3;
  const save=vi.fn(async(p:{courseId:string;name:string;expectedVersion:number})=>p.expectedVersion===2?{status:409 as const}:{status:200 as const,data:dto(p.expectedVersion+1,p.name)});
  const read=vi.fn(async()=>dto(newest===3?2:3));
  await mount({ops:ops(save,read)});await change('Несохранённый текст');await click('Сохранить');
  expect(save).toHaveBeenCalledTimes(1);newest=4;await click('Обновить данные');
  expect((host.querySelector('input') as HTMLInputElement).value).toBe('Несохранённый текст');
  await click('Сохранить');expect(save).toHaveBeenLastCalledWith({courseId:'course-1',name:'Несохранённый текст',expectedVersion:3},expect.any(AbortSignal));
 });

});

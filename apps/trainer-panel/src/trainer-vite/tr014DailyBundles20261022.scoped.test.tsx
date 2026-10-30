// @vitest-environment jsdom
import {act,createElement} from "react";
import {createRoot,type Root} from "react-dom/client";
import {beforeEach,afterEach,describe,it,expect,vi} from "vitest";
import {TrainerOptInRoute} from "./optInRoute";
import {readDailyBundles} from "./tr014DailyBundlesRead20261022";
const row={id:"b1",title:"Связка 1",type:"TRAINING",stepsCount:1,authorId:"a",authorUsername:"trainer",equipment:"",description:"",steps:[{id:"s1",title:"Шаг 1",type:"TRAINING",order:1}]};
const ok=(rows:unknown[]=[row],status=200)=>({status,headers:{"cache-control":"private, no-store"},body:{success:true,data:rows}});
let host:HTMLDivElement,root:Root;
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
const base={pathname:"/main-panel/daily-course/bundles",actor:{id:"a",role:"TRAINER" as const},token:"test-token",fetchImpl:fetch,authEpoch:"1",enableDailyBundles:true};
async function mount(x:Record<string,unknown>={}){
 await act(async()=>root.render(createElement(TrainerOptInRoute,{...base,...x})));
 await act(async()=>{
  await Promise.resolve();
  await new Promise(resolve=>setTimeout(resolve,0));
 });
}
describe("TR014 source/mock mounted read-only bundles",()=>{
 it("default disabled without request",async()=>{const t=vi.fn();await mount({enableDailyBundles:false,dailyBundleTransport:t});expect(t).not.toHaveBeenCalled();expect(host.textContent).toContain("отключены");});
 it("TRAINER own bundle and no mutation buttons",async()=>{const t=vi.fn(async(_path:string)=>ok());await mount({dailyBundleTransport:t});expect(host.textContent).toContain("Связка 1");expect(host.textContent).toContain("trainer");expect([...host.querySelectorAll("button")].some(button=>/Сохранить|Удалить|Изменить|Создать/.test(button.textContent??""))).toBe(false);expect(t.mock.calls.filter(([path])=>path==="/api/v1/trainer/daily-course/bundles")).toHaveLength(1);});
 it("invalid foreign data and extra private fields rejected",async()=>{for(const b of [{...row,authorId:"b"},{...row,privateEmail:"secret"}])await expect(readDailyBundles({enabled:true,role:"TRAINER",actorId:"a",signal:new AbortController().signal,isCurrent:()=>true,transport:async()=>ok([b])})).rejects.toThrow();});
 it("empty, error and retry are read-only",async()=>{await mount({dailyBundleTransport:async()=>ok([])});expect(host.textContent).toContain("Связок нет");let n=0;const t=async(path:string)=>{if(path==="/api/v1/trainer/daily-course/bundles"){n++;return n===1?ok([],500):ok([]);}return ok([]);};await mount({dailyBundleTransport:t});expect(host.textContent).toContain("Не удалось");await act(async()=>host.querySelector<HTMLButtonElement>('button[aria-label="Повторить загрузку связок"]')!.click());await act(async()=>{await Promise.resolve();await new Promise(resolve=>setTimeout(resolve,0));});expect(n).toBe(2);expect(host.textContent).toContain("Связок нет");});
 it("retired actor blocks late result",async()=>{let complete:(r:ReturnType<typeof ok>)=>void=()=>undefined;await mount({dailyBundleTransport:()=>new Promise(resolve=>{complete=resolve;})});await mount({actor:{id:"user",role:"USER"},dailyBundleTransport:async()=>ok()});await act(async()=>complete(ok()));expect(host.textContent).not.toContain("Связка 1");});
});
